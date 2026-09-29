import { describe, expect, it } from "vitest";

import { parseCliArgs } from "../src/cli/args";

describe("sweep command", () => {
  it("parses sweep with directory", () => {
    expect(parseCliArgs(["sweep", "/home/user/Code"])).toMatchObject({
      command: "sweep",
      sweepDir: "/home/user/Code",
    });
  });

  it("parses sweep without directory (defaults to cwd)", () => {
    const result = parseCliArgs(["sweep"]);
    expect(result.command).toBe("sweep");
    expect(result.sweepDir).toBeUndefined();
  });

  it("parses sweep with --days", () => {
    expect(parseCliArgs(["sweep", "/home/user/Code", "--days", "30"])).toMatchObject({
      command: "sweep",
      sweepDir: "/home/user/Code",
      days: 30,
    });
  });

  it("parses sweep with --min-age", () => {
    expect(parseCliArgs(["sweep", "--min-age", "14"])).toMatchObject({
      command: "sweep",
      minAge: 14,
    });
  });

  it("parses sweep with --dry-run", () => {
    expect(parseCliArgs(["sweep", "/tmp", "--dry-run"])).toMatchObject({
      command: "sweep",
      dryRun: true,
    });
  });

  it("parses sweep with --json", () => {
    expect(parseCliArgs(["sweep", "--json"])).toMatchObject({
      command: "sweep",
      json: true,
    });
  });

  it("rejects --min-age on non-sweep command", () => {
    expect(() => parseCliArgs(["list", "--min-age", "7"])).toThrow(
      "--min-age requires the sweep command",
    );
  });

  it("rejects duplicate sweep directory argument", () => {
    expect(() => parseCliArgs(["sweep", "/a", "/b"])).toThrow(
      "Unexpected argument",
    );
  });
});

describe("reclaim command", () => {
  it("parses reclaim with size", () => {
    expect(parseCliArgs(["reclaim", "5gb"])).toMatchObject({
      command: "reclaim",
      reclaimTarget: "5gb",
    });
  });

  it("parses reclaim with --dry-run", () => {
    expect(parseCliArgs(["reclaim", "500mb", "--dry-run"])).toMatchObject({
      command: "reclaim",
      reclaimTarget: "500mb",
      dryRun: true,
    });
  });

  it("parses reclaim with --yes --safe", () => {
    expect(
      parseCliArgs(["reclaim", "1gb", "--yes", "--safe"]),
    ).toMatchObject({
      command: "reclaim",
      reclaimTarget: "1gb",
      yes: true,
    });
  });

  it("rejects reclaim without size", () => {
    expect(() => parseCliArgs(["reclaim"])).toThrow(
      "reclaim requires a size argument",
    );
  });

  it("rejects duplicate reclaim target", () => {
    expect(() => parseCliArgs(["reclaim", "5gb", "10gb"])).toThrow(
      "Unexpected argument",
    );
  });

  it("rejects --days on reclaim", () => {
    expect(() => parseCliArgs(["reclaim", "5gb", "--days", "10"])).toThrow(
      "--days requires the old or sweep command",
    );
  });
});
