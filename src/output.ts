import type { CacheTarget, CleanupPlan, CleanupResult } from "./types";

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0)
    throw new RangeError("Bytes must be non-negative");
  if (bytes < 1024) return `${bytes} B`;
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    UNITS.length - 1,
  );
  return `${(bytes / 1024 ** unitIndex).toFixed(1)} ${UNITS[unitIndex]}`;
}

export function formatTarget(target: CacheTarget): string {
  const flags = [target.safety, target.trackedByGit ? "tracked" : undefined]
    .filter(Boolean)
    .join(", ");
  return [
    target.name,
    `  ${target.path}`,
    `  ${formatBytes(target.size)} · ${flags}`,
    `  Created by: ${target.tool}`,
    `  Purpose: ${target.description}`,
    `  Effect: ${target.consequences.join(" ")}`,
  ].join("\n");
}

export function formatList(targets: CacheTarget[]): string {
  if (targets.length === 0) return "No supported development caches found.";
  const body = targets.map(formatTarget).join("\n\n");
  const total = targets.reduce((sum, target) => sum + target.size, 0);
  return `Detected caches\n\n${body}\n\nTotal: ${formatBytes(total)}`;
}

export function formatPlan(plan: CleanupPlan): string {
  const removable = plan.items.filter((item) => item.action === "remove");
  const skipped = plan.items.filter((item) => item.action === "skip");
  const lines = ["Cleanup plan", ""];
  if (removable.length === 0) lines.push("REMOVE: none");
  else {
    lines.push("REMOVE:");
    lines.push(
      ...removable.map(
        (item) => `  ${item.target.path}  ${formatBytes(item.target.size)}`,
      ),
    );
  }
  if (skipped.length > 0) {
    lines.push("", "SKIP:");
    lines.push(
      ...skipped.map(
        (item) => `  ${item.target.path}  ${item.reason ?? "Skipped"}`,
      ),
    );
  }
  lines.push("", `Estimated: ${formatBytes(plan.estimatedBytes)}`);
  return lines.join("\n");
}

export function formatResult(result: CleanupResult): string {
  const lines = ["Cleanup complete", ""];
  if (result.removed.length > 0) {
    lines.push("Removed:");
    lines.push(
      ...result.removed.map(
        (item) => `  ${item.path}  ${formatBytes(item.bytesFreed)}`,
      ),
    );
  } else {
    lines.push("Removed: none");
  }
  if (result.failed.length > 0) {
    lines.push("", "Failed:");
    lines.push(...result.failed.map((item) => `  ${item.path}  ${item.error}`));
  }
  lines.push("", `Freed: ${formatBytes(result.bytesFreed)}`);
  return lines.join("\n");
}
