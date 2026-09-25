import { lstat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { builtInDetectors } from "./detectors";
import { candidate, pathExists, slug } from "./detectors/helpers";
import { detectPackageManagerCaches } from "./detectors/package-managers";
import { calculateSize } from "./filesystem/size";
import { loadConfig } from "./project/config";
import { findTrackedByGit } from "./project/git";
import { detectPackageManagers } from "./project/package-manager";
import { createProjectContext } from "./project/root";
import type {
  CacheCandidate,
  CacheTarget,
  CustomCacheDefinition,
  DetectOptions,
  ProjectContext,
  DetectionResult,
} from "./types";

export type { DetectionResult } from "./types";

export async function detectCaches(
  options: DetectOptions = {},
): Promise<DetectionResult> {
  const context = await createProjectContext(options.cwd);
  const config = options.config ?? (await loadConfig(context.root));
  const scope =
    options.scope ??
    config.defaultScope ??
    (config.showGlobal ? "all" : "project");
  const includeProject = scope === "project" || scope === "all";
  const includeGlobal = scope === "global" || scope === "all";
  const packageManagers =
    options.packageManagers ??
    config.packageManagers ??
    (await detectPackageManagers(context));
  const detected = includeProject
    ? (
        await Promise.all(
          builtInDetectors.map((detector) => detector.detect(context)),
        )
      ).flat()
    : [];
  const custom = includeProject
    ? await detectCustomCaches(
        context,
        config.custom ?? [],
        config.include ?? [],
      )
    : [];
  const packageManagerDetection = includeGlobal
    ? await detectPackageManagerCaches(context, packageManagers)
    : { candidates: [], warnings: [] };
  const ignored = new Set([
    ...(config.ignore ?? []),
    ...(options.ignore ?? []),
  ]);
  const filtered = removeOverlaps(
    [...detected, ...custom, ...packageManagerDetection.candidates].filter(
      (target) => {
        const scopeIncluded = scope === "all" || target.scope === scope;
        return (
          scopeIncluded &&
          !ignored.has(target.id) &&
          !ignored.has(target.tool) &&
          !ignored.has(target.path)
        );
      },
    ),
    context.root,
  );

  const projectPaths = filtered
    .filter((target) => target.scope === "project")
    .map((target) => absoluteCandidatePath(context.root, target));
  const trackedPaths = await findTrackedByGit(context.root, projectPaths);
  const enriched = await Promise.all(
    filtered.map((target) =>
      enrichTarget(
        context,
        target,
        trackedPaths.has(absoluteCandidatePath(context.root, target)),
      ),
    ),
  );
  const targets = enriched.filter(
    (target): target is CacheTarget => target !== undefined,
  );
  targets.sort(
    (left, right) =>
      right.size - left.size || left.path.localeCompare(right.path),
  );
  return {
    context,
    config,
    targets,
    packageManagers,
    warnings: packageManagerDetection.warnings.filter(
      (warning) => !ignored.has(warning.tool),
    ),
  };
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

function absoluteCandidatePath(root: string, target: CacheCandidate): string {
  if (target.scope === "project")
    return resolveCandidatePath(root, target.path);
  if (!isAbsolute(target.path)) {
    throw new Error(`Global cache path must be absolute: ${target.path}`);
  }
  return resolve(target.path);
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
    const absolutePath = absoluteCandidatePath(root, item);
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
    ...(item.cleanup ? { cleanup: item.cleanup } : {}),
  }));
}

async function enrichTarget(
  context: ProjectContext,
  target: CacheCandidate,
  trackedByGit: boolean,
): Promise<CacheTarget | undefined> {
  const absolutePath = absoluteCandidatePath(context.root, target);
  let size: number;
  let details: Awaited<ReturnType<typeof lstat>>;
  try {
    [size, details] = await Promise.all([
      calculateSize(absolutePath),
      lstat(absolutePath),
    ]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }

  return {
    ...target,
    absolutePath,
    createdAt: details.birthtimeMs || details.ctimeMs,
    size,
    modifiedAt: details.mtimeMs,
    trackedByGit,
    symlink: details.isSymbolicLink(),
    exists: true,
  };
}
