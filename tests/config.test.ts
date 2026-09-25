import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getCustomDefinitions, loadConfig } from "../src/project/config";

describe("config", () => {
  it("returns an empty config when no file exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "nukecache-config-empty-"));
    expect(await loadConfig(root)).toEqual({});
    expect(getCustomDefinitions({})).toEqual([]);
  });

  it("validates malformed and invalid config", async () => {
    const root = await mkdtemp(join(tmpdir(), "nukecache-config-bad-"));
    const path = join(root, "nukecache.config.json");

    await writeFile(path, "{");
    await expect(loadConfig(root)).rejects.toThrow(
      "Invalid nukecache.config.json",
    );

    await writeFile(path, "[]");
    await expect(loadConfig(root)).rejects.toThrow(
      "must contain a JSON object",
    );

    await writeFile(
      path,
      JSON.stringify({ custom: [{ name: "", paths: [] }] }),
    );
    await expect(loadConfig(root)).rejects.toThrow(
      "name must be a non-empty string",
    );

    await writeFile(
      path,
      JSON.stringify({
        custom: [{ name: "Tool", paths: [".cache"], safety: "nope" }],
      }),
    );
    await expect(loadConfig(root)).rejects.toThrow("safety is invalid");

    await writeFile(path, JSON.stringify({ ignore: "vite" }));
    await expect(loadConfig(root)).rejects.toThrow(
      "ignore must be an array of strings",
    );

    await writeFile(
      path,
      JSON.stringify({ custom: [{ id: " ", name: "Tool", paths: [".x"] }] }),
    );
    await expect(loadConfig(root)).rejects.toThrow("id must not be empty");

    await writeFile(
      path,
      JSON.stringify({ custom: [{ name: "Tool", paths: [] }] }),
    );
    await expect(loadConfig(root)).rejects.toThrow(
      "paths must be an array of strings",
    );

    await writeFile(path, JSON.stringify({ include: [" "] }));
    await expect(loadConfig(root)).rejects.toThrow(
      "include must be an array of strings",
    );

    await writeFile(path, JSON.stringify({ force: "not-a-bool" }));
    await expect(loadConfig(root)).rejects.toThrow(
      "config.force must be a boolean",
    );

    await writeFile(path, JSON.stringify({ json: "not-a-bool" }));
    await expect(loadConfig(root)).rejects.toThrow(
      "config.json must be a boolean",
    );

    await writeFile(path, JSON.stringify({ packageManagers: ["invalid-pm"] }));
    await expect(loadConfig(root)).rejects.toThrow(
      "config.packageManagers must be an array of npm, pnpm, yarn, or bun",
    );

    await writeFile(path, JSON.stringify({ unknownField: "fail" }));
    await expect(loadConfig(root)).rejects.toThrow(
      'Unexpected config property: "unknownField"',
    );

    await writeFile(path, JSON.stringify({ $schema: 123 }));
    await expect(loadConfig(root)).rejects.toThrow(
      "config.$schema must be a string",
    );

    await writeFile(path, JSON.stringify({ defaultScope: "invalid" }));
    await expect(loadConfig(root)).rejects.toThrow(
      "config.defaultScope must be project, global, or all",
    );

    await writeFile(path, JSON.stringify({ showGlobal: "no" }));
    await expect(loadConfig(root)).rejects.toThrow(
      "config.showGlobal must be a boolean",
    );

    await writeFile(path, JSON.stringify({ dryRun: 1 }));
    await expect(loadConfig(root)).rejects.toThrow(
      "config.dryRun must be a boolean",
    );

    await writeFile(path, JSON.stringify({ safe: 0 }));
    await expect(loadConfig(root)).rejects.toThrow(
      "config.safe must be a boolean",
    );

    await writeFile(path, JSON.stringify({ noUpdateCheck: "false" }));
    await expect(loadConfig(root)).rejects.toThrow(
      "config.noUpdateCheck must be a boolean",
    );

    await writeFile(path, JSON.stringify({ days: -1 }));
    await expect(loadConfig(root)).rejects.toThrow(
      "config.days must be a positive integer",
    );

    await writeFile(path, JSON.stringify({ days: 1.5 }));
    await expect(loadConfig(root)).rejects.toThrow(
      "config.days must be a positive integer",
    );

    await writeFile(path, JSON.stringify({ limit: 0 }));
    await expect(loadConfig(root)).rejects.toThrow(
      "config.limit must be a positive integer",
    );

    await writeFile(path, JSON.stringify({ custom: "not-an-array" }));
    await expect(loadConfig(root)).rejects.toThrow(
      "config.custom must be an array",
    );

    await writeFile(path, JSON.stringify({ custom: [null] }));
    await expect(loadConfig(root)).rejects.toThrow(
      "config.custom[0] must be an object",
    );

    await writeFile(
      path,
      JSON.stringify({ custom: [{ name: "Tool", paths: [".x"], id: 42 }] }),
    );
    await expect(loadConfig(root)).rejects.toThrow(
      "config.custom[0].id must be a string",
    );

    await writeFile(
      path,
      JSON.stringify({
        custom: [{ name: "Tool", paths: [".x"], description: 123 }],
      }),
    );
    await expect(loadConfig(root)).rejects.toThrow(
      "config.custom[0].description must be a string",
    );

    await writeFile(
      path,
      JSON.stringify({
        custom: [{ name: "Tool", paths: [".x"], consequences: "bad" }],
      }),
    );
    await expect(loadConfig(root)).rejects.toThrow(
      "config.custom[0].consequences must be an array of strings",
    );

    await writeFile(
      path,
      JSON.stringify({ $schema: "https://nukecache.js.org/schema.json" }),
    );
    expect(await loadConfig(root)).toMatchObject({
      $schema: "https://nukecache.js.org/schema.json",
    });
  });

  it("throws when multiple config files exist in the same project", async () => {
    const root = await mkdtemp(join(tmpdir(), "nukecache-config-multi-"));
    await writeFile(join(root, "nukecache.config.json"), "{}");
    await writeFile(join(root, "nkc.config.json"), "{}");

    await expect(loadConfig(root)).rejects.toThrow(
      "Multiple configuration files found: nukecache.config.json, nkc.config.json",
    );
  });
});
