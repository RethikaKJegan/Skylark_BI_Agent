import { describe, expect, it } from "vitest";
import { formatAnswer } from "../format";
import { buildMetrics, openPipelineBySector, overdueWorkOrders, pastDueUnknownStatusWorkOrders, pipelineSummary, winRate, workOrderSummary } from "../metrics";
import type { BoardData, DealRecord, WorkOrderRecord } from "../types";

describe("acceptance regression metrics", () => {
  const data = fixtureData();

  it("matches imported and usable row counts after structural row removal", () => {
    expect(data.deals).toHaveLength(344);
    expect(data.dealQuality.skippedHeaderRows).toBe(2);
    expect(data.workOrders).toHaveLength(176);
    expect(data.deals.length + data.workOrders.length).toBe(520);
  });

  it("calculates open pipeline from the same filtered sector subset", () => {
    const summary = pipelineSummary(data.deals);
    expect(summary.openCount).toBe(49);
    expect(summary.openValue.known).toBe(47);
    expect(summary.openValue.missing).toBe(2);
    expect(summary.openValue.value).toBeCloseTo(688_152_293.1738, 4);
    expect(summary.averageKnownValue).toBeCloseTo(14_641_538.1526, 4);
    expect(summary.knownCoverage).toBeCloseTo(0.95918, 4);

    const bySector = openPipelineBySector(data.deals);
    expect(bySector.find((row) => row.sector === "Mining")).toMatchObject({ count: 9, known: 9, missing: 0 });
    expect(bySector.find((row) => row.sector === "Mining")?.value).toBeCloseTo(29_083_888.2, 4);
    expect(bySector.find((row) => row.sector === "Renewables")).toMatchObject({ count: 8, known: 7, missing: 1 });
    expect(bySector.find((row) => row.sector === "Renewables")?.value).toBeCloseTo(25_569_056.3298, 4);
  });

  it("does not show unavailable on-hold value as zero", () => {
    const summary = pipelineSummary(data.deals);
    expect(summary.onHoldValue).toMatchObject({ value: null, total: 2, known: 0, missing: 2 });
  });

  it("calculates win rate from won and dead only", () => {
    expect(winRate(data.deals)).toMatchObject({ won: 165, dead: 127, denominator: 292 });
    expect(winRate(data.deals).rate).toBeCloseTo(0.565068493, 8);
  });

  it("calculates work-order financial anchors with missing coverage", () => {
    const wo = workOrderSummary(data.workOrders);
    expect(wo.contractedExcl).toMatchObject({ known: 175, missing: 1 });
    expect(wo.contractedExcl.value).toBeCloseTo(211_649_409.208564, 4);
    expect(wo.billedExcl).toMatchObject({ known: 113, missing: 63 });
    expect(wo.billedExcl.value).toBeCloseTo(107_389_776.587184, 4);
    expect(wo.billedIncl).toMatchObject({ known: 176, missing: 0 });
    expect(wo.billedIncl.value).toBeCloseTo(126_719_936.372877, 4);
    expect(wo.collectedIncl).toMatchObject({ known: 78, missing: 98 });
    expect(wo.collectedIncl.value).toBeCloseTo(90_428_187.503748, 4);
    expect(wo.collectionRate).toBeCloseTo(0.713606636, 8);
    expect(wo.positiveReceivables.value).toBeCloseTo(36_291_913.689269, 4);
    expect(wo.negativeReceivableRows).toBe(11);
    expect(wo.negativeUnbilledRows).toBe(6);
  });

  it("uses the shared overdue function for exact status counts", () => {
    const overdue = overdueWorkOrders(data.workOrders, "2026-08-30");
    expect(overdue).toHaveLength(48);
    const counts = countBy(overdue, (wo) => wo.executionStatus);
    expect(counts).toMatchObject({
      Ongoing: 23,
      "Not Started": 11,
      "Executed until current month": 7,
      "Paused / Stuck": 4,
      "Partial Completed": 2,
      "Details pending from Client": 1,
    });
    expect(data.workOrders.filter((wo) => wo.probableEndDate === null)).toHaveLength(19);
    const unknown = pastDueUnknownStatusWorkOrders(data.workOrders, "2026-08-30");
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatchObject({ dealName: "Alphonse", probableEndDate: "2025-11-14", executionStatus: "" });
    const metrics = buildMetrics(data, { source: "work_orders", intent: "overdue_work_orders", metrics: ["overdue_work_orders"], filters: { statuses: ["incomplete"] }, groupBy: "status" }, "2026-08-30");
    expect(metrics.workOrders).toHaveLength(176);
    expect(metrics.overdue).toHaveLength(48);
    const geminiSynonymMetrics = buildMetrics(data, { source: "work_orders", intent: "overdue_work_orders", metrics: ["overdue_work_orders"], filters: { statuses: ["not completed"] }, groupBy: "status" }, "2026-08-30");
    expect(geminiSynonymMetrics.workOrders).toHaveLength(176);
    expect(geminiSynonymMetrics.overdue).toHaveLength(48);
  });

  it("returns metric-specific responses and caveats", () => {
    const billed = formatAnswer(data, plan("work_orders", "billed_value"), "2026-08-30");
    expect(JSON.stringify(billed)).toContain("Billed excluding GST");
    expect(JSON.stringify(billed)).not.toContain("missing deal value");

    const collected = formatAnswer(data, plan("work_orders", "collected_value"), "2026-08-30");
    expect(JSON.stringify(collected)).toContain("Collected including GST");
    expect(JSON.stringify(collected)).toContain("98 of 176");

    const leadership = formatAnswer(data, plan("both", "leadership_update"), "2026-08-30");
    expect(JSON.stringify(leadership)).toContain("48 confirmed overdue");
    expect(JSON.stringify(leadership)).not.toContain("25 overdue");
  });
});

