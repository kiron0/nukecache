import { describe, expect, it } from "vitest";

import { detectOrphanedCaches } from "../src/orphaned";
import { formatOrphaned } from "../src/output";
import type { CacheTarget, ProjectContext } from "../src/types";

function makeTarget(tool: string, path: string): CacheTarget {
  return {
    id: `${tool}-cache`,
    name: `${tool} cache`,
    path,
    absolutePath: `/fake/project/${path}`,
    scope: "project",
    safety: "safe",
    tool,
    description: `${tool} cache`,
    consequences: [],
    trackedByGit: false,
    symlink: false,
    exists: true,
    size: 25_000_000,
    createdAt: Date.now() - 100_000,
    modifiedAt: Date.now() - 100_000,
  };
}

describe("Orphaned cache detection", () => {
  it("detects orphaned caches when tool is not present in package.json or config", async () => {
    const context: ProjectContext = {
      root: "/fake/nonexistent-project-dir",
      cwd: "/fake/nonexistent-project-dir",
      packageJson: {
        dependencies: { react: "^18.0.0" },
      },
    };

    const targets: CacheTarget[] = [
      makeTarget("turbo", ".turbo"),
      makeTarget("vite", ".vite"),
    ];

    const orphaned = await detectOrphanedCaches(targets, context);

    expect(orphaned).toHaveLength(2);
    expect(orphaned[0]?.target.tool).toBe("turbo");
    expect(orphaned[0]?.reason).toContain("turbo no longer detected");
    expect(orphaned[1]?.target.tool).toBe("vite");
    expect(orphaned[1]?.reason).toContain("vite no longer detected");
  });

  it("does not flag cache as orphaned if tool is in dependencies", async () => {
    const context: ProjectContext = {
      root: "/fake/nonexistent-project-dir",
      cwd: "/fake/nonexistent-project-dir",
      packageJson: {
        devDependencies: { vite: "^5.0.0" },
      },
    };

    const targets: CacheTarget[] = [makeTarget("vite", ".vite")];

    const orphaned = await detectOrphanedCaches(targets, context);

    expect(orphaned).toHaveLength(0);
  });

  it("formats orphaned cache table nicely", () => {
    const targets = [
      {
        target: makeTarget("turbo", ".turbo"),
        reason: "turbo no longer detected",
      },
    ];

    const output = formatOrphaned(targets);
    expect(output).toContain("Orphaned caches");
    expect(output).toContain(".turbo");
    expect(output).toContain("turbo no longer detected");
    expect(output).toContain("Total:");
  });

  it("formats empty orphaned result", () => {
    const output = formatOrphaned([]);
    expect(output).toContain("No orphaned caches detected.");
  });
});
