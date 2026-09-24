import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, parse, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function isTrackedByGit(
  root: string,
  path: string,
): Promise<boolean> {
  if (!(await hasGitBoundary(root))) return false;
  const projectPath = relative(root, path);
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", root, "ls-files", "--cached", "--", projectPath],
      { encoding: "utf8", windowsHide: true },
    );
    return stdout.trim().length > 0;
  } catch (error) {
    throw new Error(`Git tracking check failed for ${projectPath}`, {
      cause: error,
    });
  }
}

async function hasGitBoundary(start: string): Promise<boolean> {
  let current = resolve(start);
  const filesystemRoot = parse(current).root;
  while (true) {
    try {
      await access(resolve(current, ".git"));
      return true;
    } catch {
      if (current === filesystemRoot) return false;
      current = dirname(current);
    }
  }
}
