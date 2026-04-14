import { clsx, type ClassValue } from "clsx";
import dayjs from "dayjs";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function createId(prefix: string) {
  return `${prefix}_${dayjs().valueOf()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return undefined;
    }

    const result = Number(normalized);
    if (Number.isFinite(result)) {
      return result;
    }
  }

  return undefined;
}

export function getString(value: unknown) {
  if (value == null) {
    return "";
  }

  return String(value).trim();
}

export function safeArray<T>(value: T[] | undefined | null) {
  return Array.isArray(value) ? value : [];
}
