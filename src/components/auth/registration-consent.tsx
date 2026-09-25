import Link from "next/link";

/**
 * Dedicated consent line for registration forms -- deliberately a plain
 * <label> rather than the shared shadcn Label primitive, which defaults to
 * `flex items-center gap-2`. That default is right for a short icon+text
 * pair but wrong here: it turns each text run and <Link> in this sentence
 * into a separate flex item instead of wrapping prose, which is what
 * produced the broken/jumbled consent text on mobile (confirmed at 375px
 * on production). A plain label has no such default, so the sentence wraps
 * exactly like normal text while the checkbox stays aligned via the
 * `items-start` row in the parent.
 */
export function RegistrationConsent({
  lead,
  termsLabel,
  privacyLabel,
  trail,
}: {
  lead: string;
  termsLabel: string;
  privacyLabel: string;
  trail: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <input
        id="acceptTerms"
        name="acceptTerms"
        type="checkbox"
        required
        className="mt-1 size-4 shrink-0 rounded border-input"
      />
      <label
        htmlFor="acceptTerms"
        className="text-sm leading-snug font-normal text-foreground select-none"
      >
        {lead}{" "}
        <Link href="/terms" className="text-primary underline-offset-4 hover:underline">
          {termsLabel}
        </Link>
        {", "}
        <Link href="/privacy" className="text-primary underline-offset-4 hover:underline">
          {privacyLabel}
        </Link>
        {trail}
      </label>
    </div>
  );
}
