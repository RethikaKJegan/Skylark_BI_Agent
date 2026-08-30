import type { DealRecord, QualityReport, WorkOrderRecord } from "./types";

export type RawValue = { text: string; value?: string | null };
export type RawItem = { id: string; name: string; values: Record<string, RawValue> };

const missingTokens = new Set(["", "n/a", "na", "null", "-"]);

export function cleanText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function keyOf(value: string): string {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeMissing(value: unknown): string | undefined {
  const text = cleanText(value);
  return missingTokens.has(text.toLowerCase()) ? undefined : text;
}

export function normalizeLabel(value: unknown): string {
  const text = cleanText(value);
  if (/^billed$/i.test(text) || /^billed$/i.test(text.replace("BI", "Bi"))) return "Billed";
  if (/^pause\s*\/\s*struck$/i.test(text)) return "Paused / Stuck";
  return text;
}

export function parseNumber(value: unknown): { value: number | null; invalid?: boolean; anomaly?: boolean } {
  const candidate = rawToText(value, "number");
  const text = normalizeMissing(candidate);
  if (!text) return { value: null };
  const cleaned = text.replace(/[₹$,\s]/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return { value: null, invalid: true };
  return { value: parsed, anomaly: parsed < 0 };
}

export function parseDate(value: unknown): { value: string | null; invalid?: boolean } {
  const text = normalizeMissing(rawToText(value, "date"));
  if (!text) return { value: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { value: text };
  const iso = /^(\d{4}-\d{2}-\d{2})T/.exec(text);
  if (iso) return { value: iso[1] };
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (Number.isFinite(serial) && serial > 20000) {
      const epoch = Date.UTC(1899, 11, 30);
      return { value: new Date(epoch + serial * 86400000).toISOString().slice(0, 10) };
    }
  }
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(text);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const day = first > 12 ? first : second;
    const month = first > 12 ? second : first;
    if (isValidCalendarDate(year, month, day)) return { value: `${year}-${pad(month)}-${pad(day)}` };
  }
  return { value: null, invalid: true };
}

export function quarterBounds(date = new Date(), timezone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const endMonth = startMonth + 2;
  const endDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return {
    start: `${year}-${String(startMonth).padStart(2, "0")}-01`,
    end: `${year}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`,
  };
}

export function isEmbeddedHeader(values: Record<string, string>, required: string[]) {
  let repeats = 0;
  for (const title of required) {
    if (keyOf(values[title] || "") === keyOf(title)) repeats += 1;
  }
  return repeats >= Math.min(3, required.length);
}

export function isHeaderLikeDeal(values: Record<string, RawValue>) {
  const checks = [
    ["Deal Status", dealAliases.status],
    ["Deal Stage", dealAliases.stage],
    ["Tentative Close Date", dealAliases.tentativeCloseDate],
    ["Created Date", dealAliases.createdDate],
  ];
  return checks.filter(([title, aliases]) => keyOf(pick(values, aliases as string[])) === keyOf(title as string)).length >= 2;
}

function emptyQuality(): QualityReport {
  return { missing: [], invalidNumbers: [], invalidDates: [], anomalies: [], skippedHeaderRows: 0 };
}

function bump(list: QualityReport[keyof Omit<QualityReport, "skippedHeaderRows">], field: string, sample?: string) {
  const item = list.find((issue) => issue.field === field);
  if (item) {
    item.count += 1;
    if (sample && item.examples && item.examples.length < 3) item.examples.push(sample);
  } else {
    list.push({ field, count: 1, examples: sample ? [sample] : [] });
  }
}

function pick(values: Record<string, RawValue>, aliases: string[]) {
  for (const alias of aliases) {
    const exact = values[alias];
    if (exact !== undefined) return rawToText(exact);
    const matched = Object.entries(values).find(([key]) => keyOf(key) === keyOf(alias));
    if (matched) return rawToText(matched[1]);
  }
  return "";
}

const dealAliases = {
  name: ["Deal Name"],
  owner: ["Owner code"],
  client: ["Client Code"],
  status: ["Deal Status"],
  closeDate: ["Close Date (A)"],
  probability: ["Closure Probability"],
  value: ["Masked Deal value"],
  tentativeCloseDate: ["Tentative Close Date"],
  stage: ["Deal Stage"],
  product: ["Product deal"],
  sector: ["Sector/service"],
  createdDate: ["Created Date"],
};

const woAliases = {
  dealName: ["Deal name masked"],
  customer: ["Customer Name Code"],
  serial: ["Serial #"],
  natureOfWork: ["Nature of Work"],
  executionStatus: ["Execution Status"],
  dataDeliveryDate: ["Data Delivery Date"],
  poDate: ["Date of PO/LOI"],
  probableStartDate: ["Probable Start Date"],
  probableEndDate: ["Probable End Date"],
  owner: ["BD/KAM Personnel code"],
  sector: ["Sector"],
  typeOfWork: ["Type of Work"],
  lastInvoiceDate: ["Last invoice date"],
  invoiceStatus: ["Invoice Status"],
  woStatus: ["WO Status (billed)"],
  collectionStatus: ["Collection status"],
  collectionDate: ["Collection Date"],
  billingStatus: ["Billing Status"],
  amountExclGst: ["Amount excluding GST", "Amount in Rupees (Excl of GST) (Masked)"],
  amountInclGst: ["Amount including GST", "Amount in Rupees (Incl of GST) (Masked)"],
  billedExclGst: ["Billed value excluding GST", "Billed Value in Rupees (Excl of GST.) (Masked)"],
  billedInclGst: ["Billed value including GST", "Billed Value in Rupees (Incl of GST.) (Masked)"],
  collectedInclGst: ["Collected amount including GST", "Collected Amount in Rupees (Incl of GST.) (Masked)"],
  amountToBeBilled: ["Amount to be billed", "Amount to be billed in Rs. (Exl. of GST) (Masked)"],
  amountToBeBilledIncl: ["Amount to be billed in Rs. (Incl. of GST) (Masked)"],
  amountReceivable: ["Amount receivable", "Amount Receivable (Masked)"],
};

export function normalizeDeals(items: RawItem[]) {
  const quality = emptyQuality();
  const deals: DealRecord[] = [];
  for (const item of items) {
    const values = { ...item.values, "Deal Name": { text: item.name } };
    if (isHeaderLikeDeal(values)) {
      quality.skippedHeaderRows += 1;
      continue;
    }
    const value = parseNumber(pick(values, dealAliases.value));
    const closeDate = parseDate(pick(values, dealAliases.closeDate));
    const tentative = parseDate(pick(values, dealAliases.tentativeCloseDate));
    if (value.invalid) bump(quality.invalidNumbers, "Masked Deal value", pick(values, dealAliases.value));
    if (value.anomaly) bump(quality.anomalies, "Masked Deal value", pick(values, dealAliases.value));
    if (closeDate.invalid) bump(quality.invalidDates, "Close Date (A)", pick(values, dealAliases.closeDate));
    if (tentative.invalid) bump(quality.invalidDates, "Tentative Close Date", pick(values, dealAliases.tentativeCloseDate));
    if (value.value === null) bump(quality.missing, "Masked Deal value");
    deals.push({
      name: cleanText(pick(values, dealAliases.name) || item.name),
      ownerCode: normalizeLabel(pick(values, dealAliases.owner)),
      clientCode: normalizeLabel(pick(values, dealAliases.client)),
      status: normalizeLabel(pick(values, dealAliases.status)),
      actualCloseDate: closeDate.value,
      closureProbability: normalizeProbability(pick(values, dealAliases.probability)),
      dealValue: value.value,
      tentativeCloseDate: tentative.value,
      stage: normalizeLabel(pick(values, dealAliases.stage)),
      product: normalizeLabel(pick(values, dealAliases.product)),
      sector: normalizeLabel(pick(values, dealAliases.sector)),
      createdDate: parseDate(pick(values, dealAliases.createdDate)).value,
    });
  }
  return { deals, quality };
}

export function normalizeWorkOrders(items: RawItem[]) {
  const quality = emptyQuality();
  const workOrders: WorkOrderRecord[] = [];
  for (const item of items) {
    const values = { ...item.values, "Deal name masked": { text: item.name } };
    if (isEmbeddedHeader(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, rawToText(value)])), ["Deal name masked", "Execution Status", "Billing Status"])) {
      quality.skippedHeaderRows += 1;
      continue;
    }
    const nums = {
      amountExclGst: parseNumber(pick(values, woAliases.amountExclGst)),
      amountInclGst: parseNumber(pick(values, woAliases.amountInclGst)),
      billedExclGst: parseNumber(pick(values, woAliases.billedExclGst)),
      billedInclGst: parseNumber(pick(values, woAliases.billedInclGst)),
      collectedInclGst: parseNumber(pick(values, woAliases.collectedInclGst)),
      amountToBeBilled: parseNumber(pick(values, woAliases.amountToBeBilled)),
      amountToBeBilledIncl: parseNumber(pick(values, woAliases.amountToBeBilledIncl)),
      amountReceivable: parseNumber(pick(values, woAliases.amountReceivable)),
    };
    for (const [field, result] of Object.entries(nums)) {
      if (result.invalid) bump(quality.invalidNumbers, field);
      if (result.anomaly) bump(quality.anomalies, field);
    }
    const dates = {
      dataDeliveryDate: parseDate(pick(values, woAliases.dataDeliveryDate)),
      poDate: parseDate(pick(values, woAliases.poDate)),
      probableStartDate: parseDate(pick(values, woAliases.probableStartDate)),
      probableEndDate: parseDate(pick(values, woAliases.probableEndDate)),
    };
    for (const [field, result] of Object.entries(dates)) {
      if (result.invalid) bump(quality.invalidDates, field);
    }
    if (nums.amountReceivable.value === null) bump(quality.missing, "Amount receivable");
    workOrders.push({
      dealName: cleanText(pick(values, woAliases.dealName) || item.name),
      customerCode: normalizeLabel(pick(values, woAliases.customer)),
      serialNumber: normalizeLabel(pick(values, woAliases.serial)),
      natureOfWork: normalizeLabel(pick(values, woAliases.natureOfWork)),
      executionStatus: normalizeLabel(pick(values, woAliases.executionStatus)),
      dataDeliveryDate: dates.dataDeliveryDate.value,
      poDate: dates.poDate.value,
      probableStartDate: dates.probableStartDate.value,
      probableEndDate: dates.probableEndDate.value,
      ownerCode: normalizeLabel(pick(values, woAliases.owner)),
      sector: normalizeLabel(pick(values, woAliases.sector)),
      typeOfWork: normalizeLabel(pick(values, woAliases.typeOfWork)),
      lastInvoiceDate: parseDate(pick(values, woAliases.lastInvoiceDate)).value,
      contractedExcludingGst: nums.amountExclGst.value,
      contractedIncludingGst: nums.amountInclGst.value,
      billedExcludingGst: nums.billedExclGst.value,
      billedIncludingGst: nums.billedInclGst.value,
      collectedIncludingGst: nums.collectedInclGst.value,
      unbilledExcludingGst: nums.amountToBeBilled.value,
      unbilledIncludingGst: nums.amountToBeBilledIncl.value,
      receivable: nums.amountReceivable.value,
      invoiceStatus: normalizeLabel(pick(values, woAliases.invoiceStatus)),
      workOrderStatus: normalizeLabel(pick(values, woAliases.woStatus)),
      collectionStatus: normalizeLabel(pick(values, woAliases.collectionStatus)),
      collectionDate: parseDate(pick(values, woAliases.collectionDate)).value,
      billingStatus: normalizeLabel(pick(values, woAliases.billingStatus)),
    });
  }
  return { workOrders, quality };
}

