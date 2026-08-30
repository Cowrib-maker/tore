import { LawyerListingActions } from "@/components/verification/lawyer-listing-actions";
import { SubmitCredentialForm } from "@/components/verification/submit-credential-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LawyerCredential, LawyerProfile } from "@/domain/entities/profile";
import { LawyerVerificationStatus } from "@/domain/enums";
import type { Locale } from "@/i18n/config";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";
import {
  formatCredentialStatus,
  formatDateTimeUtc,
  formatVerificationStatus,
} from "@/lib/format-labels";

function verificationBadgeVariant(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "APPROVED":
      return "default";
    case "REJECTED":
    case "SUSPENDED":
      return "destructive";
    default:
      return "secondary";
  }
}

function statusMessage(
  profile: LawyerProfile,
  credentials: LawyerCredential[],
  copy: MarketplaceDictionary["verification"],
): string {
  const status = profile.verificationStatus;
  if (status === LawyerVerificationStatus.APPROVED) {
    return copy.approvedRecordMsg;
  }
  if (status === LawyerVerificationStatus.PENDING) {
    return copy.pendingReviewMsg;
  }
  if (status === LawyerVerificationStatus.SUSPENDED) {
    return copy.suspendedListingMsg;
  }
  const rejection = credentials.find((credential) => credential.rejectionReason)
    ?.rejectionReason;
  return rejection
    ? `${copy.rejectedMsg} ${rejection}`
    : copy.rejectedMsg;
}

export function LawyerVerificationSection({
  profile,
  credentials,
  canSubmit,
  copy,
  submitCopy,
  locale,
}: {
  profile: LawyerProfile;
  credentials: Array<LawyerCredential & { documentUrl: string }>;
  canSubmit: boolean;
  copy: MarketplaceDictionary["verification"] &
    Pick<MarketplaceDictionary["common"], "yes" | "no">;
  submitCopy: MarketplaceDictionary["submitCredential"];
  locale: Locale;
}) {
  const status = profile.verificationStatus;

  return (
    <div id="verification" className="grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{copy.statusTitle}</CardTitle>
            <Badge variant={verificationBadgeVariant(status)}>
              {formatVerificationStatus(status, locale)}
            </Badge>
          </div>
          <CardDescription>
            {statusMessage(profile, credentials, copy)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            {copy.approvedOn}{" "}
            {profile.verifiedAt
              ? `${formatDateTimeUtc(profile.verifiedAt, locale)} UTC`
              : "—"}
          </p>
          <p>
            {copy.listingLabel} {profile.isListed ? copy.yes : copy.no}
          </p>
          <p>{copy.listingAdminOnly}</p>
          <LawyerListingActions
            lawyerProfileId={profile.id}
            isListed={profile.isListed}
            canList={status === LawyerVerificationStatus.APPROVED}
            copy={copy}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.submitTitle}</CardTitle>
          <CardDescription>{copy.submitHelp}</CardDescription>
        </CardHeader>
        <CardContent>
          {canSubmit ? (
            <SubmitCredentialForm copy={submitCopy} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {status === "APPROVED"
                ? copy.approvedRecordMsg
                : status === "SUSPENDED"
                  ? copy.suspendedListingMsg
                  : copy.awaitingMsg}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.historyTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {credentials.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center">
              <p className="text-sm font-medium">{copy.emptyTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {copy.emptyBody}
              </p>
            </div>
          ) : (
            credentials.map((credential) => (
              <div
                key={credential.id}
                className="flex flex-col gap-1 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {credential.licenseNumber} · {credential.issuingAuthority}
                  </p>
                  <p className="text-muted-foreground">
                    {formatCredentialStatus(credential.status, locale)}
                    {credential.rejectionReason
                      ? ` — ${credential.rejectionReason}`
                      : ""}
                  </p>
                </div>
                <a
                  href={credential.documentUrl}
                  className="text-primary underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {credential.documentFileName}
                </a>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
