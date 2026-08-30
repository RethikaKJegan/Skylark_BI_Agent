import type { ServerEnv } from "./env";
import { quarterBounds } from "./normalize";
import { queryPlanSchema } from "./schema";
import type { GeminiFailureCategory, MetricKey, QueryPlan } from "./types";

type PlanResult =
  | { plan: QueryPlan; fallback: false }
  | { plan: QueryPlan; fallback: true; failureCategory: GeminiFailureCategory };

export async function planQuestion(message: string, history: Array<{ role: string; content: string }>, env: ServerEnv): Promise<PlanResult> {
  try {
    return { plan: await geminiPlan(message, history, env), fallback: false };
  } catch (error) {
    const failureCategory = classifyGeminiError(error);
    logGeminiFailure(error, env.GEMINI_MODEL, failureCategory);
    return { plan: fallbackPlan(message, env.BUSINESS_TIMEZONE), fallback: true, failureCategory };
  }
}

export async function geminiHealthCheck(env: ServerEnv) {
  if (!env.GEMINI_API_KEY) throw new GeminiPlanError("missing_key", "GEMINI_API_KEY is missing.");
  const text = await callGeminiText(env, "Reply with only OK");
  const cleaned = text.trim();
  if (cleaned !== "OK") throw new GeminiPlanError("empty_response", `Gemini health check returned unexpected text: ${cleaned.slice(0, 40)}`);
  return cleaned;
}

async function geminiPlan(message: string, history: Array<{ role: string; content: string }>, env: ServerEnv): Promise<QueryPlan> {
  await geminiHealthCheck(env);
  const prompt = `Return only valid JSON. Schema:
{"source":"deals|work_orders|both","intent":"record_count|open_pipeline|weighted_pipeline|win_rate|contracted_value|billed_value|collected_value|collection_rate|receivables|unbilled_backlog|overdue_work_orders|sector_comparison|data_quality|leadership_update|clarification|unsupported","metrics":["same enum"],"filters":{"sectors":[],"owners":[],"statuses":[],"dateRange":{"start":"YYYY-MM-DD","end":"YYYY-MM-DD","dateField":"column title"}},"groupBy":"sector|owner|stage|status|null","referenceDate":"YYYY-MM-DD","gstBasis":"excluding|including|both|null","clarification":{"required":false,"reason":"","question":"","options":[]}}
Rules: revenue is ambiguous; energy sector is ambiguous between Renewables, Powerline, or both. Preserve exact requested metric. Never calculate totals. Use prior chat only for follow-up context.
History: ${JSON.stringify(history.slice(-6))}
Question: ${message}`;
  const text = stripJsonFences(await callGeminiText(env, prompt));
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.warn("[gemini] invalid_json raw_response", text.slice(0, 1000));
    throw new GeminiPlanError("invalid_json", error instanceof Error ? error.message : "Invalid JSON");
  }
  const parsed = queryPlanSchema.safeParse(parsedJson);
  if (!parsed.success) {
    if (process.env.NODE_ENV === "development") console.warn("[gemini] schema_validation raw_response", text.slice(0, 1000));
    throw new GeminiPlanError("schema_validation", parsed.error.message);
  }
  return parsed.data;
}

async function callGeminiText(env: ServerEnv, prompt: string): Promise<string> {
  if (!env.GEMINI_API_KEY) throw new GeminiPlanError("missing_key", "GEMINI_API_KEY is missing.");
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    throw new GeminiPlanError("network", error instanceof Error ? error.message : "Gemini network failure");
  }
  if (!response.ok) {
    const message = await safeResponseMessage(response);
    throw new GeminiPlanError(categoryFromStatus(response.status, message), message, response.status);
  }
  const payload = (await response.json()) as { text?: string; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = payload.text ?? payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
  if (!text?.trim()) throw new GeminiPlanError("empty_response", "Gemini returned no text.");
  return text;
}

