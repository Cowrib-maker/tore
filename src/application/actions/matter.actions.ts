"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { ActionState } from "@/application/common/action-state";
import { mapActionError } from "@/application/common/map-action-error";
import { requireActor } from "@/application/common/require-actor";
import { createMatterForActor } from "@/application/use-cases/matters/create-matter";

const MATTERS_PATH = "/matters";

/**
 * Any authenticated, active role may create a Matter — it is a generic
 * container, not lawyer-only (unlike CaseFile). requireActor() with no
 * role argument accepts every ACTIVE role.
 */
export async function createMatterAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let matterId: string;
  try {
    const actor = await requireActor();
    const matter = await createMatterForActor(actor, {
      title: String(formData.get("title") ?? ""),
      type: String(formData.get("type") ?? "") || undefined,
      description: String(formData.get("description") ?? "") || null,
    });
    matterId = matter.id;
  } catch (error) {
    return mapActionError(error);
  }
  revalidatePath(MATTERS_PATH);
  redirect(`${MATTERS_PATH}/${encodeURIComponent(matterId)}`);
}
