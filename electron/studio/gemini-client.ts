import type { GenerationRequest } from '../../shared/types.js';

interface GeminiImagePart {
  mimeType: string;
  dataBase64: string;
}

export interface GeminiGenerationResult {
  images: GeminiImagePart[];
  modelText: string | null;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  attempts: number;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  message: string;
}

class GeminiHttpError extends Error {
  status: number;
  isRetryable: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.isRetryable = status === 429 || status >= 500;
  }
}

class GeminiTimeoutError extends Error {}
type JsonRecord = Record<string, unknown>;

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 800;
const VALIDATE_REQUEST_TIMEOUT_MS = 15_000;
const GENERATE_REQUEST_TIMEOUT_MS = 120_000;

export class GeminiClient {
  async validateApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
    if (!apiKey.trim()) {
      return {
        valid: false,
        message: 'API-Schluessel darf nicht leer sein.'
      };
    }

    try {
      const response = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        {},
        VALIDATE_REQUEST_TIMEOUT_MS
      );

      if (!response.ok) {
        const message = await readErrorMessage(response);
        return {
          valid: false,
          message
        };
      }

      return {
        valid: true,
        message: 'API-Schluessel ist gueltig.'
      };
    } catch (error) {
      return {
        valid: false,
        message: error instanceof Error ? error.message : 'API-Schluessel konnte nicht geprueft werden.'
      };
    }
  }

  async generate(request: GenerationRequest, apiKey: string): Promise<GeminiGenerationResult> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < MAX_RETRIES) {
      attempts += 1;
      try {
        const result = await this.generateOnce(request, apiKey);
        return {
          ...result,
          attempts
        };
      } catch (error) {
        lastError = error as Error;
        if (!(error instanceof GeminiHttpError) || !error.isRetryable || attempts >= MAX_RETRIES) {
          throw error;
        }

        const delayMs = RETRY_BASE_DELAY_MS * 2 ** (attempts - 1);
        await wait(delayMs);
      }
    }

    throw lastError ?? new Error('Generierung fehlgeschlagen (ohne Details).');
  }

  private async generateOnce(request: GenerationRequest, apiKey: string): Promise<Omit<GeminiGenerationResult, 'attempts'>> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = buildGeminiPayload(request);

    let response: Response;
    try {
      response = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        },
        GENERATE_REQUEST_TIMEOUT_MS
      );
    } catch (error) {
      if (error instanceof GeminiTimeoutError) {
        throw new GeminiHttpError(
          `Gemini API request timed out after ${Math.round(GENERATE_REQUEST_TIMEOUT_MS / 1000)} seconds.`,
          504
        );
      }
      throw error;
    }

    if (!response.ok) {
      const message = await readErrorMessage(response);
      throw new GeminiHttpError(message, response.status);
    }

    const body = asRecord(await response.json()) ?? {};
    const parts = extractCandidateParts(body);

    const images: GeminiImagePart[] = [];
    const textParts: string[] = [];

    for (const part of parts) {
      const inlineData = extractInlineData(part);
      const partText = typeof part.text === 'string' ? part.text : null;

      if (inlineData) {
        images.push({
          dataBase64: inlineData.data,
          mimeType: inlineData.mimeType
        });
      }

      if (typeof partText === 'string' && partText.trim()) {
        textParts.push(partText.trim());
      }
    }

    if (images.length === 0) {
      throw new Error('Gemini hat fuer diese Anfrage keine Bild-Payload geliefert.');
    }

    const usage = extractUsageMetadata(body);

    return {
      images,
      modelText: textParts.length > 0 ? textParts.join('\n\n') : null,
      tokenUsage: usage
        ? {
            inputTokens: numberFromRecord(usage, 'promptTokenCount', 'prompt_token_count'),
            outputTokens: numberFromRecord(usage, 'candidatesTokenCount', 'candidates_token_count')
          }
        : undefined
    };
  }
}

function buildGeminiPayload(request: GenerationRequest): Record<string, unknown> {
  const parts: Record<string, unknown>[] = [{ text: request.prompt.trim() }];

  for (const ref of request.referenceImages ?? []) {
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: ref.dataBase64
      }
    });
  }

  const generationConfig: Record<string, unknown> = {
    responseModalities: request.responseModalities ?? ['IMAGE', 'TEXT']
  };

  const normalizedResolution = normalizeResolutionForModel(request.model, request.resolution);

  if (request.aspectRatio || normalizedResolution) {
    generationConfig.imageConfig = {
      ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
      ...(normalizedResolution ? { imageSize: normalizedResolution } : {})
    };
  }

  const payload: Record<string, unknown> = {
    contents: [
      {
        role: 'user',
        parts
      }
    ],
    generationConfig
  };

  const systemPrompt = request.systemPrompt?.trim();
  if (systemPrompt) {
    payload.systemInstruction = {
      parts: [{ text: systemPrompt }]
    };
  }

  if (request.useGoogleSearch) {
    payload.tools = [{ googleSearch: {} }];
  }

  return payload;
}

function extractCandidateParts(body: JsonRecord): JsonRecord[] {
  const candidates = asRecordArray(body.candidates);
  const firstCandidate = candidates[0];

  if (!firstCandidate) {
    return [];
  }

  const content = asRecord(firstCandidate.content);
  if (!content) {
    return [];
  }

  return asRecordArray(content.parts);
}

function normalizeResolutionForModel(model: GenerationRequest['model'], resolution: GenerationRequest['resolution']) {
  if (!resolution) {
    return undefined;
  }

  if (model === 'gemini-2.5-flash-image' || model === 'gemini-2.5-flash-image-preview') {
    return '1K';
  }

  return resolution;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = asRecord(await response.json());
    const error = asRecord(body?.error);
    const message = typeof error?.message === 'string' ? error.message : null;
    return message ?? `Gemini API request failed with ${response.status}`;
  } catch {
    return `Gemini API request failed with ${response.status}`;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new GeminiTimeoutError('Request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== 'object' || value == null) {
    return null;
  }
  return value as JsonRecord;
}

function asRecordArray(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<JsonRecord[]>((accumulator, entry) => {
    const record = asRecord(entry);
    if (record) {
      accumulator.push(record);
    }
    return accumulator;
  }, []);
}

function extractInlineData(part: JsonRecord): { data: string; mimeType: string } | null {
  const inlineData = asRecord(part.inlineData) ?? asRecord(part.inline_data);
  if (!inlineData || typeof inlineData.data !== 'string' || !inlineData.data.trim()) {
    return null;
  }

  const mimeType =
    typeof inlineData.mimeType === 'string'
      ? inlineData.mimeType
      : typeof inlineData.mime_type === 'string'
        ? inlineData.mime_type
        : 'image/png';

  return {
    data: inlineData.data,
    mimeType
  };
}

function extractUsageMetadata(body: JsonRecord): JsonRecord | null {
  return asRecord(body.usageMetadata) ?? asRecord(body.usage_metadata);
}

function numberFromRecord(record: JsonRecord, ...keys: string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}