export function stripJsonFences(text: string) {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

export function fallbackPlan(message: string, timezone = "Asia/Kolkata"): QueryPlan {
  const text = message.toLowerCase();
  if (/\brevenue\b/.test(text)) {
    return clarification("revenue_measure", "Which revenue measure do you want?", ["Open sales pipeline", "Contracted work-order value", "Billed revenue", "Collected cash"]);
  }
  if (/\benergy\b/.test(text)) {
    return clarification("energy_sector", "Should Energy include Renewables, Powerline, or both?", ["Renewables", "Powerline", "Both"]);
  }
  if (text.includes("leadership")) return plan("both", "leadership_update");
  if (text.includes("records") || text.includes("record count")) return plan("both", "record_count");
  if (text.includes("quality") || text.includes("gap") || text.includes("problem")) return plan("both", "data_quality");
  if (text.includes("win rate")) return plan("deals", "win_rate");
  if (text.includes("overdue")) return { ...plan("work_orders", "overdue_work_orders"), referenceDate: parseReferenceDate(text) || undefined, groupBy: "status" };
  if (text.includes("collection rate")) return plan("work_orders", "collection_rate");
  if (text.includes("collected")) return plan("work_orders", "collected_value");
  if (text.includes("billed")) return { ...plan("work_orders", "billed_value"), gstBasis: "both" };
  if (text.includes("contracted")) return { ...plan("work_orders", "contracted_value"), gstBasis: text.includes("excluding") ? "excluding" : text.includes("including") ? "including" : "both" };
  if (text.includes("receivable")) return plan("work_orders", "receivables");
  if (text.includes("unbilled") || text.includes("backlog")) return plan("work_orders", "unbilled_backlog");
  if (text.includes("compare") && text.includes("mining")) return { ...plan("both", "sector_comparison"), filters: { sectors: ["Mining"] }, groupBy: "sector" };
  if (text.includes("compare") && text.includes("sector")) return { ...plan("both", "sector_comparison"), groupBy: "sector" };
  const sectors = ["mining", "renewables", "powerline", "railways", "tender", "dsp"].filter((sector) => text.includes(sector));
  const dateRange = text.includes("quarter") ? { ...quarterBounds(new Date(), timezone), dateField: "Tentative Close Date" } : undefined;
  if (text.includes("weighted")) return { ...plan("deals", "weighted_pipeline"), filters: { sectors, dateRange }, groupBy: "sector" };
  if (text.includes("pipeline") || text.includes("deal")) return { ...plan("deals", "open_pipeline"), filters: { sectors, dateRange }, groupBy: text.includes("owner") ? "owner" : text.includes("stage") ? "stage" : "sector" };
  return plan("deals", "unsupported");
}

export class GeminiPlanError extends Error {
  constructor(
    public category: GeminiFailureCategory,
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

function plan(source: QueryPlan["source"], metric: MetricKey): QueryPlan {
  return { source, intent: metric, metrics: [metric], filters: {}, groupBy: null, gstBasis: null };
}

function clarification(reason: string, question: string, options: string[]): QueryPlan {
  return { source: "both", intent: "clarification", metrics: ["clarification"], filters: {}, groupBy: null, gstBasis: null, clarification: { required: true, reason, question, options } };
}

function parseReferenceDate(text: string) {
  if (text.includes("30 august 2026") || text.includes("30 aug 2026")) return "2026-08-30";
  return null;
}

function classifyGeminiError(error: unknown): GeminiFailureCategory {
  if (error instanceof GeminiPlanError) return error.category;
  return "network";
}

function logGeminiFailure(error: unknown, model: string, failureCategory: GeminiFailureCategory) {
  const status = error instanceof GeminiPlanError ? error.status : undefined;
  const message = error instanceof Error ? error.message : "Unknown Gemini failure";
  console.warn("[gemini] planner_fallback", { status, message, model, failureCategory });
}

function categoryFromStatus(status: number, message: string): GeminiFailureCategory {
  if (status === 401 || status === 403) return "authentication";
  if (status === 404 || /not found/i.test(message)) return "model_not_found";
  if (status === 429 || /quota/i.test(message)) return "quota";
  return "network";
}

async function safeResponseMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string; status?: string; code?: number } };
    return body.error?.message || body.error?.status || `Gemini request failed with status ${response.status}.`;
  } catch {
    return `Gemini request failed with status ${response.status}.`;
  }
}
