import path from "path";
import { promises as fs } from "fs";

import { storagePaths } from "@/config/app";
import type {
  AnalysisDataset,
  ParsedDataset,
  UploadFileMeta,
  UploadSourceType
} from "@/types/domain";
import { createId } from "@/lib/utils";
import {
  ensureDataDirectories,
  fileExists,
  listFilesSorted,
  readJsonFile,
  writeJsonFile
} from "@/lib/storage/fs";

export interface FileRepository {
  saveUploadedFile(params: {
    buffer: Buffer;
    fileName: string;
    sourceType: UploadSourceType;
    mimeType?: string;
    extra?: Record<string, unknown>;
  }): Promise<UploadFileMeta>;
  saveCopiedFile(params: {
    sourcePath: string;
    fileName: string;
    sourceType: UploadSourceType;
    extra?: Record<string, unknown>;
  }): Promise<UploadFileMeta>;
  listUploads(): Promise<UploadFileMeta[]>;
  getLatestUpload(): Promise<UploadFileMeta | null>;
}

export interface ParsedRepository {
  save(parsed: ParsedDataset): Promise<void>;
  get(datasetId: string): Promise<ParsedDataset | null>;
}

export interface AnalysisRepository {
  save(result: AnalysisDataset): Promise<void>;
  get(datasetId: string): Promise<AnalysisDataset | null>;
  getLatest(): Promise<AnalysisDataset | null>;
}

const uploadsIndexPath = path.join(storagePaths.uploadsDir, "_index.json");

class LocalFileRepository implements FileRepository {
  async saveUploadedFile(params: {
    buffer: Buffer;
    fileName: string;
    sourceType: UploadSourceType;
    mimeType?: string;
    extra?: Record<string, unknown>;
  }) {
    await ensureDataDirectories();

    const fileId = createId("file");
    const normalizedName = `${fileId}_${params.fileName}`;
    const filePath = path.join(storagePaths.uploadsDir, normalizedName);

    await fs.writeFile(filePath, params.buffer);

    const asset: UploadFileMeta = {
      id: fileId,
      originalFileName: params.fileName,
      storedFileName: normalizedName,
      storedFilePath: filePath,
      sizeBytes: params.buffer.byteLength,
      mimeType: params.mimeType,
      sourceType: params.sourceType,
      importedAt: new Date().toISOString(),
      extra: params.extra ?? {}
    };

    await this.appendIndex(asset);
    return asset;
  }

  async saveCopiedFile(params: {
    sourcePath: string;
    fileName: string;
    sourceType: UploadSourceType;
    extra?: Record<string, unknown>;
  }) {
    const buffer = await fs.readFile(params.sourcePath);
    return this.saveUploadedFile({
      buffer,
      fileName: params.fileName,
      sourceType: params.sourceType,
      extra: {
        sourcePath: params.sourcePath,
        ...(params.extra ?? {})
      }
    });
  }

  async listUploads() {
    await ensureDataDirectories();

    if (!(await fileExists(uploadsIndexPath))) {
      return [];
    }

    return readJsonFile<UploadFileMeta[]>(uploadsIndexPath);
  }

  async getLatestUpload() {
    const uploads = await this.listUploads();
    return uploads[0] ?? null;
  }

  private async appendIndex(asset: UploadFileMeta) {
    const current = await this.listUploads();
    current.unshift(asset);
    await writeJsonFile(uploadsIndexPath, current);
  }
}

class LocalParsedRepository implements ParsedRepository {
  async save(parsed: ParsedDataset) {
    await ensureDataDirectories();
    const datasetId = getDatasetIdFromContainer(parsed);
    await writeJsonFile(
      path.join(storagePaths.parsedDir, `${datasetId}.json`),
      {
        ...parsed,
        datasetId,
        batchId: getBatchIdFromContainer(parsed)
      }
    );
  }

  async get(datasetId: string) {
    const filePath = path.join(storagePaths.parsedDir, `${datasetId}.json`);
    if (!(await fileExists(filePath))) {
      return null;
    }
    return hydrateDatasetIdentity(await readJsonFile<ParsedDataset>(filePath));
  }
}

class LocalAnalysisRepository implements AnalysisRepository {
  async save(result: AnalysisDataset) {
    await ensureDataDirectories();
    const datasetId = getDatasetIdFromContainer(result);
    await writeJsonFile(
      path.join(storagePaths.cacheDir, `${datasetId}.json`),
      {
        ...result,
        datasetId,
        batchId: getBatchIdFromContainer(result)
      }
    );
  }

  async get(datasetId: string) {
    const filePath = path.join(storagePaths.cacheDir, `${datasetId}.json`);
    if (!(await fileExists(filePath))) {
      return null;
    }

    return hydrateDatasetIdentity(await readJsonFile<AnalysisDataset>(filePath));
  }

  async getLatest() {
    await ensureDataDirectories();
    const files = await listFilesSorted(storagePaths.cacheDir);
    const latest = files.find((entry) => entry.name.endsWith(".json"));
    if (!latest) {
      return null;
    }

    return hydrateDatasetIdentity(await readJsonFile<AnalysisDataset>(latest.filePath));
  }
}

export const repositories = {
  files: new LocalFileRepository(),
  parsed: new LocalParsedRepository(),
  analysis: new LocalAnalysisRepository()
};

function getDatasetIdFromContainer(value: { datasetId?: string; batch?: { datasetId?: string } }) {
  const datasetId = value.datasetId ?? value.batch?.datasetId;
  if (!datasetId) {
    throw new Error("Dataset container is missing datasetId");
  }

  return datasetId;
}

function getBatchIdFromContainer(value: { batchId?: string; batch?: { batchId?: string } }) {
  const batchId = value.batchId ?? value.batch?.batchId;
  if (!batchId) {
    throw new Error("Dataset container is missing batchId");
  }

  return batchId;
}

function hydrateDatasetIdentity<T extends { datasetId?: string; batchId?: string; batch?: { datasetId?: string; batchId?: string } }>(
  value: T
) {
  return {
    ...value,
    datasetId: value.datasetId ?? value.batch?.datasetId,
    batchId: value.batchId ?? value.batch?.batchId
  } as T;
}
