import {
  confirm,
  intro,
  isCancel,
  multiselect,
  outro,
  spinner,
} from "@clack/prompts";
import { readFile } from "node:fs/promises";

import { executeCleanup } from "../cleanup/executor";
import { createCleanupPlan } from "../cleanup/planner";
import { detectCaches } from "../detect";
import {
  formatBytes,
  formatList,
  formatPlan,
  formatResult,
  formatWarnings,
} from "../output";
import type { CacheTarget, CleanupPlan } from "../types";
import { parseCliArgs, type CliArgs } from "./args";

async function main(): Promise<void> {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      return;
    }
    if (args.version) {
      console.log(`nukecache ${await getVersion()}`);
      return;
    }

    const progress = !args.json && process.stderr.isTTY ? spinner() : undefined;
    progress?.start("Detecting development caches");
    const detection = await detectCaches({
      ...(args.cwd ? { cwd: args.cwd } : {}),
      ignore: args.ignore,
      ...(args.global
        ? { scope: args.project ? ("all" as const) : ("global" as const) }
        : args.project
          ? { scope: "project" as const }
          : {}),
      ...(args.manager ? { packageManagers: [args.manager] } : {}),
    });
    progress?.stop(`Scanned ${detection.context.root}`);

    if (!args.json && detection.warnings.length > 0) {
      console.error(formatWarnings(detection.warnings));
    }

    if (args.command === "list") {
      if (args.json)
        console.log(
          JSON.stringify(
            toListJson(
              detection.targets,
              detection.packageManagers,
              detection.warnings,
            ),
            null,
            2,
          ),
        );
      else console.log(formatList(detection.targets));
      return;
    }

    if (detection.targets.length === 0) {
      if (args.json)
        console.log(
          JSON.stringify({
            removed: [],
            skipped: [],
            failed: [],
            bytesFreed: 0,
          }),
        );
      else console.log("No supported development caches found.");
      return;
    }

    const selectedIds = await selectTargets(detection.targets, args);
    const plan = createCleanupPlan(detection.context.root, detection.targets, {
      selectedIds,
      safeOnly: !args.force,
      allowGlobal: args.global,
      allowRebuild: args.force,
    });

    if (args.dryRun) {
      if (args.json)
        console.log(JSON.stringify(toPlanJson(plan, true), null, 2));
      else console.log(`${formatPlan(plan)}\n\nNo files were deleted.`);
      return;
    }

    if (!plan.items.some((item) => item.action === "remove")) {
      if (args.json)
        console.log(JSON.stringify(toPlanJson(plan, false), null, 2));
      else console.log(formatPlan(plan));
      return;
    }

    if (!args.yes) {
      if (!process.stdin.isTTY) {
        throw new Error(
          "Interactive cleanup requires a TTY. Use clean --safe --yes or --dry-run.",
        );
      }
      console.log(formatPlan(plan));
      const elevated = plan.items.some(
        (item) =>
          item.action === "remove" &&
          (item.target.scope === "global" || item.target.safety === "rebuild"),
      );
      const approved = await confirm({
        message: elevated
          ? "Clear selected global or rebuildable caches?"
          : "Clear selected caches?",
        initialValue: false,
      });
      if (isCancel(approved) || !approved) {
        outro("Cancelled. No files deleted.");
        return;
      }
    }

    const cleanupProgress =
      !args.json && process.stderr.isTTY ? spinner() : undefined;
    cleanupProgress?.start("Clearing caches");
    const result = await executeCleanup(plan);
    cleanupProgress?.stop("Cleanup finished");
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(formatResult(result));
    if (result.failed.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function selectTargets(
  targets: CacheTarget[],
  args: CliArgs,
): Promise<string[]> {
  const eligible = targets.filter(
    (target) =>
      !target.trackedByGit &&
      ((target.scope === "project" &&
        (target.safety === "safe" ||
          (args.force && target.safety === "rebuild"))) ||
        (args.global &&
          target.scope === "global" &&
          target.safety === "global" &&
          target.cleanup !== undefined)),
  );
  if (eligible.length === 0) return [];
  if (args.yes || args.dryRun || args.all) {
    return eligible
      .filter(
        (target) => target.scope === "project" || args.force || args.dryRun,
      )
      .map((target) => target.id);
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      "Interactive cleanup requires a TTY. Use clean --safe --yes or --dry-run.",
    );
  }

  intro("nukecache");
  console.log(formatList(targets));
  const selected = await multiselect({
    message: "Select caches to clear",
    options: eligible.map((target) => ({
      value: target.id,
      label: `${target.name} · ${formatBytes(target.size)}`,
      hint: target.path,
    })),
    initialValues: eligible
      .filter(
        (target) => target.scope === "project" && target.safety === "safe",
      )
      .map((target) => target.id),
    required: false,
  });
  if (isCancel(selected)) {
    outro("Cancelled. No files deleted.");
    return [];
  }
  return selected;
}

