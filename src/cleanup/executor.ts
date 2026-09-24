import { lstat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { calculateSize } from "../filesystem/size";
import { removeProjectTarget } from "../filesystem/remove";
import { assertSafeProjectTarget } from "../filesystem/safety";
import { runCommand, type CommandRunner } from "../process/command";
import type {
  CacheTarget,
  CleanupPlan,
  CleanupResult,
  NativeCleanupCommand,
} from "../types";

export interface ExecuteOptions {
  commandRunner?: CommandRunner;
}

export async function executeCleanup(
  plan: CleanupPlan,
  options: ExecuteOptions = {},
): Promise<CleanupResult> {
  const result: CleanupResult = {
    removed: [],
    skipped: [],
    failed: [],
    bytesFreed: 0,
  };

  for (const item of plan.items) {
    if (item.action === "skip") {
      result.skipped.push({
        id: item.target.id,
        path: item.target.path,
        reason: item.reason ?? "Skipped",
      });
      continue;
    }

    try {
      const bytesFreed = item.target.cleanup
        ? await executeNativeCleanup(
            plan.root,
            item.target,
            item.target.cleanup,
            options.commandRunner ?? runCommand,
          )
        : await executeFilesystemCleanup(plan.root, item.target);
      result.removed.push({
        id: item.target.id,
        path: item.target.path,
        bytesFreed,
      });
      result.bytesFreed += bytesFreed;
    } catch (error) {
      result.failed.push({
        id: item.target.id,
        path: item.target.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

async function executeFilesystemCleanup(
  root: string,
  target: CacheTarget,
): Promise<number> {
  if (target.scope !== "project") {
    throw new Error("Global targets require a native cleanup command");
  }
  await removeProjectTarget(root, target.absolutePath);
  return target.size;
}

async function executeNativeCleanup(
  root: string,
  target: CacheTarget,
  cleanup: NativeCleanupCommand,
  runner: CommandRunner,
): Promise<number> {
  if (target.scope === "project") {
    await assertSafeProjectTarget(root, target.absolutePath);
  }
  assertAllowedCleanup(root, target, cleanup);
  await runner(cleanup.command, cleanup.args, {
    cwd: cleanup.cwd,
    timeout: 10 * 60_000,
  });
  const remaining = await sizeIfExists(target.absolutePath);
  return Math.max(0, target.size - remaining);
}

function assertAllowedCleanup(
  root: string,
  target: CacheTarget,
  cleanup: NativeCleanupCommand,
): void {
  if (
    resolve(cleanup.cwd) !== resolve(root) ||
    cleanup.command !== target.tool
  ) {
    throw new Error("Native cleanup command does not match target context");
  }

  const valid = (() => {
    switch (cleanup.command) {
      case "npm": {
        const cacheOption = cleanup.args[3];
        return (
          cleanup.args.length === 4 &&
          cleanup.args[0] === "cache" &&
          cleanup.args[1] === "clean" &&
          cleanup.args[2] === "--force" &&
          cacheOption?.startsWith("--cache=") === true &&
          resolve(dirname(target.absolutePath)) ===
            resolve(cacheOption.slice("--cache=".length))
        );
      }
      case "pnpm":
        return (
          cleanup.args.length === 4 &&
          cleanup.args[0] === "store" &&
          cleanup.args[1] === "prune" &&
          cleanup.args[2] === "--store-dir" &&
          resolve(cleanup.args[3] ?? "") === resolve(target.absolutePath)
        );
      case "yarn":
        return (
          cleanup.args.length === 2 &&
          cleanup.args[0] === "cache" &&
          cleanup.args[1] === "clean"
        );
      case "bun":
        return (
          cleanup.args.length === 3 &&
          cleanup.args[0] === "pm" &&
          cleanup.args[1] === "cache" &&
          cleanup.args[2] === "rm"
        );
    }
  })();

  if (!valid) throw new Error("Unsupported native cleanup command");
}

async function sizeIfExists(path: string): Promise<number> {
  try {
    await lstat(path);
    return await calculateSize(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}
