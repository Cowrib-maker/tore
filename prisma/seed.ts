import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const PRACTICE_AREAS = [
  {
    slug: "family-law",
    nameMn: "Гэр бүлийн эрх зүй",
    nameEn: "Family Law",
    descriptionMn: "Гэрлэлт, гэр бүл салалт, хүүхдийн асран хамгааллыг холбосон зөвлөгөө.",
    descriptionEn: "Marriage, divorce, and child custody advisory services.",
    sortOrder: 1,
  },
  {
    slug: "criminal-law",
    nameMn: "Эрүүгийн эрх зүй",
    nameEn: "Criminal Law",
    descriptionMn: "Эрүүгийн хэрэг, мөрдөн байцаалт, шүүх хуралдаанд зөвлөгөө.",
    descriptionEn: "Criminal matters, investigations, and court representation advice.",
    sortOrder: 2,
  },
  {
    slug: "contract-commercial",
    nameMn: "Гэрээ, худалдааны эрх зүй",
    nameEn: "Contract & Commercial Law",
    descriptionMn: "Гэрээ боловсруулалт, маргаан шийдвэрлэлт, худалдааны зөвлөгөө.",
    descriptionEn: "Contract drafting, disputes, and commercial advisory.",
    sortOrder: 3,
  },
  {
    slug: "labor-employment",
    nameMn: "Хөдөлмөрийн эрх зүй",
    nameEn: "Labor & Employment Law",
    descriptionMn: "Хөдөлмөрийн гэрээ, халагдал, ажилчдын эрхийн зөвлөгөө.",
    descriptionEn: "Employment contracts, termination, and worker rights.",
    sortOrder: 4,
  },
  {
    slug: "property-real-estate",
    nameMn: "Өмч, үл хөдлөх хөрөнгийн эрх зүй",
    nameEn: "Property & Real Estate Law",
    descriptionMn: "Өмчлөл, түрээс, газар хөдлөх хөрөнгийн гүйлгээний зөвлөгөө.",
    descriptionEn: "Ownership, leasing, and real estate transaction advice.",
    sortOrder: 5,
  },
  {
    slug: "immigration-visa",
    nameMn: "Хил нэвтрэл, визний зөвлөгөө",
    nameEn: "Immigration & Visa Advisory",
    descriptionMn: "Виз, оршин суух зөвшөөрөл, хил нэвтрэлтийн зөвлөгөө.",
    descriptionEn: "Visa, residency, and immigration advisory.",
    sortOrder: 6,
  },
  {
    slug: "business-corporate",
    nameMn: "Бизнес бүртгэл, корпорацийн эрх зүй",
    nameEn: "Business & Corporate Advisory",
    descriptionMn: "Компани бүртгэл, хувьцаа, захирлын зөвлөгөө.",
    descriptionEn: "Company registration, equity, and corporate governance.",
    sortOrder: 7,
  },
  {
    slug: "other",
    nameMn: "Бусад",
    nameEn: "Other",
    descriptionMn: "Бусад эрх зүйн зөвлөгөө — админ шалгалт шаардлагатай.",
    descriptionEn: "Other legal advisory — subject to admin review.",
    sortOrder: 99,
  },
] as const;

const LANGUAGES = [
  { code: "mn", nameMn: "Монгол", nameEn: "Mongolian" },
  { code: "en", nameMn: "Англи", nameEn: "English" },
] as const;

const PLATFORM_SETTINGS = [
  {
    key: "platform_fee_percent",
    value: "15",
    description: "Platform commission percentage deducted from each consultation payment.",
  },
  {
    key: "booking_acceptance_sla_hours",
    value: "24",
    description: "Hours a lawyer has to accept or decline a paid booking request.",
  },
  {
    key: "cancellation_full_refund_hours",
    value: "48",
    description: "Hours before consultation start for a full refund on cancellation.",
  },
  {
    key: "cancellation_partial_refund_hours",
    value: "24",
    description: "Hours before consultation start for a partial refund on cancellation.",
  },
  {
    key: "booking_autocomplete_hours",
    value: "48",
    description: "Hours after scheduled end before an in-progress booking auto-completes if client does not confirm.",
  },
  {
    key: "booking_number_prefix",
    value: "TORE",
    description: "Prefix used when formatting human-readable booking numbers.",
  },
  {
    key: "support_email",
    value: "support@tore.mn",
    description: "Public support contact email for clients and lawyers.",
  },
  {
    key: "terms_version",
    value: "2026-08-01",
    description: "Current terms of service version identifier.",
  },
  {
    key: "privacy_version",
    value: "2026-08-01",
    description: "Current privacy policy version identifier.",
  },
  {
    key: "marketplace_disclaimer_version",
    value: "2026-08-01",
    description: "Current marketplace disclaimer version identifier (TORE is not a law firm).",
  },
] as const;

async function main() {
  console.log("Seeding practice areas...");
  for (const area of PRACTICE_AREAS) {
    await prisma.practiceArea.upsert({
      where: { slug: area.slug },
      update: {
        nameMn: area.nameMn,
        nameEn: area.nameEn,
        descriptionMn: area.descriptionMn,
        descriptionEn: area.descriptionEn,
        sortOrder: area.sortOrder,
        isActive: true,
      },
      create: {
        slug: area.slug,
        nameMn: area.nameMn,
        nameEn: area.nameEn,
        descriptionMn: area.descriptionMn,
        descriptionEn: area.descriptionEn,
        sortOrder: area.sortOrder,
        isActive: true,
      },
    });
  }

  console.log("Seeding languages...");
  for (const language of LANGUAGES) {
    await prisma.language.upsert({
      where: { code: language.code },
      update: {
        nameMn: language.nameMn,
        nameEn: language.nameEn,
        isActive: true,
      },
      create: {
        code: language.code,
        nameMn: language.nameMn,
        nameEn: language.nameEn,
        isActive: true,
      },
    });
  }

  console.log("Seeding platform settings...");
  for (const setting of PLATFORM_SETTINGS) {
    await prisma.platformSetting.upsert({
      where: { key: setting.key },
      update: {
        value: setting.value,
        description: setting.description,
      },
      create: {
        key: setting.key,
        value: setting.value,
        description: setting.description,
      },
    });
  }

  console.log("Seed completed successfully.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
