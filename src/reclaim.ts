import type { CacheTarget } from "./types";

export function selectReclaimCandidates(
  targets: CacheTarget[],
  targetBytes: number,
): CacheTarget[] {
  const eligible = targets.filter(
    (t) =>
      !t.trackedByGit &&
      !t.symlink &&
      t.scope === "project" &&
      (t.safety === "safe" || t.safety === "rebuild"),
  );

  const scored = eligible.map((t) => ({
    target: t,
    safePriority: t.safety === "safe" ? 0 : 1,
    age: t.modifiedAt,
    size: t.size,
  }));

  scored.sort(
    (a, b) =>
      a.safePriority - b.safePriority || a.age - b.age || b.size - a.size,
  );

  const selected: CacheTarget[] = [];
  let accumulated = 0;

  for (const { target } of scored) {
    if (accumulated >= targetBytes) break;
    selected.push(target);
    accumulated += target.size;
  }

  return selected;
}

export function parseSize(raw: string): number {
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)?$/i);
  if (!match) {
    throw new Error(
      `Invalid size "${raw}". Examples: 500mb, 5gb, 1.5gb, 200mb`,
    );
  }
  const value = parseFloat(match[1] ?? "0");
  const unit = (match[2] ?? "b").toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
    tb: 1024 ** 4,
  };
  const multiplier = multipliers[unit] ?? 1;
  const bytes = Math.round(value * multiplier);
  if (bytes <= 0) throw new Error(`Size must be positive: ${raw}`);
  return bytes;
}
