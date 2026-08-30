import type { ServerEnv } from "./env";
import { fetchBoard } from "./monday";
import { normalizeDeals, normalizeWorkOrders } from "./normalize";
import type { BoardData, QueryPlan } from "./types";

export async function loadBoardData(env: ServerEnv, plan: QueryPlan): Promise<BoardData> {
  const needDeals = plan.source === "deals" || plan.source === "both";
  const needWorkOrders = plan.source === "work_orders" || plan.source === "both";
  const [dealBoard, woBoard] = await Promise.all([
    needDeals ? fetchBoard(env, "deals") : Promise.resolve({ items: [] }),
    needWorkOrders ? fetchBoard(env, "work_orders") : Promise.resolve({ items: [] }),
  ]);
  const dealResult = normalizeDeals(dealBoard.items);
  const woResult = normalizeWorkOrders(woBoard.items);
  return {
    deals: dealResult.deals,
    workOrders: woResult.workOrders,
    dealQuality: dealResult.quality,
    workOrderQuality: woResult.quality,
    fetchedAt: new Date().toISOString(),
  };
}
