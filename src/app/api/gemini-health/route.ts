import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { GeminiPlanError, geminiHealthCheck } from "@/lib/planner";

export async function GET() {
  const envResult = getServerEnv();
  if (!envResult.ok) {
    return NextResponse.json({ status: "error", category: "missing_key", model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite" }, { status: 500 });
  }
  try {
    const text = await geminiHealthCheck(envResult.env);
    return NextResponse.json({ status: "ok", model: envResult.env.GEMINI_MODEL, text });
  } catch (error) {
    const category = error instanceof GeminiPlanError ? error.category : "network";
    const status = error instanceof GeminiPlanError ? error.status : undefined;
    console.warn("[gemini] health_failed", {
      status,
      message: error instanceof Error ? error.message : "Unknown Gemini health failure",
      model: envResult.env.GEMINI_MODEL,
      failureCategory: category,
    });
    return NextResponse.json({ status: "error", category, model: envResult.env.GEMINI_MODEL }, { status: 502 });
  }
}
