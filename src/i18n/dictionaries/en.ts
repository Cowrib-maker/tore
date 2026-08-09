import type { Dictionary } from "@/i18n/types";
import { marketplaceEn } from "@/i18n/dictionaries/marketplace/en";

/**
 * Canonical EN copy. Keep terms aligned across locales:
 * client · lawyer · counsel · credential review · consultation ·
 * consultation request · offering · directory · listing · fee
 */
export const en: Dictionary = {
  meta: {
    title: "TORE — Legal Marketplace · Mongolia",
    description:
      "Request consultations with verified lawyers in Mongolia. Transparent fees, credential review, and a clear booking process.",
  },
  common: {
    brand: "TORE",
    signIn: "Sign in",
    signOut: "Sign out",
    getStarted: "Get started",
    language: "Language",
  },
  nav: {
    lawyers: "Find a lawyer",
    howItWorks: "How it works",
    trust: "Trust & safety",
    faq: "FAQ",
  },
  landing: {
    eyebrow: "Legal marketplace · Mongolia",
    headline: "Engage verified counsel. Request a consultation with clarity.",
    support:
      "TORE connects clients with licensed lawyers in Mongolia — review fees upfront, compare verified listings, and submit a consultation request online.",
    ctaFind: "Browse lawyers",
    ctaJoin: "Register as a lawyer",
    proofProfiles: "Credential-reviewed listings",
    proofRating: "Fixed fees disclosed upfront",
    proofBilingual: "MN · EN · ZH · KO",
    proofAvatars:
      "Built for clients seeking counsel and lawyers publishing verified consultation offerings.",
    featuredEyebrow: "Illustrative profiles",
    featuredTitle: "Clear profiles. Clear fees. Clear next steps.",
    featuredSupport:
      "These illustrations show what clients see after a lawyer completes credential review, appears in the directory, and publishes a consultation offering. Open the public directory for current listings.",
    browseAll: "Open the directory",
    verified: "Verified",
    book: "View",
    profile: "Profile",
    nextSlot: "Availability",
    fromPrice: "from",
    howEyebrow: "How it works",
    howTitle: "From registration to consultation request.",
    howSteps: [
      {
        title: "Create an account",
        description:
          "Register as a client seeking legal advice, or as a lawyer ready to publish consultation offerings.",
      },
      {
        title: "Complete verification",
        description:
          "Lawyers submit credentials for review. Clients confirm contact details and email address.",
      },
      {
        title: "Discover and request",
        description:
          "Browse verified directory listings with published fees and availability, then submit a consultation request.",
      },
    ],
    trustEyebrow: "Trust & safety",
    trustTitle: "Accountable legal discovery, by design.",
    trustSupport:
      "TORE does not publish anonymous lawyer listings. Credential review, transparent offerings, and authenticated consultation requests form the foundation of the marketplace.",
    trustItems: [
      {
        title: "Credential review",
        description:
          "Public listing requires approved credentials and at least one active consultation offering.",
      },
      {
        title: "Secure access",
        description:
          "Role-based workspaces keep client and lawyer activity separate and authenticated.",
      },
      {
        title: "Transparent offerings",
        description:
          "Duration, fee in MNT, and online or in-person format are visible before you submit a request.",
      },
      {
        title: "Multilingual by design",
        description:
          "Preferred language is recorded at registration to serve Mongolia’s multilingual users.",
      },
    ],
    testimonialsEyebrow: "Who TORE serves",
    testimonialsTitle: "Built for serious legal work in Mongolia.",
    testimonials: [
      {
        quote:
          "Clients require a reliable way to identify licensed counsel, understand the fee, and request time without informal back-and-forth.",
        name: "For clients",
        role: "Individuals and organisations seeking legal advice",
      },
      {
        quote:
          "Lawyers require a structured channel to publish offerings, set availability, and accept or decline requests professionally.",
        name: "For lawyers",
        role: "Licensed practitioners and counsel",
      },
      {
        quote:
          "Verification and clarity are the foundation of the marketplace. Transparent discovery comes before broader commercial capabilities.",
        name: "Operating principle",
        role: "Verification before expansion",
      },
    ],
    faqEyebrow: "FAQ",
    faqTitle: "Questions before you begin.",
    faqSupport:
      "Create an account to access your workspace. You may browse verified lawyers in the public directory at any time.",
    faqs: [
      {
        q: "Who may list as a lawyer on TORE?",
        a: "Licensed practitioners who register, accept the marketplace terms, complete credential review, and publish an active consultation offering may request public listing.",
      },
      {
        q: "How are consultation fees presented?",
        a: "Lawyers publish offerings with a stated duration and a fixed fee in MNT. That fee is shown before you submit a consultation request.",
      },
      {
        q: "Which languages does TORE support?",
        a: "The interface is available in Mongolian, English, Chinese, and Korean. Your preferred language is stored on your account.",
      },
      {
        q: "May I request a consultation today?",
        a: "Yes. After signing in as a client, open a verified lawyer’s profile, select an offering and available time, and submit a request. The lawyer accepts or declines; you receive an in-app notification.",
      },
    ],
    ctaTitle: "Choose the appropriate next step.",
    ctaSupport:
      "Clients browse verified lawyers and request consultations. Lawyers complete credential review and publish offerings. One marketplace for transparent legal access in Mongolia.",
    ctaClient: "Create a client account",
    ctaLawyer: "Create a lawyer account",
    footerTagline:
      "Verified counsel, transparent fees, and a clear consultation request process — for Mongolia.",
    footerProduct: "Product",
    footerAccounts: "Accounts",
    footerCompany: "Company",
    footerFeatured: "Illustrative profiles",
    footerHow: "How it works",
    footerTrust: "Trust & safety",
    footerClientReg: "Client registration",
    footerLawyerReg: "Lawyer registration",
    footerFaq: "FAQ",
    footerTerms: "Terms of Service",
    footerPrivacy: "Privacy Policy",
    footerRights: "All rights reserved.",
    footerBuilt: "Serving Mongolia · MN / EN / ZH / KO",
    lawyers: [
      {
        initials: "CC",
        name: "Corporate counsel",
        role: "Illustration · Commercial practice",
        focus: ["Contracts", "Governance", "M&A"],
        rating: "",
        reviews: 0,
        price: "180,000 ₮",
        duration: "60 min",
        city: "Ulaanbaatar",
        available: "Weekly schedule",
        tone: "from-[#E4EFEB] to-[#C9DED6]",
      },
      {
        initials: "FC",
        name: "Family counsel",
        role: "Illustration · Family practice",
        focus: ["Mediation", "Agreements", "Advisory"],
        rating: "",
        reviews: 0,
        price: "120,000 ₮",
        duration: "45 min",
        city: "Ulaanbaatar",
        available: "Weekly schedule",
        tone: "from-[#E8ECEF] to-[#D2D9E0]",
      },
      {
        initials: "EC",
        name: "Employment counsel",
        role: "Illustration · Labour practice",
        focus: ["Disputes", "Compliance", "Advisory"],
        rating: "",
        reviews: 0,
        price: "220,000 ₮",
        duration: "90 min",
        city: "Regional coverage",
        available: "Weekly schedule",
        tone: "from-[#EEE8E1] to-[#DDD2C4]",
      },
    ],
    mockup: {
      urlBar: "tore.mn/lawyers · Verified counsel",
      matching: "Directory",
      matchingTitle: "Verified listings only",
      availableCount: "Filtered results",
      bookTitle: "Request consultation",
      thisWeek: "This week",
      confirm: "Submit request · fee disclosed upfront",
      verifiedTitle: "Credentials reviewed",
      verifiedBody:
        "Public listing requires approved credentials and an active consultation offering.",
      weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      rows: [
        {
          initials: "CC",
          name: "Corporate counsel",
          focus: "Contracts · Governance",
          rating: "",
          reviews: "",
          price: "180,000 ₮",
          tone: "bg-[#E4EFEB] text-[#0F3D33]",
        },
        {
          initials: "FC",
          name: "Family counsel",
          focus: "Mediation · Agreements",
          rating: "",
          reviews: "",
          price: "120,000 ₮",
          tone: "bg-[#E8ECF2] text-[#0A0F14]",
        },
        {
          initials: "EC",
          name: "Employment counsel",
          focus: "Labour · Compliance",
          rating: "",
          reviews: "",
          price: "220,000 ₮",
          tone: "bg-[#EEE8E1] text-[#0A0F14]",
        },
      ],
    },
  },
  auth: {
    loginTitle: "Sign in to TORE",
    loginDescription:
      "Access your client or lawyer workspace on Mongolia’s legal marketplace.",
    email: "Email",
    password: "Password",
    signingIn: "Signing in…",
    signInSubmit: "Sign in",
    forgotPassword: "Forgot password?",
    resendTitle: "Resend verification email",
    resendDescription:
      "If your email address is not yet confirmed, enter it below to receive a new verification link.",
    resendSubmit: "Resend verification email",
    resendSending: "Sending…",
    verifyTitleSuccess: "Email confirmed",
    verifyTitleError: "Verification unsuccessful",
    verifySuccess: "{email} has been verified. You may sign in.",
    verifyFailed:
      "This link is invalid or has expired. Request a new verification email from the sign-in page.",
    verifyMissingToken: "A valid verification token is required to open this page.",
    verifyResendHint: "Return to sign-in to request a new verification email.",
    newToTore: "New to TORE?",
    registerClientLink: "Register as a client",
    registerLawyerLink: "Register as a lawyer",
    clientTitle: "Create a client account",
    clientDescription:
      "Find verified lawyers, review consultation fees, and submit appointment requests.",
    lawyerTitle: "Create a lawyer account",
    lawyerDescription:
      "Complete credential review, publish consultation offerings, and respond to booking requests.",
    fullName: "Full legal name",
    namePlaceholder: "As it appears on official documents",
    emailPlaceholder: "name@example.com",
    passwordHint:
      "Minimum 8 characters, including one uppercase letter and one number.",
    preferredLanguage: "Preferred language",
    acceptTerms:
      "I accept the Terms of Service, Privacy Policy, and Marketplace Disclaimer.",
    creating: "Creating account…",
    createClient: "Create client account",
    createLawyer: "Create lawyer account",
    areYouLawyer: "Are you a lawyer?",
    registerAsLawyer: "Register as a lawyer",
    areYouClient: "Seeking legal counsel?",
    registerAsClient: "Register as a client",
    alreadyHave: "Already have an account?",
    forgotTitle: "Password recovery",
    forgotDescription:
      "Self-service password reset is not available. Contact support with your registered email address if you require assistance restoring access.",
    sendReset: "Contact support",
    sending: "Please wait…",
    backToSignIn: "Back to sign in",
  },
  dashboard: {
    clientTitle: "Client workspace",
    lawyerTitle: "Lawyer workspace",
    adminTitle: "Administration",
    profileTitle: "Profile",
    navDashboard: "Overview",
    navProfile: "Profile",
    navBookings: "Bookings",
    navNotifications: "Notifications",
    navFindLawyers: "Find lawyers",
    navVerification: "Verification",
    navOfferings: "Offerings",
    navAvailability: "Availability",
    navLawyerReview: "Credential review",
    pageOfferings: "Consultation offerings",
    pageAvailability: "Availability",
    pageBookings: "Bookings",
    pageNotifications: "Notifications",
    pageVerification: "Credential verification",
    signOut: "Sign out",
  },
  marketplace: marketplaceEn,
};
