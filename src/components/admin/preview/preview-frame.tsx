import type { ReactNode } from "react";

import { PreviewNetworkGuard } from "@/components/admin/preview/preview-network-guard";
import { UserRole } from "@/domain/enums";
import type { PreviewContentMode, PreviewContext, PreviewPageId } from "@/domain/admin-preview/scenarios";
import { PREVIEW_PAGES } from "@/domain/admin-preview/scenarios";

/**
 * Wraps a real component in a read-only preview. `inert` makes the whole subtree non-interactive (no clicks, no keyboard focus,
 * no form submission, no navigation), so a preview can never trigger a payment, e-mail, upload or any other server action.
 * The banner states the selected role and mode in plain text — it is never hidden or ambiguous.
 */
export function PreviewFrame({
  page,
  context,
  locale,
  content,
  children,
}: {
  page: PreviewPageId;
  context: PreviewContext;
  locale: string;
  content: PreviewContentMode;
  children: ReactNode;
}) {
  return (
    <div data-preview-frame data-preview-context={context.id} data-preview-content={content}>
      <div role="status" className="sticky top-0 z-50 border-b border-amber-400 bg-amber-100 px-4 py-2 text-sm text-amber-950">
        <strong>УРЬДЧИЛАН ХАРАХ</strong> · Хуудас: {PREVIEW_PAGES[page].title.mn} · Дүр: <strong>{context.label.mn}</strong> · Хэл: {locale.toUpperCase()} ·
        Агуулга: <strong>{content === "draft" ? "НООРОГ (нийтлэгдээгүй)" : "нийтлэгдсэн"}</strong>
        <span className="block text-xs">
          Синтетик жишээ өгөгдөл. Товчлуур, маягт ажиллахгүй; төлбөр, имэйл, лиценз, байршуулалт хийгдэхгүй; жинхэнэ хэрэглэгчийн мэдээлэл өөрчлөгдөхгүй.
        </span>
      </div>
      <PreviewNetworkGuard audience={context.role === UserRole.LAWYER ? "lawyer" : "citizen"} />
      <div inert aria-label="Урьдчилан харах агуулга">
        {children}
      </div>
    </div>
  );
}
