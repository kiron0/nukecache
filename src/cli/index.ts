import {
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  note,
  outro,
  select,
  spinner,
} from "@clack/prompts";
import { readFile } from "node:fs/promises";

import { executeCleanup } from "../cleanup/executor";
import { createCleanupPlan } from "../cleanup/planner";
import { detectCaches } from "../detect";
import {
  formatAge,
  formatBytes,
  formatDockerUsage,
  formatLargest,
  formatList,
  formatOld,
  formatOrphaned,
  formatPlan,
  formatProjectSummary,
  formatReclaimPlan,
  formatResult,
  formatSweepTable,
  formatTarget,
  formatWarnings,
  printThanks,
} from "../output";
import { parseSize, selectReclaimCandidates } from "../reclaim";
import { sweep } from "../sweep";
import { detectOrphanedCaches } from "../orphaned";
import { isDockerAvailable, getDockerDiskUsage, pruneDockerBuildCache } from "../docker";
import type { CacheTarget, CleanupPlan, DetectionResult } from "../types";
import {
  checkForUpdate,
  checkUpdateManually,
  ignoreUpdateVersion,
  installUpdate,
  type UpdateInfo,
} from "../update";
import { parseCliArgs, type CliArgs } from "./args";
import {
  formatConfig,
  resolveConfigCollision,
  runConfigCommand,
  runInteractiveConfig,
} from "./config";
import { loadConfig } from "../project/config";
import { createProjectContext } from "../project/root";

