import { env } from "@/lib/env";
import type { QpayGateway } from "@/domain/ports/qpay-gateway";
import {
  isQpayConfigured as qpayEnvIsConfigured,
  readQpayConfig,
} from "@/infrastructure/billing/qpay-config";
import { QpayHttpGateway } from "@/infrastructure/billing/qpay-http-gateway";

export function isQpayConfigured(): boolean {
  return qpayEnvIsConfigured(env);
}

export function createQpayGateway(): QpayGateway {
  return new QpayHttpGateway(readQpayConfig(env));
}

export function qpayCallbackUrl(): string {
  return readQpayConfig(env).callbackUrl;
}
