import { describe, expect, it } from "vitest";
import { fallbackPlan } from "../planner";
import { overdueWorkOrders, pipelineSummary, winRate, workOrderSummary } from "../metrics";
import type { DealRecord, WorkOrderRecord } from "../types";

const deals: DealRecord[] = [
  deal({ name: "A", status: "Open", dealValue: 100, sector: "Mining" }),
  deal({ name: "B", status: "Open", dealValue: null, sector: "Mining" }),
  deal({ name: "C", status: "Won", dealValue: 50, sector: "Renewables" }),
  deal({ name: "D", status: "Dead", dealValue: 25, sector: "Powerline" }),
];

const workOrders: WorkOrderRecord[] = [
  workOrder({ dealName: "A", executionStatus: "Ongoing", probableEndDate: "2026-01-01", contractedExcludingGst: 100, billedIncludingGst: 118, collectedIncludingGst: 59, receivable: 59, unbilledExcludingGst: 100 }),
  workOrder({ dealName: "B", executionStatus: "Completed", probableEndDate: "2026-01-01", contractedExcludingGst: 100, billedIncludingGst: 118, collectedIncludingGst: 118, receivable: -5, unbilledExcludingGst: -10 }),
];

describe("metrics", () => {
  it("calculates pipeline and excludes unknown values from sums", () => {
    expect(pipelineSummary(deals)).toMatchObject({ openValue: { value: 100, known: 1, missing: 1 }, openCount: 2, knownCoverage: 0.5 });
  });

  it("calculates win rate from won and dead only", () => {
    expect(winRate(deals)).toMatchObject({ won: 1, dead: 1, rate: 0.5 });
  });

  it("uses billed including GST for collection rate and tracks receivable anomalies", () => {
    expect(workOrderSummary(workOrders)).toMatchObject({ contractedExcl: { value: 200 }, billedIncl: { value: 236 }, collectedIncl: { value: 177 }, positiveReceivables: { value: 59 }, negativeReceivableRows: 1, collectionRate: 0.75 });
  });

  it("finds overdue work orders by probable end date and non-completed status", () => {
    expect(overdueWorkOrders(workOrders, "2026-08-30")).toHaveLength(1);
  });

  it("detects ambiguous revenue and energy questions", () => {
    expect(fallbackPlan("How much revenue do we have?").clarification?.required).toBe(true);
    expect(fallbackPlan("What is energy pipeline this quarter?").clarification?.question).toContain("Energy");
  });
});

function deal(overrides: Partial<DealRecord>): DealRecord {
  return { name: "D", ownerCode: "OWNER_1", clientCode: "C", status: "Open", actualCloseDate: null, closureProbability: null, dealValue: null, tentativeCloseDate: null, stage: "Stage", product: "Drone", sector: "Mining", createdDate: null, ...overrides };
}

function workOrder(overrides: Partial<WorkOrderRecord>): WorkOrderRecord {
  return { dealName: "D", customerCode: "C", serialNumber: "1", natureOfWork: "One time", executionStatus: "Ongoing", dataDeliveryDate: null, poDate: null, probableStartDate: null, probableEndDate: null, ownerCode: "O", sector: "Mining", typeOfWork: "Survey", lastInvoiceDate: null, contractedExcludingGst: null, contractedIncludingGst: null, billedExcludingGst: null, billedIncludingGst: null, collectedIncludingGst: null, unbilledExcludingGst: null, unbilledIncludingGst: null, receivable: null, invoiceStatus: "", workOrderStatus: "Open", collectionStatus: "", collectionDate: null, billingStatus: "", ...overrides };
}
