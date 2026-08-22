"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { adminSaveHomepageContentAction } from "@/application/actions/admin-homepage-content.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LandingPage } from "@/components/marketing/landing-page";
import { HomepageImageDropzone } from "@/components/admin/homepage-image-dropzone";
import type { HomepageSectionKey } from "@/domain/entities/homepage-section";
import type { HomepageLandingContent } from "@/domain/entities/homepage-content";
import { cn } from "@/lib/utils";
import { LEGAL_AI_PATH } from "@/domain/services/rbac";
import type { Dictionary } from "@/i18n/types";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

type ImageCopy = Pick<
  MarketplaceDictionary["adminHomepage"],
  "noImage" | "upload" | "change" | "remove" | "uploaded" | "removed"
>;

type Content = HomepageLandingContent;

/* ── small field primitives ─────────────────────────────────────────── */

function FieldRow({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="min-h-[72px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function StringListField({
  label,
  items,
  onChange,
  fixed,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  fixed?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="grid gap-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={(e) => {
                const next = [...items];
                next[index] = e.target.value;
                onChange(next);
              }}
            />
            {!fixed ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                Устгах
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      {!fixed ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => onChange([...items, ""])}
        >
          + Мөр нэмэх
        </Button>
      ) : null}
    </div>
  );
}

