/**
 * TORE Legal AI Gateway.
 *
 * Public surface for application adapters. Do not import concrete
 * services from route files — depend on {@link GatewayService} and
 * {@link createLegalAiGateway} instead.
 */

import { RuleBasedDomainFilter } from "./domain-filter.service";
import { GatewayService } from "./gateway.service";
import { PromptBuilderService } from "./prompt-builder.service";
import { ResponseFormatterService } from "./response-formatter.service";
import type { GatewayDependencies } from "./types";
import { UserTypeService } from "./user-type.service";

export {
  DomainLabel,
  GatewayResponseType,
  PromptTurnKind,
  UserType,
} from "./types";
export type {
  DomainFilterMethod,
  DomainFilterResult,
  DomainFilterRule,
  GatewayCitation,
  GatewayDependencies,
  GatewayRequest,
  GatewayResponse,
  GatewayTurn,
  IDomainFilter,
  IPromptBuilder,
  IResponseFormatter,
  IUserTypeService,
  PromptBuildInput,
  PromptBundle,
  UserTypeContext,
  VerifiedLegalAuthority,
} from "./types";

export {
  DEFAULT_LEGAL_TERMS,
  RuleBasedDomainFilter,
  createTermRules,
  normalizeMessage,
} from "./domain-filter.service";
export { UserTypeService } from "./user-type.service";
export { PromptBuilderService } from "./prompt-builder.service";
export { ResponseFormatterService } from "./response-formatter.service";
export { GatewayService } from "./gateway.service";

/**
 * Composition root for the default production wiring.
 * Pass partial `overrides` in tests to substitute any collaborator.
 */
export function createLegalAiGateway(
  overrides: Partial<GatewayDependencies> = {},
): GatewayService {
  return new GatewayService({
    domainFilter: overrides.domainFilter ?? new RuleBasedDomainFilter(),
    userTypeService: overrides.userTypeService ?? new UserTypeService(),
    promptBuilder: overrides.promptBuilder ?? new PromptBuilderService(),
    responseFormatter:
      overrides.responseFormatter ?? new ResponseFormatterService(),
  });
}
