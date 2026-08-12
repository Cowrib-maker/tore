import { ForbiddenError } from "@/domain/errors/domain-error";
import {
  ADMIN_DEVTOOLS_V1_FLAG,
  isAdminDevtoolsEnabled,
} from "@/lib/feature-flags";

/** Fail closed unless admin-devtools flag is ON and NODE_ENV is not production. */
export function assertAdminDevtoolsEnabled(): void {
  if (!isAdminDevtoolsEnabled()) {
    throw new ForbiddenError(
      `Admin developer tools are disabled (set ${ADMIN_DEVTOOLS_V1_FLAG}=1 in non-production)`,
    );
  }
}
