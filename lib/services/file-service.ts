// @ts-nocheck
import path from "path";
import { promises as fs } from "fs";

import { localSourceOptions } from "@/config/app";
import { parseExcelBuffer } from "@/lib/parser/excel-parser";
import { analyzeDataset, getLatestAnalysis } from "@/lib/services/analysis-service";
import { repositories } from "@/lib/storage/repositories";
import { createId } from "@/lib/utils";

export async function processUploadedExcel(file: File) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const asset = await repositories.files.saveUploadedFile({
    buffer,
    fileName: file.name,
    sourceType: "upload"
  });

  return processStoredBuffer({
    buffer,
    fileId: asset.id,
    fileName: asset.fileName
  });
}

export async function importLatestLocalExcel() {
  await fs.mkdir(localSourceOptions.directoryPath, { recursive: true });
  const entries = await fs.readdir(localSourceOptions.directoryPath);
  const candidates = entries
    .filter((name) =>
      localSourceOptions.extensions.some((extension) => name.endsWith(extension))
    )
    .map((name) => ({
      name,
      filePath: path.join(localSourceOptions.directoryPath, name)
    }));

  if (candidates.length === 0) {
    throw new Error(
      `固定目录中未找到 Excel 文件，请检查 ${localSourceOptions.directoryPath}`
    );
  }

  const stats = await Promise.all(
    candidates.map(async (candidate) => ({
      ...candidate,
      stat: await fs.stat(candidate.filePath)
    }))
  );
  const latest = stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
  const asset = await repositories.files.saveCopiedFile({
    sourcePath: latest.filePath,
    fileName: latest.name,
    sourceType: "local-directory"
  });

  const buffer = await fs.readFile(asset.filePath);
  return processStoredBuffer({
    buffer,
    fileId: asset.id,
    fileName: asset.fileName
  });
}

export async function getDashboardSnapshot() {
  return getLatestAnalysis();
}

async function processStoredBuffer(params: {
  buffer: Buffer;
  fileId: string;
  fileName: string;
}) {
  const datasetId = createId("dataset");
  const parsed = parseExcelBuffer({
    datasetId,
    fileId: params.fileId,
    buffer: params.buffer
  });

  await repositories.parsed.save(parsed);

  const analysis = await analyzeDataset({
    datasetId,
    fileId: params.fileId,
    records: parsed.rows
  });

  return {
    success: true,
    datasetId,
    fileId: params.fileId,
    fileName: params.fileName,
    parsed,
    analysis
  };
}
