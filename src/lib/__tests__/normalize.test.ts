import { describe, expect, it } from "vitest";
import { cleanText, isEmbeddedHeader, normalizeLabel, normalizeMissing, parseDate, parseNumber, quarterBounds } from "../normalize";

describe("normalization", () => {
  it("normalizes text and null-like values", () => {
    expect(cleanText("  Mining   Ops ")).toBe("Mining Ops");
    expect(normalizeMissing("N/A")).toBeUndefined();
    expect(normalizeMissing("NONE")).toBe("NONE");
  });

  it("normalizes known typo labels", () => {
    expect(normalizeLabel("BIlled")).toBe("Billed");
    expect(normalizeLabel("Pause / struck")).toBe("Paused / Stuck");
  });

  it("parses numbers without converting missing to zero", () => {
    expect(parseNumber("₹1,20,000").value).toBe(120000);
    expect(parseNumber({ text: "ignored", value: "{\"amount\":2500}" }).value).toBe(2500);
    expect(parseNumber("-5").anomaly).toBe(true);
    expect(parseNumber("-").value).toBeNull();
    expect(parseNumber("abc").invalid).toBe(true);
  });

  it("parses ISO, natural and spreadsheet dates", () => {
    expect(parseDate("2026-08-30").value).toBe("2026-08-30");
    expect(parseDate({ text: "ignored", value: "{\"date\":\"2026-08-30\"}" }).value).toBe("2026-08-30");
    expect(parseDate("45927").value).toBe("2025-09-27");
    expect(parseDate("").value).toBeNull();
    expect(parseDate("not a date").invalid).toBe(true);
  });

  it("detects embedded header rows", () => {
    expect(isEmbeddedHeader({ "Deal Status": "Deal Status", "Deal Name": "Deal Name", "Owner code": "Owner code" }, ["Deal Status", "Deal Name", "Owner code"])).toBe(true);
  });

  it("calculates timezone quarter boundaries", () => {
    expect(quarterBounds(new Date("2026-08-30T00:00:00Z"), "Asia/Kolkata")).toEqual({ start: "2026-07-01", end: "2026-09-30" });
  });
});
