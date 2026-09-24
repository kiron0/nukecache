import { removeProjectTarget } from "../filesystem/remove";
import type { CleanupPlan, CleanupResult } from "../types";

export async function executeCleanup(
  plan: CleanupPlan,
): Promise<CleanupResult> {
  const result: CleanupResult = {
    removed: [],
    skipped: [],
    failed: [],
    bytesFreed: 0,
  };

  for (const item of plan.items) {
    if (item.action === "skip") {
      result.skipped.push({
        id: item.target.id,
        path: item.target.path,
        reason: item.reason ?? "Skipped",
      });
      continue;
    }

    try {
      await removeProjectTarget(plan.root, item.target.absolutePath);
      result.removed.push({
        id: item.target.id,
        path: item.target.path,
        bytesFreed: item.target.size,
      });
      result.bytesFreed += item.target.size;
    } catch (error) {
      result.failed.push({
        id: item.target.id,
        path: item.target.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
