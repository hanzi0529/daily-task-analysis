import { promises as fs } from "fs";
import path from "path";

import { storagePaths } from "@/config/app";
import { tryReadJsonFile, writeJsonFile } from "@/lib/storage/fs";
import { createId } from "@/lib/utils";
import type { ModelProviderConfig, ModelProviderStore } from "@/types/domain";

const configFilePath = path.join(storagePaths.configDir, "model-providers.json");

export interface ModelConfigRepository {
  getAll(): Promise<{ activeConfigId: string | null; configs: ModelProviderConfig[] }>;
  getRaw(): Promise<ModelProviderStore>;
  getActiveRaw(): Promise<ModelProviderConfig | null>;
  create(
    input: Omit<ModelProviderConfig, "id" | "createdAt" | "updatedAt">
  ): Promise<ModelProviderConfig>;
  update(
    id: string,
    input: Partial<Omit<ModelProviderConfig, "id" | "createdAt" | "updatedAt">>
  ): Promise<ModelProviderConfig>;
  delete(id: string): Promise<void>;
  setActive(id: string): Promise<void>;
}

async function readStore(): Promise<ModelProviderStore> {
  await fs.mkdir(storagePaths.configDir, { recursive: true });
  const raw = await tryReadJsonFile<ModelProviderStore>(configFilePath);
  return raw ?? { activeConfigId: null, configs: [] };
}

async function writeStore(store: ModelProviderStore): Promise<void> {
  await fs.mkdir(storagePaths.configDir, { recursive: true });
  await writeJsonFile(configFilePath, store);
}

export function maskApiKey(apiKey: string): string {
  if (!apiKey) return "";
  if (apiKey.length <= 7) return "****";
  return `${apiKey.slice(0, 3)}****${apiKey.slice(-4)}`;
}

export function maskConfig(config: ModelProviderConfig): ModelProviderConfig {
  return { ...config, apiKey: maskApiKey(config.apiKey) };
}

class LocalModelConfigRepository implements ModelConfigRepository {
  async getAll() {
    const store = await readStore();
    return {
      activeConfigId: store.activeConfigId,
      configs: store.configs.map(maskConfig)
    };
  }

  async getRaw(): Promise<ModelProviderStore> {
    return readStore();
  }

  async getActiveRaw(): Promise<ModelProviderConfig | null> {
    const store = await readStore();
    if (!store.activeConfigId) return null;
    return store.configs.find((c) => c.id === store.activeConfigId) ?? null;
  }

  async create(
    input: Omit<ModelProviderConfig, "id" | "createdAt" | "updatedAt">
  ): Promise<ModelProviderConfig> {
    const store = await readStore();
    const now = new Date().toISOString();
    const config: ModelProviderConfig = {
      id: createId("cfg"),
      ...input,
      createdAt: now,
      updatedAt: now
    };
    store.configs.push(config);
    // First config becomes active automatically
    if (store.configs.length === 1) {
      store.activeConfigId = config.id;
    }
    await writeStore(store);
    return config;
  }

  async update(
    id: string,
    input: Partial<Omit<ModelProviderConfig, "id" | "createdAt" | "updatedAt">>
  ): Promise<ModelProviderConfig> {
    const store = await readStore();
    const index = store.configs.findIndex((c) => c.id === id);
    if (index < 0) throw new Error(`Model config ${id} not found`);

    const existing = store.configs[index];
    const updated: ModelProviderConfig = {
      ...existing,
      ...input,
      // Preserve old apiKey if the update sends an empty string
      apiKey: input.apiKey?.trim() ? input.apiKey : existing.apiKey,
      updatedAt: new Date().toISOString()
    };
    store.configs[index] = updated;
    await writeStore(store);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const store = await readStore();
    store.configs = store.configs.filter((c) => c.id !== id);
    if (store.activeConfigId === id) {
      store.activeConfigId = store.configs[0]?.id ?? null;
    }
    await writeStore(store);
  }

  async setActive(id: string): Promise<void> {
    const store = await readStore();
    if (!store.configs.some((c) => c.id === id)) {
      throw new Error(`Model config ${id} not found`);
    }
    store.activeConfigId = id;
    await writeStore(store);
  }
}

export const modelConfigRepository = new LocalModelConfigRepository();
