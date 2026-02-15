import { EventEmitter } from 'node:events';

import { v4 as uuidv4 } from 'uuid';

import type {
  EnqueueResult,
  GenerationRequest,
  ReferenceImagePayload,
  QueueJob,
  Resolution,
  StudioProject
} from '../../shared/types.js';
import { ConfigStore } from './config.js';
import { StudioDatabase } from './db.js';
import { GeminiClient } from './gemini-client.js';
import { ImageStore } from './image-store.js';

const MAX_BATCH_COUNT = 4;
const MAX_REFERENCE_IMAGES = 14;

export class GenerationQueue extends EventEmitter {
  private activeRuns = 0;
  private paused = false;

  constructor(
    private readonly database: StudioDatabase,
    private readonly configStore: ConfigStore,
    private readonly geminiClient: GeminiClient,
    private readonly imageStore: ImageStore,
    private concurrency: number
  ) {
    super();
    this.concurrency = clampConcurrency(concurrency);
    this.database.requeueRunningJobs();
    this.kick();
  }

  listJobs(limit = 200): QueueJob[] {
    return this.database.listQueueJobs(limit);
  }

  setConcurrency(value: number): void {
    this.concurrency = clampConcurrency(value);
    this.kick();
  }

  getConcurrency(): number {
    return this.concurrency;
  }

  enqueue(request: GenerationRequest): EnqueueResult {
    const requestedBatchCount = request.batchCount ?? 1;
    const batchCount = Math.min(MAX_BATCH_COUNT, Math.max(1, requestedBatchCount));
    const estimatedBatchCost = estimateCost(request.resolution) * batchCount;
    this.assertSpendWithinLimits(estimatedBatchCost);
    const queuedJobIds: string[] = [];

    for (let i = 0; i < batchCount; i += 1) {
      const jobId = uuidv4();
      this.database.insertQueueJob({
        id: jobId,
        status: 'pending',
        request: {
          ...request,
          batchCount: 1
        },
        priority: 0
      });
      queuedJobIds.push(jobId);
    }

    this.emit('queue-changed');
    this.kick();

    return { queuedJobIds };
  }

  pause(): void {
    this.paused = true;
    this.emit('queue-changed');
  }

  resume(): void {
    this.paused = false;
    this.emit('queue-changed');
    this.kick();
  }

  cancel(jobId: string): boolean {
    const job = this.database.getQueueJobById(jobId);
    if (!job || job.status !== 'pending') {
      return false;
    }

    this.database.markQueueJobCancelled(jobId);
    this.emit('queue-changed');

    return true;
  }

  private kick(): void {
    if (this.paused) {
      return;
    }

    while (this.activeRuns < this.concurrency) {
      const nextJob = this.database.getNextPendingJob();
      if (!nextJob) {
        break;
      }

      this.runJob(nextJob).catch((error) => {
        const message = error instanceof Error ? error.message : 'Unbekannter Fehler in der Warteschlange';
        this.database.markQueueJobFailed(nextJob.id, message);
        this.activeRuns = Math.max(0, this.activeRuns - 1);
        this.emit('queue-changed');
        this.kick();
      });
    }
  }

