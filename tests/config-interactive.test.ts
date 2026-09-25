import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prompts = vi.hoisted(() => {
  const cancelSymbol = Symbol("cancel");
  const selectValues: unknown[] = [];
  const textValues: string[] = [];
  const confirmValues: boolean[] = [];
  return {
    cancelSymbol,
    selectValues,
    textValues,
    confirmValues,
    cancel: vi.fn(),
    confirm: vi.fn(() => Promise.resolve(confirmValues.shift() ?? true)),
    intro: vi.fn(),
    isCancel: (value: unknown) => value === cancelSymbol,
    log: { error: vi.fn(), info: vi.fn(), step: vi.fn(), success: vi.fn() },
    note: vi.fn(),
    outro: vi.fn(),
    select: vi.fn(() => Promise.resolve(selectValues.shift() ?? cancelSymbol)),
    text: vi.fn((options: { validate?: (value?: string) => unknown }) => {
      const value = textValues.shift() ?? "";
      options.validate?.(value);
      return Promise.resolve(value);
    }),
  };
});

vi.mock("@clack/prompts", () => prompts);

import {
  resolveConfigCollision,
  runInteractiveConfig,
  validateCustomInput,
  validateDaysInput,
  validateInteractiveInput,
  validateLimitInput,
  validatePackageManagersInput,
  validatePathsInput,
} from "../src/cli/config";
import { loadConfig } from "../src/project/config";

const temporaryDirectories: string[] = [];

