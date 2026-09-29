import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join, resolve } from "node:path";

import { detectCaches } from "./detect";
import type { CacheTarget, DetectionResult, NukecacheConfig } from "./types";

const ROOT_MARKERS = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
]);

const MAX_DEPTH = 6;

const PRUNE_DIRS = new Set([
  ".git",
  "node_modules",
  ".pnpm-store",
  ".yarn",
  ".cache",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".next",
  ".vite",
  ".nuxt",
]);

export interface SweepProjectResult {
  root: string;
  detection: DetectionResult;
}

export interface SweepResult {
  baseDir: string;
  projects: SweepProjectResult[];
  allTargets: Array<CacheTarget & { projectRoot: string }>;
  totalBytes: number;
}

export async function sweep(
  baseDir: string,
  options: {
    days?: number;
    config?: NukecacheConfig;
    onProject?: (root: string) => void;
  } = {},
): Promise<SweepResult> {
  const resolved = resolve(baseDir);
  const roots = await findProjectRoots(resolved, 0);

  const projects: SweepProjectResult[] = [];

  await Promise.all(
    roots.map(async (root) => {
      try {
        options.onProject?.(root);
        const detection = await detectCaches({
          cwd: root,
          config: options.config ?? {},
          scope: "project",
          ...(options.days !== undefined ? {} : {}),
        });
        if (detection.targets.length > 0) {
          projects.push({ root, detection });
        }
      } catch {
        // Skip unreadable projects silently.
      }
    }),
  );

  projects.sort(
    (a, b) => totalSize(b.detection.targets) - totalSize(a.detection.targets),
  );

  const cutoff =
    options.days !== undefined
      ? Date.now() - options.days * 24 * 60 * 60 * 1000
      : undefined;

  const allTargets: Array<CacheTarget & { projectRoot: string }> = projects
    .flatMap((p) =>
      p.detection.targets
        .filter((t) => cutoff === undefined || t.modifiedAt <= cutoff)
        .map((t) => ({ ...t, projectRoot: p.root })),
    )
    .sort((a, b) => b.size - a.size);

  const totalBytes = allTargets.reduce((sum, t) => sum + t.size, 0);

  return { baseDir: resolved, projects, allTargets, totalBytes };
}

async function findProjectRoots(dir: string, depth: number): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];

  let entries: Dirent<string>[];
  try {
    entries = (await readdir(dir, {
      withFileTypes: true,
      encoding: "utf8",
    })) as Dirent<string>[];
  } catch {
    return [];
  }

  const names = new Set(entries.map((e) => e.name));
  const isRoot = [...ROOT_MARKERS].some((m) => names.has(m));

  if (isRoot) {
    return [dir];
  }

  const subdirs = entries.filter(
    (e) =>
      e.isDirectory() && !PRUNE_DIRS.has(e.name) && !e.name.startsWith("."),
  );

  const nested = await Promise.all(
    subdirs.map((e) => findProjectRoots(join(dir, e.name), depth + 1)),
  );
  return nested.flat();
}

function totalSize(targets: CacheTarget[]): number {
  return targets.reduce((sum, t) => sum + t.size, 0);
}
