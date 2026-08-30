import type { BoardData, ChatResponse, QueryPlan } from "./types";
import { buildMetrics, countMissingProbableEndDate, currency, groupWorkOrders, openPipelineBySector, percent, sourceList, workOrderSummary } from "./metrics";

export function formatAnswer(data: BoardData, plan: QueryPlan, todayIso: string, fallback = false): ChatResponse {
  if (plan.clarification?.required) {
    return {
      status: "clarification",
      question: plan.clarification.question || "Can you clarify the metric you want?",
      options: plan.clarification.options || [],
    };
  }
  if (plan.intent === "unsupported") return { status: "error", message: "I cannot answer that from the configured Monday.com boards.", retryable: false };

  const computed = buildMetrics(data, plan, todayIso);
  const recordCounts = {
    deals: plan.source !== "work_orders" ? data.deals.length : undefined,
    workOrders: plan.source !== "deals" ? data.workOrders.length : undefined,
  };
  const base = { sources: sourceList(plan), fetchedAt: data.fetchedAt, recordCounts, fallback };

  if (plan.intent === "record_count") {
    const total = data.deals.length + data.workOrders.length;
    return success(`There are ${total} usable records available after removing structural rows.`, [
      { label: "Usable Deals", value: String(data.deals.length), context: `${data.dealQuality.skippedHeaderRows} structural rows removed` },
      { label: "Work Orders", value: String(data.workOrders.length) },
      { label: "Total usable", value: String(total) },
    ], ["Structural/header-like deal rows are removed before counts, metrics and caveats."], base);
  }

  if (plan.intent === "win_rate") {
    return success(`Deal win rate is ${percent(computed.won.rate)}.`, [
      { label: "Win rate", value: percent(computed.won.rate), context: `${computed.won.won} / (${computed.won.won} + ${computed.won.dead})` },
      { label: "Won deals", value: String(computed.won.won) },
      { label: "Dead deals", value: String(computed.won.dead) },
    ], ["Win rate excludes Open, On Hold and blank statuses from the denominator."], { ...base, sources: ["Deals"] });
  }

  if (plan.intent === "open_pipeline" || plan.intent === "weighted_pipeline") {
    const sectors = openPipelineBySector(computed.deals);
    const onHold = computed.pipe.onHoldValue;
    return success(`Open pipeline is ${currency(computed.pipe.openValue.value, 2)} across ${computed.pipe.openCount} open deals.`, [
      { label: "Open pipeline", value: currency(computed.pipe.openValue.value, 2) },
      { label: "Known open values", value: String(computed.pipe.openValue.known), context: `${computed.pipe.openValue.missing} missing` },
      { label: "Known-value coverage", value: percent(computed.pipe.knownCoverage) },
      { label: "On-hold pipeline", value: currency(onHold.value, 2), context: `${onHold.total} On Hold deals; ${onHold.missing} of ${onHold.total} values missing` },
    ], [`${computed.pipe.openValue.missing} open deals are missing deal value and are excluded from pipeline sums.`], {
      ...base,
      sources: ["Deals"],
      table: {
        columns: ["Sector", "Open deals", "Known values", "Missing values", "Open value"],
        rows: sectors.map((row) => ({
          Sector: row.sector,
          "Open deals": row.count,
          "Known values": row.known,
          "Missing values": row.missing,
          "Open value": currency(row.value, 2),
        })),
      },
    });
  }

  if (plan.intent === "contracted_value") {
    const value = plan.gstBasis === "including" ? computed.wo.contractedIncl : computed.wo.contractedExcl;
    const basis = plan.gstBasis === "including" ? "including GST" : "excluding GST";
    return success(`Total contracted work-order value ${basis} is ${currency(value.value, 2)}.`, [
      { label: `Contracted ${basis}`, value: currency(value.value, 2), context: `${value.known} known / ${value.missing} missing` },
    ], [`Contracted ${basis} is missing for ${value.missing} of ${value.total} work orders.`], { ...base, sources: ["Work Orders"] });
  }

  if (plan.intent === "billed_value") {
    return success(`Billed value is ${currency(computed.wo.billedExcl.value, 2)} excluding GST and ${currency(computed.wo.billedIncl.value, 2)} including GST.`, [
      { label: "Billed excluding GST", value: currency(computed.wo.billedExcl.value, 2), context: `${computed.wo.billedExcl.known} known / ${computed.wo.billedExcl.missing} missing` },
      { label: "Billed including GST", value: currency(computed.wo.billedIncl.value, 2), context: `${computed.wo.billedIncl.known} known / ${computed.wo.billedIncl.missing} missing` },
    ], [
      `Billed excluding GST is missing for ${computed.wo.billedExcl.missing} of ${computed.wo.billedExcl.total} work orders.`,
      `Billed including GST is missing for ${computed.wo.billedIncl.missing} of ${computed.wo.billedIncl.total} work orders.`,
    ], { ...base, sources: ["Work Orders"] });
  }

  if (plan.intent === "collected_value") {
    return success(`Collected cash is ${currency(computed.wo.collectedIncl.value, 2)} including GST.`, [
      { label: "Collected including GST", value: currency(computed.wo.collectedIncl.value, 2), context: `${computed.wo.collectedIncl.known} known / ${computed.wo.collectedIncl.missing} missing` },
    ], [`Collected including GST is missing for ${computed.wo.collectedIncl.missing} of ${computed.wo.collectedIncl.total} work orders.`], { ...base, sources: ["Work Orders"] });
  }

  if (plan.intent === "collection_rate") {
    return success(`Collection rate is ${percent(computed.wo.collectionRate)}.`, [
      { label: "Collection rate", value: percent(computed.wo.collectionRate), context: "Collected incl. GST / billed incl. GST" },
      { label: "Collected including GST", value: currency(computed.wo.collectedIncl.value, 2) },
      { label: "Billed including GST", value: currency(computed.wo.billedIncl.value, 2) },
    ], [`Collected including GST is missing for ${computed.wo.collectedIncl.missing} of ${computed.wo.collectedIncl.total} work orders.`], { ...base, sources: ["Work Orders"] });
  }

  if (plan.intent === "receivables") {
    return success(`Positive receivables are ${currency(computed.wo.positiveReceivables.value, 2)}.`, [
      { label: "Positive receivables", value: currency(computed.wo.positiveReceivables.value, 2) },
      { label: "Negative receivable rows", value: String(computed.wo.negativeReceivableRows) },
    ], [`${computed.wo.negativeReceivableRows} negative receivable rows are flagged separately and not netted against exposure.`], { ...base, sources: ["Work Orders"] });
  }

  if (plan.intent === "unbilled_backlog") {
    return success(`Positive unbilled backlog is ${currency(computed.wo.positiveUnbilledExcl.value, 2)} excluding GST.`, [
      { label: "Unbilled excl. GST", value: currency(computed.wo.positiveUnbilledExcl.value, 2) },
      { label: "Unbilled incl. GST", value: currency(computed.wo.positiveUnbilledIncl.value, 2) },
      { label: "Negative unbilled rows", value: String(computed.wo.negativeUnbilledRows) },
    ], [`${computed.wo.negativeUnbilledRows} work orders have negative unbilled values and are reported as anomalies.`], { ...base, sources: ["Work Orders"] });
  }

  if (plan.intent === "overdue_work_orders") {
    const statusRows = groupCounts(computed.overdue, (wo) => wo.executionStatus);
    const unknownNames = computed.pastDueUnknownStatus.map((wo) => wo.dealName).filter(Boolean).slice(0, 3);
    return success(`As of ${computed.asOfDate}, ${computed.overdue.length} incomplete work orders are confirmed overdue.`, [
      { label: "Total work orders", value: String(computed.workOrders.length) },
      { label: "Confirmed overdue incomplete", value: String(computed.overdue.length) },
      { label: "Past due, status unknown", value: String(computed.pastDueUnknownStatus.length), context: unknownNames.join(", ") || undefined },
      { label: "Missing probable end date", value: String(countMissingProbableEndDate(computed.workOrders)) },
    ], [
      `${countMissingProbableEndDate(computed.workOrders)} work orders are missing probable end date and cannot be assessed for overdue status.`,
      `${computed.pastDueUnknownStatus.length} rows have a past probable end date but unknown execution status.`,
    ], {
      ...base,
      sources: ["Work Orders"],
      table: { columns: ["Execution status", "Confirmed overdue count"], rows: statusRows.map((row) => ({ "Execution status": row.label, "Confirmed overdue count": row.count })) },
    });
  }

  if (plan.intent === "sector_comparison") {
    const sectorDeals = openPipelineBySector(computed.deals);
    const sectorWo = groupWorkOrders(computed.workOrders, "sector");
    return success("Pipeline and execution are compared independently by normalized sector; no masked deal-name row join is performed.", [
      { label: "Open pipeline", value: currency(computed.pipe.openValue.value, 2) },
      { label: "Work orders", value: String(computed.workOrders.length) },
      { label: "Contracted excl. GST", value: currency(computed.wo.contractedExcl.value, 2) },
      { label: "Positive receivables", value: currency(computed.wo.positiveReceivables.value, 2) },
    ], ["Deals and work orders are aggregated independently by sector because masked deal names can repeat."], {
      ...base,
      sources: ["Deals", "Work Orders"],
      table: {
        columns: ["Sector", "Open deals", "Open pipeline", "Work orders", "Contracted excl. GST", "Billed excl. GST", "Collected incl. GST", "Positive receivables"],
        rows: sectorDeals.map((dealRow) => {
          const woRow = sectorWo.find((row) => row.label.toLowerCase() === dealRow.sector.toLowerCase());
          return {
            Sector: dealRow.sector,
            "Open deals": dealRow.count,
            "Open pipeline": currency(dealRow.value, 2),
            "Work orders": woRow?.count ?? 0,
            "Contracted excl. GST": currency(woRow?.contracted ?? null, 2),
            "Billed excl. GST": currency(woRow?.billed ?? null, 2),
            "Collected incl. GST": currency(woRow?.collected ?? null, 2),
            "Positive receivables": currency(woRow?.receivable ?? null, 2),
          };
        }),
      },
    });
  }

  if (plan.intent === "data_quality") {
    const q = computed.quality;
    return success("The biggest data-quality problems are missing close dates, missing deal values, missing collection fields and negative financial anomalies.", [
      { label: "Missing deal value", value: `${q.deals.missingDealValue} of ${q.deals.total}`, context: percent(q.deals.total ? q.deals.missingDealValue / q.deals.total : null) },
      { label: "Missing collected amount", value: `${q.workOrders.missingCollectedIncludingGst} of ${q.workOrders.total}`, context: percent(q.workOrders.total ? q.workOrders.missingCollectedIncludingGst / q.workOrders.total : null) },
      { label: "Missing probable end date", value: `${q.workOrders.missingProbableEndDate} of ${q.workOrders.total}` },
      { label: "Negative receivable rows", value: String(q.workOrders.negativeReceivableRows) },
    ], [`${q.deals.malformedRowsRemoved} malformed structural deal rows were removed before quality and metric calculations.`], { ...base, sources: ["Deals", "Work Orders"] });
  }

  if (plan.intent === "leadership_update") {
    return leadershipUpdate(data, plan, todayIso, fallback);
  }

  return { status: "error", message: "I cannot answer that from the configured Monday.com boards.", retryable: false };
}