function fixtureData(): BoardData {
  return {
    deals: buildDeals(),
    workOrders: buildWorkOrders(),
    dealQuality: { missing: [], invalidNumbers: [], invalidDates: [], anomalies: [], skippedHeaderRows: 2 },
    workOrderQuality: { missing: [], invalidNumbers: [], invalidDates: [], anomalies: [], skippedHeaderRows: 0 },
    fetchedAt: "2026-08-30T00:00:00.000Z",
  };
}

function buildDeals() {
  const deals: DealRecord[] = [];
  addOpen(deals, "Tender", 4, 4, 531_964_562.448);
  addOpen(deals, "Railways", 13, 13, 52_023_788.196);
  addOpen(deals, "DSP", 6, 6, 32_175_420);
  addOpen(deals, "Mining", 9, 9, 29_083_888.2);
  addOpen(deals, "Renewables", 8, 7, 25_569_056.3298);
  addOpen(deals, "Security and Surveillance", 1, 1, 7_340_400);
  addOpen(deals, "Powerline", 4, 4, 6_324_978);
  addOpen(deals, "", 3, 2, 3_547_860);
  addOpen(deals, "Construction", 1, 1, 122_340);
  for (let i = 0; i < 165; i++) deals.push(deal({ status: "Won", actualCloseDate: "2026-01-01", dealValue: i < 38 ? null : 1 }));
  for (let i = 0; i < 127; i++) deals.push(deal({ status: "Dead", actualCloseDate: "2026-01-01", dealValue: i < 127 ? null : 1 }));
  deals.push(deal({ status: "On Hold", dealValue: null }));
  deals.push(deal({ status: "On Hold", dealValue: null }));
  deals.push(deal({ status: "", dealValue: null }));
  return deals;
}

function addOpen(deals: DealRecord[], sector: string, count: number, known: number, total: number) {
  for (let i = 0; i < count; i++) deals.push(deal({ status: "Open", sector, dealValue: i < known ? (i === 0 ? total : 0) : null }));
}

