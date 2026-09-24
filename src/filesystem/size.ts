import { lstat, opendir } from "node:fs/promises";
import { join } from "node:path";

export async function calculateSize(path: string): Promise<number> {
  const details = await lstat(path);
  if (!details.isDirectory() || details.isSymbolicLink()) return details.size;

  let total = details.size;
  const directory = await opendir(path);

  for await (const entry of directory) {
    const entryPath = join(path, entry.name);
    const entryDetails = await lstat(entryPath);

    if (entryDetails.isSymbolicLink()) {
      total += entryDetails.size;
    } else if (entryDetails.isDirectory()) {
      total += await calculateSize(entryPath);
    } else {
      total += entryDetails.size;
    }
  }

  return total;
}
