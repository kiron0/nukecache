import { describe, expect, it, vi } from "vitest";

import {
  formatReclaimPlan,
  formatSweepTable,
} from "../src/output";
import type { CacheTarget } from "../src/types";

function makeTarget(overrides: Partial<CacheTarget> & Pick<CacheTarget, "id" | "size">): CacheTarget {
  return {
    name: overrides.id ?? "cache",
    path: overrides.path ?? `.${overrides.id}`,
    absolutePath: `/tmp/${overrides.id}`,
    scope: "project",
    safety: "safe",
    tool: "test",
    description: "test",
    consequences: [],
    trackedByGit: false,
    symlink: false,
    createdAt: Date.now() - 5_000_000,
    modifiedAt: Date.now() - 5_000_000,
    exists: true,
    ...overrides,
  };
}

describe("formatSweepTable", () => {
  it("shows no-caches message when empty", () => {
    expect(formatSweepTable([], "/home/user/Code", 0)).toContain(
      "No reclaimable caches found",
    );
  });

  it("includes base dir in header", () => {
    const t = { ...makeTarget({ id: "next", size: 1024 * 1024 * 500 }), projectRoot: "/home/user/Code/app" };
    const out = formatSweepTable([t], "/home/user/Code", t.size);
    expect(out).toContain("Sweeping /home/user/Code");
  });

  it("shows total reclaimable", () => {
    const t = { ...makeTarget({ id: "vite", size: 200 * 1024 * 1024 }), projectRoot: "/home/user/Code/site" };
    const out = formatSweepTable([t], "/home/user/Code", t.size);
    expect(out).toContain("Total reclaimable:");
    expect(out).toContain("200.0 MB");
  });

  it("renders relative project path", () => {
    const t = { ...makeTarget({ id: "turbo", size: 100 * 1024 * 1024 }), projectRoot: "/Code/old-dashboard" };
    const out = formatSweepTable([t], "/Code", t.size);
    expect(out).toContain("old-dashboard");
  });
});

describe("formatReclaimPlan", () => {
  it("shows no-candidates message when empty", () => {
    const out = formatReclaimPlan([], 5 * 1024 ** 3);
    expect(out).toContain("No safe candidates");
    expect(out).toContain("5.0 GB");
  });

  it("shows target and estimated size", () => {
    const c = makeTarget({ id: "next-cache", size: 2 * 1024 ** 3 });
    const out = formatReclaimPlan([c], 5 * 1024 ** 3);
    expect(out).toContain("Need to reclaim: 5.0 GB");
    expect(out).toContain("Estimated:");
    expect(out).toContain("2.0 GB");
  });

  it("lists each candidate", () => {
    const a = makeTarget({ id: "a", size: 1024 ** 3 });
    const b = makeTarget({ id: "b", size: 1024 ** 3, path: ".b" });
    const out = formatReclaimPlan([a, b], 2 * 1024 ** 3);
    expect(out).toContain(".a");
    expect(out).toContain(".b");
  });
});
