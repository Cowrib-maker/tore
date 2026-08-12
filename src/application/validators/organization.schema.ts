import { z } from "zod";

import { OrganizationType } from "@/domain/enums";

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(120, "Organization name must be at most 120 characters"),
  type: z.nativeEnum(OrganizationType),
});

export type CreateOrganizationFormInput = z.infer<
  typeof createOrganizationSchema
>;
