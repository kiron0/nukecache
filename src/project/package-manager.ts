import { readdir } from "node:fs/promises";

import type { PackageManager, ProjectContext } from "../types";

const MARKERS: ReadonlyArray<readonly [PackageManager, string[]]> = [
  ["npm", ["package-lock.json", "npm-shrinkwrap.json"]],
  ["pnpm", ["pnpm-lock.yaml", "pnpm-workspace.yaml"]],
  ["yarn", ["yarn.lock"]],
  ["bun", ["bun.lock", "bun.lockb"]],
];

export async function detectPackageManagers(
  context: ProjectContext,
): Promise<PackageManager[]> {
  const managers = new Set<PackageManager>();
  const declared = parsePackageManager(context.packageJson?.packageManager);
  if (declared) managers.add(declared);

  let entries: Set<string>;
  try {
    entries = new Set(await readdir(context.root));
  } catch {
    entries = new Set();
  }
  for (const [manager, markers] of MARKERS) {
    if (markers.some((marker) => entries.has(marker))) managers.add(manager);
  }

  return [...managers];
}

export function parsePackageManager(
  value: unknown,
): PackageManager | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.split("@")[0];
  return name && isPackageManager(name) ? name : undefined;
}

export function isPackageManager(value: string): value is PackageManager {
  return (
    value === "npm" || value === "pnpm" || value === "yarn" || value === "bun"
  );
}
