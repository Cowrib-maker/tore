import type {
  CreateMatterDocumentInput,
  MatterDocument,
} from "@/domain/entities/matter-document";

export interface MatterDocumentRepository {
  create(input: CreateMatterDocumentInput): Promise<MatterDocument>;
  findById(id: string): Promise<MatterDocument | null>;
  listByMatterId(matterId: string): Promise<MatterDocument[]>;
}
