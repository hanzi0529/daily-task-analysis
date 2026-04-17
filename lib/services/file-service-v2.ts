import path from "path";
import { promises as fs } from "fs";

import { localSourceOptions, storagePaths } from "@/config/app";
import { importBufferAndAnalyze, getLatestDatasetAnalysis } from "@/lib/services/dataset-analysis-service";
import { repositories } from "@/lib/storage/repositories";

export async function processUploadedExcelV2(file: File) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const asset = await repositories.files.saveUploadedFile({
    buffer,
    fileName: file.name,
    sourceType: "upload",
    mimeType: file.type || undefined
  });

  return importBufferAndAnalyze({
    file: asset,
    buffer,
    importMode: "upload"
  });
}

export async function importLatestLocalExcelV2() {
  const latest = await findLatestExcelCandidate();
  const asset = await repositories.files.saveCopiedFile({
    sourcePath: latest.filePath,
    fileName: latest.name,
    sourceType: "local-directory",
    extra: {
      sourceDirectory: latest.sourceDirectory
    }
  });

  const buffer = await fs.readFile(asset.storedFilePath);
  return importBufferAndAnalyze({
    file: asset,
    buffer,
    importMode: "local-directory"
  });
}

export async function getLatestDatasetSnapshotV2() {
  return getLatestDatasetAnalysis();
}

async function findLatestExcelCandidate() {
  const candidateDirectories = [localSourceOptions.directoryPath];
  const candidates: Array<{
    name: string;
    filePath: string;
    sourceDirectory: string;
    mtimeMs: number;
  }> = [];

  for (const directory of candidateDirectories) {
    await fs.mkdir(directory, { recursive: true });
    const entries = await fs.readdir(directory);

    for (const name of entries) {
      if (!localSourceOptions.extensions.some((extension) => name.endsWith(extension))) {
        continue;
      }

      const filePath = path.join(directory, name);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        continue;
      }

      candidates.push({
        name,
        filePath,
        sourceDirectory: directory,
        mtimeMs: stat.mtimeMs
      });
    }
  }

  const latest = candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)[0];
  if (!latest) {
    throw new Error(
      `未在 ${localSourceOptions.directoryPath} 或 ${storagePaths.uploadsDir} 找到 Excel 文件`
    );
  }

  return latest;
}
