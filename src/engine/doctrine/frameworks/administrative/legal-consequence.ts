/**
 * Захиргааны актын алдааны эрх зvйн vр дагавар (error → legal consequence).
 *
 * Source: methodology handbook p.15 (general exposition), applied verbatim
 * in Тохиолдол №2 at p.33 ("Захиргааны ерөнхий хуулийн 47-д заасан алдаа
 * гараагvй тул илт хууль бус акт биш ... хууль бус акт байна").
 *
 * Only the two categories the source actually works through end-to-end are
 * given a worked test fixture (илт хууль бус / хууль бус, via Case 2).
 * "Хэлбэрийн төдий алдаа" (§45) and "хууль бус эс vйлдэхvй" (§106.3.4) are
 * defined here from the general-methodology text only — the source has no
 * worked example for either, so no case fixture exists for them (see TBD).
 */
import { methodologyProvenance } from "./provenance";
import type { DoctrineProvenance } from "../../provenance";

export const AdministrativeDefectKind = {
  /** ЗЕХ §45 — court need not invalidate. */
  MERE_FORM_DEFECT: "MERE_FORM_DEFECT",
  /** ЗЕХ §47.1.1-47.1.7 -> §47.2 — void ab initio. */
  MANIFESTLY_UNLAWFUL: "MANIFESTLY_UNLAWFUL",
  /** Neither mere-form nor manifest — ordinary unlawfulness. */
  UNLAWFUL: "UNLAWFUL",
  /** Unjustified refusal or omission to issue a required act. */
  UNLAWFUL_OMISSION: "UNLAWFUL_OMISSION",
} as const;

export type AdministrativeDefectKind =
  (typeof AdministrativeDefectKind)[keyof typeof AdministrativeDefectKind];

export type AdministrativeDefectConsequence = {
  kind: AdministrativeDefectKind;
  /** Mongolian label as used in the source. */
  label: string;
  /** What the court does per ЗХШХШтХ / ЗЕХ. */
  consequenceStatement: string;
  provenance: DoctrineProvenance[];
};

/**
 * Canonical decision table — p.15. Order matches the source's own
 * presentation (mere-form, manifestly-unlawful, unlawful, omission).
 */
export const ADMINISTRATIVE_DEFECT_CONSEQUENCES: readonly AdministrativeDefectConsequence[] =
  [
    {
      kind: AdministrativeDefectKind.MERE_FORM_DEFECT,
      label: "Хэлбэрийн төдий алдаа",
      consequenceStatement:
        "Шvvхээс хvчингvй болгох шаардлагагvй (ЗЕХ §45).",
      provenance: [
        methodologyProvenance(
          "х.15",
          "Эрх зvйн тохиолдол шийдвэрлэх аргачлал, х.15 — Захиргааны актын алдааны эрх зvйн vр дагавар",
        ),
      ],
    },
    {
      kind: AdministrativeDefectKind.MANIFESTLY_UNLAWFUL,
      label: "Илт хууль бус",
      consequenceStatement:
        "Гарсан цагаасаа эрх зvйн vйлчлэлгvй (=байхгvй мэт); шvvх тогтооно (ЗЕХ §47.1.1-47.1.7, §47.2; ЗХШХШтХ §106.3.2).",
      provenance: [
        methodologyProvenance(
          "х.15",
          "Эрх зvйн тохиолдол шийдвэрлэх аргачлал, х.15 — Захиргааны актын алдааны эрх зvйн vр дагавар",
        ),
        methodologyProvenance(
          "х.33",
          "Эрх зvйн тохиолдол шийдвэрлэх аргачлал, Тохиолдол №2, х.33 — §47-ийн шалгуураар илт хууль бус эсэхийг ялгасан хэрэглээ",
        ),
      ],
    },
    {
      kind: AdministrativeDefectKind.UNLAWFUL,
      label: "Хууль бус (илт биш, хэлбэрийн төдий биш)",
      consequenceStatement: "Шvvх хvчингvй болгоно (ЗХШХШтХ §106.3.1).",
      provenance: [
        methodologyProvenance(
          "х.15",
          "Эрх зvйн тохиолдол шийдвэрлэх аргачлал, х.15 — Захиргааны актын алдааны эрх зvйн vр дагавар",
        ),
        methodologyProvenance(
          "х.33",
          "Эрх зvйн тохиолдол шийдвэрлэх аргачлал, Тохиолдол №2, х.33 — хууль бус акт гэсэн эцсийн ангилал",
        ),
      ],
    },
    {
      kind: AdministrativeDefectKind.UNLAWFUL_OMISSION,
      label: "Захиргааны акт гаргахаас vндэслэлгvй татгалзсан/гаргаагvй эс vйлдэхvй",
      consequenceStatement:
        "Шvvх шаардагдах захиргааны актыг гаргахыг даалгана (ЗХШХШтХ §106.3.4).",
      provenance: [
        methodologyProvenance(
          "х.15",
          "Эрх зvйн тохиолдол шийдвэрлэх аргачлал, х.15 — Захиргааны актын алдааны эрх зvйн vр дагавар",
        ),
      ],
    },
  ];