beforeEach(() => {
  prompts.selectValues.length = 0;
  prompts.textValues.length = 0;
  prompts.confirmValues.length = 0;
  vi.clearAllMocks();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("interactive config", () => {
  it("uses Clack prompts to update every config type and restore defaults", async () => {
    const root = await project();
    prompts.selectValues.push(
      "update",
      "defaultScope",
      "project",
      "update",
      "showGlobal",
      "true",
      "update",
      "ignore",
      "update",
      "include",
      "update",
      "custom",
      "unset",
      "showGlobal",
      "done",
    );
    prompts.textValues.push(
      "vite, turbo",
      ".generated-cache",
      '[{"name":"Compiler","paths":[".compiler-cache"]}]',
    );
    prompts.confirmValues.push(true, true, true, true, true, true);

    await runInteractiveConfig(root);

    const config = await loadConfig(root);
    expect(config).toMatchObject({
      defaultScope: "project",
      ignore: ["vite", "turbo"],
      include: [".generated-cache"],
    });
    expect(config.showGlobal).toBeUndefined();
    expect(config.custom?.[0]?.name).toBe("Compiler");
    expect(prompts.intro).toHaveBeenCalledWith("nukecache config");
    expect(prompts.note).toHaveBeenCalled();
    expect(prompts.log.success).toHaveBeenCalledTimes(6);
    expect(prompts.outro).toHaveBeenCalledWith("Configuration saved.");
  });

  it("handles prompt cancellation without writing configuration", async () => {
    const root = await project();
    prompts.selectValues.push(prompts.cancelSymbol);

    await runInteractiveConfig(root);

    expect(await loadConfig(root)).toEqual({});
    expect(prompts.cancel).toHaveBeenCalledWith("Configuration unchanged.");
  });

  it("interactively removes selected duplicate config file", async () => {
    const root = await project();
    const nukecacheFile = join(root, "nukecache.config.json");
    const nkcFile = join(root, "nkc.config.json");
    await writeFile(nukecacheFile, "{}");
    await writeFile(nkcFile, "{}");

    // Select nkcFile to remove, confirm deletion
    prompts.selectValues.push(nkcFile);
    prompts.confirmValues.push(true);

    await resolveConfigCollision(root, true);

    expect(prompts.log.error).toHaveBeenCalled();
    expect(prompts.log.step).toHaveBeenCalledWith("Removed nkc.config.json.");
    expect(prompts.log.success).toHaveBeenCalledWith(
      "Configuration conflict resolved. Active file: nukecache.config.json",
    );
    expect(await loadConfig(root)).toEqual({});
  });

  it("aborts when user cancels duplicate file selection", async () => {
    const root = await project();
    await writeFile(join(root, "nukecache.config.json"), "{}");
    await writeFile(join(root, "nkc.config.json"), "{}");

    prompts.selectValues.push(prompts.cancelSymbol);
    await expect(resolveConfigCollision(root, true)).rejects.toThrow(
      "Aborted config resolution.",
    );
    expect(prompts.cancel).toHaveBeenCalledWith(
      "Aborted. Multiple configuration files still exist.",
    );
  });

  it("aborts when user declines confirmation to delete duplicate file", async () => {
    const root = await project();
    const nkcFile = join(root, "nkc.config.json");
    await writeFile(join(root, "nukecache.config.json"), "{}");
    await writeFile(nkcFile, "{}");

    prompts.selectValues.push(nkcFile);
    prompts.confirmValues.push(false);
    await expect(resolveConfigCollision(root, true)).rejects.toThrow(
      "Aborted config resolution.",
    );
    expect(prompts.cancel).toHaveBeenCalledWith(
      "Aborted. File was not removed.",
    );
  });

  describe("real-time interactive input validation", () => {
    it("validates days in real time", () => {
      expect(validateDaysInput("30")).toBeUndefined();
      expect(validateDaysInput("1")).toBeUndefined();
      expect(validateDaysInput("0")).toBe("Enter a positive integer.");
      expect(validateDaysInput("-5")).toBe("Enter a positive integer.");
      expect(validateDaysInput("abc")).toBe("Enter a positive integer.");
      expect(validateDaysInput("")).toBe("Enter a positive integer.");
      expect(validateDaysInput("1.5")).toBe("Enter a positive integer.");
    });

    it("validates limit in real time", () => {
      expect(validateLimitInput("10")).toBeUndefined();
      expect(validateLimitInput("1")).toBeUndefined();
      expect(validateLimitInput("0")).toBe("Enter a positive integer.");
      expect(validateLimitInput("NaN")).toBe("Enter a positive integer.");
      expect(validateLimitInput("")).toBe("Enter a positive integer.");
    });

    it("validates package managers in real time", () => {
      expect(validatePackageManagersInput("npm, pnpm")).toBeUndefined();
      expect(validatePackageManagersInput("yarn")).toBeUndefined();
      expect(validatePackageManagersInput("bun")).toBeUndefined();
      expect(validatePackageManagersInput("")).toBeUndefined();
      expect(validatePackageManagersInput("npm, , pnpm")).toBe(
        "Package managers must not contain empty items.",
      );
      expect(validatePackageManagersInput("cargo")).toBe(
        'Invalid package manager "cargo". Allowed: npm, pnpm, yarn, bun.',
      );
    });

    it("validates paths in real time", () => {
      expect(validatePathsInput("vite, turbo")).toBeUndefined();
      expect(validatePathsInput("")).toBeUndefined();
      expect(validatePathsInput("vite, , turbo")).toBe(
        "Entries must not contain empty items.",
      );
    });

    it("validates custom cache definitions in real time", () => {
      expect(
        validateCustomInput('[{"name":"Comp","paths":[".cache"]}]'),
      ).toBeUndefined();
      expect(validateCustomInput("")).toBe(
        "Custom definitions must be a JSON array.",
      );
      expect(validateCustomInput("not-json")).toBe("Enter valid JSON.");
      expect(validateCustomInput('{"not":"array"}')).toBe(
        "Custom definitions must be a JSON array.",
      );
      expect(validateCustomInput("[{}]")).toBe(
        "custom[0].name must be a non-empty string",
      );
      expect(validateCustomInput('[{"name":"test","paths":[]}]')).toBe(
        "custom[0].paths must be an array of strings",
      );
      expect(
        validateCustomInput('[{"name":"test","paths":["a"],"safety":"bad"}]'),
      ).toBe("custom[0].safety is invalid");
    });

    it("routes validation by key using validateInteractiveInput", () => {
      expect(validateInteractiveInput("days", "14")).toBeUndefined();
      expect(validateInteractiveInput("days", "-1")).toBe(
        "Enter a positive integer.",
      );
      expect(validateInteractiveInput("limit", "5")).toBeUndefined();
      expect(
        validateInteractiveInput("packageManagers", "npm"),
      ).toBeUndefined();
      expect(validateInteractiveInput("ignore", "vite")).toBeUndefined();
      expect(validateInteractiveInput("include", "dist")).toBeUndefined();
      expect(
        validateInteractiveInput("custom", '[{"name":"X","paths":["a"]}]'),
      ).toBeUndefined();
      expect(
        validateInteractiveInput("defaultScope", "project"),
      ).toBeUndefined();
    });
  });
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "nukecache-config-interactive-"));
  temporaryDirectories.push(root);
  return root;
}
