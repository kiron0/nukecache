import { lstat, rm } from "node:fs/promises";

import { assertSafeProjectTarget } from "./safety";

export async function removeProjectTarget(
  root: string,
  path: string,
): Promise<void> {
  await assertSafeProjectTarget(root, path);
  await rm(path, {
    recursive: true,
    force: false,
    maxRetries: 3,
    retryDelay: 100,
  });

  try {
    await lstat(path);
    throw new Error(
      `Cleanup verification failed; target still exists: ${path}`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
