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

export async function writeJsonFile(filePath: string, data: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function readJsonFile<T>(filePath: string) {
  const buffer = await fs.readFile(filePath, "utf8");
  return JSON.parse(buffer) as T;
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
