import { cache } from "react";

import { LawyerPosition } from "@/domain/enums";
import {
  lawyerCredentialRepository,
  lawyerProfileRepository,
} from "@/infrastructure/repositories";
import {
  lawyerVerificationState,
  type LawyerVerificationState,
} from "@/domain/services/lawyer-onboarding";

/**
 * The lawyer's licence-review state (independent of any subscription), from the
 * same persisted profile and credentials the dashboard uses.
 *
 * `null` means "no licence flow to show": the account has no lawyer profile yet,
 * or its position is not ATTORNEY. Only attorneys go through licence
 * verification (the profile page and dashboard hide it for other positions and
 * only ATTORNEY can be listed or booked), so other positions must not be shown
 * a licence status or a "submit licence" action. Their plan status still shows.
 *
 * Wrapped in React `cache`, which only de-duplicates calls within ONE server
 * request (layout + page render); it never carries data across requests.
 */
export const loadLawyerLicenseState = cache(
  async (userId: string): Promise<LawyerVerificationState | null> => {
    const profile = await lawyerProfileRepository.findByUserId(userId);
    if (!profile || profile.position !== LawyerPosition.ATTORNEY) return null;
    const credentials = await lawyerCredentialRepository.findByLawyerProfileId(profile.id);
    return lawyerVerificationState(profile, credentials);
  },
);
