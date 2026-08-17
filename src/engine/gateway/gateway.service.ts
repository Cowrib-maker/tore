import {
  DomainLabel,
  type DomainFilterResult,
  type GatewayDependencies,
  type GatewayRequest,
  type GatewayTurn,
  type IDomainFilter,
  type IPromptBuilder,
  type IResponseFormatter,
  type IUserTypeService,
} from "./types";

/**
 * AI Gateway orchestrator for TORE Legal AI.
 *
 * Responsibilities (Single Responsibility):
 * 1. Resolve audience ({@link IUserTypeService})
 * 2. Classify domain ({@link IDomainFilter})
 * 3. Build a model prompt when the turn is legal ({@link IPromptBuilder})
 * 4. Return a unified envelope ({@link IResponseFormatter})
 *
 * This class does not call a language model and must not be inlined into
 * Next.js route handlers. Inject it from an application adapter later.
 */
export class GatewayService {
  private readonly domainFilter: IDomainFilter;
  private readonly userTypeService: IUserTypeService;
  private readonly promptBuilder: IPromptBuilder;
  private readonly responseFormatter: IResponseFormatter;

  constructor(dependencies: GatewayDependencies) {
    this.domainFilter = dependencies.domainFilter;
    this.userTypeService = dependencies.userTypeService;
    this.promptBuilder = dependencies.promptBuilder;
    this.responseFormatter = dependencies.responseFormatter;
  }

  /**
   * Runs filter → user type → prompt (legal only) → unified response.
   * The application chat adapter answers ordinary NON_LEGAL questions;
   * this method still classifies them for the unused pipeline path.
   */
  async createTurn(request: GatewayRequest): Promise<GatewayTurn> {
    const message = request.message.trim();
    const userType = this.userTypeService.resolve(request.userContext);

    if (!message) {
      return {
        domain: DomainLabel.NON_LEGAL,
        userType,
        prompt: null,
        response: this.responseFormatter.formatError({
          message: "Асуултаа оруулна уу.",
          metadata: {
            conversationId: request.conversationId ?? null,
            ...request.metadata,
          },
        }),
      };
    }

    const filterResult = await this.domainFilter.classify(message);
    const metadata = filterMetadata(filterResult, userType, request);

    if (filterResult.domain === DomainLabel.NON_LEGAL) {
      return {
        domain: DomainLabel.NON_LEGAL,
        userType,
        prompt: null,
        response: this.responseFormatter.formatOutOfDomain({ metadata }),
      };
    }

    const prompt = this.promptBuilder.build({
      message,
      userType,
      domain: DomainLabel.LEGAL,
    });

    return {
      domain: DomainLabel.LEGAL,
      userType,
      prompt,
      response: this.responseFormatter.formatLegalInformation({
        message: "",
        suggestions: [],
        citations: [],
        metadata: {
          ...metadata,
          promptReady: true,
        },
      }),
    };
  }
}

function filterMetadata(
  filterResult: DomainFilterResult,
  userType: GatewayTurn["userType"],
  request: GatewayRequest,
): Record<string, unknown> {
  return {
    domain: filterResult.domain,
    userType,
    filterMethod: filterResult.method,
    matchedRuleIds: filterResult.matchedRuleIds,
    confidence: filterResult.confidence ?? null,
    conversationId: request.conversationId ?? null,
    ...request.metadata,
  };
}