function buildWorkOrders() {
  const rows: WorkOrderRecord[] = [];
  const statuses = [
    ["Ongoing", 23],
    ["Not Started", 11],
    ["Executed until current month", 7],
    ["Paused / Stuck", 4],
    ["Partial Completed", 2],
    ["Details pending from Client", 1],
  ] as const;
  const sectors = ["Mining", "Railways", "Renewables", "Powerline", "Others"];
  for (const [status, count] of statuses) {
    for (let i = 0; i < count; i++) rows.push(workOrder({ executionStatus: status, probableEndDate: "2026-01-01", sector: sectors[rows.length % sectors.length] }));
  }
  rows.push(workOrder({ dealName: "Alphonse", executionStatus: "", probableEndDate: "2025-11-14", sector: "Mining" }));
  while (rows.length < 157) rows.push(workOrder({ executionStatus: "Completed", probableEndDate: "2026-01-01", sector: "Mining" }));
  while (rows.length < 176) rows.push(workOrder({ executionStatus: "Ongoing", probableEndDate: null, sector: "Mining" }));

  distribute(rows, "contractedExcludingGst", 175, 211_649_409.208564);
  distribute(rows, "billedExcludingGst", 113, 107_389_776.587184);
  distribute(rows, "billedIncludingGst", 176, 126_719_936.372877);
  distribute(rows, "collectedIncludingGst", 78, 90_428_187.503748);
  distribute(rows, "receivable", 40, 36_291_913.689269);
  for (let i = 40; i < 51; i++) rows[i].receivable = -1;
  distribute(rows, "unbilledExcludingGst", 50, 1_000);
  distribute(rows, "unbilledIncludingGst", 50, 1_180);
  for (let i = 50; i < 56; i++) {
    rows[i].unbilledExcludingGst = -1;
    rows[i].unbilledIncludingGst = -1;
  }
  return rows;
}

function distribute<K extends keyof WorkOrderRecord>(rows: WorkOrderRecord[], key: K, known: number, total: number) {
  for (let i = 0; i < rows.length; i++) rows[i] = { ...rows[i], [key]: i < known ? (i === 0 ? total : 0) : null };
}

function deal(overrides: Partial<DealRecord>): DealRecord {
  return { name: "D", ownerCode: "OWNER", clientCode: "C", status: "Open", actualCloseDate: null, closureProbability: null, dealValue: null, tentativeCloseDate: "2026-09-01", stage: "Stage", product: "Drone", sector: "Mining", createdDate: "2026-01-01", ...overrides };
}

function workOrder(overrides: Partial<WorkOrderRecord>): WorkOrderRecord {
  return { dealName: "D", customerCode: "C", serialNumber: "1", natureOfWork: "One time", executionStatus: "Ongoing", dataDeliveryDate: null, poDate: null, probableStartDate: null, probableEndDate: "2026-01-01", ownerCode: "O", sector: "Mining", typeOfWork: "Survey", lastInvoiceDate: null, contractedExcludingGst: null, contractedIncludingGst: null, billedExcludingGst: null, billedIncludingGst: null, collectedIncludingGst: null, unbilledExcludingGst: null, unbilledIncludingGst: null, receivable: null, invoiceStatus: "", workOrderStatus: "Open", collectionStatus: "", collectionDate: null, billingStatus: "", ...overrides };
}

function plan(source: "deals" | "work_orders" | "both", intent: Parameters<typeof formatAnswer>[1]["intent"]): Parameters<typeof formatAnswer>[1] {
  return { source, intent, metrics: [intent], filters: {}, groupBy: null };
}

function countBy<T>(items: T[], selector: (item: T) => string) {
  return Object.fromEntries([...items.reduce((map, item) => map.set(selector(item), (map.get(selector(item)) || 0) + 1), new Map<string, number>())]);
}
