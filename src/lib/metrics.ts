import type { BoardData, DealRecord, QueryPlan, SourceName, WorkOrderRecord } from "./types";
import { keyOf } from "./normalize";

type NumericSummary = { value: number | null; known: number; missing: number; total: number };

export function currency(value: number | null, digits = 0) {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: digits,
  }).format(value);
}

export function percent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

export function applyDealFilters(deals: DealRecord[], plan: QueryPlan) {
  return deals.filter((deal) => {
    if (plan.filters.sectors?.length && !plan.filters.sectors.some((sector) => sectorMatches(deal.sector, sector))) return false;
    if (plan.filters.owners?.length && !plan.filters.owners.some((owner) => keyOf(deal.ownerCode) === keyOf(owner))) return false;
    if (plan.filters.statuses?.length && !plan.filters.statuses.some((status) => keyOf(deal.status) === keyOf(status))) return false;
    if (plan.filters.dateRange) {
      const field = keyOf(plan.filters.dateRange.dateField).includes("close date a") ? deal.actualCloseDate : deal.tentativeCloseDate;
      if (!field || field < plan.filters.dateRange.start || field > plan.filters.dateRange.end) return false;
    }
    return true;
  });
}

export function applyWorkOrderFilters(workOrders: WorkOrderRecord[], plan: QueryPlan) {
  return workOrders.filter((wo) => {
    if (plan.filters.sectors?.length && !plan.filters.sectors.some((sector) => sectorMatches(wo.sector, sector))) return false;
    if (plan.filters.owners?.length && !plan.filters.owners.some((owner) => keyOf(wo.ownerCode) === keyOf(owner))) return false;
    if (plan.filters.statuses?.length && !plan.filters.statuses.some((status) => keyOf(wo.executionStatus) === keyOf(status) || keyOf(wo.billingStatus) === keyOf(status))) return false;
    return true;
  });
}

export function openDeals(deals: DealRecord[]) {
  return deals.filter((deal) => keyOf(deal.status) === "open");
}

export function onHoldDeals(deals: DealRecord[]) {
  return deals.filter((deal) => ["on hold", "paused stuck", "paused stuc"].includes(keyOf(deal.status)));
}

export function summarizeNumbers<T>(records: T[], selector: (record: T) => number | null): NumericSummary {
  let value = 0;
  let known = 0;
  for (const record of records) {
    const next = selector(record);
    if (next !== null) {
      known += 1;
      value += next;
    }
  }
  return { value: known ? value : null, known, missing: records.length - known, total: records.length };
}

export function pipelineSummary(deals: DealRecord[]) {
  const open = openDeals(deals);
  const onHold = onHoldDeals(deals);
  const openValue = summarizeNumbers(open, (deal) => deal.dealValue);
  const onHoldValue = summarizeNumbers(onHold, (deal) => deal.dealValue);
  return {
    openValue,
    onHoldValue,
    openCount: open.length,
    knownCoverage: open.length ? openValue.known / open.length : null,
    averageKnownValue: openValue.known && openValue.value !== null ? openValue.value / openValue.known : null,
  };
}

export function winRate(deals: DealRecord[]) {
  const won = deals.filter((deal) => keyOf(deal.status) === "won").length;
  const dead = deals.filter((deal) => ["dead", "lost"].includes(keyOf(deal.status))).length;
  return { won, dead, denominator: won + dead, rate: won + dead ? won / (won + dead) : null };
}

export function openPipelineBySector(deals: DealRecord[]) {
  const result = new Map<string, { count: number; known: number; missing: number; value: number }>();
  for (const deal of openDeals(deals)) {
    const sector = deal.sector || "Unknown sector";
    const current = result.get(sector) || { count: 0, known: 0, missing: 0, value: 0 };
    current.count += 1;
    if (deal.dealValue === null) {
      current.missing += 1;
    } else {
      current.known += 1;
      current.value += deal.dealValue;
    }
    result.set(sector, current);
  }
  return [...result.entries()]
    .map(([sector, item]) => ({ sector, ...item, value: item.known ? item.value : null }))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || b.count - a.count);
}

export function workOrderSummary(workOrders: WorkOrderRecord[]) {
  const contractedExcl = summarizeNumbers(workOrders, (wo) => wo.contractedExcludingGst);
  const contractedIncl = summarizeNumbers(workOrders, (wo) => wo.contractedIncludingGst);
  const billedExcl = summarizeNumbers(workOrders, (wo) => wo.billedExcludingGst);
  const billedIncl = summarizeNumbers(workOrders, (wo) => wo.billedIncludingGst);
  const collectedIncl = summarizeNumbers(workOrders, (wo) => wo.collectedIncludingGst);
  const positiveReceivables = summarizeNumbers(workOrders.filter((wo) => (wo.receivable ?? 0) > 0), (wo) => wo.receivable);
  const positiveUnbilledExcl = summarizeNumbers(workOrders.filter((wo) => (wo.unbilledExcludingGst ?? 0) > 0), (wo) => wo.unbilledExcludingGst);
  const positiveUnbilledIncl = summarizeNumbers(workOrders.filter((wo) => (wo.unbilledIncludingGst ?? 0) > 0), (wo) => wo.unbilledIncludingGst);
  const negativeReceivableRows = workOrders.filter((wo) => (wo.receivable ?? 0) < 0).length;
  const negativeUnbilledRows = workOrders.filter((wo) => (wo.unbilledExcludingGst ?? 0) < 0 || (wo.unbilledIncludingGst ?? 0) < 0).length;
  return {
    contractedExcl,
    contractedIncl,
    billedExcl,
    billedIncl,
    collectedIncl,
    positiveReceivables,
    positiveUnbilledExcl,
    positiveUnbilledIncl,
    negativeReceivableRows,
    negativeUnbilledRows,
    collectionRate: billedIncl.value !== null && billedIncl.value !== 0 && collectedIncl.value !== null ? collectedIncl.value / billedIncl.value : null,
  };
}

