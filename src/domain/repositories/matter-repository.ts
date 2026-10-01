import type {
  CreateMatterInput,
  Matter,
  MatterStatus,
  MatterType,
} from "@/domain/entities/matter";

export type UpdateMatterPatch = {
  title?: string;
  type?: MatterType;
  description?: string | null;
  status?: MatterStatus;
};

export interface MatterRepository {
  create(input: CreateMatterInput): Promise<Matter>;
  findById(id: string): Promise<Matter | null>;
  listByOwnerId(ownerId: string): Promise<Matter[]>;
  update(id: string, patch: UpdateMatterPatch): Promise<Matter>;
  /** Exact count, never a capped page length — used for the Matters list's
   * per-row conversation count without loading any conversation content. */
  countConversationsByMatterIds(
    matterIds: string[],
  ): Promise<Record<string, number>>;
}
