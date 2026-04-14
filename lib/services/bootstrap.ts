import { ensureDataDirectories } from "@/lib/storage/fs";

let started = false;

export async function ensureBootstrapped() {
  if (started) {
    return;
  }

  await ensureDataDirectories();
  started = true;
}
