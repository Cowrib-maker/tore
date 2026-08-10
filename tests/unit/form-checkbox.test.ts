import { describe, expect, it } from "vitest";

import { isFormCheckboxOn } from "@/application/common/parse-form";

describe("isFormCheckboxOn", () => {
  it("returns true when checkbox on follows a hidden off sentinel", () => {
    const formData = new FormData();
    formData.append("isListed", "off");
    formData.append("isListed", "on");
    expect(isFormCheckboxOn(formData, "isListed")).toBe(true);
  });

  it("returns false for hidden off alone (unchecked)", () => {
    const formData = new FormData();
    formData.append("isListed", "off");
    expect(isFormCheckboxOn(formData, "isListed")).toBe(false);
  });

  it("returns true for a lone on value", () => {
    const formData = new FormData();
    formData.append("isListed", "on");
    expect(isFormCheckboxOn(formData, "isListed")).toBe(true);
  });

  it("documents why formData.get is wrong with a leading off sentinel", () => {
    const formData = new FormData();
    formData.append("isListed", "off");
    formData.append("isListed", "on");
    expect(formData.get("isListed")).toBe("off");
    expect(formData.get("isListed") === "on").toBe(false);
  });
});
