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
import { formatBytes, formatList, formatPlan, formatResult } from "../output";
import type { CacheTarget, CleanupPlan } from "../types";
import { parseCliArgs } from "./args";

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
    });
    progress?.stop(`Scanned ${detection.context.root}`);

    if (args.command === "list") {
      if (args.json)
        console.log(JSON.stringify(toListJson(detection.targets), null, 2));
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

    const selectedIds = await selectTargets(
      detection.targets,
      args.yes || args.dryRun || args.all,
    );
    const plan = createCleanupPlan(detection.context.root, detection.targets, {
      selectedIds,
      safeOnly: true,
    });

    if (args.dryRun) {
      if (args.json)
        console.log(JSON.stringify(toPlanJson(plan, true), null, 2));
      else console.log(`${formatPlan(plan)}\n\nNo files were deleted.`);
      return;
    }

    if (plan.estimatedBytes === 0) {
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
      const approved = await confirm({
        message: "Clear selected caches?",
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
  selectAll: boolean,
): Promise<string[]> {
  const eligible = targets.filter(
    (target) =>
      target.scope === "project" &&
      target.safety === "safe" &&
      !target.trackedByGit,
  );
  if (eligible.length === 0) return [];
  if (selectAll) return eligible.map((target) => target.id);
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
    initialValues: eligible.map((target) => target.id),
    required: false,
  });
  if (isCancel(selected)) {
    outro("Cancelled. No files deleted.");
    return [];
  }
  return selected;
}

function toListJson(targets: CacheTarget[]) {
  return {
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
    })),
    totalBytes: targets.reduce((sum, target) => sum + target.size, 0),
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
  nukecache --dry-run               Preview safe cleanup

Options:
  --all                             Select all safe project caches
  --cwd <path>                      Scan another project directory
  --dry-run                         Preview; never delete
  --ignore <id|tool|path>           Skip target (repeatable)
  --json                            Emit machine-readable JSON
  --project                         Project scope (default)
  --safe                            Restrict cleanup to safe targets
  --yes, -y                         Skip confirmation; requires --safe
  --help, -h                        Show help
  --version, -v                     Show version`);
}

void main();