async function main(): Promise<void> {
  if (process.stdin.isTTY) {
    process.once("SIGINT", () => {
      printThanks();
      process.exit(130);
    });
  }
  try {
    const args = parseCliArgs(process.argv.slice(2));
    const version = await getVersion();
    if (args.help) {
      printHelp();
      printThanks();
      return;
    }
    if (args.version) {
      console.log(`nukecache ${version}`);
      printThanks();
      return;
    }
    if (args.checkUpdate) {
      await handleManualUpdateCheck(version, args);
      return;
    }

    const context = await createProjectContext(args.cwd);
    const isInteractive =
      !args.json && Boolean(process.stdin.isTTY && process.stdout.isTTY);
    await resolveConfigCollision(context.root, isInteractive);
    const config = await loadConfig(context.root);

    if (
      !args.noUpdateCheck &&
      !config.noUpdateCheck &&
      process.env.NUKECACHE_NO_UPDATE_CHECK !== "1"
    ) {
      await handleUpdateCheck(version, args);
    }
    if (args.command === "sweep") {
      await handleSweep(args, version);
      return;
    }

    if (args.command === "reclaim") {
      await handleReclaim(args, context, config);
      return;
    }

    if (args.command === "orphaned") {
      await handleOrphaned(args, context, config);
      return;
    }

    if (args.command === "config") {
      if (
        args.configAction === "show" &&
        !args.json &&
        process.stdin.isTTY &&
        process.stdout.isTTY
      ) {
        await runInteractiveConfig(context.root);
        return;
      }
      const result = await runConfigCommand(context.root, args);
      console.log(
        args.json ? JSON.stringify(result, null, 2) : formatConfig(result),
      );
      if (!args.json) printThanks();
      return;
    }

    if (!args.json && config.json) {
      args.json = true;
    }
    if (args.command === "clean" && !args.dryRun && config.dryRun) {
      args.dryRun = true;
    }
    if (args.command === "clean" && !args.safe && config.safe) {
      args.safe = true;
    }
    if (args.command === "clean" && !args.force && config.force) {
      args.force = true;
    }
    if (
      args.command === "largest" &&
      args.limit === undefined &&
      config.limit
    ) {
      args.limit = config.limit;
    }
    if (args.command === "old" && args.days === undefined && config.days) {
      args.days = config.days;
    }

    if (args.docker) {
      if (args.command === "list") {
        await handleDockerList(args);
      } else {
        await handleDockerClean(args);
      }
      return;
    }

    const progress = !args.json && process.stderr.isTTY ? spinner() : undefined;
    progress?.start("Detecting development caches");
    const detection = await detectCaches({
      cwd: context.root,
      config,
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
      else {
        console.log(formatList(detection.targets));
        printThanks();
      }
      return;
    }

    if (args.command === "largest") {
      const limit = args.limit ?? 10;
      if (args.json) {
        console.log(
          JSON.stringify(
            detection.targets.slice(0, limit).map(toTargetJson),
            null,
            2,
          ),
        );
      } else {
        console.log(formatLargest(detection.targets, limit));
        printThanks();
      }
      return;
    }

    if (args.command === "old") {
      const days = args.days ?? 30;
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const oldTargets = detection.targets.filter(
        (target) => target.modifiedAt <= cutoff,
      );
      if (args.json)
        console.log(JSON.stringify(oldTargets.map(toTargetJson), null, 2));
      else {
        console.log(formatOld(oldTargets, days));
        printThanks();
      }
      return;
    }

    if (args.command === "explain") {
      const matches = findTargets(detection.targets, args.explainTarget ?? "");
      if (matches.length === 0) {
        const available = detection.targets.map((t) => t.id).join(", ");
        throw new Error(
          `Cache target not found: "${args.explainTarget ?? ""}"${available ? `\nAvailable targets: ${available}` : ""}`,
        );
      }
      if (args.json)
        console.log(JSON.stringify(matches.map(toTargetJson), null, 2));
      else {
        console.log(matches.map(formatTarget).join("\n\n"));
        printThanks();
      }
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
      else {
        console.log("No supported development caches found.");
        printThanks();
      }
      return;
    }

    const selectedIds = await selectTargets(detection, args);
    if (selectedIds === undefined) return;
    const plan = createCleanupPlan(detection.context.root, detection.targets, {
      selectedIds,
      safeOnly: !args.force,
      allowGlobal: args.global,
      allowRebuild: args.force,
    });

    if (args.dryRun) {
      if (args.json)
        console.log(JSON.stringify(toPlanJson(plan, true), null, 2));
      else {
        console.log(`${formatPlan(plan)}\n\nNo files were deleted.`);
        printThanks();
      }
      return;
    }

    if (!plan.items.some((item) => item.action === "remove")) {
      if (args.json)
        console.log(JSON.stringify(toPlanJson(plan, false), null, 2));
      else {
        console.log(formatPlan(plan));
        printThanks();
      }
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
        cancel(
          approved === false
            ? "Cleanup skipped. No files deleted."
            : "Cancelled. No files deleted.",
        );
        printThanks();
        return;
      }
    }

    const cleanupProgress =
      !args.json && process.stderr.isTTY ? spinner() : undefined;
    cleanupProgress?.start("Clearing caches");
    const result = await executeCleanup(plan);
    cleanupProgress?.stop("Cleanup finished");
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(formatResult(result));
      printThanks();
    }
    if (result.failed.length > 0) process.exitCode = 1;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Aborted config resolution."
    ) {
      process.exitCode = 1;
      return;
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    if (!process.argv.includes("--json")) {
      printThanks();
    }
  }
}

