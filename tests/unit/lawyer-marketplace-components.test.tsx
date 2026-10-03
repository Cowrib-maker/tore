// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import {
  LawyerCard,
  type LawyerCardCopy,
  type LawyerCardData,
} from "@/components/marketplace/lawyer-card";
import { RatingSummary } from "@/components/marketplace/rating-summary";
import { VerifiedBadge } from "@/components/marketplace/verified-badge";

afterEach(cleanup);

const copy: LawyerCardCopy = {
  verified: "Баталгаажсан өмгөөлөгч",
  fallbackTitle: "Хууль зүйн зөвлөх",
  yearsExperience: "{n} жилийн туршлага",
  ratingCount: "{count} үнэлгээ",
  online: "Онлайн",
  fromPrice: "Эхлэх үнэ {price} ₮",
  viewOfferings: "Үйлчилгээ үзэх",
  viewProfile: "Профайл үзэх",
  getConsultation: "Зөвлөгөө авах",
};

const bare: LawyerCardData = {
  slug: "bat",
  displayName: "Бат",
  imageUrl: null,
  headline: null,
  verificationStatus: "APPROVED",
  yearsOfExperience: null,
  averageRating: null,
  reviewCount: 0,
  city: null,
  practiceAreaNames: [],
  offersOnline: false,
  minPriceMnt: null,
};

describe("LawyerCard", () => {
  it("renders persisted data: rating, price, experience, location, specialization", () => {
    render(
      <LawyerCard
        copy={copy}
        lawyer={{
          ...bare,
          headline: "Өмгөөлөгч",
          yearsOfExperience: 8,
          averageRating: 4.5,
          reviewCount: 12,
          city: "Улаанбаатар",
          practiceAreaNames: ["Хөдөлмөрийн эрх зүй"],
          offersOnline: true,
          minPriceMnt: 80000,
        }}
      />,
    );
    expect(screen.getByText("Өмгөөлөгч")).toBeTruthy();
    expect(screen.getByText("4.5")).toBeTruthy();
    expect(screen.getByText(/12 үнэлгээ/)).toBeTruthy();
    expect(screen.getByText("8 жилийн туршлага")).toBeTruthy();
    expect(screen.getByText("Улаанбаатар")).toBeTruthy();
    expect(screen.getByText("Хөдөлмөрийн эрх зүй")).toBeTruthy();
    expect(screen.getByText("Онлайн")).toBeTruthy();
    expect(screen.getByText(/Эхлэх үнэ 80\D?000 ₮/)).toBeTruthy();
    expect(screen.getByText("Баталгаажсан өмгөөлөгч")).toBeTruthy();
  });

  it("invents nothing when optional fields are missing", () => {
    const { container } = render(<LawyerCard copy={copy} lawyer={bare} />);
    expect(screen.queryByText(/үнэлгээ/)).toBeNull();
    expect(screen.queryByText(/жилийн туршлага/)).toBeNull();
    expect(screen.queryByText("Онлайн")).toBeNull();
    expect(screen.queryByText(/Эхлэх үнэ/)).toBeNull();
    expect(container.querySelectorAll(".ds-chip")).toHaveLength(0);
    // Neutral fallbacks only.
    expect(screen.getByText("Хууль зүйн зөвлөх")).toBeTruthy();
    expect(screen.getByText("Үйлчилгээ үзэх")).toBeTruthy();
  });

  it("points the profile and consultation CTAs into the existing profile/booking flow", () => {
    render(<LawyerCard copy={copy} lawyer={bare} />);
    expect(
      screen.getByRole("link", { name: "Профайл үзэх" }).getAttribute("href"),
    ).toBe("/lawyers/bat");
    expect(
      screen.getByRole("link", { name: "Зөвлөгөө авах" }).getAttribute("href"),
    ).toBe("/lawyers/bat#consult");
  });

  it("does not render a verified badge for a non-approved status", () => {
    render(
      <LawyerCard copy={copy} lawyer={{ ...bare, verificationStatus: "PENDING" }} />,
    );
    expect(screen.queryByText("Баталгаажсан өмгөөлөгч")).toBeNull();
  });
});

describe("VerifiedBadge", () => {
  it.each(["PENDING", "REJECTED", "SUSPENDED"])("is hidden for %s", (status) => {
    const { container } = render(<VerifiedBadge status={status} label="OK" />);
    expect(container.textContent).toBe("");
  });

  it("shows for APPROVED", () => {
    render(<VerifiedBadge status="APPROVED" label="Баталгаажсан" />);
    expect(screen.getByText("Баталгаажсан")).toBeTruthy();
  });
});

describe("RatingSummary", () => {
  it("shows average and count from the aggregate", () => {
    render(<RatingSummary average={4.25} count={4} countLabel="{count} үнэлгээ" />);
    expect(screen.getByText("4.3")).toBeTruthy();
    expect(screen.getByText(/4 үнэлгээ/)).toBeTruthy();
  });

  it("renders the empty label (or nothing) when there are no reviews", () => {
    const { container, rerender } = render(
      <RatingSummary average={null} count={0} countLabel="x" />,
    );
    expect(container.textContent).toBe("");
    rerender(
      <RatingSummary
        average={null}
        count={0}
        countLabel="x"
        emptyLabel="Одоогоор үнэлгээ байхгүй."
      />,
    );
    expect(screen.getByText("Одоогоор үнэлгээ байхгүй.")).toBeTruthy();
  });
});
