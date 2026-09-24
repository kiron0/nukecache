import type { CacheTarget, CleanupPlan, CleanupPlanItem } from "../types";

export interface PlanOptions {
  selectedIds?: Iterable<string>;
  safeOnly?: boolean;
}

export function createCleanupPlan(
  root: string,
  targets: CacheTarget[],
  options: PlanOptions = {},
): CleanupPlan {
  const selected = options.selectedIds
    ? new Set(options.selectedIds)
    : undefined;
  const safeOnly = options.safeOnly ?? true;

  const items: CleanupPlanItem[] = targets.map((target) => {
    if (selected && !selected.has(target.id)) {
      return { target, action: "skip", reason: "Not selected" };
    }
    if (target.trackedByGit) {
      return { target, action: "skip", reason: "Tracked by Git" };
    }
    if (target.scope !== "project") {
      return { target, action: "skip", reason: "Outside project scope" };
    }
    if (safeOnly && target.safety !== "safe") {
      return {
        target,
        action: "skip",
        reason: `Safety level is ${target.safety}`,
      };
    }
    return { target, action: "remove" };
  });

  return {
    root,
    items,
    estimatedBytes: items.reduce(
      (total, item) =>
        total + (item.action === "remove" ? item.target.size : 0),
      0,
    ),
  };
}
