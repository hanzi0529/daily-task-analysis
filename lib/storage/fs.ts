import { promises as fs } from "fs";
import path from "path";

import { storagePaths } from "@/config/app";

export async function ensureDataDirectories() {
  await Promise.all(
    [
      storagePaths.uploadsDir,
      storagePaths.parsedDir,
      storagePaths.cacheDir
    ].map((dir) => fs.mkdir(dir, { recursive: true }))
  );
}

// Atomic write: write to a sibling .tmp file, then rename over the target.
// On the same filesystem partition, rename(2) is atomic — readers always see
// either the old complete file or the new complete file, never partial data.
// This prevents the "Unterminated string in JSON" / "Unexpected end of JSON"
// errors that occur when a concurrent read catches a file mid-write.
export async function writeJsonFile(filePath: string, data: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

// Throws on read or parse error — use when the caller already handles errors.
export async function readJsonFile<T>(filePath: string) {
  const buffer = await fs.readFile(filePath, "utf8");
  return JSON.parse(buffer) as T;
}

// Returns null on any error (ENOENT, parse failure, etc.).
// Use for resilient reads where a missing or corrupt file should be treated
// as "not available" rather than a fatal error.
export async function tryReadJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const buffer = await fs.readFile(filePath, "utf8");
    return JSON.parse(buffer) as T;
  } catch {
    return null;
  }
}

export async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listFilesSorted(dirPath: string) {
  const names = await fs.readdir(dirPath);
  const withStats = await Promise.all(
    names.map(async (name) => {
      const filePath = path.join(dirPath, name);
      const stat = await fs.stat(filePath);
      return { name, filePath, stat };
    })
  );

  return withStats
    .filter((entry) => entry.stat.isFile())
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
}