async function selectTargets(
  detection: DetectionResult,
  args: CliArgs,
): Promise<string[] | undefined> {
  const eligible = detection.targets.filter(
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
  note(formatProjectSummary(detection), "Project Overview");
  const selected = await multiselect({
    message: "Select caches to clear",
    options: eligible.map((target) => ({
      value: target.id,
      label: `${target.name} · ${formatBytes(target.size)}`,
      hint: `${target.path} (${target.safety})`,
    })),
    initialValues: eligible
      .filter(
        (target) => target.scope === "project" && target.safety === "safe",
      )
      .map((target) => target.id),
    required: false,
  });
  if (isCancel(selected)) {
    cancel("Cancelled. No files deleted.");
    printThanks();
    return undefined;
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
      createdAt: new Date(target.createdAt).toISOString(),
      modifiedAt: new Date(target.modifiedAt).toISOString(),
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

function toTargetJson(target: CacheTarget) {
  return {
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
    createdAt: new Date(target.createdAt).toISOString(),
    modifiedAt: new Date(target.modifiedAt).toISOString(),
  };
}

function findTargets(targets: CacheTarget[], query: string): CacheTarget[] {
  const q = query.toLowerCase();
  return targets.filter((t) =>
    [t.id, t.tool, t.name, t.path, t.absolutePath].some(
      (v) => v.toLowerCase() === q,
    ),
  );
}

async function handleUpdateCheck(
  currentVersion: string,
  args: CliArgs,
): Promise<void> {
  const update = await checkForUpdate(currentVersion);
  if (!update) return;

  if (args.json || args.yes || !process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(updateNotice(update));
    return;
  }

  console.log(
    `Update available · ${update.currentVersion} → ${update.latestVersion}\nRelease notes: ${update.releaseUrl}`,
  );
  const action = await select({
    message: "Update nukecache?",
    options: [
      { value: "update", label: "Update now", hint: "npm install --global" },
      { value: "skip", label: "Skip" },
      {
        value: "ignore",
        label: "Skip this version",
        hint: `hide ${update.latestVersion}`,
      },
    ],
    initialValue: "update",
  });
  if (isCancel(action)) {
    cancel("Cancelled.");
    printThanks();
    return;
  }
  if (action === "skip") return;
  if (action === "ignore") {
    await ignoreUpdateVersion(update.latestVersion);
    return;
  }

  console.log(`Updating to ${update.latestVersion}...`);
  await installUpdate(update.latestVersion);
  outro(`Updated to ${update.latestVersion}. Restart nukecache to use it.`);
}

async function handleManualUpdateCheck(
  version: string,
  args: CliArgs,
): Promise<void> {
  const isInteractive =
    !args.json && Boolean(process.stdout.isTTY && process.stdin.isTTY);

  if (args.json) {
    const result = await checkUpdateManually(version, { force: args.force });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (isInteractive) {
    intro("nukecache update check");
    const checkSpinner = spinner();
    checkSpinner.start("Checking npm registry for updates");
    const result = await checkUpdateManually(version, { force: args.force });
    if (result.rateLimited) {
      checkSpinner.stop(
        `Checked recently (rate limited, 60s cooldown). Latest: v${result.latestVersion}`,
      );
    } else if (result.updateAvailable) {
      checkSpinner.stop(
        `Update available: ${result.currentVersion} → ${result.latestVersion}`,
      );
    } else {
      checkSpinner.stop(`Up to date (v${result.currentVersion})`);
    }

    if (result.updateAvailable) {
      note(`Run: npm install --global nukecache@latest`, "Upgrade Available");
      const answer = await select({
        message: `Install v${result.latestVersion} now?`,
        options: [
          { value: "install", label: "Install update now" },
          { value: "skip", label: "Skip for now" },
        ],
        initialValue: "install",
      });
      if (isCancel(answer)) {
        cancel("Cancelled.");
        printThanks();
        return;
      }
      if (answer === "install") {
        console.log(`Updating to ${result.latestVersion}...`);
        await installUpdate(result.latestVersion);
        outro(
          `Updated to ${result.latestVersion}. Restart nukecache to use it.`,
        );
      }
    }
    printThanks();
    return;
  }

  const result = await checkUpdateManually(version, { force: args.force });
  if (result.updateAvailable) {
    console.log(
      `Update available: ${result.currentVersion} → ${result.latestVersion}`,
    );
    console.log("Run: npm install --global nukecache@latest");
  } else {
    console.log(`nukecache is up to date (${result.currentVersion})`);
  }
  if (result.rateLimited) {
    console.log(
      "(Checked recently with 60s rate limit; use --force to bypass)",
    );
  }
  printThanks();
}

function updateNotice(update: UpdateInfo): string {
  return `Update available: ${update.currentVersion} → ${update.latestVersion}. Run: npm install --global nukecache@latest`;
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
  nukecache check-update            Check for package updates
  nukecache list [--json]           Inspect caches without deleting
  nukecache config                  Interactive project configuration
  nukecache config set <key> <val>  Update project configuration
  nukecache config unset <key>      Remove configured value
  nukecache largest [--limit 10]    Show largest detected caches
  nukecache old [--days 30]         Show caches unchanged for N days
  nukecache explain <target>        Explain matching caches
  nukecache clean                   Interactive cleanup
  nukecache clean --safe --yes      Remove all safe, untracked project caches
  nukecache npm                     Clean npm's global cache interactively
  nukecache pnpm --dry-run          Preview pnpm store pruning
  nukecache list --global           Inspect detected manager caches
  nukecache --dry-run               Preview safe cleanup
  nukecache sweep <dir>             Scan all projects in <dir> for caches
  nukecache sweep ~/Code --days 30  Scan projects with caches older than 30d
  nukecache reclaim 5gb             Auto-select safest caches to free 5 GB
  nukecache reclaim 500mb --dry-run Preview reclaim without deleting
  nukecache orphaned                Show caches whose tool no longer exists
  nukecache orphaned --dry-run      Preview orphaned cleanup without deleting
  nukecache list --docker           Show Docker build cache size
  nukecache clean --docker          Prune Docker build cache interactively

Options:
  --all                             Select all safe project caches
  --check-update                    Check for package updates (60s rate limit)
  --cwd <path>                      Scan another project directory
  --days <number>                   Age threshold for old/sweep commands
  --docker                          Operate on Docker build cache (list/clean)
  --dry-run                         Preview; never delete
  --force                           Include rebuildable/global caches; bypass active-cache protection
  --global                          Package-manager cache scope
  --ignore <id|tool|path>           Skip target (repeatable)
  --json                            Emit machine-readable JSON
  --limit <number>                  Result limit for largest command
  --min-age <days>                  Same as --days for sweep (alias)
  --no-update-check                 Disable update check for this run
  --project                         Include project scope with --global
  --safe                            Restrict cleanup to safe targets
  --yes, -y                         Skip confirmation; global requires --force
  --help, -h                        Show help
  --version, -v                     Show version`);
}


async function handleSweep(
  args: CliArgs,
  _version: string,
): Promise<void> {
  const baseDir = args.sweepDir ?? process.cwd();
  const days = args.days ?? args.minAge;
  const isInteractive =
    !args.json && Boolean(process.stdin.isTTY && process.stdout.isTTY);

  const progress =
    !args.json && process.stderr.isTTY ? spinner() : undefined;
  progress?.start(`Scanning ${baseDir}`);

  const result = await sweep(baseDir, {
    ...(days !== undefined ? { days } : {}),
  });

  progress?.stop(
    `Scanned ${result.projects.length} project(s), ${result.allTargets.length} cache(s) found`,
  );

  if (result.allTargets.length === 0) {
    if (args.json) {
      console.log(JSON.stringify({ baseDir, projects: [], totalBytes: 0 }));
    } else {
      console.log("No reclaimable caches found.");
      printThanks();
    }
    return;
  }

  if (args.json) {
    console.log(
      JSON.stringify({
        baseDir,
        projects: result.projects.map((p) => ({
          root: p.root,
          caches: p.detection.targets.map(toTargetJson),
        })),
        totalBytes: result.totalBytes,
      }),
    );
    return;
  }

  console.log(
    formatSweepTable(result.allTargets, result.baseDir, result.totalBytes),
  );

  if (args.dryRun) {
    console.log("\nDry run — no files deleted.");
    printThanks();
    return;
  }

  if (!isInteractive) {
    printThanks();
    return;
  }

  intro("nukecache sweep");

  const sweepEligible = result.allTargets.filter(
    (t) => !t.trackedByGit && !t.symlink && t.safety === "safe",
  );

  if (sweepEligible.length === 0) {
    console.log("No safe targets available for cleanup.");
    printThanks();
    return;
  }

  const selected = await multiselect({
    message: "Select caches to clear",
    options: sweepEligible.map((t) => ({
      value: t.absolutePath,
      label: `${t.projectRoot.split("/").at(-1)} · ${t.path}  ${formatBytes(t.size)}`,
      hint: `${t.safety} · ${formatAge(t.modifiedAt)}`,
    })),
    initialValues: sweepEligible
      .filter((t) => t.safety === "safe")
      .map((t) => t.absolutePath),
    required: false,
  });

  if (isCancel(selected)) {
    cancel("Cancelled. No files deleted.");
    printThanks();
    return;
  }

  if (selected.length === 0) {
    cancel("No caches selected.");
    printThanks();
    return;
  }

  const approved = await confirm({
    message: `Clear ${selected.length} cache(s)?`,
    initialValue: false,
  });

  if (isCancel(approved) || !approved) {
    cancel("Cleanup skipped. No files deleted.");
    printThanks();
    return;
  }

  const { removeProjectTarget } = await import("../filesystem/remove");
  let totalFreed = 0;
  const removed: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];
  const selectedSet = new Set(selected);

  for (const target of sweepEligible) {
    if (!selectedSet.has(target.absolutePath)) continue;
    try {
      await removeProjectTarget(target.projectRoot, target.absolutePath);
      totalFreed += target.size;
      removed.push(target.path);
    } catch (error) {
      failed.push({
        path: target.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const lines = ["Sweep complete", ""];
  if (removed.length > 0) lines.push("Removed:", ...removed.map((p) => `  ${p}`));
  if (failed.length > 0)
    lines.push("", "Failed:", ...failed.map((f) => `  ${f.path}  ${f.error}`));
  lines.push("", `Freed: ${formatBytes(totalFreed)}`);
  console.log(lines.join("\n"));
  printThanks();

  if (failed.length > 0) process.exitCode = 1;
}

async function handleReclaim(
  args: CliArgs,
  context: Awaited<ReturnType<typeof createProjectContext>>,
  config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> {
  const targetBytes = parseSize(args.reclaimTarget!);
  const isInteractive =
    !args.json && Boolean(process.stdin.isTTY && process.stdout.isTTY);

  const progress =
    !args.json && process.stderr.isTTY ? spinner() : undefined;
  progress?.start("Detecting caches");

  const detection = await detectCaches({
    cwd: context.root,
    config,
    scope: "project",
  });
  progress?.stop(`Scanned ${detection.context.root}`);

  const candidates = selectReclaimCandidates(detection.targets, targetBytes);

  if (args.json) {
    const estimated = candidates.reduce((s, t) => s + t.size, 0);
    console.log(
      JSON.stringify({
        targetBytes,
        estimatedBytes: estimated,
        candidates: candidates.map(toTargetJson),
      }),
    );
    return;
  }

  console.log(formatReclaimPlan(candidates, targetBytes));

  if (candidates.length === 0) {
    printThanks();
    return;
  }

  if (args.dryRun) {
    console.log("\nDry run — no files deleted.");
    printThanks();
    return;
  }

  if (!args.yes) {
    if (!isInteractive) {
      throw new Error(
        "Interactive reclaim requires a TTY. Use reclaim <size> --yes or --dry-run.",
      );
    }
    const approved = await confirm({
      message: "Clean selected caches?",
      initialValue: false,
    });
    if (isCancel(approved) || !approved) {
      cancel(
        approved === false
          ? "Cleanup skipped. No files deleted."
          : "Cancelled. No files deleted.",
      );
      printThanks();
      return;
    }
  }

  const plan = createCleanupPlan(context.root, detection.targets, {
    selectedIds: candidates.map((t) => t.id),
    safeOnly: false,
    allowGlobal: false,
  });

  const cleanupProgress =
    !args.json && process.stderr.isTTY ? spinner() : undefined;
  cleanupProgress?.start("Clearing caches");
  const result = await executeCleanup(plan);
  cleanupProgress?.stop("Cleanup finished");

  console.log(formatResult(result));
  printThanks();

  if (result.failed.length > 0) process.exitCode = 1;
}

async function handleOrphaned(
  args: CliArgs,
  context: Awaited<ReturnType<typeof createProjectContext>>,
  config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> {
  const progress =
    !args.json && process.stderr.isTTY ? spinner() : undefined;
  progress?.start("Detecting caches");

  const detection = await detectCaches({
    cwd: context.root,
    config,
    scope: "project",
  });
  progress?.stop(`Scanned ${detection.context.root}`);

  const orphaned = await detectOrphanedCaches(detection.targets, detection.context);

  if (args.json) {
    console.log(
      JSON.stringify({
        orphaned: orphaned.map(({ target, reason }) => ({
          ...toTargetJson(target),
          orphanReason: reason,
        })),
        totalBytes: orphaned.reduce((s, { target }) => s + target.size, 0),
      }),
    );
    return;
  }

  console.log(formatOrphaned(orphaned));

  if (orphaned.length === 0) {
    printThanks();
    return;
  }

  if (args.dryRun) {
    console.log("\nDry run — no files deleted.");
    printThanks();
    return;
  }

  const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (!args.yes) {
    if (!isInteractive) {
      throw new Error(
        "orphaned requires confirmation. Use orphaned --yes or --dry-run.",
      );
    }
    intro("nukecache orphaned");
    const approved = await confirm({
      message: `Remove ${orphaned.length} orphaned cache(s)?`,
      initialValue: false,
    });
    if (isCancel(approved) || !approved) {
      cancel(
        approved === false
          ? "Cleanup skipped. No files deleted."
          : "Cancelled. No files deleted.",
      );
      printThanks();
      return;
    }
  }

  const plan = createCleanupPlan(
    context.root,
    orphaned.map(({ target }) => target),
    { selectedIds: orphaned.map(({ target }) => target.id), safeOnly: false, allowGlobal: false },
  );

  const cleanupProgress =
    !args.json && process.stderr.isTTY ? spinner() : undefined;
  cleanupProgress?.start("Clearing orphaned caches");
  const result = await executeCleanup(plan);
  cleanupProgress?.stop("Done");

  console.log(formatResult(result));
  printThanks();
  if (result.failed.length > 0) process.exitCode = 1;
}

async function handleDockerList(args: CliArgs): Promise<void> {
  const available = await isDockerAvailable();
  if (!available) {
    console.error("Docker is not running or not installed.");
    process.exitCode = 1;
    return;
  }

  const progress =
    !args.json && process.stderr.isTTY ? spinner() : undefined;
  progress?.start("Querying Docker");

  const usage = await getDockerDiskUsage();
  progress?.stop("Done");

  if (args.json) {
    console.log(
      JSON.stringify({
        buildCacheSize: usage.buildCacheSize,
        buildCacheReclaimable: usage.buildCacheReclaimable,
      }),
    );
    return;
  }

  console.log(formatDockerUsage(usage.buildCacheSize, usage.buildCacheReclaimable));
  printThanks();
}

async function handleDockerClean(args: CliArgs): Promise<void> {
  const available = await isDockerAvailable();
  if (!available) {
    console.error("Docker is not running or not installed.");
    process.exitCode = 1;
    return;
  }

  if (args.dryRun) {
    const usage = await getDockerDiskUsage();
    console.log(formatDockerUsage(usage.buildCacheSize, usage.buildCacheReclaimable));
    console.log("\nDry run — no build cache pruned.");
    printThanks();
    return;
  }

  const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (!args.yes && !args.force) {
    if (!isInteractive) {
      throw new Error(
        "Docker prune requires confirmation. Use clean --docker --yes or --dry-run.",
      );
    }
    intro("nukecache clean --docker");
    const usage = await getDockerDiskUsage();
    console.log(formatDockerUsage(usage.buildCacheSize, usage.buildCacheReclaimable));
    console.log("");
    const approved = await confirm({
      message: "Prune all Docker build cache? (docker builder prune --force)",
      initialValue: false,
    });
    if (isCancel(approved) || !approved) {
      cancel(
        approved === false
          ? "Cleanup skipped."
          : "Cancelled.",
      );
      printThanks();
      return;
    }
  }

  const progress =
    !args.json && process.stderr.isTTY ? spinner() : undefined;
  progress?.start("Running docker builder prune");

  const result = await pruneDockerBuildCache(true);
  progress?.stop("Done");

  if (args.json) {
    console.log(JSON.stringify({ reclaimedBytes: result.reclaimedBytes }));
    return;
  }

  console.log(`Docker build cache pruned. Freed: ${formatBytes(result.reclaimedBytes)}`);
  printThanks();
}

void main();
