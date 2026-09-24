import { access } from "node:fs/promises";
import { resolve } from "node:path";

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

  const detected = await Promise.all(
    MARKERS.map(async ([manager, markers]) => {
      const found = await Promise.all(
        markers.map((marker) => exists(resolve(context.root, marker))),
      );
      return found.some(Boolean) ? manager : undefined;
    }),
  );
  for (const manager of detected) {
    if (manager) managers.add(manager);
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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