export function isOverdueWorkOrder(wo: WorkOrderRecord, asOfDate: string) {
  return wo.probableEndDate !== null && wo.probableEndDate < asOfDate && keyOf(wo.executionStatus) !== "" && keyOf(wo.executionStatus) !== "completed";
}

export function overdueWorkOrders(workOrders: WorkOrderRecord[], asOfDate: string) {
  return workOrders.filter((wo) => isOverdueWorkOrder(wo, asOfDate));
}

export function pastDueUnknownStatusWorkOrders(workOrders: WorkOrderRecord[], asOfDate: string) {
  return workOrders.filter((wo) => wo.probableEndDate !== null && wo.probableEndDate < asOfDate && keyOf(wo.executionStatus) === "");
}

export function countMissingProbableEndDate(workOrders: WorkOrderRecord[]) {
  return workOrders.filter((wo) => wo.probableEndDate === null).length;
}

export function groupWorkOrders(workOrders: WorkOrderRecord[], key: "sector" | "owner" | "status") {
  const result = new Map<string, { count: number; contracted: number; billed: number; collected: number; receivable: number }>();
  for (const wo of workOrders) {
    const label = key === "status" ? wo.executionStatus || "Unknown" : key === "owner" ? wo.ownerCode || "Unknown" : wo.sector || "Unknown";
    const current = result.get(label) || { count: 0, contracted: 0, billed: 0, collected: 0, receivable: 0 };
    current.count += 1;
    current.contracted += wo.contractedExcludingGst ?? 0;
    current.billed += wo.billedExcludingGst ?? 0;
    current.collected += wo.collectedIncludingGst ?? 0;
    current.receivable += wo.receivable && wo.receivable > 0 ? wo.receivable : 0;
    result.set(label, current);
  }
  return [...result.entries()].map(([label, item]) => ({ label, ...item })).sort((a, b) => b.contracted - a.contracted || b.count - a.count);
}

export function dataQualitySummary(data: BoardData) {
  return {
    deals: {
      missingDealValue: data.deals.filter((deal) => deal.dealValue === null).length,
      missingActualCloseDate: data.deals.filter((deal) => deal.actualCloseDate === null).length,
      missingTentativeCloseDate: data.deals.filter((deal) => deal.tentativeCloseDate === null).length,
      missingClosureProbability: data.deals.filter((deal) => deal.closureProbability === null).length,
      malformedRowsRemoved: data.dealQuality.skippedHeaderRows,
      total: data.deals.length,
    },
    workOrders: {
      missingBilledExcludingGst: data.workOrders.filter((wo) => wo.billedExcludingGst === null).length,
      missingCollectedIncludingGst: data.workOrders.filter((wo) => wo.collectedIncludingGst === null).length,
      missingProbableEndDate: data.workOrders.filter((wo) => wo.probableEndDate === null).length,
      missingCollectionStatus: data.workOrders.filter((wo) => !wo.collectionStatus).length,
      missingCollectionDate: data.workOrders.filter((wo) => wo.collectionDate === null).length,
      negativeReceivableRows: data.workOrders.filter((wo) => (wo.receivable ?? 0) < 0).length,
      negativeUnbilledRows: data.workOrders.filter((wo) => (wo.unbilledExcludingGst ?? 0) < 0 || (wo.unbilledIncludingGst ?? 0) < 0).length,
      total: data.workOrders.length,
    },
  };
}

export function buildMetrics(data: BoardData, plan: QueryPlan, fallbackAsOfDate: string) {
  const asOfDate = plan.referenceDate || fallbackAsOfDate;
  const deals = applyDealFilters(data.deals, plan);
  const workOrderPlan =
    plan.intent === "overdue_work_orders"
      ? { ...plan, filters: { ...plan.filters, statuses: plan.filters.statuses?.filter((status) => keyOf(status) !== "incomplete") } }
      : plan;
  const workOrders = applyWorkOrderFilters(data.workOrders, workOrderPlan);
  const pipe = pipelineSummary(deals);
  const wo = workOrderSummary(workOrders);
  const won = winRate(deals);
  const overdue = overdueWorkOrders(workOrders, asOfDate);
  const pastDueUnknownStatus = pastDueUnknownStatusWorkOrders(workOrders, asOfDate);
  const quality = dataQualitySummary(data);
  return { asOfDate, deals, workOrders, pipe, wo, won, overdue, pastDueUnknownStatus, quality };
}

export function sourceList(plan: QueryPlan): SourceName[] {
  if (plan.source === "deals") return ["Deals"];
  if (plan.source === "work_orders") return ["Work Orders"];
  return ["Deals", "Work Orders"];
}

function sectorMatches(actual: string, requested: string) {
  const normalized = keyOf(requested);
  if (normalized === "both") return ["renewables", "powerline"].includes(keyOf(actual));
  return keyOf(actual).includes(normalized);
}
