import { lstat, opendir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import type { CacheCandidate, CacheSafety, ProjectContext } from "../types";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function candidate(
  id: string,
  name: string,
  path: string,
  tool: string,
  description: string,
  consequences: string[],
  safety: CacheSafety = "safe",
): CacheCandidate {
  return {
    id,
    name,
    path,
    scope: "project",
    safety,
    tool,
    description,
    consequences,
  };
}

export async function existingCandidates(
  context: ProjectContext,
  definitions: CacheCandidate[],
): Promise<CacheCandidate[]> {
  const checks = await Promise.all(
    definitions.map(async (definition) => ({
      definition,
      exists: await pathExists(join(context.root, definition.path)),
    })),
  );
  return checks
    .filter((check) => check.exists)
    .map((check) => check.definition);
}

const SKIP_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".next",
  ".turbo",
  ".vite",
  "coverage",
  "node_modules",
]);

export async function findFiles(
  root: string,
  predicate: (name: string) => boolean,
): Promise<string[]> {
  const found: string[] = [];

  async function walk(directory: string): Promise<void> {
    let handle;
    try {
      handle = await opendir(directory);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") return;
      throw error;
    }
    for await (const entry of handle) {
      if (entry.isSymbolicLink()) continue;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) await walk(absolutePath);
      } else if (entry.isFile() && predicate(entry.name)) {
        found.push(relative(root, absolutePath).split(sep).join("/"));
      }
    }
  }

  await walk(root);
  return found.sort();
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
