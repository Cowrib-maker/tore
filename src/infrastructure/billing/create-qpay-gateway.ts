import { env } from "@/lib/env";
import type { QpayGateway } from "@/domain/ports/qpay-gateway";
import { readQpayConfig } from "@/infrastructure/billing/qpay-config";
import { QpayHttpGateway } from "@/infrastructure/billing/qpay-http-gateway";

export function createQpayGateway(): QpayGateway {
  return new QpayHttpGateway(readQpayConfig(env));
}

export function qpayCallbackUrl(): string {
  return readQpayConfig(env).callbackUrl;
}
