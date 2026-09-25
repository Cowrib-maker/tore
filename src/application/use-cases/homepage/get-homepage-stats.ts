import { getPrismaClient } from "@/infrastructure/database/prisma-client";

export type HomepageStats = {
  listedLawyers: number;
  practiceAreas: number;
  activeOrganizations: number;
};

/**
 * Real, live counts for the public homepage hero panel -- never fabricated.
 * Callers should omit the panel entirely when every count is 0 rather than
 * display an unimpressive/empty-looking stat row.
 */
export async function getHomepageStats(): Promise<HomepageStats> {
  const db = getPrismaClient();
  const [listedLawyers, practiceAreas, activeOrganizations] =
    await Promise.all([
      db.lawyerProfile.count({
        where: { isListed: true, deletedAt: null },
      }),
      db.practiceArea.count(),
      db.organization.count({
        where: { status: "ACTIVE", deletedAt: null },
      }),
    ]);
  return { listedLawyers, practiceAreas, activeOrganizations };
}
