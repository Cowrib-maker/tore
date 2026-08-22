import { z } from "zod";

const text = z.string().trim().min(1).max(4000);
const shortText = z.string().trim().min(1).max(400);
const stringList = z.array(shortText).min(1).max(20);

const experienceItem = z.object({
  title: shortText,
  audience: shortText,
  description: text,
});

const ecosystemBranchItem = z.object({
  title: shortText,
  items: stringList,
});

const titledItem = z.object({
  title: shortText,
  description: text,
});

const stepItem = z.object({
  title: shortText,
  description: text,
});

const faqItem = z.object({
  q: shortText,
  a: text,
});

export const homepageContentSchema = z.object({
  osEyebrow: shortText,
  headline: shortText,
  support: text,
  ctaExplore: shortText,
  ctaStart: shortText,
  previewLabel: shortText,
  experiencesEyebrow: shortText,
  experiencesTitle: shortText,
  experiencesContinue: shortText,
  experiences: z.array(experienceItem).min(1).max(12),
  ecosystemEyebrow: shortText,
  ecosystemTitle: shortText,
  ecosystemSupport: text,
  ecosystemHub: shortText,
  ecosystemHubSub: shortText,
  ecosystemAi: shortText,
  ecosystemBranches: z.array(ecosystemBranchItem).min(1).max(12),
  aiEyebrow: shortText,
  aiTitle: shortText,
  aiSupport: text,
  aiSupportDetail: text,
  aiDisclaimer: text,
  aiDirection: shortText,
  aiTrustFlow: z.tuple([shortText, shortText, shortText]),
  aiTabs: stringList,
  aiPrompt: text,
  aiConclusion: text,
  aiCitation: shortText,
  aiSource: shortText,
  aiConfidence: shortText,
  aiAuthority: shortText,
  aiComposerPlaceholder: shortText,
  aiComposerSubmit: shortText,
  aiComposerGuestHint: shortText,
  knowledgeEyebrow: shortText,
  knowledgeTitle: shortText,
  knowledgeSupport: text,
  knowledgePrinciple: text,
  knowledgeDirection: shortText,
  knowledgeSources: stringList,
  workspaceEyebrow: shortText,
  workspaceTitle: shortText,
  workspaceSupport: text,
  workspaceDirection: text,
  workspaceModules: stringList,
  marketEyebrow: shortText,
  marketTitle: shortText,
  marketSupport: text,
  marketCta: shortText,
  marketItems: z.array(titledItem).min(1).max(12),
  enterpriseEyebrow: shortText,
  enterpriseTitle: shortText,
  enterpriseSupport: text,
  enterpriseCta: shortText,
  enterpriseDirection: text,
  enterpriseModules: stringList,
  trustEyebrow: shortText,
  trustTitle: shortText,
  trustSupport: text,
  trustItems: z.array(titledItem).min(1).max(12),
  howEyebrow: shortText,
  howTitle: shortText,
  howSteps: z.array(stepItem).min(1).max(12),
  faqEyebrow: shortText,
  faqTitle: shortText,
  faqSupport: text,
  faqs: z.array(faqItem).min(1).max(20),
  footerTagline: text,
  footerProduct: shortText,
  footerAccounts: shortText,
  footerCompany: shortText,
  footerPlatform: shortText,
  footerSolutions: shortText,
  footerLawyers: shortText,
  footerBusinesses: shortText,
  footerEnterprise: shortText,
  footerHow: shortText,
  footerDirectory: shortText,
  footerClientReg: shortText,
  footerLawyerReg: shortText,
  footerFaq: shortText,
  footerTerms: shortText,
  footerPrivacy: shortText,
  footerRights: shortText,
  footerBuilt: shortText,
});

export type HomepageContentFormInput = z.infer<typeof homepageContentSchema>;
