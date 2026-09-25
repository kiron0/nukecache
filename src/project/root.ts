import { readFile, readdir } from "node:fs/promises";
import { dirname, parse, resolve } from "node:path";

import type { ProjectContext } from "../types";

const ROOT_MARKERS = [
  "package.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
];

async function containsRootMarker(path: string): Promise<boolean> {
  try {
    const entries = new Set(await readdir(path));
    return ROOT_MARKERS.some((marker) => entries.has(marker));
  } catch {
    return false;
  }
}

export async function findProjectRoot(cwd = process.cwd()): Promise<string> {
  let current = resolve(cwd);
  const filesystemRoot = parse(current).root;

  while (true) {
    if (await containsRootMarker(current)) return current;

    if (current === filesystemRoot) return resolve(cwd);
    current = dirname(current);
  }
}

export async function createProjectContext(
  cwd = process.cwd(),
): Promise<ProjectContext> {
  const root = await findProjectRoot(cwd);
  let packageJson: Record<string, unknown> | undefined;

  try {
    const parsed: unknown = JSON.parse(
      await readFile(resolve(root, "package.json"), "utf8"),
    );
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      packageJson = parsed as Record<string, unknown>;
    }
  } catch {
    // Detection also works for projects without package.json.
  }

  return packageJson
    ? { cwd: resolve(cwd), root, packageJson }
    : { cwd: resolve(cwd), root };
}
