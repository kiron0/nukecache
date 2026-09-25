import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

import { mapWithConcurrency } from "./concurrency";

const FILESYSTEM_CONCURRENCY = 128;

export async function calculateSize(path: string): Promise<number> {
  const details = await lstat(path);
  if (!details.isDirectory() || details.isSymbolicLink()) return details.size;

  let total = details.size;
  let directories = [path];

  while (directories.length > 0) {
    const batches = await mapWithConcurrency(
      directories,
      FILESYSTEM_CONCURRENCY,
      async (directory) => {
        try {
          return (await readdir(directory)).map((name) =>
            join(directory, name),
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw error;
        }
      },
    );
    const paths = batches.flat();
    const nextDirectories: string[] = [];
    const sizes = await mapWithConcurrency(
      paths,
      FILESYSTEM_CONCURRENCY,
      async (entryPath) => {
        try {
          const entryDetails = await lstat(entryPath);
          if (entryDetails.isDirectory() && !entryDetails.isSymbolicLink()) {
            nextDirectories.push(entryPath);
          }
          return entryDetails.size;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
          throw error;
        }
      },
    );
    total += sizes.reduce((sum, size) => sum + size, 0);
    directories = nextDirectories;
  }

  return total;
}