function normalizeProbability(value: string): DealRecord["closureProbability"] {
  const text = keyOf(value);
  if (text === "high") return "High";
  if (text === "medium") return "Medium";
  if (text === "low") return "Low";
  return null;
}

type ColumnRequirement = {
  label: string;
  aliases: string[];
  optional?: boolean;
};

export function requiredColumnGroupsFor(board: "deals" | "work_orders"): ColumnRequirement[] {
  const entries = board === "deals" ? Object.entries(dealAliases) : Object.entries(woAliases);
  return entries.map(([key, aliases]) => ({
    label: aliases[0],
    aliases,
    optional: key === "name" || key === "dealName",
  }));
}

function rawToText(value: unknown, preferred?: "number" | "date") {
  if (typeof value === "object" && value !== null && "text" in value) {
    const raw = value as RawValue;
    if (preferred === "number" && raw.value) {
      try {
        const parsed = JSON.parse(raw.value);
        if (typeof parsed === "number") return String(parsed);
        if (typeof parsed?.amount === "number") return String(parsed.amount);
        if (typeof parsed?.value === "number") return String(parsed.value);
      } catch {
        return raw.value;
      }
    }
    if (preferred === "date" && raw.value) {
      try {
        const parsed = JSON.parse(raw.value);
        if (typeof parsed?.date === "string") return parsed.date;
      } catch {
        return raw.value;
      }
    }
    return raw.text;
  }
  return String(value ?? "");
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function isValidCalendarDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
