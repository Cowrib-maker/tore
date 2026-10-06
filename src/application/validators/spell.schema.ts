import { z } from "zod";

import { SpellLicenseSource, SpellLicenseStatus, SpellPlanCode, SpellPlatform } from "@/domain/spell/enums";

const base64url = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9_-]+$/);

export const activateRequestSchema = z.object({
  code: z.string().min(1).max(64),
  installation: z.object({
    publicKey: base64url(64),
    platform: z.nativeEnum(SpellPlatform),
    appVersion: z.string().min(1).max(32),
    machineHint: z.string().min(1).max(256).optional(),
  }),
  confirmTransferOfActivationId: z.string().min(1).max(64).optional(),
});

export const activationRefSchema = z.object({
  activationId: z.string().min(1).max(64),
});

export const issueLicenseSchema = z.object({
  planCode: z.nativeEnum(SpellPlanCode),
  ownerUserId: z.string().min(1).max(64).optional(),
  source: z
    .enum([SpellLicenseSource.ADMIN_ISSUED, SpellLicenseSource.PROMO])
    .optional(),
});

export const reasonSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const adminListQuerySchema = z.object({
  status: z.nativeEnum(SpellLicenseStatus).optional(),
  planCode: z.nativeEnum(SpellPlanCode).optional(),
  source: z.nativeEnum(SpellLicenseSource).optional(),
  ownerUserId: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