function ObjectListField<T extends Record<string, string>>({
  label,
  items,
  onChange,
  fields,
  emptyItem,
}: {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  fields: Array<{ key: keyof T; label: string; multiline?: boolean }>;
  emptyItem: T;
}) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="grid gap-3">
        {items.map((item, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2"
          >
            {fields.map((field) => (
              <div
                key={String(field.key)}
                className={cn(field.multiline && "sm:col-span-2")}
              >
                <FieldRow
                  label={field.label}
                  value={item[field.key] ?? ""}
                  multiline={field.multiline}
                  onChange={(value) => {
                    const next = [...items];
                    next[index] = { ...next[index], [field.key]: value };
                    onChange(next);
                  }}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                Энэ мөрийг устгах
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => onChange([...items, emptyItem])}
      >
        + Нэмэх
      </Button>
    </div>
  );
}

function Section({
  title,
  help,
  defaultOpen,
  children,
}: {
  title: string;
  help?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {help ? (
            <p className="text-xs text-muted-foreground">{help}</p>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="grid gap-4 border-t p-4">{children}</div>
    </details>
  );
}

/* ── main editor ────────────────────────────────────────────────────── */

export function AdminHomepageContentEditor({
  initialContent,
  initialUpdatedAt,
  previewDict,
  initialSectionImages,
  imageCopy,
}: {
  initialContent: HomepageLandingContent;
  initialUpdatedAt: string | null;
  previewDict: Dictionary;
  initialSectionImages: Record<HomepageSectionKey, string | null>;
  imageCopy: ImageCopy;
}) {
  const [content, setContent] = useState<Content>(initialContent);
  const [images, setImages] =
    useState<Record<HomepageSectionKey, string | null>>(initialSectionImages);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);

  function set<K extends keyof Content>(key: K, value: Content[K]) {
    setContent((prev) => ({ ...prev, [key]: value }));
  }

  function setImage(key: HomepageSectionKey, url: string | null) {
    setImages((prev) => ({ ...prev, [key]: url }));
  }

  function sectionImageProps(sectionKey: HomepageSectionKey, label: string) {
    return {
      sectionKey,
      label,
      imageUrl: images[sectionKey],
      copy: imageCopy,
      onImageChange: (url: string | null) => setImage(sectionKey, url),
    } as const;
  }

  function handleSave() {
    setError(null);
    setSuccessNote(null);
    startTransition(async () => {
      const result = await adminSaveHomepageContentAction(content);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setUpdatedAt(result.updatedAt);
      if (result.translationError) {
        setSuccessNote(
          `Монгол хувилбар хадгалагдлаа. ${result.translationError}`,
        );
      } else if (result.translated.length > 0) {
        setSuccessNote(
          `Хадгалагдлаа. Бусад хэлүүд рүү автоматаар орчуулагдлаа: ${result.translated
            .join(", ")
            .toUpperCase()}.`,
        );
      } else {
        setSuccessNote("Хадгалагдлаа.");
      }
    });
  }

  const livePreviewDict: Dictionary = { ...previewDict, landing: content };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,440px)_1fr] lg:items-start">
    <div className="grid gap-4">
      <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        Хэсэг бүрийн зургийг чирж (drag &amp; drop) эсвэл дарж сонгоод
        байршуулна уу — зураг тухайн хэсэгт яг хаана харагдахыг баруун талын
        урьдчилан харах дээр шууд харах боломжтой. Текстийн хувьд энд зөвхөн{" "}
        <strong>Монгол</strong> хувилбарыг засварлана. Хадгалахад англи,
        хятад, солонгос хувилбарууд автоматаар орчуулагдаж шинэчлэгдэнэ.
      </div>

      <Section title="Эхлэл хэсэг (Hero)" defaultOpen>
        <HomepageImageDropzone {...sectionImageProps("hero", "Эхлэл хэсгийн зураг")} />
        <FieldRow
          label="Эйброу (жижиг гарчиг)"
          value={content.osEyebrow}
          onChange={(v) => set("osEyebrow", v)}
        />
        <FieldRow
          label="Гол гарчиг"
          value={content.headline}
          onChange={(v) => set("headline", v)}
        />
        <FieldRow
          label="Тайлбар"
          value={content.support}
          multiline
          onChange={(v) => set("support", v)}
        />
        <FieldRow
          label="Товч 1 (Хууль зүйн тусламж авах)"
          value={content.ctaExplore}
          onChange={(v) => set("ctaExplore", v)}
        />
        <FieldRow
          label="Товч 2 (Өмгөөлөгч хайх)"
          value={content.ctaStart}
          onChange={(v) => set("ctaStart", v)}
        />
        <FieldRow
          label="AI бичих талбарын placeholder"
          value={content.aiComposerPlaceholder}
          onChange={(v) => set("aiComposerPlaceholder", v)}
        />
      </Section>

      <Section title="Платформын боломжууд (Experiences)">
        <HomepageImageDropzone {...sectionImageProps("experiences", "Энэ хэсгийн зураг")} />
        <FieldRow
          label="Эйброу"
          value={content.experiencesEyebrow}
          onChange={(v) => set("experiencesEyebrow", v)}
        />
        <FieldRow
          label="Гарчиг"
          value={content.experiencesTitle}
          onChange={(v) => set("experiencesTitle", v)}
        />
        <FieldRow
          label="Үргэлжлүүлэх товч"
          value={content.experiencesContinue}
          onChange={(v) => set("experiencesContinue", v)}
        />
        <ObjectListField
          label="Карт жагсаалт"
          items={content.experiences}
          onChange={(items) => set("experiences", items)}
          fields={[
            { key: "title", label: "Гарчиг" },
            { key: "audience", label: "Зорилтот бүлэг" },
            { key: "description", label: "Тайлбар", multiline: true },
          ]}
          emptyItem={{ title: "", audience: "", description: "" }}
        />
      </Section>

      <Section title="Экосистем (одоогоор нүүр хуудсанд ашиглагдахгүй байгаа хэсэг)">
        <FieldRow
          label="Эйброу"
          value={content.ecosystemEyebrow}
          onChange={(v) => set("ecosystemEyebrow", v)}
        />
        <FieldRow
          label="Гарчиг"
          value={content.ecosystemTitle}
          onChange={(v) => set("ecosystemTitle", v)}
        />
        <FieldRow
          label="Тайлбар"
          value={content.ecosystemSupport}
          multiline
          onChange={(v) => set("ecosystemSupport", v)}
        />
        <FieldRow
          label="Төв нэр (Hub)"
          value={content.ecosystemHub}
          onChange={(v) => set("ecosystemHub", v)}
        />
        <FieldRow
          label="Төвийн дэд гарчиг"
          value={content.ecosystemHubSub}
          onChange={(v) => set("ecosystemHubSub", v)}
        />
        <FieldRow
          label="AI нэр"
          value={content.ecosystemAi}
          onChange={(v) => set("ecosystemAi", v)}
        />
        <div className="grid gap-3">
          <Label className="text-xs text-muted-foreground">Салбарууд</Label>
          {content.ecosystemBranches.map((branch, index) => (
            <div key={index} className="grid gap-2 rounded-lg border p-3">
              <FieldRow
                label="Салбарын нэр"
                value={branch.title}
                onChange={(v) => {
                  const next = [...content.ecosystemBranches];
                  next[index] = { ...next[index], title: v };
                  set("ecosystemBranches", next);
                }}
              />
              <StringListField
                label="Дэд зүйлүүд"
                items={branch.items}
                onChange={(items) => {
                  const next = [...content.ecosystemBranches];
                  next[index] = { ...next[index], items };
                  set("ecosystemBranches", next);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() =>
                  set(
                    "ecosystemBranches",
                    content.ecosystemBranches.filter((_, i) => i !== index),
                  )
                }
              >
                Энэ салбарыг устгах
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() =>
              set("ecosystemBranches", [
                ...content.ecosystemBranches,
                { title: "", items: [""] },
              ])
            }
          >
            + Салбар нэмэх
          </Button>
        </div>
      </Section>

      <Section title="TORE Legal AI">
        <HomepageImageDropzone {...sectionImageProps("legal-ai", "Энэ хэсгийн зураг")} />
        <FieldRow
          label="Эйброу"
          value={content.aiEyebrow}
          onChange={(v) => set("aiEyebrow", v)}
        />
        <FieldRow
          label="Гарчиг"
          value={content.aiTitle}
          onChange={(v) => set("aiTitle", v)}
        />
        <FieldRow
          label="Тайлбар"
          value={content.aiSupport}
          multiline
          onChange={(v) => set("aiSupport", v)}
        />
        <FieldRow
          label="Дэлгэрэнгүй тайлбар"
          value={content.aiSupportDetail}
          multiline
          onChange={(v) => set("aiSupportDetail", v)}
        />
        <FieldRow
          label="Анхааруулга"
          value={content.aiDisclaimer}
          multiline
          onChange={(v) => set("aiDisclaimer", v)}
        />
        <FieldRow
          label="Чиглэлийн тайлбар"
          value={content.aiDirection}
          onChange={(v) => set("aiDirection", v)}
        />
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">
            Итгэлцлийн урсгал (яг 3 алхам)
          </Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {content.aiTrustFlow.map((step, index) => (
              <Input
                key={index}
                value={step}
                onChange={(e) => {
                  const next = [...content.aiTrustFlow] as [
                    string,
                    string,
                    string,
                  ];
                  next[index] = e.target.value;
                  set("aiTrustFlow", next);
                }}
              />
            ))}
          </div>
        </div>
        <StringListField
          label="Табууд"
          items={content.aiTabs}
          onChange={(items) => set("aiTabs", items)}
        />
        <FieldRow
          label="Жишээ асуулт"
          value={content.aiPrompt}
          multiline
          onChange={(v) => set("aiPrompt", v)}
        />
        <FieldRow
          label="Жишээ хариу"
          value={content.aiConclusion}
          multiline
          onChange={(v) => set("aiConclusion", v)}
        />
        <FieldRow
          label="Эшлэл"
          value={content.aiCitation}
          onChange={(v) => set("aiCitation", v)}
        />
        <FieldRow
          label="Эх сурвалж"
          value={content.aiSource}
          onChange={(v) => set("aiSource", v)}
        />
        <FieldRow
          label="Итгэмжлэлийн тэмдэглэл"
          value={content.aiConfidence}
          onChange={(v) => set("aiConfidence", v)}
        />
        <FieldRow
          label="Эрх бүхий тайлбар"
          value={content.aiAuthority}
          onChange={(v) => set("aiAuthority", v)}
        />
        <FieldRow
          label="AI илгээх товч"
          value={content.aiComposerSubmit}
          onChange={(v) => set("aiComposerSubmit", v)}
        />
        <FieldRow
          label="Зочны тэмдэглэл"
          value={content.aiComposerGuestHint}
          onChange={(v) => set("aiComposerGuestHint", v)}
        />
      </Section>

      <Section title="Мэдлэгийн сан (Knowledge)">
        <HomepageImageDropzone {...sectionImageProps("knowledge", "Энэ хэсгийн зураг")} />
        <FieldRow
          label="Эйброу"
          value={content.knowledgeEyebrow}
          onChange={(v) => set("knowledgeEyebrow", v)}
        />
        <FieldRow
          label="Гарчиг"
          value={content.knowledgeTitle}
          onChange={(v) => set("knowledgeTitle", v)}
        />
        <FieldRow
          label="Тайлбар"
          value={content.knowledgeSupport}
          multiline
          onChange={(v) => set("knowledgeSupport", v)}
        />
        <FieldRow
          label="Зарчим"
          value={content.knowledgePrinciple}
          multiline
          onChange={(v) => set("knowledgePrinciple", v)}
        />
        <FieldRow
          label="Чиглэл"
          value={content.knowledgeDirection}
          onChange={(v) => set("knowledgeDirection", v)}
        />
        <StringListField
          label="Эх сурвалжууд"
          items={content.knowledgeSources}
          onChange={(items) => set("knowledgeSources", items)}
        />
      </Section>

      <Section title="Ажлын талбар (Workspace)">
        <HomepageImageDropzone {...sectionImageProps("workspace", "Энэ хэсгийн зураг")} />
        <FieldRow
          label="Эйброу"
          value={content.workspaceEyebrow}
          onChange={(v) => set("workspaceEyebrow", v)}
        />
        <FieldRow
          label="Гарчиг"
          value={content.workspaceTitle}
          multiline
          onChange={(v) => set("workspaceTitle", v)}
        />
        <FieldRow
          label="Тайлбар"
          value={content.workspaceSupport}
          multiline
          onChange={(v) => set("workspaceSupport", v)}
        />
        <FieldRow
          label="Чиглэлийн тайлбар"
          value={content.workspaceDirection}
          multiline
          onChange={(v) => set("workspaceDirection", v)}
        />
        <StringListField
          label="Модулиуд"
          items={content.workspaceModules}
          onChange={(items) => set("workspaceModules", items)}
        />
      </Section>

      <Section title="Зах зээл (Marketplace)">
        <HomepageImageDropzone {...sectionImageProps("marketplace", "Энэ хэсгийн зураг")} />
        <FieldRow
          label="Эйброу"
          value={content.marketEyebrow}
          onChange={(v) => set("marketEyebrow", v)}
        />
        <FieldRow
          label="Гарчиг"
          value={content.marketTitle}
          multiline
          onChange={(v) => set("marketTitle", v)}
        />
        <FieldRow
          label="Тайлбар"
          value={content.marketSupport}
          multiline
          onChange={(v) => set("marketSupport", v)}
        />
        <FieldRow
          label="Товч (Лавлах нээх)"
          value={content.marketCta}
          onChange={(v) => set("marketCta", v)}
        />
        <ObjectListField
          label="Карт жагсаалт"
          items={content.marketItems}
          onChange={(items) => set("marketItems", items)}
          fields={[
            { key: "title", label: "Гарчиг" },
            { key: "description", label: "Тайлбар", multiline: true },
          ]}
          emptyItem={{ title: "", description: "" }}
        />
      </Section>

      <Section title="Байгууллага (Enterprise)">
        <HomepageImageDropzone {...sectionImageProps("enterprise", "Энэ хэсгийн зураг")} />
        <FieldRow
          label="Эйброу"
          value={content.enterpriseEyebrow}
          onChange={(v) => set("enterpriseEyebrow", v)}
        />
        <FieldRow
          label="Гарчиг"
          value={content.enterpriseTitle}
          onChange={(v) => set("enterpriseTitle", v)}
        />
        <FieldRow
          label="Тайлбар"
          value={content.enterpriseSupport}
          multiline
          onChange={(v) => set("enterpriseSupport", v)}
        />
        <FieldRow
          label="Товч"
          value={content.enterpriseCta}
          onChange={(v) => set("enterpriseCta", v)}
        />
        <FieldRow
          label="Чиглэлийн тайлбар"
          value={content.enterpriseDirection}
          multiline
          onChange={(v) => set("enterpriseDirection", v)}
        />
        <StringListField
          label="Модулиуд"
          items={content.enterpriseModules}
          onChange={(items) => set("enterpriseModules", items)}
        />
      </Section>

      <Section title="Итгэлцэл (Trust)">
        <HomepageImageDropzone {...sectionImageProps("trust", "Энэ хэсгийн зураг")} />
        <FieldRow
          label="Эйброу"
          value={content.trustEyebrow}
          onChange={(v) => set("trustEyebrow", v)}
        />
        <FieldRow
          label="Гарчиг"
          value={content.trustTitle}
          onChange={(v) => set("trustTitle", v)}
        />
        <FieldRow
          label="Тайлбар"
          value={content.trustSupport}
          multiline
          onChange={(v) => set("trustSupport", v)}
        />
        <ObjectListField
          label="Карт жагсаалт"
          items={content.trustItems}
          onChange={(items) => set("trustItems", items)}
          fields={[
            { key: "title", label: "Гарчиг" },
            { key: "description", label: "Тайлбар", multiline: true },
          ]}
          emptyItem={{ title: "", description: "" }}
        />
      </Section>

      <Section title="Хэрхэн ажилладаг (How)">
        <HomepageImageDropzone {...sectionImageProps("how", "Энэ хэсгийн зураг")} />
        <FieldRow
          label="Эйброу"
          value={content.howEyebrow}
          onChange={(v) => set("howEyebrow", v)}
        />
        <FieldRow
          label="Гарчиг"
          value={content.howTitle}
          onChange={(v) => set("howTitle", v)}
        />
        <ObjectListField
          label="Алхмууд"
          items={content.howSteps}
          onChange={(items) => set("howSteps", items)}
          fields={[
            { key: "title", label: "Гарчиг" },
            { key: "description", label: "Тайлбар", multiline: true },
          ]}
          emptyItem={{ title: "", description: "" }}
        />
      </Section>

      <Section title="Түгээмэл асуулт (FAQ)">
        <HomepageImageDropzone {...sectionImageProps("faq", "Энэ хэсгийн зураг")} />
        <FieldRow
          label="Эйброу"
          value={content.faqEyebrow}
          onChange={(v) => set("faqEyebrow", v)}
        />
        <FieldRow
          label="Гарчиг"
          value={content.faqTitle}
          onChange={(v) => set("faqTitle", v)}
        />
        <FieldRow
          label="Тайлбар"
          value={content.faqSupport}
          multiline
          onChange={(v) => set("faqSupport", v)}
        />
        <ObjectListField
          label="Асуулт хариултууд"
          items={content.faqs}
          onChange={(items) => set("faqs", items)}
          fields={[
            { key: "q", label: "Асуулт" },
            { key: "a", label: "Хариулт", multiline: true },
          ]}
          emptyItem={{ q: "", a: "" }}
        />
      </Section>

      <Section title="Хөл (Footer)">
        <FieldRow
          label="Уриа"
          value={content.footerTagline}
          multiline
          onChange={(v) => set("footerTagline", v)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow
            label="Бүтээгдэхүүн"
            value={content.footerProduct}
            onChange={(v) => set("footerProduct", v)}
          />
          <FieldRow
            label="Бүртгэл"
            value={content.footerAccounts}
            onChange={(v) => set("footerAccounts", v)}
          />
          <FieldRow
            label="Компани"
            value={content.footerCompany}
            onChange={(v) => set("footerCompany", v)}
          />
          <FieldRow
            label="Платформ"
            value={content.footerPlatform}
            onChange={(v) => set("footerPlatform", v)}
          />
          <FieldRow
            label="Шийдэл"
            value={content.footerSolutions}
            onChange={(v) => set("footerSolutions", v)}
          />
          <FieldRow
            label="Өмгөөлөгчид"
            value={content.footerLawyers}
            onChange={(v) => set("footerLawyers", v)}
          />
          <FieldRow
            label="Байгууллага"
            value={content.footerBusinesses}
            onChange={(v) => set("footerBusinesses", v)}
          />
          <FieldRow
            label="Enterprise"
            value={content.footerEnterprise}
            onChange={(v) => set("footerEnterprise", v)}
          />
          <FieldRow
            label="Үйл ажиллагаа"
            value={content.footerHow}
            onChange={(v) => set("footerHow", v)}
          />
          <FieldRow
            label="Өмгөөлөгчийн лавлах"
            value={content.footerDirectory}
            onChange={(v) => set("footerDirectory", v)}
          />
          <FieldRow
            label="Үйлчлүүлэгчийн бүртгэл"
            value={content.footerClientReg}
            onChange={(v) => set("footerClientReg", v)}
          />
          <FieldRow
            label="Өмгөөлөгчийн бүртгэл"
            value={content.footerLawyerReg}
            onChange={(v) => set("footerLawyerReg", v)}
          />
          <FieldRow
            label="Түгээмэл асуулт"
            value={content.footerFaq}
            onChange={(v) => set("footerFaq", v)}
          />
          <FieldRow
            label="Үйлчилгээний нөхцөл"
            value={content.footerTerms}
            onChange={(v) => set("footerTerms", v)}
          />
          <FieldRow
            label="Нууцлалын бодлого"
            value={content.footerPrivacy}
            onChange={(v) => set("footerPrivacy", v)}
          />
          <FieldRow
            label="Эрхийн тэмдэглэл"
            value={content.footerRights}
            onChange={(v) => set("footerRights", v)}
          />
          <FieldRow
            label="Бүтээсэн тэмдэглэл"
            value={content.footerBuilt}
            onChange={(v) => set("footerBuilt", v)}
          />
        </div>
      </Section>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-xl border bg-background/95 p-3 backdrop-blur">
        <Button type="button" onClick={handleSave} disabled={pending}>
          {pending ? "Хадгалж байна…" : "Хадгалах"}
        </Button>
        {updatedAt ? (
          <span className="text-xs text-muted-foreground">
            Сүүлд шинэчилсэн: {new Date(updatedAt).toLocaleString("mn-MN")}
          </span>
        ) : null}
        {successNote ? (
          <span className="text-xs text-emerald-700">{successNote}</span>
        ) : null}
        {error ? (
          <span className="text-xs text-destructive">{error}</span>
        ) : null}
      </div>
    </div>

    <div className="hidden lg:block">
      <div className="sticky top-4 h-[calc(100vh-2rem)] overflow-hidden rounded-xl border bg-white">
        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">
            Урьдчилан харах — Нүүр хуудас (Монгол)
          </p>
        </div>
        <LivePreviewPanel dict={livePreviewDict} sectionImages={images} />
      </div>
    </div>
    </div>
  );
}

/* ── live preview ───────────────────────────────────────────────────── */

const PREVIEW_WIDTH = 1280;

function LivePreviewPanel({
  dict,
  sectionImages,
}: {
  dict: Dictionary;
  sectionImages: Record<HomepageSectionKey, string | null>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const updateScale = () => {
      const width = scrollEl.clientWidth;
      setScale(Math.max(0.25, Math.min(1, width / PREVIEW_WIDTH)));
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(scrollEl);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return;
    const updateHeight = () => setContentHeight(contentEl.scrollHeight);
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(contentEl);
    return () => ro.disconnect();
  });

  return (
    <div
      ref={scrollRef}
      className="h-[calc(100%-2.25rem)] overflow-y-auto overflow-x-hidden bg-[#F7F9FC]"
    >
      <div style={{ height: contentHeight * scale || undefined }}>
        <div
          ref={contentRef}
          style={{
            width: PREVIEW_WIDTH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <LandingPage
            dict={dict}
            locale="mn"
            authUser={null}
            composerMode="guest"
            exploreHref={LEGAL_AI_PATH}
            sectionImages={sectionImages}
          />
        </div>
      </div>
    </div>
  );
}
