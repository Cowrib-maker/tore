import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

/**
 * Read-only photo for the lawyer's own page. Photos are managed by the
 * platform admin, so there is deliberately no input, button or endpoint here.
 */
export function ProfilePhotoDisplay({
  photoUrl,
  initial,
  copy,
}: {
  photoUrl: string | null;
  initial: string;
  copy: MarketplaceDictionary["profilePhoto"];
}) {
  return (
    <div className="flex items-center gap-4">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          data-testid="profile-photo-display"
          className="size-16 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div
          aria-hidden
          data-testid="profile-photo-fallback"
          className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground"
        >
          {initial}
        </div>
      )}
      <p className="text-sm text-muted-foreground">{copy.adminManaged}</p>
    </div>
  );
}
