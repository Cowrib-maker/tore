// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ProfilePhotoUploadForm } from "@/components/profiles/profile-photo-upload-form";
import { PROFILE_PHOTO_MAX_BYTES } from "@/application/validators/profile.schema";

const copy = {
  title: "t",
  description: "Upload your photo",
  noPhoto: "No photo",
  chooseFile: "Choose a photo",
  uploading: "Uploading…",
  submit: "Save photo",
  success: "Photo updated.",
  errorTooLarge: "Too large",
  errorType: "Wrong type",
  errorGeneric: "Could not save; current photo unchanged",
  previewNote: "Selected photo. Press save.",
};

const png = (size = 10) =>
  new File([new Uint8Array(size)], "me.png", { type: "image/png" });

function pick(file: File) {
  const input = screen.getByLabelText("Choose a photo") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:preview-1"),
    revokeObjectURL: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProfilePhotoUploadForm", () => {
  it("shows the existing photo, or the neutral placeholder when there is none", () => {
    const { rerender } = render(<ProfilePhotoUploadForm photoUrl="/api/files/profile-photo/u1/a.png" copy={copy} />);
    expect(screen.getByTestId("profile-photo-preview").getAttribute("src")).toBe(
      "/api/files/profile-photo/u1/a.png",
    );
    rerender(<ProfilePhotoUploadForm photoUrl={null} copy={copy} />);
    expect(screen.getByText("No photo")).toBeTruthy();
  });

  it("previews the selected photo immediately and enables save", () => {
    render(<ProfilePhotoUploadForm photoUrl="/old.png" copy={copy} />);
    expect((screen.getByRole("button", { name: "Save photo" }) as HTMLButtonElement).disabled).toBe(true);
    pick(png());
    expect(screen.getByTestId("profile-photo-preview").getAttribute("src")).toBe("blob:preview-1");
    expect(screen.getByText("Selected photo. Press save.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save photo" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("rejects a wrong type or oversized file client-side and keeps the existing photo", () => {
    render(<ProfilePhotoUploadForm photoUrl="/old.png" copy={copy} />);
    pick(new File(["x"], "a.gif", { type: "image/gif" }));
    expect(screen.getByRole("alert").textContent).toBe("Wrong type");
    expect(screen.getByTestId("profile-photo-preview").getAttribute("src")).toBe("/old.png");

    pick(png(PROFILE_PHOTO_MAX_BYTES + 1));
    expect(screen.getByRole("alert").textContent).toBe("Too large");
    expect(screen.getByTestId("profile-photo-preview").getAttribute("src")).toBe("/old.png");
  });

  it("uploads to the own-photo endpoint, then refreshes the page data", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ProfilePhotoUploadForm photoUrl="/old.png" copy={copy} />);
    pick(png());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save photo" }));
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/profile/photo");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("photo")).toBeInstanceOf(File);
    expect(screen.getByText("Photo updated.")).toBeTruthy();
  });

  it("on a server failure shows a clear error and goes back to the existing photo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ code: "STORAGE_FAILED" }), { status: 502 })),
    );
    render(<ProfilePhotoUploadForm photoUrl="/old.png" copy={copy} />);
    pick(png());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save photo" }));
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(copy.errorGeneric));
    expect(screen.getByTestId("profile-photo-preview").getAttribute("src")).toBe("/old.png");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("maps a server FILE_TOO_LARGE to the size message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ code: "FILE_TOO_LARGE" }), { status: 413 })),
    );
    render(<ProfilePhotoUploadForm photoUrl={null} copy={copy} />);
    pick(png());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save photo" }));
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Too large"));
  });
});
