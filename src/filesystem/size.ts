import { lstat, opendir } from "node:fs/promises";
import { join } from "node:path";

export async function calculateSize(path: string): Promise<number> {
  const details = await lstat(path);
  if (!details.isDirectory() || details.isSymbolicLink()) return details.size;

  let total = details.size;
  let directory;
  try {
    directory = await opendir(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }

  for await (const entry of directory) {
    const entryPath = join(path, entry.name);
    let entryDetails;
    try {
      entryDetails = await lstat(entryPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }

    if (entryDetails.isSymbolicLink()) {
      total += entryDetails.size;
    } else if (entryDetails.isDirectory()) {
      try {
        total += await calculateSize(entryPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    } else {
      total += entryDetails.size;
    }
  }

  return total;
}
