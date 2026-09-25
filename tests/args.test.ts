import { describe, expect, it } from "vitest";

import { parseCliArgs } from "../src/cli/args";

describe("parseCliArgs", () => {
  it("uses interactive clean defaults", () => {
    expect(parseCliArgs([])).toEqual({
      all: false,
      checkUpdate: false,
      command: "clean",
      dryRun: false,
      force: false,
      global: false,
      help: false,
      ignore: [],
      json: false,
      noUpdateCheck: false,
      project: false,
      safe: false,
      version: false,
      yes: false,
    });
  });

  it("parses check-update argument and command", () => {
    expect(parseCliArgs(["--check-update"])).toMatchObject({
      checkUpdate: true,
      command: "check-update",
    });
    expect(parseCliArgs(["check-update"])).toMatchObject({
      checkUpdate: true,
      command: "check-update",
    });
    expect(parseCliArgs(["check-update", "--json"])).toMatchObject({
      checkUpdate: true,
      command: "check-update",
      json: true,
    });
  });

  it("parses package-manager and global cleanup options", () => {
    expect(parseCliArgs(["pnpm", "--force", "--yes"])).toMatchObject({
      command: "clean",
      manager: "pnpm",
      global: true,
      force: true,
      yes: true,
    });
    expect(parseCliArgs(["list", "--global"])).toMatchObject({
      command: "list",
      global: true,
    });
  });

  it("parses list and shared options", () => {
    expect(
      parseCliArgs(["list", "--json", "--cwd", "/tmp/app", "--ignore", "vite"]),
    ).toMatchObject({
      command: "list",
      json: true,
      cwd: "/tmp/app",
      ignore: ["vite"],
    });
  });

  it("parses inspection commands", () => {
    expect(parseCliArgs(["largest", "--limit", "5"])).toMatchObject({
      command: "largest",
      limit: 5,
    });
    expect(parseCliArgs(["old", "--days", "14"])).toMatchObject({
      command: "old",
      days: 14,
    });
    expect(parseCliArgs(["explain", "vite"])).toMatchObject({
      command: "explain",
      explainTarget: "vite",
    });
    expect(parseCliArgs(["explain", "bun"])).toMatchObject({
      manager: "bun",
      global: true,
    });
  });

  it("parses safe non-interactive cleanup", () => {
    expect(parseCliArgs(["clean", "--safe", "--yes"])).toMatchObject({
      command: "clean",
      safe: true,
      yes: true,
    });
  });

  it("rejects unsafe or ambiguous combinations", () => {
    expect(() => parseCliArgs(["clean", "--yes"])).toThrow(
      "--yes requires --safe",
    );
    expect(() => parseCliArgs(["list", "--dry-run"])).toThrow(
      "list does not accept",
    );
    expect(() => parseCliArgs(["npm", "--project"])).toThrow(
      "cannot be combined",
    );
    expect(() => parseCliArgs(["--global", "--yes", "--safe"])).toThrow(
      "requires --force",
    );
    expect(() => parseCliArgs(["--wat"])).toThrow("Unknown option");
    expect(() => parseCliArgs(["--cwd"])).toThrow("Missing value");
    expect(() => parseCliArgs(["explain"])).toThrow("requires a cache");
    expect(() => parseCliArgs(["old", "--days", "0"])).toThrow(
      "positive integer",
    );
    expect(() => parseCliArgs(["list", "--limit", "5"])).toThrow(
      "requires the largest",
    );
    expect(() => parseCliArgs(["config", "unknown-action"])).toThrow(
      "config action",
    );
    expect(() => parseCliArgs(["config", "set"])).toThrow(
      "config set requires a key and value",
    );
    expect(() => parseCliArgs(["config", "unset"])).toThrow(
      "config unset requires a key",
    );
    expect(() =>
      parseCliArgs(["config", "set", "key", "val", "unexpected"]),
    ).toThrow("Unexpected config argument");
    expect(() => parseCliArgs(["clean", "--all", "--global"])).toThrow(
      "--all excludes global caches",
    );
    expect(() => parseCliArgs(["clean", "--json"])).toThrow(
      "clean --json requires --safe --yes or --dry-run",
    );
    expect(() => parseCliArgs(["clean", "--cwd"])).toThrow(
      "Missing value for --cwd",
    );
    expect(() => parseCliArgs(["clean", "--limit", "0"])).toThrow(
      "--limit requires a positive integer",
    );
    expect(() => parseCliArgs(["clean", "--days", "abc"])).toThrow(
      "--days requires a positive integer",
    );
    expect(() => parseCliArgs(["explain", "a", "b"])).toThrow(
      "Unexpected target: b",
    );
    expect(() => parseCliArgs(["clean", "clean"])).toThrow(
      "Unexpected command: clean",
    );
    expect(() => parseCliArgs(["npm", "pnpm"])).toThrow(
      "Unexpected package manager: pnpm",
    );
  });
});
