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
    await writeJsonFile(
      path.join(storagePaths.parsedDir, `${parsed.datasetId}.json`),
      parsed
    );
  }

  async get(datasetId: string) {
    const filePath = path.join(storagePaths.parsedDir, `${datasetId}.json`);
    if (!(await fileExists(filePath))) {
      return null;
    }
    return readJsonFile<ParsedDataset>(filePath);
  }
}

class LocalAnalysisRepository implements AnalysisRepository {
  async save(result: AnalysisDataset) {
    await ensureDataDirectories();
    await writeJsonFile(
      path.join(storagePaths.cacheDir, `${result.datasetId}.json`),
      result
    );
  }

  async get(datasetId: string) {
    const filePath = path.join(storagePaths.cacheDir, `${datasetId}.json`);
    if (!(await fileExists(filePath))) {
      return null;
    }

    return readJsonFile<AnalysisDataset>(filePath);
  }

  async getLatest() {
    await ensureDataDirectories();
    const files = await listFilesSorted(storagePaths.cacheDir);
    const latest = files.find((entry) => entry.name.endsWith(".json"));
    if (!latest) {
      return null;
    }

    return readJsonFile<AnalysisDataset>(latest.filePath);
  }
}

export const repositories = {
  files: new LocalFileRepository(),
  parsed: new LocalParsedRepository(),
  analysis: new LocalAnalysisRepository()
};
