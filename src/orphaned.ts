import { access } from "node:fs/promises";
import { join } from "node:path";

import type { CacheTarget, ProjectContext } from "./types";

/**
 * Tool-to-detection rules: a tool's cache is "orphaned" when none of the
 * listed signals are present in the project.
 *
 * signals:
 *   deps      — package.json dependency name substrings (devDeps + deps)
 *   configs   — config file paths relative to project root
 *   binaries  — script names in package.json "scripts" values
 */
const ORPHAN_RULES: Array<{
  tool: string;
  deps?: string[];
  configs?: string[];
  binaries?: string[];
}> = [
  {
    tool: "next",
    deps: ["next"],
    configs: ["next.config.js", "next.config.mjs", "next.config.ts"],
  },
  {
    tool: "vite",
    deps: ["vite"],
    configs: ["vite.config.js", "vite.config.mjs", "vite.config.ts"],
  },
  {
    tool: "turbo",
    deps: ["turbo"],
    configs: ["turbo.json"],
  },
  {
    tool: "jest",
    deps: ["jest", "@jest/core"],
    configs: ["jest.config.js", "jest.config.mjs", "jest.config.ts", "jest.config.json"],
  },
  {
    tool: "vitest",
    deps: ["vitest"],
    configs: ["vitest.config.js", "vitest.config.mjs", "vitest.config.ts"],
  },
  {
    tool: "playwright",
    deps: ["@playwright/test", "playwright"],
    configs: ["playwright.config.js", "playwright.config.mjs", "playwright.config.ts"],
  },
  {
    tool: "cypress",
    deps: ["cypress"],
    configs: ["cypress.config.js", "cypress.config.mjs", "cypress.config.ts"],
  },
  {
    tool: "nx",
    deps: ["nx", "@nx/workspace"],
    configs: ["nx.json"],
  },
  {
    tool: "parcel",
    deps: ["parcel"],
    configs: [".parcelrc"],
  },
  {
    tool: "angular",
    deps: ["@angular/core", "@angular/cli"],
    configs: ["angular.json"],
  },
  {
    tool: "babel",
    deps: ["@babel/core", "babel-loader"],
    configs: ["babel.config.js", "babel.config.json", ".babelrc"],
  },
  {
    tool: "swc",
    deps: ["@swc/core", "@swc/cli"],
    configs: [".swcrc"],
  },
  {
    tool: "yarn",
    configs: ["yarn.lock", ".yarn"],
  },
];

export interface OrphanedTarget {
  target: CacheTarget;
  reason: string;
}

/**
 * Given a list of detected cache targets and the project context, returns
 * targets whose owning tool/package is no longer present in the project.
 */
export async function detectOrphanedCaches(
  targets: CacheTarget[],
  context: ProjectContext,
): Promise<OrphanedTarget[]> {
  const pkgJson = context.packageJson ?? {};
  const allDeps = new Set([
    ...Object.keys((pkgJson.dependencies as Record<string, unknown>) ?? {}),
    ...Object.keys((pkgJson.devDependencies as Record<string, unknown>) ?? {}),
    ...Object.keys((pkgJson.peerDependencies as Record<string, unknown>) ?? {}),
  ]);
  const scriptValues = Object.values(
    (pkgJson.scripts as Record<string, string>) ?? {},
  ).join(" ");

  const orphaned: OrphanedTarget[] = [];

  for (const target of targets) {
    if (target.scope !== "project") continue;
    const rule = ORPHAN_RULES.find((r) => r.tool === target.tool);
    if (!rule) continue; // no rule = cannot determine orphaned status

    const depPresent =
      rule.deps !== undefined &&
      rule.deps.some((dep) =>
        [...allDeps].some((installed) => installed.includes(dep)),
      );

    const configPresent =
      rule.configs !== undefined &&
      (
        await Promise.all(
          rule.configs.map((cfg) => fileExists(join(context.root, cfg))),
        )
      ).some(Boolean);

    const binaryPresent =
      rule.binaries !== undefined &&
      rule.binaries.some((bin) => scriptValues.includes(bin));

    const present = depPresent || configPresent || binaryPresent;

    if (!present) {
      const signals = [
        rule.deps?.join(", "),
        rule.configs?.map((c) => c.split("/").at(-1)).join(", "),
      ]
        .filter(Boolean)
        .join(" / ");
      orphaned.push({
        target,
        reason: `${target.tool} no longer detected (checked: ${signals})`,
      });
    }
  }

  return orphaned;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
