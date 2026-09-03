import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";

const baseUrl = (
  process.env.TORE_E2E_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000"
).replace(/\/+$/, "");

let browser: Browser;

describe("/legal-ai UI E2E", () => {
  beforeAll(async () => {
    const route = await fetch(`${baseUrl}/legal-ai`);
    if (!route.ok) {
      throw new Error(`Legal AI server is unavailable at ${baseUrl}.`);
    }
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("renders a resizable desktop chat with fullscreen and spell-check controls", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${baseUrl}/legal-ai`, { waitUntil: "networkidle" });

    const handle = page.getByTestId("legal-ai-resize-handle");
    const handleBox = await handle.boundingBox();
    const frame = handle.locator("xpath=..");
    const initialFrame = await frame.boundingBox();
    expect(handleBox).not.toBeNull();
    expect(initialFrame).not.toBeNull();

    await page.mouse.move(handleBox!.x + 4, handleBox!.y + 4);
    await page.mouse.down();
    await page.mouse.move(handleBox!.x + 120, handleBox!.y + 80, { steps: 5 });
    await page.mouse.up();

    const resizedFrame = await frame.boundingBox();
    expect(resizedFrame?.width).toBeGreaterThan(initialFrame!.width);
    expect(resizedFrame?.height).toBeGreaterThan(initialFrame!.height);
    expect(
      await page.getByRole("button", { name: "Бүтэн дэлгэцээр нээх" }).isVisible(),
    ).toBe(true);
    expect(
      await page
        .getByRole("button", { name: "Зөв бичгийн алдаа шалгах (одоо шалгах)" })
        .isVisible(),
    ).toBe(true);

    await page.close();
  });

  it("hides the desktop resize handle on mobile", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${baseUrl}/legal-ai`, { waitUntil: "networkidle" });

    expect(await page.getByTestId("legal-ai-resize-handle").isVisible()).toBe(false);
    await page.close();
  });
});
