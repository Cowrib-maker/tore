"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { EditableText } from "@/components/marketing/homepage-editable-text";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/i18n/types";

type FaqItem = Dictionary["landing"]["faqs"][number];

export function LandingFaq({ faqs }: { faqs: FaqItem[] }) {
  const [open, setOpen] = useState(0);

  return (
    <div className="divide-y divide-[#0B1F3A]/8 overflow-hidden rounded-2xl border border-[#0B1F3A]/10 bg-white landing-shadow-sm">
      {faqs.map((item, index) => {
        const isOpen = open === index;
        return (
          <div key={item.q} className="px-5 sm:px-6">
            <button
              type="button"
              className="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left transition-colors hover:text-[#0B1F3A] sm:py-6"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? -1 : index)}
            >
              <span className="text-[15px] font-semibold tracking-tight text-[#0A0F14] sm:text-base">
                <EditableText path={`faqs.${index}.q`}>{item.q}</EditableText>
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-[#5A6B64] transition-transform duration-300 ease-out",
                  isOpen && "rotate-180 text-[#0B1F3A]",
                )}
              />
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <p className="pb-5 pr-8 text-sm leading-relaxed text-[#5A6B64] sm:pb-6 sm:text-[15px]">
                  <EditableText path={`faqs.${index}.a`}>{item.a}</EditableText>
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
