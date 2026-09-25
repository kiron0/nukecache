import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseCliArgs } from "../src/cli/args";
import { formatConfig, runConfigCommand } from "../src/cli/config";
import { loadConfig } from "../src/project/config";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("config command", () => {
  it("shows effective defaults without creating a file", async () => {
    const root = await project();
    const result = await runConfigCommand(root, parseCliArgs(["config"]));

    expect(result).toMatchObject({
      exists: false,
      config: {
        defaultScope: "project",
        showGlobal: false,
        ignore: [],
        include: [],
        custom: [],
      },
    });
    expect(formatConfig(result)).toContain("Status        defaults");
    expect(formatConfig(result)).toContain("Update options");
  });

  it("sets and persists boolean values", async () => {
    const root = await project();
    const result = await runConfigCommand(
      root,
      parseCliArgs(["config", "set", "showGlobal", "true"]),
    );

    expect(result.changed).toEqual({ action: "set", key: "showGlobal" });
    expect(result.config.showGlobal).toBe(true);
    expect((await loadConfig(root)).showGlobal).toBe(true);
    expect(await readFile(result.path, "utf8")).toContain('"showGlobal": true');
  });

  it("sets JSON array values", async () => {
    const root = await project();
    const result = await runConfigCommand(
      root,
      parseCliArgs(["config", "set", "ignore", '["vite","turbo"]']),
    );
    expect(result.config.ignore).toEqual(["vite", "turbo"]);
  });

  it("sets custom definitions", async () => {
    const root = await project();
    const custom = JSON.stringify([
      { name: "Internal compiler", paths: [".internal-cache"] },
    ]);
    const result = await runConfigCommand(
      root,
      parseCliArgs(["config", "set", "custom", custom]),
    );
    expect(result.config.custom[0]?.name).toBe("Internal compiler");
    expect(formatConfig(result)).toContain(".internal-cache");
  });

  it("unsets configured values", async () => {
    const root = await project();
    await runConfigCommand(
      root,
      parseCliArgs(["config", "set", "showGlobal", "true"]),
    );
    const result = await runConfigCommand(
      root,
      parseCliArgs(["config", "unset", "showGlobal"]),
    );
    expect(result.changed).toEqual({ action: "unset", key: "showGlobal" });
    expect(result.config.showGlobal).toBe(false);
    expect((await loadConfig(root)).showGlobal).toBeUndefined();
  });

  it.each([
    [["config", "set", "showGlobal", "yes"], "true or false"],
    [
      ["config", "set", "defaultScope", "invalid"],
      "must be project, global, or all",
    ],
    [["config", "set", "ignore", "vite"], "valid JSON"],
    [["config", "set", "unknown", "true"], "Unknown config key"],
  ] as Array<[string[], string]>)(
    "rejects invalid update %j",
    async (argv, error) => {
      const root = await project();
      await expect(runConfigCommand(root, parseCliArgs(argv))).rejects.toThrow(
        error,
      );
    },
  );

  it("loads and persists to nkc.config.json if present", async () => {
    const root = await project();
    const nkcPath = join(root, "nkc.config.json");
    await writeFile(nkcPath, JSON.stringify({ showGlobal: true }));

    const loaded = await loadConfig(root);
    expect(loaded.showGlobal).toBe(true);

    const result = await runConfigCommand(
      root,
      parseCliArgs(["config", "set", "dryRun", "true"]),
    );
    expect(result.path).toBe(nkcPath);
    expect(await readFile(nkcPath, "utf8")).toContain('"dryRun": true');
  });

  it("sets and unsets all new config options", async () => {
    const root = await project();
    await runConfigCommand(
      root,
      parseCliArgs(["config", "set", "defaultScope", "all"]),
    );
    await runConfigCommand(
      root,
      parseCliArgs(["config", "set", "dryRun", "true"]),
    );
    await runConfigCommand(
      root,
      parseCliArgs(["config", "set", "safe", "true"]),
    );
    await runConfigCommand(root, parseCliArgs(["config", "set", "days", "45"]));
    await runConfigCommand(
      root,
      parseCliArgs(["config", "set", "limit", "20"]),
    );
    await runConfigCommand(
      root,
      parseCliArgs(["config", "set", "force", "true"]),
    );
    await runConfigCommand(
      root,
      parseCliArgs(["config", "set", "json", "true"]),
    );
    await runConfigCommand(
      root,
      parseCliArgs(["config", "set", "packageManagers", '["pnpm","bun"]']),
    );
    await runConfigCommand(
      root,
      parseCliArgs(["config", "set", "noUpdateCheck", "true"]),
    );

    const config = await loadConfig(root);
    expect(config.defaultScope).toBe("all");
    expect(config.dryRun).toBe(true);
    expect(config.safe).toBe(true);
    expect(config.force).toBe(true);
    expect(config.json).toBe(true);
    expect(config.packageManagers).toEqual(["pnpm", "bun"]);
    expect(config.days).toBe(45);
    expect(config.limit).toBe(20);
    expect(config.noUpdateCheck).toBe(true);
  });
});

describe("nearby command errors", () => {
  it.each([
    [["confg"], "nukecache config"],
    [["--jsoon"], "nukecache --json"],
    [["config", "ste"], "nukecache config set"],
    [["lis"], "nukecache list"],
  ] as Array<[string[], string]>)(
    "suggests a command for %j",
    (argv, suggestion) => {
      expect(() => parseCliArgs(argv)).toThrow(suggestion);
    },
  );
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "nukecache-config-cli-"));
  temporaryDirectories.push(root);
  return root;
}
