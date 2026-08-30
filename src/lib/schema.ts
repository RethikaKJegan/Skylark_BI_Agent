import { z } from "zod";

export const queryPlanSchema = z.object({
  source: z.enum(["deals", "work_orders", "both"]),
  intent: z.enum([
    "record_count",
    "open_pipeline",
    "weighted_pipeline",
    "win_rate",
    "contracted_value",
    "billed_value",
    "collected_value",
    "collection_rate",
    "receivables",
    "unbilled_backlog",
    "overdue_work_orders",
    "sector_comparison",
    "data_quality",
    "leadership_update",
    "clarification",
    "unsupported",
  ]),
  metrics: z
    .array(
      z.enum([
        "record_count",
        "open_pipeline",
        "weighted_pipeline",
        "win_rate",
        "contracted_value",
        "billed_value",
        "collected_value",
        "collection_rate",
        "receivables",
        "unbilled_backlog",
        "overdue_work_orders",
        "sector_comparison",
        "data_quality",
        "leadership_update",
        "clarification",
        "unsupported",
      ]),
    )
    .default([]),
  filters: z
    .object({
      sectors: z.array(z.string()).optional(),
      owners: z.array(z.string()).optional(),
      statuses: z.array(z.string()).optional(),
      dateRange: z.preprocess(
        (value) => {
          if (!value || typeof value !== "object") return undefined;
          const candidate = value as { start?: unknown; end?: unknown; dateField?: unknown };
          return typeof candidate.start === "string" && typeof candidate.end === "string" && typeof candidate.dateField === "string"
            ? value
            : undefined;
        },
        z
          .object({
            start: z.string(),
            end: z.string(),
            dateField: z.string(),
          })
          .optional(),
      ),
    })
    .default({}),
  groupBy: z.enum(["sector", "owner", "stage", "status"]).nullable().optional(),
  referenceDate: z.string().nullable().optional().transform((value) => value ?? undefined),
  gstBasis: z.enum(["excluding", "including", "both"]).nullable().optional(),
  clarification: z
    .object({
      required: z.boolean(),
      reason: z.string().optional(),
      question: z.string().optional(),
      options: z.array(z.string()).optional(),
    })
    .optional(),
});

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(6)
    .optional(),
});
