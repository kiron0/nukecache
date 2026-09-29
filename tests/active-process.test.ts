import { describe, expect, it } from "vitest";

import { createCleanupPlan } from "../src/cleanup/planner";
import type { CacheTarget } from "../src/types";

function makeTarget(overrides: Partial<CacheTarget> = {}): CacheTarget {
  return {
    id: "next-cache",
    name: "Next.js Cache",
    path: ".next/cache",
    absolutePath: "/project/.next/cache",
    scope: "project",
    safety: "safe",
    tool: "next",
    description: "Next.js build cache",
    consequences: ["Next build slower"],
    trackedByGit: false,
    symlink: false,
    exists: true,
    size: 50_000_000,
    createdAt: Date.now() - 3600_000,
    modifiedAt: Date.now() - 3600_000,
    ...overrides,
  };
}

describe("Active process protection", () => {
  it("skips caches currently in use by an active process", () => {
    const target = makeTarget({
      activeProcess: { pid: 8123, command: "next dev" },
    });

    const plan = createCleanupPlan("/project", [target], { safeOnly: true });

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.action).toBe("skip");
    expect(plan.items[0]?.reason).toContain("In use by next (PID 8123)");
    expect(plan.items[0]?.reason).toContain("--force to override");
  });

  it("allows removing active cache when allowRebuild (--force) is set", () => {
    const target = makeTarget({
      activeProcess: { pid: 8123, command: "next dev" },
    });

    const plan = createCleanupPlan("/project", [target], {
      safeOnly: false,
      allowRebuild: true,
    });

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.action).toBe("remove");
  });

  it("removes target normally when activeProcess is undefined", () => {
    const target = makeTarget();

    const plan = createCleanupPlan("/project", [target], { safeOnly: true });

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.action).toBe("remove");
  });
});
