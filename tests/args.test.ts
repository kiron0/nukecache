import { describe, expect, it } from "vitest";

import { parseCliArgs } from "../src/cli/args";

describe("parseCliArgs", () => {
  it("uses interactive clean defaults", () => {
    expect(parseCliArgs([])).toEqual({
      all: false,
      command: "clean",
      dryRun: false,
      force: false,
      global: false,
      help: false,
      ignore: [],
      json: false,
      project: false,
      safe: false,
      version: false,
      yes: false,
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
  });
});
