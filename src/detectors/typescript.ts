import type { CacheDetector } from "../types";
import { candidate, findFiles, slug } from "./helpers";

export const typescriptDetector: CacheDetector = {
  id: "typescript",
  name: "TypeScript",
  async detect(context) {
    const paths = await findFiles(context.root, (name) =>
      name.endsWith(".tsbuildinfo"),
    );
    return paths.map((path) =>
      candidate(
        `typescript-${slug(path)}`,
        "TypeScript incremental cache",
        path,
        "typescript",
        "Incremental compiler state written by TypeScript.",
        ["Next TypeScript build performs a full compilation."],
      ),
    );
  },
};
