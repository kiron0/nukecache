import { lstat, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { mapWithConcurrency } from "../filesystem/concurrency";
import type { CacheCandidate, CacheSafety, ProjectContext } from "../types";

const DIRECTORY_CONCURRENCY = 32;

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
  let directories = [root];

  while (directories.length > 0) {
    const discovered = await mapWithConcurrency(
      directories,
      DIRECTORY_CONCURRENCY,
      async (directory) => {
        try {
          const entries = await readdir(directory, { withFileTypes: true });
          const children: string[] = [];
          for (const entry of entries) {
            if (entry.isSymbolicLink()) continue;
            const absolutePath = join(directory, entry.name);
            if (entry.isDirectory()) {
              if (!SKIP_DIRECTORIES.has(entry.name))
                children.push(absolutePath);
            } else if (entry.isFile() && predicate(entry.name)) {
              found.push(relative(root, absolutePath).split(sep).join("/"));
            }
          }
          return children;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "EACCES" || code === "EPERM" || code === "ENOENT") {
            return [];
          }
          throw error;
        }
      },
    );
    directories = discovered.flat();
  }

  return found.sort();
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
