import {
  GatewayResponseType,
  type GatewayCitation,
  type GatewayResponse,
  type IResponseFormatter,
} from "./types";

const DEFAULT_OUT_OF_DOMAIN_MESSAGE =
  "TORE Legal AI хууль зүйн мэдээлэлд зориулагдсан. Хууль, гэрээ, шүүх, эрх зүйн асуултаа бичнэ үү.";

const DEFAULT_OUT_OF_DOMAIN_SUGGESTIONS = [
  "Миний хөдөлмөрийн гэрээнд ямар заалт анхаарах вэ?",
  "Гэрээ цуцлахдаа ямар хууль хамаарах вэ?",
  "Өмгөөлөгчтэй хэрхэн холбогдох вэ?",
];

/**
 * Builds the unified gateway response object.
 *
 * All user-visible envelopes should pass through this class so clients
 * always receive the same shape.
 */
export class ResponseFormatterService implements IResponseFormatter {
  formatLegalInformation(input: {
    message: string;
    suggestions?: string[];
    citations?: GatewayCitation[];
    metadata?: Record<string, unknown>;
  }): GatewayResponse {
    return createResponse({
      success: true,
      type: GatewayResponseType.LEGAL_INFORMATION,
      message: input.message,
      suggestions: input.suggestions,
      citations: input.citations,
      metadata: input.metadata,
    });
  }

  formatOutOfDomain(input: {
    message?: string;
    suggestions?: string[];
    metadata?: Record<string, unknown>;
  } = {}): GatewayResponse {
    return createResponse({
      success: true,
      type: GatewayResponseType.OUT_OF_DOMAIN,
      message: input.message ?? DEFAULT_OUT_OF_DOMAIN_MESSAGE,
      suggestions: input.suggestions ?? DEFAULT_OUT_OF_DOMAIN_SUGGESTIONS,
      metadata: input.metadata,
    });
  }

  formatError(input: {
    message: string;
    metadata?: Record<string, unknown>;
  }): GatewayResponse {
    return createResponse({
      success: false,
      type: GatewayResponseType.GATEWAY_ERROR,
      message: input.message,
      metadata: input.metadata,
    });
  }
}

function createResponse(input: {
  success: boolean;
  type: GatewayResponse["type"];
  message: string;
  suggestions?: string[];
  citations?: GatewayCitation[];
  metadata?: Record<string, unknown>;
}): GatewayResponse {
  return {
    success: input.success,
    type: input.type,
    message: input.message,
    suggestions: input.suggestions ?? [],
    citations: input.citations ?? [],
    metadata: input.metadata ?? {},
  };
}
