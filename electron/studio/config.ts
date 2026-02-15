import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { safeStorage } from 'electron';

import type { ModelName, StudioConfigPublic } from '../../shared/types.js';
import { STUDIO_PATHS } from './paths.js';

interface StudioConfigFile {
  encryptedApiKey?: string;
  defaultModel?: ModelName;
  theme?: 'dark' | 'light' | 'system';
  onboardingCompleted?: boolean;
  queueConcurrency?: number;
  monthlySpendLimitUsd?: number | null;
  totalSpendLimitUsd?: number | null;
}

const DEFAULT_CONFIG: Required<Omit<StudioConfigFile, 'encryptedApiKey'>> = {
  defaultModel: 'gemini-3-pro-image-preview',
  theme: 'dark',
  onboardingCompleted: false,
  queueConcurrency: 2,
  monthlySpendLimitUsd: null,
  totalSpendLimitUsd: null
};

const FALLBACK_KEY_FILE = path.join(STUDIO_PATHS.root, '.apikey-key.bin');
const FALLBACK_KEY_BYTES = 32;
const FALLBACK_IV_BYTES = 12;
const FALLBACK_AUTH_TAG_BYTES = 16;

function encodeApiKey(apiKey: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return `v1:${safeStorage.encryptString(apiKey).toString('base64')}`;
  }

  try {
    const key = getFallbackEncryptionKey();
    const iv = randomBytes(FALLBACK_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const packed = Buffer.concat([iv, authTag, encrypted]).toString('base64');
    return `v2:${packed}`;
  } catch {
    return `plain:${Buffer.from(apiKey, 'utf8').toString('base64')}`;
  }
}

function decodeApiKey(value: string): string | null {
  if (!value) {
    return null;
  }

  if (value.startsWith('v1:')) {
    if (!safeStorage.isEncryptionAvailable()) {
      return null;
    }

    try {
      const bytes = Buffer.from(value.slice(3), 'base64');
      return safeStorage.decryptString(bytes);
    } catch {
      return null;
    }
  }

  if (value.startsWith('plain:')) {
    try {
      return Buffer.from(value.slice(6), 'base64').toString('utf8');
    } catch {
      return null;
    }
  }

  if (value.startsWith('v2:')) {
    try {
      const bytes = Buffer.from(value.slice(3), 'base64');
      if (bytes.length <= FALLBACK_IV_BYTES + FALLBACK_AUTH_TAG_BYTES) {
        return null;
      }

      const iv = bytes.subarray(0, FALLBACK_IV_BYTES);
      const authTag = bytes.subarray(FALLBACK_IV_BYTES, FALLBACK_IV_BYTES + FALLBACK_AUTH_TAG_BYTES);
      const encrypted = bytes.subarray(FALLBACK_IV_BYTES + FALLBACK_AUTH_TAG_BYTES);
      const key = getFallbackEncryptionKey();
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      return null;
    }
  }

  return null;
}

export class ConfigStore {
  private config: StudioConfigFile;

  constructor() {
    this.config = this.readConfigFile();
    this.writeConfigFile();
  }

  private readConfigFile(): StudioConfigFile {
    if (!fs.existsSync(STUDIO_PATHS.config)) {
      return { ...DEFAULT_CONFIG };
    }

    try {
      const content = fs.readFileSync(STUDIO_PATHS.config, 'utf8');
      const parsed = JSON.parse(content) as StudioConfigFile;
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        defaultModel: normalizeModelName(parsed.defaultModel),
        queueConcurrency: normalizeConcurrency(parsed.queueConcurrency),
        monthlySpendLimitUsd: normalizeSpendLimit(parsed.monthlySpendLimitUsd),
        totalSpendLimitUsd: normalizeSpendLimit(parsed.totalSpendLimitUsd)
      };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  private writeConfigFile(): void {
    fs.writeFileSync(STUDIO_PATHS.config, JSON.stringify(this.config, null, 2), 'utf8');
  }

  getApiKey(): string | null {
    if (!this.config.encryptedApiKey) {
      return null;
    }

    return decodeApiKey(this.config.encryptedApiKey);
  }

  setApiKey(apiKey: string): void {
    this.config.encryptedApiKey = encodeApiKey(apiKey.trim());
    this.writeConfigFile();
  }

  clearApiKey(): void {
    delete this.config.encryptedApiKey;
    this.writeConfigFile();
  }

  updateConfig(
    patch: Partial<
      Pick<
        StudioConfigFile,
        'defaultModel' | 'theme' | 'onboardingCompleted' | 'queueConcurrency' | 'monthlySpendLimitUsd' | 'totalSpendLimitUsd'
      >
    >
  ): StudioConfigPublic {
    const hasMonthlySpendLimitPatch = Object.prototype.hasOwnProperty.call(
      patch,
      'monthlySpendLimitUsd'
    );
    const hasTotalSpendLimitPatch = Object.prototype.hasOwnProperty.call(
      patch,
      'totalSpendLimitUsd'
    );

    this.config = {
      ...this.config,
      ...patch,
      defaultModel: normalizeModelName(patch.defaultModel ?? this.config.defaultModel),
      queueConcurrency: normalizeConcurrency(patch.queueConcurrency ?? this.config.queueConcurrency),
      monthlySpendLimitUsd: normalizeSpendLimit(
        hasMonthlySpendLimitPatch ? patch.monthlySpendLimitUsd : this.config.monthlySpendLimitUsd
      ),
      totalSpendLimitUsd: normalizeSpendLimit(
        hasTotalSpendLimitPatch ? patch.totalSpendLimitUsd : this.config.totalSpendLimitUsd
      )
    };

    this.writeConfigFile();

    return this.getPublicConfig();
  }

  getPublicConfig(): StudioConfigPublic {
    return {
      hasApiKey: Boolean(this.getApiKey()),
      defaultModel: normalizeModelName(this.config.defaultModel),
      theme: this.config.theme ?? DEFAULT_CONFIG.theme,
      onboardingCompleted: this.config.onboardingCompleted ?? DEFAULT_CONFIG.onboardingCompleted,
      queueConcurrency: normalizeConcurrency(this.config.queueConcurrency),
      monthlySpendLimitUsd: normalizeSpendLimit(this.config.monthlySpendLimitUsd),
      totalSpendLimitUsd: normalizeSpendLimit(this.config.totalSpendLimitUsd)
    };
  }
}

function normalizeConcurrency(value: number | undefined): number {
  if (!value || Number.isNaN(value)) {
    return DEFAULT_CONFIG.queueConcurrency;
  }

  return Math.min(8, Math.max(1, Math.floor(value)));
}

function normalizeSpendLimit(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) {
    return null;
  }

  if (value <= 0) {
    return null;
  }

  return Number(value.toFixed(3));
}

function normalizeModelName(value: ModelName | undefined): ModelName {
  if (value === 'gemini-2.5-flash-image-preview') {
    return 'gemini-2.5-flash-image';
  }

  return value ?? DEFAULT_CONFIG.defaultModel;
}

function getFallbackEncryptionKey(): Buffer {
  if (fs.existsSync(FALLBACK_KEY_FILE)) {
    const existing = fs.readFileSync(FALLBACK_KEY_FILE);
    if (existing.length === FALLBACK_KEY_BYTES) {
      return existing;
    }
  }

  const key = randomBytes(FALLBACK_KEY_BYTES);
  fs.writeFileSync(FALLBACK_KEY_FILE, key, { mode: 0o600 });
  return key;
}
