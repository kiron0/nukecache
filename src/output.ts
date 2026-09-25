import type {
  CacheTarget,
  CleanupPlan,
  CleanupResult,
  DetectionWarning,
} from "./types";

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
    `  Last changed: ${formatAge(target.modifiedAt)}`,
    `  Created by: ${target.tool}`,
    `  Purpose: ${target.description}`,
    `  Effect: ${target.consequences.join(" ")}`,
  ].join("\n");
}

export function formatLargest(targets: CacheTarget[], limit: number): string {
  const largest = [...targets]
    .sort((left, right) => right.size - left.size)
    .slice(0, limit);
  if (largest.length === 0) return "No supported development caches found.";
  const lines = largest.flatMap((target, index) => [
    `${index + 1}. ${target.name}  ${formatBytes(target.size)}`,
    `   ${target.path} · ${target.scope} · ${target.safety}`,
  ]);
  const total = largest.reduce((sum, target) => sum + target.size, 0);
  return `Largest caches\n\n${lines.join("\n")}\n\nShown: ${formatBytes(total)}`;
}

export function formatOld(targets: CacheTarget[], days: number): string {
  if (targets.length === 0) {
    return `No caches unchanged for ${days} days.`;
  }
  return `Caches unchanged for at least ${days} days\n\n${targets
    .map(formatTarget)
    .join("\n\n")}\n\nAge uses cache path timestamps.`;
}

export function formatList(targets: CacheTarget[]): string {
  if (targets.length === 0) return "No supported development caches found.";
  const sections = (["project", "global"] as const).flatMap((scope) => {
    const scoped = targets.filter((target) => target.scope === scope);
    if (scoped.length === 0) return [];
    const title = scope === "project" ? "Project caches" : "Global caches";
    return [`${title}\n\n${scoped.map(formatTarget).join("\n\n")}`];
  });
  const total = targets.reduce((sum, target) => sum + target.size, 0);
  return `Detected caches\n\n${sections.join("\n\n")}\n\nTotal: ${formatBytes(total)}`;
}

export function formatWarnings(warnings: DetectionWarning[]): string {
  return warnings
    .map((warning) => `Warning (${warning.tool}): ${warning.message}`)
    .join("\n");
}

export function formatAge(timestamp: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatPlan(plan: CleanupPlan): string {
  const removable = plan.items.filter((item) => item.action === "remove");
  const skipped = plan.items.filter((item) => item.action === "skip");
  const lines = ["Cleanup plan", ""];
  if (removable.length === 0) lines.push("REMOVE: none");
  else {
    lines.push("REMOVE:");
    lines.push(
      ...removable.map((item) => {
        const method = item.target.cleanup
          ? `  [${item.target.cleanup.command} native cleanup]`
          : "";
        return `  ${item.target.path}  ${formatBytes(item.target.size)}${method}`;
      }),
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
  lines.push("", `Selected size: ${formatBytes(plan.estimatedBytes)}`);
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