function leadershipUpdate(data: BoardData, plan: QueryPlan, todayIso: string, fallback: boolean): ChatResponse {
  const computed = buildMetrics(data, plan, todayIso);
  const wo = workOrderSummary(data.workOrders);
  const won = computed.won;
  const missingEnd = countMissingProbableEndDate(data.workOrders);
  return success([
    `Executive headline: open pipeline is ${currency(computed.pipe.openValue.value, 2)} across ${computed.pipe.openCount} open deals, with ${computed.overdue.length} confirmed overdue incomplete work orders as of ${computed.asOfDate}.`,
    `Sales pipeline: ${computed.pipe.openValue.known} open deals have known values; ${computed.pipe.openValue.missing} open deals are missing values. Win rate is ${percent(won.rate)}.`,
    `Delivery and execution: ${data.workOrders.length} work orders are tracked; ${computed.overdue.length} are confirmed overdue, ${computed.pastDueUnknownStatus.length} are past due with unknown execution status, and ${missingEnd} lack probable end dates.`,
    `Billing and cash: billed including GST is ${currency(wo.billedIncl.value, 2)}, collected including GST is ${currency(wo.collectedIncl.value, 2)}, and positive receivables are ${currency(wo.positiveReceivables.value, 2)}.`,
    `Top risks: overdue delivery, ${wo.collectedIncl.missing} missing collected amounts, ${wo.negativeReceivableRows} negative receivable rows, and missing open deal values.`,
    "Data-quality caveats: missing numeric values are not treated as zero; negative values are preserved and flagged.",
  ].join("\n\n"), [
    { label: "Open pipeline", value: currency(computed.pipe.openValue.value, 2) },
    { label: "Win rate", value: percent(won.rate) },
    { label: "Overdue incomplete", value: String(computed.overdue.length) },
    { label: "Positive receivables", value: currency(wo.positiveReceivables.value, 2) },
  ], [`${computed.pipe.openValue.missing} open deals are missing values; ${wo.collectedIncl.missing} work orders are missing collected amounts.`], {
    sources: ["Deals", "Work Orders"],
    fetchedAt: data.fetchedAt,
    recordCounts: { deals: data.deals.length, workOrders: data.workOrders.length },
    fallback,
  });
}

function success(
  answer: string,
  metrics: Array<{ label: string; value: string; context?: string }>,
  caveats: string[],
  base: Omit<Extract<ChatResponse, { status: "success" }>, "status" | "answer" | "metrics" | "caveats">,
): ChatResponse {
  return { status: "success", answer, metrics, caveats, ...base };
}

function groupCounts<T>(items: T[], selector: (item: T) => string) {
  const map = new Map<string, number>();
  for (const item of items) map.set(selector(item) || "Unknown", (map.get(selector(item) || "Unknown") || 0) + 1);
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}
