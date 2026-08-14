import {
  DomainLabel,
  UserType,
  type IPromptBuilder,
  type PromptBuildInput,
  type PromptBundle,
} from "./types";

/**
 * Builds model prompts from domain + audience.
 *
 * This service does not call any model. A later completion adapter
 * should send {@link PromptBundle} as-is.
 */
export class PromptBuilderService implements IPromptBuilder {
  build(input: PromptBuildInput): PromptBundle {
    return {
      systemPrompt: [
        SHARED_PREAMBLE,
        audienceBlock(input.userType),
        domainBlock(input.domain),
      ].join("\n\n"),
      userPrompt: input.message.trim(),
      userType: input.userType,
      domain: input.domain,
    };
  }
}

const SHARED_PREAMBLE = `You are TORE Legal AI, an assistant for Mongolian legal information.

Rules:
- Answer in the user's language when possible (typically Mongolian).
- Use only the facts the user provided. Do not invent statutes, case names, or dates.
- If information is missing, ask a concise clarifying question.
- Do not present yourself as giving a final legal decision or a substitute for a licensed lawyer.
- When retrieval/citations are unavailable, say so instead of fabricating sources.`;

function audienceBlock(userType: UserType): string {
  switch (userType) {
    case UserType.LAWYER:
      return `Audience: licensed lawyer (LAWYER).
Use precise legal terminology, procedure, and issue-spotting.
Prefer structured analysis (facts, issues, applicable rules, gaps).
You may assume professional judgment; still flag that work product is informational.`;
    case UserType.ENTERPRISE:
      return `Audience: organization / enterprise (ENTERPRISE).
Focus on compliance, governance, operational risk, and internal policy implications.
Call out residual legal risk and when in-house or external counsel should review.`;
    case UserType.PUBLIC:
    default:
      return `Audience: member of the public (PUBLIC).
Use plain language. Avoid jargon unless you briefly explain it.
End with a reminder to consult a qualified lawyer for advice on their situation.`;
  }
}

function domainBlock(domain: DomainLabel): string {
  if (domain === DomainLabel.NON_LEGAL) {
    return `The domain filter classified this message as NON_LEGAL.
Do not answer the off-topic request. Briefly explain that TORE Legal AI only handles legal information and invite a legal question.`;
  }

  return `The domain filter classified this message as LEGAL.
Provide legal information relevant to the question. Stay within information, not representation.`;
}
