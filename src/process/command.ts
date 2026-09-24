import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CommandOptions {
  cwd: string;
  timeout?: number;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: CommandOptions,
) => Promise<string>;

export const runCommand: CommandRunner = async (command, args, options) => {
  const { stdout } = await execFileAsync(
    resolveExecutable(command),
    [...args],
    {
      cwd: options.cwd,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: options.timeout ?? 15_000,
      windowsHide: true,
    },
  );
  return stdout;
};

export function resolveExecutable(command: string): string {
  if (process.platform !== "win32") return command;
  return command === "bun" ? `${command}.exe` : `${command}.cmd`;
}
