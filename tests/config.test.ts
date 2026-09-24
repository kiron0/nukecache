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
      JSON.stringify({ custom: [{ name: "Tool", paths: [], safety: "nope" }] }),
    );
    await expect(loadConfig(root)).rejects.toThrow("safety is invalid");

    await writeFile(path, JSON.stringify({ ignore: "vite" }));
    await expect(loadConfig(root)).rejects.toThrow(
      "ignore must be an array of strings",
    );
  });
});
