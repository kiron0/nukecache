import { execFile } from "node:child_process";
import { relative } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function isTrackedByGit(
  root: string,
  path: string,
): Promise<boolean> {
  const projectPath = relative(root, path);
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", root, "ls-files", "--cached", "--", projectPath],
      { encoding: "utf8", windowsHide: true },
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}