function toListJson(
  targets: CacheTarget[],
  packageManagers: string[],
  warnings: Array<{ tool: string; message: string }>,
) {
  return {
    packageManagers,
    caches: targets.map((target) => ({
      id: target.id,
      name: target.name,
      path: target.path,
      size: target.size,
      scope: target.scope,
      safety: target.safety,
      tool: target.tool,
      description: target.description,
      consequences: target.consequences,
      trackedByGit: target.trackedByGit,
      symlink: target.symlink,
      ...(target.cleanup
        ? {
            cleanup: {
              command: target.cleanup.command,
              args: target.cleanup.args,
            },
          }
        : {}),
    })),
    totalBytes: targets.reduce((sum, target) => sum + target.size, 0),
    warnings,
  };
}

function toPlanJson(plan: CleanupPlan, dryRun: boolean) {
  return {
    dryRun,
    remove: plan.items
      .filter((item) => item.action === "remove")
      .map((item) => ({
        id: item.target.id,
        path: item.target.path,
        size: item.target.size,
        scope: item.target.scope,
        safety: item.target.safety,
      })),
    skipped: plan.items
      .filter((item) => item.action === "skip")
      .map((item) => ({
        id: item.target.id,
        path: item.target.path,
        reason: item.reason,
      })),
    estimatedBytes: plan.estimatedBytes,
  };
}

async function getVersion(): Promise<string> {
  for (const url of [
    new URL("../../package.json", import.meta.url),
    new URL("../package.json", import.meta.url),
  ]) {
    try {
      const value: unknown = JSON.parse(await readFile(url, "utf8"));
      if (typeof value === "object" && value !== null && "version" in value) {
        return String(value.version);
      }
    } catch {
      // Try path used by bundled output.
    }
  }
  return "unknown";
}

function printHelp(): void {
  console.log(`nukecache — detect, inspect, and safely clear development caches

Usage:
  nukecache                         Interactive project cleanup
  nukecache list [--json]           Inspect caches without deleting
  nukecache clean                   Interactive cleanup
  nukecache clean --safe --yes      Remove all safe, untracked project caches
  nukecache npm                     Clean npm's global cache interactively
  nukecache pnpm --dry-run          Preview pnpm store pruning
  nukecache list --global           Inspect detected manager caches
  nukecache --dry-run               Preview safe cleanup

Options:
  --all                             Select all safe project caches
  --cwd <path>                      Scan another project directory
  --dry-run                         Preview; never delete
  --force                           Include rebuildable/global caches
  --global                          Package-manager cache scope
  --ignore <id|tool|path>           Skip target (repeatable)
  --json                            Emit machine-readable JSON
  --project                         Include project scope with --global
  --safe                            Restrict cleanup to safe targets
  --yes, -y                         Skip confirmation; global requires --force
  --help, -h                        Show help
  --version, -v                     Show version`);
}

void main();
