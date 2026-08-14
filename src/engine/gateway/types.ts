/**
 * Shared contracts for the TORE Legal AI Gateway.
 *
 * These types are the stable boundary between the engine and future
 * HTTP adapters. Routes must depend on these contracts, not on
 * concrete filter/prompt implementations.
 */

/** Classification of whether a user message belongs in the legal product. */
export const DomainLabel = {
  LEGAL: "LEGAL",
  NON_LEGAL: "NON_LEGAL",
} as const;

export type DomainLabel = (typeof DomainLabel)[keyof typeof DomainLabel];

/** Audience the gateway should write for. */
export const UserType = {
  PUBLIC: "PUBLIC",
  LAWYER: "LAWYER",
  ENTERPRISE: "ENTERPRISE",
} as const;

export type UserType = (typeof UserType)[keyof typeof UserType];

/** Unified envelope `type` values returned to clients. */
export const GatewayResponseType = {
  LEGAL_INFORMATION: "LEGAL_INFORMATION",
  OUT_OF_DOMAIN: "OUT_OF_DOMAIN",
  GATEWAY_ERROR: "GATEWAY_ERROR",
} as const;

export type GatewayResponseType =
  (typeof GatewayResponseType)[keyof typeof GatewayResponseType];

/**
 * How a domain decision was produced. Rule-based today; a classifier
 * model can report `model` without changing callers.
 */
export type DomainFilterMethod = "rule" | "model";

/** One expandable matching rule used by the rule-based domain filter. */
export type DomainFilterRule = {
  /** Stable identifier for logs, tests, and later model training labels. */
  id: string;
  /** Domain assigned when the rule matches. Defaults to LEGAL. */
  domain?: DomainLabel;
  /** Return true when the normalized user message matches this rule. */
  test: (normalizedMessage: string) => boolean;
};

/** Result of {@link IDomainFilter.classify}. */
export type DomainFilterResult = {
  domain: DomainLabel;
  method: DomainFilterMethod;
  /** Rule ids or model labels that contributed to the decision. */
  matchedRuleIds: string[];
  /** Optional score in `[0, 1]` for future classifier backends. */
  confidence?: number;
};

/**
 * Minimal identity context for resolving {@link UserType}.
 * Keep this free of Prisma/session types so the gateway stays portable.
 */
export type UserTypeContext = {
  /** Explicit override from the application layer. */
  userType?: UserType;
  /** Application role, e.g. `CLIENT`, `LAWYER`, `ADMIN`. */
  role?: string | null;
  /** True when the caller is in an organization workspace. */
  isEnterprise?: boolean;
  organizationId?: string | null;
};

/** Source locator attached to a legal answer. Empty until retrieval is wired. */
export type GatewayCitation = {
  title?: string;
  url?: string;
  locator?: string;
  source?: string;
};

/**
 * Unified client-facing gateway response.
 *
 * Routes should return this object (or map it 1:1) and must not
 * assemble legal copy themselves.
 */
export type GatewayResponse = {
  success: boolean;
  type: GatewayResponseType;
  message: string;
  suggestions: string[];
  citations: GatewayCitation[];
  metadata: Record<string, unknown>;
};

/** Inputs used to build a model prompt. No model is invoked here. */
export type PromptBuildInput = {
  message: string;
  userType: UserType;
  domain: DomainLabel;
};

/** Prompt payload a future completion adapter can send to a model. */
export type PromptBundle = {
  systemPrompt: string;
  userPrompt: string;
  userType: UserType;
  domain: DomainLabel;
};

/** Inbound gateway request from an application adapter (not a route). */
export type GatewayRequest = {
  message: string;
  userContext?: UserTypeContext;
  conversationId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Orchestrator output. For LEGAL turns, `prompt` is ready for a model
 * adapter that has not been connected yet. Chat routes stay unchanged.
 */
export type GatewayTurn = {
  domain: DomainLabel;
  userType: UserType;
  prompt: PromptBundle | null;
  response: GatewayResponse;
};

/** Port: decide LEGAL vs NON_LEGAL. Swap the implementation for a classifier. */
export interface IDomainFilter {
  classify(
    message: string,
  ): DomainFilterResult | Promise<DomainFilterResult>;
}

/** Port: map caller context to a gateway user type. */
export interface IUserTypeService {
  resolve(context?: UserTypeContext): UserType;
}

/** Port: build system/user prompts from domain + audience. */
export interface IPromptBuilder {
  build(input: PromptBuildInput): PromptBundle;
}

/** Port: assemble the unified {@link GatewayResponse}. */
export interface IResponseFormatter {
  formatLegalInformation(input: {
    message: string;
    suggestions?: string[];
    citations?: GatewayCitation[];
    metadata?: Record<string, unknown>;
  }): GatewayResponse;
  formatOutOfDomain(input?: {
    message?: string;
    suggestions?: string[];
    metadata?: Record<string, unknown>;
  }): GatewayResponse;
  formatError(input: {
    message: string;
    metadata?: Record<string, unknown>;
  }): GatewayResponse;
}

/** Constructor dependencies for {@link GatewayService}. */
export type GatewayDependencies = {
  domainFilter: IDomainFilter;
  userTypeService: IUserTypeService;
  promptBuilder: IPromptBuilder;
  responseFormatter: IResponseFormatter;
};
