export type MatterStatus = "ACTIVE" | "ARCHIVED";

export type MatterType =
  | "GENERAL"
  | "LITIGATION"
  | "CONTRACT"
  | "EMPLOYMENT"
  | "FAMILY"
  | "CRIMINAL"
  | "ADMINISTRATIVE";

/**
 * TORE Matter Workspace V1 — the persistent, any-role container around one
 * or more Legal AI conversations. Deliberately minimal: V1 implements only
 * Overview + AI conversations, so this entity carries no facts/documents/
 * issues/timeline fields yet (see the Prisma schema comment on `Matter`).
 */
export type Matter = {
  id: string;
  ownerId: string;
  title: string;
  type: MatterType;
  description: string | null;
  status: MatterStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateMatterInput = {
  ownerId: string;
  title: string;
  type: MatterType;
  description: string | null;
};