  private async runJob(job: QueueJob): Promise<void> {
    this.activeRuns += 1;
    this.database.markQueueJobRunning(job.id);
    this.emit('queue-changed');

    const startedAt = Date.now();

    try {
      const apiKey = this.configStore.getApiKey();
      if (!apiKey) {
        throw new Error('Kein API-Schluessel konfiguriert. Oeffne die Einstellungen und hinterlege einen Schluessel.');
      }

      const costEstimate = estimateCost(job.request.resolution);
      this.assertSpendWithinLimits(costEstimate, { excludeQueueJobId: job.id });

      const resolvedSystemPrompt = this.resolveSystemPrompt(job.request);
      const resolvedReferenceImages = await this.resolveReferenceImages(job.request);
      const requestForGeneration: GenerationRequest = {
        ...job.request,
        referenceImages: resolvedReferenceImages
      };

      if (resolvedSystemPrompt) {
        requestForGeneration.systemPrompt = resolvedSystemPrompt;
      }

      const generationResult = await this.geminiClient.generate(requestForGeneration, apiKey);
      const generatedImage = generationResult.images[0];

      if (!generatedImage) {
        throw new Error('Generierung abgeschlossen, aber ohne Bild-Payload.');
      }

      const generationMs = Date.now() - startedAt;

      const imageId = await this.imageStore.persistGeneratedImage({
        request: requestForGeneration,
        generated: generatedImage,
        modelText: generationResult.modelText,
        generationMs,
        costEstimate
      });

      this.database.markQueueJobCompleted(job.id, imageId);
      this.database.insertUsageLog({
        id: uuidv4(),
        model: job.request.model,
        resolution: job.request.resolution ?? null,
        costEstimate,
        tokensIn: generationResult.tokenUsage?.inputTokens ?? null,
        tokensOut: generationResult.tokenUsage?.outputTokens ?? null
      });

      this.emit('job-completed', {
        jobId: job.id,
        imageId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unbekannter Generierungsfehler.';
      this.database.markQueueJobFailed(job.id, message);
      this.emit('job-failed', {
        jobId: job.id,
        message
      });
    } finally {
      this.activeRuns = Math.max(0, this.activeRuns - 1);
      this.emit('queue-changed');
      this.kick();
    }
  }

  private async resolveReferenceImages(request: GenerationRequest): Promise<ReferenceImagePayload[]> {
    const explicitReferences = (request.referenceImages ?? []).slice(0, MAX_REFERENCE_IMAGES);
    if (!request.projectId) {
      return explicitReferences;
    }

    const remainingSlots = Math.max(0, MAX_REFERENCE_IMAGES - explicitReferences.length);
    if (remainingSlots === 0) {
      return explicitReferences;
    }

    const projectBrandReferences = await this.imageStore.loadProjectBrandReferences(
      request.projectId,
      remainingSlots
    );

    return [...explicitReferences, ...projectBrandReferences];
  }

  private resolveSystemPrompt(request: GenerationRequest): string | null {
    const fragments: string[] = [];
    const direct = request.systemPrompt?.trim();
    if (direct) {
      fragments.push(direct);
    }

    const projectId = request.projectId?.trim();
    const project = projectId ? this.database.getProjectById(projectId) : null;
    this.pushProjectContextFragments(fragments, project, direct);

    return fragments.length > 0 ? fragments.join('\n\n') : null;
  }

  private pushProjectContextFragments(
    fragments: string[],
    project: StudioProject | null,
    directPrompt: string | undefined
  ): void {
    if (!project) {
      return;
    }

    const projectPrompt = project.systemPrompt?.trim();
    if (projectPrompt && projectPrompt !== directPrompt) {
      fragments.push(projectPrompt);
    }

    const guidelines = project.brandGuidelines?.trim();
    if (guidelines) {
      fragments.push(`Markenidentitaet und Brand-Richtlinien:\n${guidelines}`);
    }

    if (project.brandStrictMode) {
      fragments.push(
        'Strikter On-Brand-Modus: Halte Ausgabe strikt innerhalb der Markenidentitaet. Keine Abweichungen bei Stil, Farben, Tone-of-Voice oder visueller Sprache ohne explizite Nutzeranweisung.'
      );
    }
  }

  private assertSpendWithinLimits(
    estimatedAdditionalCost: number,
    options?: { excludeQueueJobId?: string }
  ): void {
    if (estimatedAdditionalCost <= 0) {
      return;
    }

    const reservedQueueCost = this.getReservedQueueCost(options?.excludeQueueJobId);
    const config = this.configStore.getPublicConfig();
    this.assertSingleLimit(
      'Monatslimit',
      config.monthlySpendLimitUsd,
      this.database.getSessionCost('month'),
      reservedQueueCost,
      estimatedAdditionalCost
    );
    this.assertSingleLimit(
      'Gesamtlimit',
      config.totalSpendLimitUsd,
      this.database.getSessionCost('all'),
      reservedQueueCost,
      estimatedAdditionalCost
    );
  }

  private getReservedQueueCost(excludeQueueJobId?: string): number {
    const openJobs = this.database.listOpenQueueJobs();
    return openJobs.reduce((sum, job) => {
      if (excludeQueueJobId && job.id === excludeQueueJobId) {
        return sum;
      }

      return sum + estimateCost(job.request.resolution);
    }, 0);
  }

  private assertSingleLimit(
    label: string,
    configuredLimit: number | null,
    currentSpent: number,
    reservedQueueCost: number,
    additionalCost: number
  ): void {
    if (configuredLimit == null) {
      return;
    }

    const projected = currentSpent + reservedQueueCost + additionalCost;
    if (projected <= configuredLimit) {
      return;
    }

    throw new Error(
      `${label} erreicht: Aktuell ${formatUsd(currentSpent)}, reserviert ${formatUsd(reservedQueueCost)}, geplanter Auftrag ${formatUsd(additionalCost)}, Limit ${formatUsd(configuredLimit)}. Passe das Limit in den Einstellungen an.`
    );
  }
}

function clampConcurrency(value: number): number {
  return Math.min(8, Math.max(1, Math.floor(value)));
}

export function estimateCost(resolution?: Resolution): number {
  if (resolution === '4K') {
    return 0.24;
  }

  return 0.134;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(3)}`;
}
