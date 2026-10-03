// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import {
  LawyerOnboardingCard,
  type LawyerOnboardingCopy,
} from "@/components/marketplace/lawyer-onboarding-card";
import type { LawyerOnboarding } from "@/domain/services/lawyer-onboarding";

afterEach(cleanup);

const labels = {
  license: "License submitted",
  approved: "Approved",
  offering: "Active service",
  optedIn: "Listed",
  headline: "Headline",
  bio: "Bio",
  years: "Years",
  city: "City",
  education: "Education",
  photo: "Photo",
  practiceAreas: "Practice areas",
  languages: "Languages",
  schedule: "Schedule",
};

const copy: LawyerOnboardingCopy = {
  title: "Complete your profile",
  help: "help",
  groupVerification: "Required for verification",
  groupListing: "Required for the directory",
  groupRecommended: "Optional",
  visibleNow: "Visible in the directory",
  items: labels,
};

function onboarding(overrides: Partial<LawyerOnboarding> = {}): LawyerOnboarding {
  return {
    verificationState: "SUBMIT_LICENSE",
    forVerification: [{ key: "license", done: false }],
    forPublicListing: [
      { key: "approved", done: false },
      { key: "offering", done: false },
      { key: "optedIn", done: false },
    ],
    recommended: [{ key: "bio", done: true }],
    isPubliclyVisible: false,
    ...overrides,
  };
}

describe("LawyerOnboardingCard", () => {
  it("renders the three groups and links unfinished items to existing screens", () => {
    render(<LawyerOnboardingCard onboarding={onboarding()} copy={copy} />);
    expect(screen.getByText("Required for verification")).toBeTruthy();
    expect(screen.getByText("Required for the directory")).toBeTruthy();
    expect(screen.getByText("Optional")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "License submitted" }).getAttribute("href"),
    ).toBe("/lawyer/profile#verification");
    expect(
      screen.getByRole("link", { name: "Active service" }).getAttribute("href"),
    ).toBe("/lawyer/offerings");
    // Completed items are plain text, not links.
    expect(screen.queryByRole("link", { name: "Bio" })).toBeNull();
    expect(screen.getByText("Bio")).toBeTruthy();
    expect(screen.queryByText("Visible in the directory")).toBeNull();
  });

  it("shows the visibility badge only when the lawyer is publicly visible", () => {
    render(
      <LawyerOnboardingCard
        onboarding={onboarding({ isPubliclyVisible: true })}
        copy={copy}
      />,
    );
    expect(screen.getByText("Visible in the directory")).toBeTruthy();
  });
});
