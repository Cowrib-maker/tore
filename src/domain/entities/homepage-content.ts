import type { Locale } from "@/i18n/config";

/**
 * Editable text content for the public marketing homepage.
 * Mirrors the shape of `Dictionary["landing"]` (see @/i18n/types) —
 * admins edit the Mongolian ("mn") version; other locales are produced
 * by machine translation and stored as full overrides per locale.
 */
export type HomepageLandingContent = {
  osEyebrow: string;
  headline: string;
  support: string;
  ctaExplore: string;
  ctaStart: string;
  previewLabel: string;
  experiencesEyebrow: string;
  experiencesTitle: string;
  experiencesContinue: string;
  experiences: Array<{
    title: string;
    audience: string;
    description: string;
  }>;
  ecosystemEyebrow: string;
  ecosystemTitle: string;
  ecosystemSupport: string;
  ecosystemHub: string;
  ecosystemHubSub: string;
  ecosystemAi: string;
  ecosystemBranches: Array<{ title: string; items: string[] }>;
  aiEyebrow: string;
  aiTitle: string;
  aiSupport: string;
  aiSupportDetail: string;
  aiDisclaimer: string;
  aiDirection: string;
  aiTrustFlow: [string, string, string];
  aiTabs: string[];
  aiPrompt: string;
  aiConclusion: string;
  aiCitation: string;
  aiSource: string;
  aiConfidence: string;
  aiAuthority: string;
  aiComposerPlaceholder: string;
  aiComposerSubmit: string;
  aiComposerGuestHint: string;
  knowledgeEyebrow: string;
  knowledgeTitle: string;
  knowledgeSupport: string;
  knowledgePrinciple: string;
  knowledgeDirection: string;
  knowledgeSources: string[];
  workspaceEyebrow: string;
  workspaceTitle: string;
  workspaceSupport: string;
  workspaceDirection: string;
  workspaceModules: string[];
  marketEyebrow: string;
  marketTitle: string;
  marketSupport: string;
  marketCta: string;
  marketItems: Array<{ title: string; description: string }>;
  enterpriseEyebrow: string;
  enterpriseTitle: string;
  enterpriseSupport: string;
  enterpriseCta: string;
  enterpriseDirection: string;
  enterpriseModules: string[];
  trustEyebrow: string;
  trustTitle: string;
  trustSupport: string;
  trustItems: Array<{ title: string; description: string }>;
  howEyebrow: string;
  howTitle: string;
  howSteps: Array<{ title: string; description: string }>;
  faqEyebrow: string;
  faqTitle: string;
  faqSupport: string;
  faqs: Array<{ q: string; a: string }>;
  footerTagline: string;
  footerProduct: string;
  footerAccounts: string;
  footerCompany: string;
  footerPlatform: string;
  footerSolutions: string;
  footerLawyers: string;
  footerBusinesses: string;
  footerEnterprise: string;
  footerHow: string;
  footerDirectory: string;
  footerClientReg: string;
  footerLawyerReg: string;
  footerFaq: string;
  footerTerms: string;
  footerPrivacy: string;
  footerRights: string;
  footerBuilt: string;
};

export type HomepageContentRecord = {
  locale: Locale;
  content: HomepageLandingContent;
  updatedAt: Date;
};
