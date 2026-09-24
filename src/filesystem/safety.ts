import { lstat, realpath } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";

const PROTECTED_NAMES = new Set([
  ".git",
  ".env",
  ".env.local",
  ".env.production",
  "app",
  "bun.lock",
  "bun.lockb",
  "components",
  "data",
  "deno.lock",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "package.json",
  "pages",
  "pnpm-lock.yaml",
  "public",
  "src",
  "yarn.lock",
]);

function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return (
    path === "" ||
    (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))
  );
}

export async function assertSafeProjectTarget(
  projectRoot: string,
  targetPath: string,
): Promise<void> {
  const root = resolve(projectRoot);
  const target = resolve(targetPath);
  const filesystemRoot = parse(target).root;

  if (target === root || target === filesystemRoot || !isWithin(root, target)) {
    throw new Error(`Unsafe cleanup path outside project boundary: ${target}`);
  }

  const relativePath = relative(root, target);
  const parts = relativePath.split(sep);
  if (parts.some(isProtectedName)) {
    throw new Error(
      `Protected project path cannot be removed: ${relativePath}`,
    );
  }

  const rootRealPath = await realpath(root);
  const details = await lstat(target);
  if (details.isSymbolicLink()) return;

  const targetRealPath = await realpath(target);
  if (!isWithin(rootRealPath, targetRealPath)) {
    throw new Error(`Target resolves outside project boundary: ${target}`);
  }

  // Catch a non-symlink target reached through a symlinked parent.
  const parentRealPath = await realpath(dirname(target));
  if (!isWithin(rootRealPath, parentRealPath)) {
    throw new Error(
      `Target parent resolves outside project boundary: ${target}`,
    );
  }

  if (isProtectedName(basename(target)) || isDatabaseFile(basename(target))) {
    throw new Error(
      `Protected project path cannot be removed: ${relativePath}`,
    );
  }
}

function isProtectedName(name: string): boolean {
  return (
    PROTECTED_NAMES.has(name) || name === ".env" || name.startsWith(".env.")
  );
}

function isDatabaseFile(name: string): boolean {
  return /\.(?:db|sqlite|sqlite3)$/iu.test(name);
}
