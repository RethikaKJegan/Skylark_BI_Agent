export type SourceName = "Deals" | "Work Orders";
export type GeminiFailureCategory =
  | "missing_key"
  | "authentication"
  | "model_not_found"
  | "quota"
  | "network"
  | "empty_response"
  | "invalid_json"
  | "schema_validation";
export type MetricKey =
  | "record_count"
  | "open_pipeline"
  | "weighted_pipeline"
  | "win_rate"
  | "contracted_value"
  | "billed_value"
  | "collected_value"
  | "collection_rate"
  | "receivables"
  | "unbilled_backlog"
  | "overdue_work_orders"
  | "sector_comparison"
  | "data_quality"
  | "leadership_update"
  | "clarification"
  | "unsupported";

export type QueryPlan = {
  source: "deals" | "work_orders" | "both";
  intent: MetricKey;
  metrics: MetricKey[];
  filters: {
    sectors?: string[];
    owners?: string[];
    statuses?: string[];
    dateRange?: { start: string; end: string; dateField: string };
  };
  groupBy?: "sector" | "owner" | "stage" | "status" | null;
  referenceDate?: string;
  gstBasis?: "excluding" | "including" | "both" | null;
  clarification?: { required: boolean; reason?: string; question?: string; options?: string[] };
};

export type QualityIssue = {
  field: string;
  count: number;
  examples?: string[];
};

export type QualityReport = {
  missing: QualityIssue[];
  invalidNumbers: QualityIssue[];
  invalidDates: QualityIssue[];
  anomalies: QualityIssue[];
  skippedHeaderRows: number;
};

export type DealRecord = {
  name: string;
  ownerCode: string;
  clientCode: string;
  status: string;
  actualCloseDate: string | null;
  closureProbability: "High" | "Medium" | "Low" | null;
  dealValue: number | null;
  tentativeCloseDate: string | null;
  stage: string;
  product: string;
  sector: string;
  createdDate: string | null;
};

export type WorkOrderRecord = {
  dealName: string;
  customerCode: string;
  serialNumber: string;
  natureOfWork: string;
  executionStatus: string;
  dataDeliveryDate: string | null;
  poDate: string | null;
  probableStartDate: string | null;
  probableEndDate: string | null;
  ownerCode: string;
  sector: string;
  typeOfWork: string;
  lastInvoiceDate: string | null;
  contractedExcludingGst: number | null;
  contractedIncludingGst: number | null;
  billedExcludingGst: number | null;
  billedIncludingGst: number | null;
  collectedIncludingGst: number | null;
  unbilledExcludingGst: number | null;
  unbilledIncludingGst: number | null;
  receivable: number | null;
  invoiceStatus: string;
  workOrderStatus: string;
  collectionStatus: string;
  collectionDate: string | null;
  billingStatus: string;
};

export type BoardData = {
  deals: DealRecord[];
  workOrders: WorkOrderRecord[];
  dealQuality: QualityReport;
  workOrderQuality: QualityReport;
  fetchedAt: string;
};

export type ChatResponse =
  | {
      status: "success";
      answer: string;
      metrics: Array<{ label: string; value: string; context?: string }>;
      table?: { columns: string[]; rows: Array<Record<string, string | number>> };
      caveats: string[];
      sources: SourceName[];
      fetchedAt: string;
      recordCounts: { deals?: number; workOrders?: number };
      fallback?: boolean;
      planning?: { mode: "gemini" | "fallback"; failureCategory?: GeminiFailureCategory };
    }
  | {
      status: "clarification";
      question: string;
      options: string[];
      planning?: { mode: "gemini" | "fallback"; failureCategory?: GeminiFailureCategory };
    }
  | { status: "error"; message: string; retryable: boolean };
