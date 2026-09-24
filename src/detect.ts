import { lstat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { builtInDetectors } from "./detectors";
import { candidate, pathExists, slug } from "./detectors/helpers";
import { calculateSize } from "./filesystem/size";
import { loadConfig } from "./project/config";
import { isTrackedByGit } from "./project/git";
import { createProjectContext } from "./project/root";
import type {
  CacheCandidate,
  CacheTarget,
  CustomCacheDefinition,
  DetectOptions,
  NukecacheConfig,
  ProjectContext,
} from "./types";

export interface DetectionResult {
  context: ProjectContext;
  config: NukecacheConfig;
  targets: CacheTarget[];
}

export async function detectCaches(
  options: DetectOptions = {},
): Promise<DetectionResult> {
  const context = await createProjectContext(options.cwd);
  const config = options.config ?? (await loadConfig(context.root));
  const detected = (
    await Promise.all(
      builtInDetectors.map((detector) => detector.detect(context)),
    )
  ).flat();
  const custom = await detectCustomCaches(
    context,
    config.custom ?? [],
    config.include ?? [],
  );
  const ignored = new Set([
    ...(config.ignore ?? []),
    ...(options.ignore ?? []),
  ]);
  const filtered = removeOverlaps(
    [...detected, ...custom].filter(
      (target) =>
        !ignored.has(target.id) &&
        !ignored.has(target.tool) &&
        !ignored.has(target.path),
    ),
    context.root,
  );

  const targets = await Promise.all(
    filtered.map((target) => enrichTarget(context, target)),
  );
  targets.sort(
    (left, right) =>
      right.size - left.size || left.path.localeCompare(right.path),
  );
  return { context, config, targets };
}

async function detectCustomCaches(
  context: ProjectContext,
  definitions: CustomCacheDefinition[],
  include: string[],
): Promise<CacheCandidate[]> {
  const expanded = definitions.flatMap((definition, definitionIndex) =>
    definition.paths.map((path, pathIndex) =>
      candidate(
        definition.id ??
          `custom-${definitionIndex + 1}-${pathIndex + 1}-${slug(definition.name)}`,
        definition.name,
        path,
        definition.id ?? "custom",
        definition.description ?? "Project-specific generated cache.",
        definition.consequences ?? ["Owning tool must recreate this cache."],
        definition.safety ?? "safe",
      ),
    ),
  );

  const included = include.map((path, index) =>
    candidate(
      `include-${index + 1}-${slug(path)}`,
      "Configured cache",
      path,
      "custom",
      "Cache path explicitly included by project configuration.",
      ["Owning tool must recreate this cache."],
    ),
  );

  const all = [...expanded, ...included];
  const checks = await Promise.all(
    all.map(async (definition) => ({
      definition,
      exists: await pathExists(
        resolveCandidatePath(context.root, definition.path),
      ),
    })),
  );
  return checks
    .filter((check) => check.exists)
    .map((check) => check.definition);
}

function resolveCandidatePath(root: string, path: string): string {
  if (isAbsolute(path))
    throw new Error(`Cache path must be project-relative: ${path}`);
  const absolutePath = resolve(root, path);
  const projectRelative = relative(root, absolutePath);
  if (
    projectRelative === "" ||
    projectRelative === ".." ||
    projectRelative.startsWith(`..${sep}`) ||
    isAbsolute(projectRelative)
  ) {
    throw new Error(`Cache path escapes project boundary: ${path}`);
  }
  return absolutePath;
}

function removeOverlaps(
  candidates: CacheCandidate[],
  root: string,
): CacheCandidate[] {
  const sorted = [...candidates].sort(
    (left, right) =>
      left.path.length - right.path.length ||
      left.path.localeCompare(right.path),
  );
  const accepted: Array<CacheCandidate & { absolutePath: string }> = [];

  for (const item of sorted) {
    const absolutePath = resolveCandidatePath(root, item.path);
    const duplicateOrChild = accepted.some((parent) => {
      const childPath = relative(parent.absolutePath, absolutePath);
      return (
        childPath === "" ||
        (childPath !== ".." &&
          !childPath.startsWith(`..${sep}`) &&
          !isAbsolute(childPath))
      );
    });
    if (!duplicateOrChild) accepted.push({ ...item, absolutePath });
  }

  return accepted.map((item) => ({
    id: item.id,
    name: item.name,
    path: item.path,
    scope: item.scope,
    safety: item.safety,
    tool: item.tool,
    description: item.description,
    consequences: item.consequences,
  }));
}

async function enrichTarget(
  context: ProjectContext,
  target: CacheCandidate,
): Promise<CacheTarget> {
  const absolutePath = resolveCandidatePath(context.root, target.path);
  const [size, trackedByGit, details] = await Promise.all([
    calculateSize(absolutePath),
    isTrackedByGit(context.root, absolutePath),
    lstat(absolutePath),
  ]);

  return {
    ...target,
    absolutePath,
    size,
    trackedByGit,
    symlink: details.isSymbolicLink(),
    exists: true,
  };
}
