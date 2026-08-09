import type { ConsultationOffering } from "@/domain/entities/consultation-offering";
import type { LawyerProfile } from "@/domain/entities/profile";
import type { Language, PracticeArea } from "@/domain/entities/taxonomy";
import type { InstantSlot } from "@/domain/value-objects/time-slot";
import type { AvailabilityRepository } from "@/domain/repositories/availability-repository";
import type { BookingRepository } from "@/domain/repositories/booking-repository";
import type { ConsultationOfferingRepository } from "@/domain/repositories/consultation-offering-repository";
import type {
  LawyerDiscoveryFilters,
  LawyerProfileRepository,
} from "@/domain/repositories/profile-repository";
import type {
  LanguageRepository,
  LawyerTaxonomyRepository,
  PracticeAreaRepository,
} from "@/domain/repositories/taxonomy-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";
import {
  filterAvailableSlots,
  generateCandidateSlots,
} from "@/domain/services/generate-slots";
import { NotFoundError } from "@/domain/errors/domain-error";
import type { Locale } from "@/i18n/config";
import { localizedTaxonomyName } from "@/lib/localized-content";

export type DirectoryLawyerCard = {
  profile: LawyerProfile;
  displayName: string;
  minPriceMnt: number | null;
  practiceAreaNames: string[];
  languageCodes: string[];
};

export type PublicLawyerProfileView = {
  profile: LawyerProfile;
  displayName: string;
  offerings: ConsultationOffering[];
  practiceAreas: PracticeArea[];
  languages: Language[];
  slots: InstantSlot[];
};

export type DiscoveryDeps = {
  lawyerProfileRepository: LawyerProfileRepository;
  consultationOfferingRepository: ConsultationOfferingRepository;
  availabilityRepository: AvailabilityRepository;
  bookingRepository: BookingRepository;
  practiceAreaRepository: PracticeAreaRepository;
  languageRepository: LanguageRepository;
  lawyerTaxonomyRepository: LawyerTaxonomyRepository;
  userRepository: UserRepository;
};

export async function searchListedLawyers(
  filters: LawyerDiscoveryFilters,
  deps: DiscoveryDeps,
  locale: Locale = "mn",
): Promise<DirectoryLawyerCard[]> {
  const profiles = await deps.lawyerProfileRepository.findListed(filters);
  if (profiles.length === 0) return [];

  const profileIds = profiles.map((p) => p.id);
  const userIds = [...new Set(profiles.map((p) => p.userId))];

  const [
    users,
    offerings,
    practiceLinks,
    languageLinks,
    allPracticeAreas,
    allLanguages,
  ] = await Promise.all([
    deps.userRepository.findByIds(userIds),
    deps.consultationOfferingRepository.findActiveByLawyerProfileIds(
      profileIds,
    ),
    deps.lawyerTaxonomyRepository.getPracticeAreasForProfiles(profileIds),
    deps.lawyerTaxonomyRepository.getLanguagesForProfiles(profileIds),
    deps.practiceAreaRepository.findAllActive(),
    deps.languageRepository.findAllActive(),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const offeringsByProfile = new Map<string, ConsultationOffering[]>();
  for (const offering of offerings) {
    const list = offeringsByProfile.get(offering.lawyerProfileId) ?? [];
    list.push(offering);
    offeringsByProfile.set(offering.lawyerProfileId, list);
  }
  const practiceById = new Map(allPracticeAreas.map((p) => [p.id, p]));
  const languageById = new Map(allLanguages.map((l) => [l.id, l]));

  const practiceIdsByProfile = new Map<string, string[]>();
  for (const link of practiceLinks) {
    const list = practiceIdsByProfile.get(link.lawyerProfileId) ?? [];
    list.push(link.practiceAreaId);
    practiceIdsByProfile.set(link.lawyerProfileId, list);
  }
  const languageIdsByProfile = new Map<string, string[]>();
  for (const link of languageLinks) {
    const list = languageIdsByProfile.get(link.lawyerProfileId) ?? [];
    list.push(link.languageId);
    languageIdsByProfile.set(link.lawyerProfileId, list);
  }

  return profiles.map((profile) => {
    const user = userById.get(profile.userId);
    const profileOfferings = offeringsByProfile.get(profile.id) ?? [];
    const practiceAreas = (practiceIdsByProfile.get(profile.id) ?? [])
      .map((id) => practiceById.get(id))
      .filter(Boolean) as PracticeArea[];
    const languages = (languageIdsByProfile.get(profile.id) ?? [])
      .map((id) => languageById.get(id))
      .filter(Boolean) as Language[];

    return {
      profile,
      displayName: user?.name ?? profile.slug,
      minPriceMnt:
        profileOfferings.length > 0
          ? Math.min(...profileOfferings.map((o) => o.priceMnt))
          : null,
      practiceAreaNames: practiceAreas.map((p) =>
        localizedTaxonomyName(p, locale),
      ),
      languageCodes: languages.map((l) => l.code),
    };
  });
}

export async function getPublicLawyerProfile(
  slug: string,
  deps: DiscoveryDeps,
): Promise<PublicLawyerProfileView> {
  const profile = await deps.lawyerProfileRepository.findBySlug(slug);
  if (!profile) throw new NotFoundError("LawyerProfile");

  const hasActive = await deps.lawyerProfileRepository.hasActiveOffering(
    profile.id,
  );
  if (!profile.isListed || profile.verificationStatus !== "APPROVED" || !hasActive) {
    throw new NotFoundError("LawyerProfile");
  }

  const [
    user,
    offerings,
    practiceLinks,
    languageLinks,
    rules,
    allPracticeAreas,
    allLanguages,
  ] = await Promise.all([
    deps.userRepository.findById(profile.userId),
    deps.consultationOfferingRepository.findActiveByLawyerProfileId(
      profile.id,
    ),
    deps.lawyerTaxonomyRepository.getPracticeAreas(profile.id),
    deps.lawyerTaxonomyRepository.getLanguages(profile.id),
    deps.availabilityRepository.findActiveRulesByLawyerProfileId(profile.id),
    deps.practiceAreaRepository.findAllActive(),
    deps.languageRepository.findAllActive(),
  ]);

  const duration = offerings[0]?.durationMinutes ?? 60;

  const from = new Date();
  const to = new Date(Date.now() + 14 * 86400000);
  const exceptions =
    await deps.availabilityRepository.findExceptionsByLawyerProfileId(
      profile.id,
      from.toISOString().slice(0, 10),
      to.toISOString().slice(0, 10),
    );
  const bookings = await deps.bookingRepository.findByLawyerProfileId(
    profile.id,
  );
  const candidates = generateCandidateSlots({
    rules,
    fromDate: from,
    days: 14,
    durationMinutes: duration,
  });
  const slots = filterAvailableSlots({
    candidates,
    rules,
    exceptions,
    bookings,
  }).slice(0, 24);

  const practiceById = new Map(allPracticeAreas.map((p) => [p.id, p]));
  const languageById = new Map(allLanguages.map((l) => [l.id, l]));

  const practiceAreas = practiceLinks
    .map((l) => practiceById.get(l.practiceAreaId))
    .filter(Boolean) as PracticeArea[];
  const languages = languageLinks
    .map((l) => languageById.get(l.languageId))
    .filter(Boolean) as Language[];

  return {
    profile,
    displayName: user?.name ?? profile.slug,
    offerings,
    practiceAreas,
    languages,
    slots,
  };
}
