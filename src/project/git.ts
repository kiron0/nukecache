import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function isTrackedByGit(
  root: string,
  path: string,
): Promise<boolean> {
  return (await findTrackedByGit(root, [path])).has(path);
}

export async function findTrackedByGit(
  root: string,
  paths: readonly string[],
): Promise<Set<string>> {
  const tracked = new Set<string>();
  if (paths.length === 0 || !(await hasGitBoundary(root))) return tracked;

  const projectPaths = paths.map((path) => relative(root, path));
  const gitPaths = projectPaths.map((path) => path.split(sep).join("/"));
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", root, "ls-files", "--cached", "-z", "--", ...gitPaths],
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      },
    );
    const files = stdout.split("\0").filter(Boolean);
    for (let index = 0; index < paths.length; index++) {
      const path = paths[index];
      const projectPath = projectPaths[index];
      const gitPath = gitPaths[index];
      if (!path || !projectPath || !gitPath || isAbsolute(projectPath))
        continue;
      if (
        files.some((file) => file === gitPath || file.startsWith(`${gitPath}/`))
      ) {
        tracked.add(path);
      }
    }
    return tracked;
  } catch (error) {
    throw new Error("Git tracking check failed", {
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
