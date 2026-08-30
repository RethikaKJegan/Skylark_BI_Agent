import type { ServerEnv } from "./env";
import type { RawItem } from "./normalize";
import { keyOf, requiredColumnGroupsFor } from "./normalize";

type MondayColumn = { id: string; title: string };
type MondayItem = { id: string; name: string; column_values: Array<{ id: string; text: string | null; value: string | null }> };
type MondayBoard = { columns: MondayColumn[]; items_page: { cursor: string | null; items: MondayItem[] } };

const BOARD_QUERY = `
query BoardItems($boardId: ID!, $limit: Int!) {
  boards(ids: [$boardId]) {
    columns { id title }
    items_page(limit: $limit) {
      cursor
      items { id name column_values { id text value } }
    }
  }
}`;

const NEXT_PAGE_QUERY = `
query NextItemsPage($cursor: String!, $limit: Int!) {
  next_items_page(cursor: $cursor, limit: $limit) {
    cursor
    items { id name column_values { id text value } }
  }
}`;

type CacheEntry = { expires: number; data: { columns: MondayColumn[]; items: RawItem[] } };
const cache = new Map<string, CacheEntry>();

export async function fetchBoard(env: ServerEnv, board: "deals" | "work_orders", fetcher: typeof fetch = fetch) {
  const boardId = board === "deals" ? env.MONDAY_DEALS_BOARD_ID : env.MONDAY_WORK_ORDERS_BOARD_ID;
  const cached = cache.get(boardId);
  if (cached && cached.expires > Date.now()) return cached.data;

  const first = await mondayGraphql<{ boards: MondayBoard[] }>(env, BOARD_QUERY, { boardId, limit: 500 }, fetcher);
  const selected = first.boards?.[0];
  if (!selected) throw new MondayError("Configured Monday.com board was not found.", false);

  const missing = missingColumns(selected.columns, requiredColumnGroupsFor(board));
  if (missing.length) throw new MissingColumnsError(missing);

  let items = selected.items_page.items;
  let cursor = selected.items_page.cursor;
  while (cursor) {
    const next = await mondayGraphql<{ next_items_page: { cursor: string | null; items: MondayItem[] } }>(
      env,
      NEXT_PAGE_QUERY,
      { cursor, limit: 500 },
      fetcher,
    );
    items = items.concat(next.next_items_page.items);
    cursor = next.next_items_page.cursor;
  }

  const data = { columns: selected.columns, items: items.map((item) => toRawItem(item, selected.columns)) };
  cache.set(boardId, { expires: Date.now() + 60000, data });
  return data;
}

export async function mondayGraphql<T>(env: ServerEnv, query: string, variables: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<T> {
  if (/\bmutation\b/i.test(query)) throw new MondayError("Monday mutations are disabled.", false);
  const attempt = async () =>
    fetcher("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: env.MONDAY_API_TOKEN,
        "API-Version": env.MONDAY_API_VERSION,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(12000),
    });

  let response: Response;
  try {
    response = await attempt();
  } catch {
    throw new MondayError("Could not reach Monday.com. Check network access and try again.", true);
  }
  if ([429, 500, 502, 503, 504].includes(response.status)) {
    const retryAfter = Number(response.headers.get("retry-after") || "1");
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter, 3) * 1000));
    try {
      response = await attempt();
    } catch {
      throw new MondayError("Could not reach Monday.com after retrying.", true);
    }
  }
  if (response.status === 401 || response.status === 403) throw new MondayError("Monday.com authentication failed. Check the server-side API token.", false);
  if (!response.ok) throw new MondayError(`Monday.com request failed with status ${response.status}.`, [429, 500, 502, 503, 504].includes(response.status));
  const payload = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (payload.errors?.length) throw new MondayError(`Monday.com returned an error: ${payload.errors[0].message}`, false);
  if (!payload.data) throw new MondayError("Monday.com returned an empty response.", true);
  return payload.data;
}

function toRawItem(item: MondayItem, columns: MondayColumn[]): RawItem {
  const byId = new Map(columns.map((column) => [column.id, column.title]));
  const values: RawItem["values"] = {};
  for (const value of item.column_values) {
    const title = byId.get(value.id);
    if (title) values[title] = { text: value.text || "", value: value.value };
  }
  return { id: item.id, name: item.name, values };
}

function missingColumns(columns: MondayColumn[], expected: ReturnType<typeof requiredColumnGroupsFor>) {
  const actual = new Set(columns.map((column) => keyOf(column.title)));
  return expected
    .filter((group) => !group.optional)
    .filter((group) => !group.aliases.some((alias) => actual.has(keyOf(alias))))
    .map((group) => group.label);
}

export class MondayError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
  }
}

export class MissingColumnsError extends Error {
  constructor(public columns: string[]) {
    super(`Missing expected Monday.com columns: ${columns.join(", ")}`);
  }
}
