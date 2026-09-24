import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), "nukecache-cli-e2e-"));
const cli = join(process.cwd(), "dist", "cli.js");

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
  const listResult = JSON.parse(listed.stdout);
  assert.equal(listResult.caches.length, 1);
  assert.equal(listResult.caches[0].path, ".next/cache");

  const preview = await execFileAsync(process.execPath, [
    cli,
    "--dry-run",
    "--json",
    "--cwd",
    directory,
  ]);
  const previewResult = JSON.parse(preview.stdout);
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
  const cleanupResult = JSON.parse(cleaned.stdout);
  assert.equal(cleanupResult.removed.length, 1);
  await assert.rejects(access(cache));

  const version = await execFileAsync(process.execPath, [cli, "--version"]);
  assert.match(version.stdout, /^nukecache 0\.1\.0/);

  await assert.rejects(
    execFileAsync(process.execPath, [cli, "--unknown"]),
    (error) => error.code === 1 && error.stderr.includes("Unknown option"),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
