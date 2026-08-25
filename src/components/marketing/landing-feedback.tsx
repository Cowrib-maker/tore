"use client";

import { useActionState } from "react";

import { submitHomepageFeedbackAction } from "@/application/actions/homepage-feedback.actions";
import type { ActionState } from "@/application/common/action-state";
import { LandingReveal } from "@/components/marketing/landing-reveal";
import type { Dictionary } from "@/i18n/types";

const initialState: ActionState = {};

export function LandingFeedback({ home }: { home: Dictionary["publicHome"] }) {
  const [state, formAction, pending] = useActionState(
    submitHomepageFeedbackAction,
    initialState,
  );

  return (
    <section
      id="feedback"
      className="scroll-mt-24 border-b border-[#0B1F3A]/8 bg-[#F7F6F2]"
    >
      <div className="mx-auto max-w-xl px-5 py-14 sm:px-8 sm:py-16">
        <LandingReveal>
          <h2 className="font-[family-name:var(--font-landing-display)] text-[1.65rem] tracking-[-0.03em] text-[#0B1F3A] sm:text-[1.9rem]">
            {home.feedbackTitle}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#5C6570]">
            {home.feedbackLead}
          </p>
        </LandingReveal>

        <LandingReveal delayMs={40}>
          <form
            action={formAction}
            className="mt-8 space-y-4 rounded-2xl border border-[#0B1F3A]/10 bg-white p-5 sm:p-6"
          >
            {state.success ? (
              <p
                role="status"
                className="rounded-lg bg-[#E8F4F1] px-3 py-2 text-sm text-[#0F3D33]"
              >
                {home.feedbackSuccess}
              </p>
            ) : null}
            {state.error ? (
              <p
                role="alert"
                className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {state.error}
              </p>
            ) : null}

            <div className="grid gap-1.5">
              <label
                htmlFor="feedback-kind"
                className="text-[12px] font-medium text-[#5C6570]"
              >
                {home.feedbackKindLabel}
              </label>
              <select
                id="feedback-kind"
                name="kind"
                defaultValue="feedback"
                className="h-10 rounded-xl border border-[#0B1F3A]/12 bg-[#F7F6F2] px-3 text-sm text-[#0A0F14] outline-none focus:border-[#1A7A72]/50"
              >
                <option value="feedback">{home.feedbackKinds.feedback}</option>
                <option value="suggestion">
                  {home.feedbackKinds.suggestion}
                </option>
                <option value="bug">{home.feedbackKinds.bug}</option>
              </select>
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor="feedback-message"
                className="text-[12px] font-medium text-[#5C6570]"
              >
                {home.feedbackMessageLabel}
              </label>
              <textarea
                id="feedback-message"
                name="message"
                required
                minLength={10}
                maxLength={2000}
                rows={5}
                placeholder={home.feedbackMessagePlaceholder}
                className="min-h-[8rem] rounded-xl border border-[#0B1F3A]/12 bg-[#F7F6F2] px-3 py-2 text-sm text-[#0A0F14] outline-none placeholder:text-[#9AA3AD] focus:border-[#1A7A72]/50"
              />
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor="feedback-email"
                className="text-[12px] font-medium text-[#5C6570]"
              >
                {home.feedbackEmailLabel}{" "}
                <span className="font-normal text-[#8A939D]">
                  ({home.feedbackEmailOptional})
                </span>
              </label>
              <input
                id="feedback-email"
                name="email"
                type="email"
                autoComplete="email"
                className="h-10 rounded-xl border border-[#0B1F3A]/12 bg-[#F7F6F2] px-3 text-sm text-[#0A0F14] outline-none focus:border-[#1A7A72]/50"
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#0B1F3A] text-[13px] font-semibold text-white transition hover:bg-[#16365F] disabled:opacity-50"
            >
              {pending ? home.feedbackPending : home.feedbackSubmit}
            </button>
          </form>
        </LandingReveal>
      </div>
    </section>
  );
}
