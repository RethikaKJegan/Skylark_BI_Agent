const required = [
  "MONDAY_API_TOKEN",
  "MONDAY_DEALS_BOARD_ID",
  "MONDAY_WORK_ORDERS_BOARD_ID",
  "GEMINI_API_KEY",
] as const;

export type ServerEnv = {
  MONDAY_API_TOKEN: string;
  MONDAY_DEALS_BOARD_ID: string;
  MONDAY_WORK_ORDERS_BOARD_ID: string;
  MONDAY_API_VERSION: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  BUSINESS_TIMEZONE: string;
};

export function getServerEnv(): { ok: true; env: ServerEnv } | { ok: false; missing: string[] } {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) return { ok: false, missing: [...missing] };
  return {
    ok: true,
    env: {
      MONDAY_API_TOKEN: process.env.MONDAY_API_TOKEN!,
      MONDAY_DEALS_BOARD_ID: process.env.MONDAY_DEALS_BOARD_ID!,
      MONDAY_WORK_ORDERS_BOARD_ID: process.env.MONDAY_WORK_ORDERS_BOARD_ID!,
      MONDAY_API_VERSION: process.env.MONDAY_API_VERSION || "2026-07",
      GEMINI_API_KEY: process.env.GEMINI_API_KEY!,
      GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
      BUSINESS_TIMEZONE: process.env.BUSINESS_TIMEZONE || "Asia/Kolkata",
    },
  };
}
