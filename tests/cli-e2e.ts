import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

interface ListOutput {
  caches: Array<{ path: string }>;
}

interface PlanOutput {
  dryRun: boolean;
  remove: Array<{ path: string }>;
}

interface CleanupOutput {
  removed: Array<{ path: string }>;
}

type ExecFailure = Error & { code: number; stderr: string };

const execFileAsync = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), "nukecache-cli-e2e-"));
const cli = join(process.cwd(), "dist", "cli.js");
const packageVersion = await readPackageVersion();

try {
  await writeFile(join(directory, "package.json"), '{"name":"fixture"}');
  const cache = join(directory, ".next", "cache");
  await mkdir(cache, { recursive: true });
  await writeFile(join(cache, "entry.bin"), "cached-data");

  const listed = await execFileAsync(process.execPath, [
    cli,
    "list",
    "--json",
    "--cwd",
    directory,
  ]);
  const listResult = parseJson<ListOutput>(listed.stdout);
  assert.equal(listResult.caches.length, 1);
  assert.equal(listResult.caches[0]?.path, ".next/cache");

  const preview = await execFileAsync(process.execPath, [
    cli,
    "--dry-run",
    "--json",
    "--cwd",
    directory,
  ]);
  const previewResult = parseJson<PlanOutput>(preview.stdout);
  assert.equal(previewResult.dryRun, true);
  assert.equal(previewResult.remove.length, 1);
  await access(cache);

  const cleaned = await execFileAsync(process.execPath, [
    cli,
    "clean",
    "--safe",
    "--yes",
    "--json",
    "--cwd",
    directory,
  ]);
  const cleanupResult = parseJson<CleanupOutput>(cleaned.stdout);
  assert.equal(cleanupResult.removed.length, 1);
  await assert.rejects(access(cache));

  const version = await execFileAsync(process.execPath, [cli, "--version"]);
  assert.equal(version.stdout.trim(), `nukecache ${packageVersion}`);

  await assert.rejects(
    execFileAsync(process.execPath, [cli, "--unknown"]),
    (error: unknown) =>
      isExecFailure(error) &&
      error.code === 1 &&
      error.stderr.includes("Unknown option"),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}

function parseJson<T>(source: string): T {
  return JSON.parse(source) as T;
}

async function readPackageVersion(): Promise<string> {
  const packageJson: unknown = JSON.parse(
    await readFile(join(process.cwd(), "package.json"), "utf8"),
  );
  if (
    typeof packageJson !== "object" ||
    packageJson === null ||
    !("version" in packageJson) ||
    typeof packageJson.version !== "string"
  ) {
    throw new TypeError("package.json must contain a string version");
  }
  return packageJson.version;
}

function isExecFailure(error: unknown): error is ExecFailure {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "number" &&
    "stderr" in error &&
    typeof error.stderr === "string"
  );
}
