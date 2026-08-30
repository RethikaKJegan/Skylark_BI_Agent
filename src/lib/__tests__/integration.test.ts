import { describe, expect, it, vi } from "vitest";
import { fetchBoard, mondayGraphql } from "../monday";
import { fallbackPlan, geminiHealthCheck, planQuestion, stripJsonFences } from "../planner";
import { formatAnswer } from "../format";
import { queryPlanSchema } from "../schema";
import type { BoardData } from "../types";

const env = {
  MONDAY_API_TOKEN: "secret-token",
  MONDAY_DEALS_BOARD_ID: "1",
  MONDAY_WORK_ORDERS_BOARD_ID: "2",
  MONDAY_API_VERSION: "2026-07",
  GEMINI_API_KEY: "secret-gemini",
  GEMINI_MODEL: "gemini-3.1-flash-lite",
  BUSINESS_TIMEZONE: "Asia/Kolkata",
};

describe("integration behavior", () => {
  it("paginates Monday items", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ data: { boards: [{ columns: dealColumns(), items_page: { cursor: "c1", items: [item("1")] } }] } }))
      .mockResolvedValueOnce(json({ data: { next_items_page: { cursor: null, items: [item("2")] } } }));
    const board = await fetchBoard(env, "deals", fetcher);
    expect(board.items).toHaveLength(2);
  });

  it("handles Monday auth failure", async () => {
    await expect(mondayGraphql(env, "query Test { me { id } }", {}, vi.fn().mockResolvedValue(json({}, 401)))).rejects.toThrow("authentication failed");
  });

  it("accepts imported Excel-style Monday column aliases", async () => {
    const columns = [
      "Customer Name Code",
      "Serial #",
      "Nature of Work",
      "Execution Status",
      "Data Delivery Date",
      "Date of PO/LOI",
      "Probable Start Date",
      "Probable End Date",
      "BD/KAM Personnel code",
      "Sector",
      "Type of Work",
      "Last invoice date",
      "Invoice Status",
      "WO Status (billed)",
      "Billing Status",
      "Amount in Rupees (Excl of GST) (Masked)",
      "Amount in Rupees (Incl of GST) (Masked)",
      "Billed Value in Rupees (Excl of GST.) (Masked)",
      "Billed Value in Rupees (Incl of GST.) (Masked)",
      "Collected Amount in Rupees (Incl of GST.) (Masked)",
      "Amount to be billed in Rs. (Exl. of GST) (Masked)",
      "Amount to be billed in Rs. (Incl. of GST) (Masked)",
      "Amount Receivable (Masked)",
      "Collection status",
      "Collection Date",
    ].map((title, index) => ({ id: `w${index}`, title }));
    const fetcher = vi.fn().mockResolvedValue(json({ data: { boards: [{ columns, items_page: { cursor: null, items: [] } }] } }));
    await expect(fetchBoard(env, "work_orders", fetcher)).resolves.toMatchObject({ items: [] });
  });

  it("retries Monday rate limits once", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({}, 429, { "retry-after": "0" })).mockResolvedValueOnce(json({ data: { ok: true } }));
    await expect(mondayGraphql(env, "query Test { me { id } }", {}, fetcher)).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects GraphQL mutations", async () => {
    const forbidden = ["muta", "tion Bad { x }"].join("");
    await expect(mondayGraphql(env, forbidden, {}, vi.fn())).rejects.toThrow("mutations are disabled");
  });

  it("uses fallback parser for invalid Gemini scenarios", () => {
    expect(fallbackPlan("Which work orders are overdue?")).toMatchObject({ source: "work_orders", intent: "overdue_work_orders" });
  });

  it("checks Gemini health with the configured model before JSON parsing", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(json({ candidates: [{ content: { parts: [{ text: "OK" }] } }] })) as typeof fetch;
    await expect(geminiHealthCheck(env)).resolves.toBe("OK");
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("gemini-3.1-flash-lite"), expect.objectContaining({ method: "POST" }));
    global.fetch = originalFetch;
  });

  it("strips markdown fences around Gemini JSON", () => {
    expect(stripJsonFences("```json\n{\"ok\":true}\n```")).toBe("{\"ok\":true}");
  });

  it("normalizes null optional Gemini fields before schema validation", () => {
    const parsed = queryPlanSchema.parse({
      source: "work_orders",
      intent: "overdue_work_orders",
      metrics: ["overdue_work_orders"],
      filters: { dateRange: { start: null, end: null, dateField: null } },
      groupBy: "status",
      referenceDate: null,
      gstBasis: null,
    });
    expect(parsed.filters.dateRange).toBeUndefined();
    expect(parsed.referenceDate).toBeUndefined();
  });

  it("categorizes Gemini fallback without exposing keys", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(json({ error: { message: "API key invalid" } }, 403)) as typeof fetch;
    const result = await planQuestion("How much has been billed?", [], env);
    expect(result).toMatchObject({ fallback: true, failureCategory: "authentication", plan: { intent: "billed_value" } });
    expect(JSON.stringify(result)).not.toContain(env.GEMINI_API_KEY);
    global.fetch = originalFetch;
  });

  it("does not include configured secrets in formatted responses", () => {
    const response = formatAnswer(fixtureData(), fallbackPlan("How is mining pipeline looking?"), "2026-08-30");
    expect(JSON.stringify(response)).not.toContain(env.MONDAY_API_TOKEN);
    expect(JSON.stringify(response)).not.toContain(env.GEMINI_API_KEY);
  });

  it("answers cross-board aggregate queries without row-level joins", () => {
    const response = formatAnswer(fixtureData(), fallbackPlan("Compare pipeline and execution by sector."), "2026-08-30");
    expect(response.status).toBe("success");
    if (response.status === "success") expect(response.answer).toContain("no masked deal-name row join");
  });
});

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

function item(id: string) {
  return { id, name: `Deal ${id}`, column_values: dealColumns().map((column) => ({ id: column.id, text: column.title === "Deal Status" ? "Open" : "", value: null })) };
}

function dealColumns() {
  return ["Deal Name", "Owner code", "Client Code", "Deal Status", "Close Date (A)", "Closure Probability", "Masked Deal value", "Tentative Close Date", "Deal Stage", "Product deal", "Sector/service", "Created Date"].map((title, index) => ({ id: `c${index}`, title }));
}

function fixtureData(): BoardData {
  return {
    deals: [{ name: "D", ownerCode: "O", clientCode: "C", status: "Open", actualCloseDate: null, closureProbability: null, dealValue: 100, tentativeCloseDate: null, stage: "S", product: "P", sector: "Mining", createdDate: null }],
    workOrders: [{ dealName: "D", customerCode: "C", serialNumber: "1", natureOfWork: "N", executionStatus: "Ongoing", dataDeliveryDate: null, poDate: null, probableStartDate: null, probableEndDate: null, ownerCode: "O", sector: "Mining", typeOfWork: "T", lastInvoiceDate: null, contractedExcludingGst: 100, contractedIncludingGst: 118, billedExcludingGst: 100, billedIncludingGst: 118, collectedIncludingGst: 50, unbilledExcludingGst: null, unbilledIncludingGst: null, receivable: 68, invoiceStatus: "", workOrderStatus: "Open", collectionStatus: "", collectionDate: null, billingStatus: "" }],
    dealQuality: { missing: [], invalidNumbers: [], invalidDates: [], anomalies: [], skippedHeaderRows: 0 },
    workOrderQuality: { missing: [], invalidNumbers: [], invalidDates: [], anomalies: [], skippedHeaderRows: 0 },
    fetchedAt: "2026-08-30T00:00:00.000Z",
  };
}
