import {
  ConflictFindingType,
  type ConflictFinding,
} from "@/engine/graph";

/**
 * Formats deterministic, graph-backed conflict findings into a prompt
 * block the model must acknowledge rather than silently pick a side.
 * Never asserts which authority is correct — only that both were
 * surfaced for this answer and a specific, evidence-backed relation (or
 * opposite temporal force) exists between them. Returns undefined when
 * there is nothing to report, which is every turn today (the graph has
 * no persisted edges until a projection is run against real corpus data).
 */
export function formatAuthorityConflictBlock(
  conflicts: readonly ConflictFinding[],
): string | undefined {
  if (conflicts.length === 0) {
    return undefined;
  }

  const lines = conflicts.map((finding) => `- ${describe(finding)}`);
  return [
    "ЭРХ ЗҮЙН ЭХ СУРВАЛЖИЙН ЗӨРЧИЛДӨӨН (баримтад суурилсан, автоматаар илрүүлсэн):",
    ...lines,
    "Эдгээр эх сурвалжийн аль нь хамаарахыг таамгаар бүү сонго. Хэрэглэгчид зөрчилдөөн байгааг тодорхой дурдаж, аль эх сурвалж давамгайлахыг баталгаатай тодорхойлж чадаагүйгээ шударгаар мэдэгд.",
  ].join("\n");
}

function describe(finding: ConflictFinding): string {
  switch (finding.type) {
    case ConflictFindingType.EXPLICIT_REPEALS:
      return "Хоёр эх сурвалжийн хооронд албан ёсны REPEALS (хүчингүй болгосон) холбоос бүртгэгдсэн байна.";
    case ConflictFindingType.EXPLICIT_SUPERSEDES:
      return "Хоёр эх сурвалжийн хооронд албан ёсны SUPERSEDES (орлуулсан) холбоос бүртгэгдсэн байна.";
    case ConflictFindingType.TEMPORAL_INCOMPATIBILITY:
      return "Нэг эх сурвалж хүчинтэй, нөгөө нь хүчингүй байгаа боловч энэ ялгааг тайлбарлах шууд холбоос олдсонгүй.";
    default:
      return "Тодорхойгүй төрлийн зөрчилдөөн илэрсэн.";
  }
}