export function findDefectConsequence(
  kind: AdministrativeDefectKind,
): AdministrativeDefectConsequence {
  const found = ADMINISTRATIVE_DEFECT_CONSEQUENCES.find(
    (entry) => entry.kind === kind,
  );
  if (!found) {
    throw new Error(`No consequence entry for defect kind ${kind}`);
  }
  return found;
}

/**
 * Нэхэмжлэлийн шаардлагын vндэслэл (ЗХШХШтХ §52.5.x) — remedy claim
 * grounds, applied verbatim in Case 2 at p.33. This is the "final
 * remedy/nexus bridge" the gate review names: it does not become a
 * LegalElement — "эрх, хууль ёсны ашиг сонирхол зөрчигдсön эсэх" is the
 * causal link between a found defect and which of these claim types is
 * available, decided at the conclusion stage, not by subsumption.
 */
export const AdministrativeRemedyClaimKind = {
  /** §52.5.1 — invalidate the unlawful act. */
  INVALIDATE_ACT: "INVALIDATE_ACT",
  /** §52.5.2 — recover damages caused by the unlawful act/omission. */
  RECOVER_DAMAGES: "RECOVER_DAMAGES",
} as const;

export type AdministrativeRemedyClaimKind =
  (typeof AdministrativeRemedyClaimKind)[keyof typeof AdministrativeRemedyClaimKind];

export type AdministrativeRemedyClaim = {
  kind: AdministrativeRemedyClaimKind;
  label: string;
  claimStatement: string;
  provenance: DoctrineProvenance[];
};

export const ADMINISTRATIVE_REMEDY_CLAIMS: readonly AdministrativeRemedyClaim[] = [
  {
    kind: AdministrativeRemedyClaimKind.INVALIDATE_ACT,
    label: "Захиргааны актыг хvчингvй болгуулах",
    claimStatement:
      "ЗХШХШтХ §52.5.1: захиргааны акт хууль бус бөгöед түvнийг хvчингvй болгуулах нэхэмжлэлийн хувьд нэхэмжлэгчийн эрх, хууль ёсны ашиг сонирхол нь хэрхэн зöрчигдсöнийг дvгнэнэ (ЗХШХШтХ §106.3.1).",
    provenance: [
      methodologyProvenance(
        "х.33",
        "Эрх зvйн тохиолдол шийдвэрлэх аргачлал, Тохиолдол №2, х.33 — Нэхэмжлэлийн шаардлагыг тодорхойлох, §52.5.1",
      ),
    ],
  },
  {
    kind: AdministrativeRemedyClaimKind.RECOVER_DAMAGES,
    label: "Хохирол гаргуулах",
    claimStatement:
      "ЗХШХШтХ §52.5.2: захиргааны байгууллага ямар vvргээ биелvvлээгvйгээс, эсхvл захиргааны хууль бус vйл ажиллагааны улмаас нэхэмжлэгчид ямар хохирол учирснийг тодорхойлж, түvнийг хэрхэн шийдвэрлэхийг дvгнэнэ (ЗХШХШтХ §106.3.7).",
    provenance: [
      methodologyProvenance(
        "х.33",
        "Эрх зvйн тохиолдол шийдвэрлэх аргачлал, Тохиолдол №2, х.33 — Нэхэмжлэлийн шаардлагыг тодорхойлох, §52.5.2",
      ),
    ],
  },
];
