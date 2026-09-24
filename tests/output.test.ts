import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatList,
  formatPlan,
  formatResult,
  formatTarget,
} from "../src/output";
import type { CacheTarget, CleanupPlan } from "../src/types";

describe("output", () => {
  it("formats byte units", () => {
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(() => formatBytes(-1)).toThrow(RangeError);
  });

  it("formats human-readable cache lists", () => {
    const target = fixtureTarget();
    expect(formatList([target])).toContain("Vite cache");
    expect(formatList([target])).toContain("Total: 2.0 KB");
    expect(formatList([])).toContain("No supported");
    expect(formatTarget({ ...target, trackedByGit: true })).toContain(
      "safe, tracked",
    );
  });

  it("formats cleanup plans and results", () => {
    const target = fixtureTarget();
    const plan: CleanupPlan = {
      root: "/tmp/app",
      items: [
        { target, action: "remove" },
        {
          target: { ...target, id: "tracked", path: ".eslintcache" },
          action: "skip",
          reason: "Tracked by Git",
        },
      ],
      estimatedBytes: target.size,
    };

    expect(formatPlan(plan)).toContain("REMOVE:");
    expect(formatPlan(plan)).toContain("SKIP:");
    expect(formatPlan({ ...plan, items: [], estimatedBytes: 0 })).toContain(
      "REMOVE: none",
    );

    expect(
      formatResult({
        removed: [
          { id: target.id, path: target.path, bytesFreed: target.size },
        ],
        skipped: [],
        failed: [{ id: "bad", path: ".bad", error: "Permission denied" }],
        bytesFreed: target.size,
      }),
    ).toContain("Permission denied");
    expect(
      formatResult({ removed: [], skipped: [], failed: [], bytesFreed: 0 }),
    ).toContain("Removed: none");
  });
});

function fixtureTarget(): CacheTarget {
  return {
    id: "vite",
    name: "Vite cache",
    path: "node_modules/.vite",
    absolutePath: "/tmp/app/node_modules/.vite",
    scope: "project",
    safety: "safe",
    tool: "vite",
    description: "Vite cache",
    consequences: [],
    size: 2048,
    trackedByGit: false,
    symlink: false,
    exists: true,
  };
}
