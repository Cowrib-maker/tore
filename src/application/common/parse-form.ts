import type { ZodError, ZodTypeAny, z } from "zod";

import type { ActionState } from "@/application/common/action-state";

export function firstZodMessage(
  error: ZodError,
  fallback = "Invalid input",
): string {
  return error.errors[0]?.message ?? fallback;
}

/**
 * Read a checkbox from FormData when a hidden "off" sentinel may share the same
 * name. Prefer getAll: formData.get() returns only the first value, so a leading
 * hidden field would always win over a checked checkbox.
 */
export function isFormCheckboxOn(formData: FormData, name: string): boolean {
  return formData.getAll(name).some((value) => value === "on");
}

/**
 * Parse with Zod; on failure return ActionState error for form actions.
 */
export function parseWithSchema<T extends ZodTypeAny>(
  schema: T,
  data: unknown,
): { ok: true; data: z.infer<T> } | { ok: false; state: ActionState } {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, state: { error: firstZodMessage(parsed.error) } };
  }
  return { ok: true, data: parsed.data };
}
