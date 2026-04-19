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
import { modelConfigRepository } from "@/lib/storage/model-config-repository";
import {
  ensureDataDirectories,
  fileExists,
  listFilesSorted,
  readJsonFile,
  tryReadJsonFile,
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
  // Only called during import — never during AI review save()
  setLatest(datasetId: string): Promise<void>;
}

const uploadsIndexPath = path.join(storagePaths.uploadsDir, "_index.json");
const analysisIndexPath = path.join(storagePaths.cacheDir, "_index.json");

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

    try {
      return await readJsonFile<UploadFileMeta[]>(uploadsIndexPath);
    } catch {
      return [];
    }
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
    // tryReadJsonFile returns null instead of throwing if the file is corrupt.
    const result = await tryReadJsonFile<ParsedDataset>(filePath);
    return result ? hydrateDatasetIdentity(result) : null;
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
    // NOTE: intentionally does NOT update analysisIndexPath.
    // The "latest" pointer is managed exclusively by setLatest(), which is
    // only called during import — never during AI review writes.
  }

  // Called once per import to record the new dataset as "latest".
  // Prepends the new datasetId and deduplicates any prior entry.
  async setLatest(datasetId: string) {
    await ensureDataDirectories();
    let index: string[] = [];
    try {
      if (await fileExists(analysisIndexPath)) {
        const raw = await readJsonFile<unknown>(analysisIndexPath);
        if (Array.isArray(raw)) {
          index = raw.filter((id): id is string => typeof id === "string");
        }
      }
    } catch {
      index = [];
    }
    const deduped = index.filter((id) => id !== datasetId);
    await writeJsonFile(analysisIndexPath, [datasetId, ...deduped]);
  }

  async get(datasetId: string) {
    const filePath = path.join(storagePaths.cacheDir, `${datasetId}.json`);
    if (!(await fileExists(filePath))) {
      return null;
    }
    // Use tryReadJsonFile so a file that is momentarily corrupt (race window
    // on a non-atomic filesystem, stale .tmp, etc.) is treated as "not found"
    // rather than crashing the caller.
    const result = await tryReadJsonFile<AnalysisDataset>(filePath);
    return result ? hydrateDatasetIdentity(result) : null;
  }

  async getLatest() {
    await ensureDataDirectories();

    // Primary: read from the stable import-order index.
    // tryReadJsonFile is used so a corrupt _index.json falls through to rebuild.
    const indexRaw = await tryReadJsonFile<unknown>(analysisIndexPath);
    if (Array.isArray(indexRaw) && indexRaw.length > 0) {
      const latestId = indexRaw[0];
      if (typeof latestId === "string") {
        const result = await this.get(latestId);
        if (result) {
          return result;
        }
        // Indexed file was deleted or corrupt — fall through and rebuild.
      }
    }

    // Fallback: mtime sort over all dataset files.
    // Also rebuilds _index.json so the next call uses the stable pointer.
    const candidates = await this.scanCandidates();
    if (candidates.length === 0) {
      return null;
    }

    // Rebuild index from filesystem state (best-effort, non-fatal if it fails).
    try {
      await writeJsonFile(
        analysisIndexPath,
        candidates.map((entry) => entry.name.slice(0, -5))
      );
    } catch {
      // ignore — index rebuild failure must not block the read
    }

    // Iterate candidates in mtime order and return the first readable one.
    // Skips files that are currently unreadable (corrupt, mid-write race, etc.)
    // so a single bad file cannot bring down the entire API.
    for (const candidate of candidates) {
      const result = await tryReadJsonFile<AnalysisDataset>(candidate.filePath);
      if (result) {
        return hydrateDatasetIdentity(result);
      }
    }

    return null;
  }

  // Scan cache dir for dataset files sorted by mtime desc, excluding _index.json
  // and any leftover .tmp files from a previous crashed atomic write.
  private async scanCandidates() {
    const files = await listFilesSorted(storagePaths.cacheDir);
    return files.filter(
      (entry) =>
        entry.name.endsWith(".json") &&
        entry.name !== "_index.json" &&
        !entry.name.endsWith(".tmp")
    );
  }
}

export const repositories = {
  files: new LocalFileRepository(),
  parsed: new LocalParsedRepository(),
  analysis: new LocalAnalysisRepository(),
  modelConfigs: modelConfigRepository
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
