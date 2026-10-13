import { z } from 'zod';
import { domainSchema, processNameSchema } from '@nwi/shared';

const instant = z.iso.datetime({ offset: true });

export const enrollSchema = z.object({
  code: z.string().trim().toUpperCase().min(8).max(32),
  hostname: z.string().trim().min(1).max(255),
  osVersion: z.string().trim().max(100).optional(),
  // Kompyuterning barqaror identifikatori; serverda faqat xeshi saqlanadi.
  machineId: z.string().trim().min(8).max(200),
  agentVersion: z.string().trim().min(1).max(50),
  // Xodim agentdagi "Nima yig'iladi" oynasida monitoring shartlari bilan tanishganini tasdiqlagan.
  consentAcknowledged: z.literal(
    true,
    'Monitoring shartlari bilan tanishganlikni tasdiqlash shart',
  ),
});

export const heartbeatSchema = z.object({
  agentVersion: z.string().trim().min(1).max(50),
  queueDepth: z.int().min(0).max(10_000_000).optional(),
  errors: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(100),
        message: z.string().trim().max(1000),
        occurredAt: instant,
      }),
    )
    .max(20)
    .default([]),
});

export const MAX_BATCH_SIZE = 500;

// Hodisalar bittalab tekshiriladi: bitta yaroqsiz hodisa butun to'plamni rad ettirmaydi.
export const eventBatchSchema = z.object({
  sentAt: instant,
  events: z.array(z.unknown()).min(1).max(MAX_BATCH_SIZE),
});

export const eventSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  processName: processNameSchema,
  appName: z.string().trim().min(1).max(200).optional(),
  domain: domainSchema.nullish(),
  startedAt: instant,
  endedAt: instant,
  activeSec: z.int().min(0),
  idleSec: z.int().min(0),
  state: z.enum(['ACTIVE', 'IDLE', 'LOCKED']),
  monitoringStatus: z.enum(['IN_SCHEDULE', 'OUTSIDE_SCHEDULE']).default('IN_SCHEDULE'),
});

export type EnrollInput = z.output<typeof enrollSchema>;
export type HeartbeatInput = z.output<typeof heartbeatSchema>;
export type EventInput = z.output<typeof eventSchema>;
