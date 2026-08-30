import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { formatAnswer } from "@/lib/format";
import { loadBoardData } from "@/lib/data";
import { MissingColumnsError, MondayError } from "@/lib/monday";
import { planQuestion } from "@/lib/planner";
import { chatRequestSchema } from "@/lib/schema";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
    if (!rateLimit(ip)) return NextResponse.json({ status: "error", message: "Too many requests. Try again shortly.", retryable: true }, { status: 429 });
    const parsed = chatRequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ status: "error", message: "Invalid request.", retryable: false }, { status: 400 });
    const envResult = getServerEnv();
    if (!envResult.ok) {
      return NextResponse.json({ status: "error", message: `Missing server environment variables: ${envResult.missing.join(", ")}`, retryable: false }, { status: 500 });
    }

    const planResult = await planQuestion(parsed.data.message, compactHistory(parsed.data.history || []), envResult.env);
    const planning = planResult.fallback
      ? { mode: "fallback" as const, failureCategory: process.env.NODE_ENV === "development" ? planResult.failureCategory : undefined }
      : { mode: "gemini" as const };
    if (planResult.plan.clarification?.required) {
      const response = formatAnswer(emptyData(), planResult.plan, todayIso(envResult.env.BUSINESS_TIMEZONE), planResult.fallback);
      return NextResponse.json(response.status === "success" || response.status === "clarification" ? { ...response, planning } : response);
    }

    const data = await loadBoardData(envResult.env, planResult.plan);
    const response = formatAnswer(data, planResult.plan, todayIso(envResult.env.BUSINESS_TIMEZONE), planResult.fallback);
    return NextResponse.json(response.status === "success" ? { ...response, planning } : response);
  } catch (error) {
    if (error instanceof MissingColumnsError) return NextResponse.json({ status: "error", message: error.message, retryable: false }, { status: 500 });
    if (error instanceof MondayError) return NextResponse.json({ status: "error", message: error.message, retryable: error.retryable }, { status: error.retryable ? 503 : 500 });
    return NextResponse.json({ status: "error", message: "Unexpected server error. No credentials or raw board data were exposed.", retryable: true }, { status: 500 });
  }
}

function todayIso(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function compactHistory(history: Array<{ role: "user" | "assistant"; content: string }>) {
  return history.slice(-12).map((message) => ({
    role: message.role,
    content: message.content.slice(0, 1200),
  }));
}

function emptyData() {
  return {
    deals: [],
    workOrders: [],
    dealQuality: { missing: [], invalidNumbers: [], invalidDates: [], anomalies: [], skippedHeaderRows: 0 },
    workOrderQuality: { missing: [], invalidNumbers: [], invalidDates: [], anomalies: [], skippedHeaderRows: 0 },
    fetchedAt: new Date().toISOString(),
  };
}
