/**
 * Formats a caution block for verified authorities whose current-status
 * temporal validity (src/application/legal-graph/resolve-temporal-validity.ts)
 * indicates the source is not unqualified current law — REPEALED, EXPIRED,
 * or HISTORICALLY_IN_FORCE (a citation resolved for a "current" question
 * but only proven applicable to a past window). Mirrors
 * legal-ai-authority-conflict-block.ts's shape and purpose: an
 * already-formatted, evidence-only text block for the prompt, never a
 * silent filter — the reasoning layer must be told explicitly, not have
 * the source quietly dropped, since a historical question may still need
 * to cite the same law.
 */

import type { ResolvedLegalAuthority } from "./resolve-legal-authorities";

const FLAGGED_STATUSES = new Set(["REPEALED", "EXPIRED", "HISTORICALLY_IN_FORCE"]);

export function formatTemporalValidityBlock(
  authorities: readonly ResolvedLegalAuthority[],
): string | undefined {
  const lines = authorities
    .map((authority) => describe(authority))
    .filter((line): line is string => line !== null);

  if (lines.length === 0) {
    return undefined;
  }

  return [
    "ЭРХ ЗҮЙН ЭХ СУРВАЛЖИЙН ХУГАЦААНЫ ХҮЧИНТЭЙ БАЙДАЛ (баримтад суурилсан, автоматаар илрүүлсэн):",
    ...lines,
    "Хүчингүй болсон буюу түүхэн хугацаанд хамаарах эх сурвалжийг өнөөдрийн хүчинтэй хууль мэт танилцуулж болохгүй. Харин түүхэн асуултад хариулахдаа тухайн үед хүчинтэй байсан хуулийг ашиглаж болно — контекстээс шалтгаална.",
  ].join("\n");
}

function describe(authority: ResolvedLegalAuthority): string | null {
  const validity = authority.temporalValidity;
  if (!validity || !FLAGGED_STATUSES.has(validity.status)) {
    return null;
  }
  const uncertainty = validity.uncertainty ? ` (${validity.uncertainty})` : "";
  switch (validity.status) {
    case "REPEALED":
      return `- "${authority.title}" — энэ эх сурвалж хүчингүй болсон гэсэн шууд баримт бүртгэгдсэн байна.${uncertainty}`;
    case "EXPIRED":
      return `- "${authority.title}" — энэ эх сурвалжийн хүчинтэй хугацаа дууссан.${uncertainty}`;
    case "HISTORICALLY_IN_FORCE":
      return `- "${authority.title}" — энэ эх сурвалж зөвхөн тодорхой түүхэн хугацаанд хүчинтэй байсныг нотолсон, өнөөдрийн хүчинтэй эсэх нь тогтоогдоогүй.${uncertainty}`;
    default:
      return null;
  }
}
