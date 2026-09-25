import { homedir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

import { pathExists } from "./helpers";
import { runCommand, type CommandRunner } from "../process/command";
import type {
  CacheCandidate,
  DetectionWarning,
  NativeCleanupCommand,
  PackageManager,
  ProjectContext,
} from "../types";

export interface PackageManagerDetection {
  candidates: CacheCandidate[];
  warnings: DetectionWarning[];
}

interface CacheDefinition {
  id: string;
  name: string;
  path: string;
  tool: PackageManager;
  description: string;
  consequences: string[];
  cleanup: NativeCleanupCommand;
  allowProjectScope?: boolean;
}

export async function detectPackageManagerCaches(
  context: ProjectContext,
  managers: readonly PackageManager[],
  runner: CommandRunner = runCommand,
): Promise<PackageManagerDetection> {
  const results = await Promise.all(
    managers.map(async (manager) => {
      try {
        const definition = await detectManagerCache(context, manager, runner);
        return definition
          ? { candidate: toCandidate(context, definition) }
          : {};
      } catch (error) {
        return {
          warning: {
            tool: manager,
            message: `${manager} cache could not be inspected: ${errorMessage(error)}`,
          },
        };
      }
    }),
  );

  return {
    candidates: results.flatMap((result) =>
      result.candidate ? [result.candidate] : [],
    ),
    warnings: results.flatMap((result) =>
      result.warning ? [result.warning] : [],
    ),
  };
}

async function detectManagerCache(
  context: ProjectContext,
  manager: PackageManager,
  runner: CommandRunner,
): Promise<CacheDefinition | undefined> {
  switch (manager) {
    case "npm": {
      const cacheRoot = await commandPath(
        runner,
        "npm",
        ["config", "get", "cache"],
        context.root,
      );
      const path = join(cacheRoot, "_cacache");
      if (!(await pathExists(path))) return undefined;
      return {
        id: "npm-cache",
        name: "npm cache",
        path,
        tool: "npm",
        description: "Content-addressable package downloads managed by npm.",
        consequences: ["Future installs may download packages again."],
        cleanup: {
          kind: "command",
          command: "npm",
          args: ["cache", "clean", "--force", `--cache=${cacheRoot}`],
          cwd: context.root,
        },
      };
    }
    case "pnpm": {
      const path = await commandPath(
        runner,
        "pnpm",
        ["store", "path"],
        context.root,
      );
      if (!(await pathExists(path))) return undefined;
      return {
        id: "pnpm-store",
        name: "pnpm store",
        path,
        tool: "pnpm",
        description:
          "Shared content-addressable package store. Cleanup prunes only unreferenced packages.",
        consequences: ["Future installs may download pruned packages again."],
        cleanup: {
          kind: "command",
          command: "pnpm",
          args: ["store", "prune", "--store-dir", path],
          cwd: context.root,
        },
      };
    }
    case "yarn": {
      const version = (
        await runner("yarn", ["--version"], { cwd: context.root })
      ).trim();
      const major = Number.parseInt(version.split(".")[0] ?? "", 10);
      if (!Number.isFinite(major)) {
        throw new Error(`unrecognized version: ${version}`);
      }
      const args =
        major === 1
          ? ["cache", "dir"]
          : ["config", "get", "cacheFolder", "--json"];
      const path = await commandPath(runner, "yarn", args, context.root);
      if (!(await pathExists(path))) return undefined;
      return {
        id: major === 1 ? "yarn-classic-cache" : "yarn-cache",
        name: major === 1 ? "Yarn Classic cache" : "Yarn cache",
        path,
        tool: "yarn",
        description: "Downloaded package archives managed by Yarn.",
        consequences: ["Future installs may download packages again."],
        cleanup: {
          kind: "command",
          command: "yarn",
          args: ["cache", "clean"],
          cwd: context.root,
        },
        allowProjectScope: true,
      };
    }
    case "bun": {
      let cwd = context.root;
      let path: string;
      try {
        path = await commandPath(runner, "bun", ["pm", "cache"], cwd);
      } catch (initialError) {
        const fallbackCwd = await bunCommandFallbackCwd(context.root);
        if (fallbackCwd === context.root) throw initialError;
        cwd = fallbackCwd;
        path = await commandPath(runner, "bun", ["pm", "cache"], cwd);
      }
      if (!(await pathExists(path))) return undefined;
      return {
        id: "bun-cache",
        name: "Bun cache",
        path,
        tool: "bun",
        description: "Global package and registry cache managed by Bun.",
        consequences: ["Future installs may download packages again."],
        cleanup: {
          kind: "command",
          command: "bun",
          args: ["pm", "cache", "rm"],
          cwd,
        },
      };
    }
  }
}

async function bunCommandFallbackCwd(defaultCwd: string): Promise<string> {
  let current = dirname(fileURLToPath(import.meta.url));
  const filesystemRoot = parse(current).root;
  while (true) {
    if (await pathExists(join(current, "package.json"))) return current;
    if (current === filesystemRoot) return defaultCwd;
    current = dirname(current);
  }
}

function toCandidate(
  context: ProjectContext,
  definition: CacheDefinition,
): CacheCandidate {
  const absolutePath = safeAbsoluteCachePath(definition.path);
  const projectPath = relative(context.root, absolutePath);
  const inProject =
    definition.allowProjectScope === true &&
    projectPath !== "" &&
    projectPath !== ".." &&
    !projectPath.startsWith(`..${sep}`) &&
    !isAbsolute(projectPath);

  return {
    id: definition.id,
    name: definition.name,
    path: inProject ? projectPath.split(sep).join("/") : absolutePath,
    scope: inProject ? "project" : "global",
    safety: inProject ? "rebuild" : "global",
    tool: definition.tool,
    description: definition.description,
    consequences: definition.consequences,
    cleanup: definition.cleanup,
  };
}

function safeAbsoluteCachePath(path: string): string {
  const expanded = /^~[\\/]/u.test(path)
    ? join(homedir(), path.slice(2))
    : path;
  if (!isAbsolute(expanded))
    throw new Error(`cache path is not absolute: ${path}`);
  const absolutePath = resolve(expanded);
  if (
    absolutePath === parse(absolutePath).root ||
    absolutePath === resolve(homedir())
  ) {
    throw new Error(`unsafe cache path: ${path}`);
  }
  return absolutePath;
}

async function commandPath(
  runner: CommandRunner,
  command: PackageManager,
  args: string[],
  cwd: string,
): Promise<string> {
  const output = await runner(command, args, { cwd });
  const path = parsePathOutput(output);
  if (!path) throw new Error("command returned no cache path");
  return safeAbsoluteCachePath(path);
}

function parsePathOutput(output: string): string | undefined {
  const trimmed = output.trim();
  if (!trimmed) return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === "string") return parsed;
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      for (const key of ["effective", "value", "path"]) {
        if (typeof record[key] === "string") return record[key];
      }
    }
  } catch {
    // Plain-text output is expected from most package managers.
  }
  const lines = trimmed.split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]?.trim();
    if (line) return line;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.split("\n")[0] ?? error.message;
  }
  return String(error);
}
