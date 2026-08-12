"use client";

import { useActionState } from "react";

import type { ActionState } from "@/application/common/action-state";
import {
  adminDevBulkApproveAction,
  adminDevEnsureOfferingAction,
  adminDevImpersonateAction,
  adminDevMakeDirectoryReadyAction,
  adminDevMarkEmailVerifiedAction,
  adminDevSetListedAction,
  adminDevSetVerificationAction,
} from "@/application/actions/admin-devtools.actions";
import { Button } from "@/components/ui/button";
import { LawyerVerificationStatus } from "@/domain/enums";

const initial: ActionState = {};

function DevActionButton({
  action,
  userId,
  label,
  extraFields,
  variant = "outline",
}: {
  action: (
    prev: ActionState,
    formData: FormData,
  ) => Promise<ActionState>;
  userId?: string;
  label: string;
  extraFields?: Record<string, string>;
  variant?: "outline" | "default" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="inline">
      {userId ? <input type="hidden" name="userId" value={userId} /> : null}
      {extraFields
        ? Object.entries(extraFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}
      <Button type="submit" size="sm" variant={variant} disabled={pending}>
        {pending ? "…" : label}
      </Button>
      {state.error ? (
        <span className="ml-2 text-xs text-destructive">{state.error}</span>
      ) : null}
      {state.success && state.message ? (
        <span className="ml-2 text-xs text-emerald-700">{state.message}</span>
      ) : null}
    </form>
  );
}

export function AdminDevBulkApproveButton({
  pendingCount,
}: {
  pendingCount: number;
}) {
  return (
    <DevActionButton
      action={adminDevBulkApproveAction}
      label={`Approve all pending (${pendingCount})`}
      variant="default"
    />
  );
}

export function AdminDevUserActions({
  userId,
  role,
  emailVerified,
  isListed,
  verificationStatus,
  directoryReady,
}: {
  userId: string;
  role: string;
  emailVerified: boolean;
  isListed: boolean | null;
  verificationStatus: string | null;
  directoryReady: boolean;
}) {
  const isLawyer = role === "LAWYER";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        <DevActionButton
          action={adminDevImpersonateAction}
          userId={userId}
          label="Login as"
          variant="default"
        />
        {!emailVerified ? (
          <DevActionButton
            action={adminDevMarkEmailVerifiedAction}
            userId={userId}
            label="Verify email"
          />
        ) : null}
      </div>

      {isLawyer ? (
        <div className="flex flex-wrap gap-1.5">
          {!directoryReady ? (
            <DevActionButton
              action={adminDevMakeDirectoryReadyAction}
              userId={userId}
              label="Make directory-ready"
              variant="secondary"
            />
          ) : null}
          {verificationStatus !== LawyerVerificationStatus.APPROVED ? (
            <DevActionButton
              action={adminDevSetVerificationAction}
              userId={userId}
              label="Force APPROVED"
              extraFields={{ status: LawyerVerificationStatus.APPROVED }}
            />
          ) : (
            <DevActionButton
              action={adminDevSetVerificationAction}
              userId={userId}
              label="Reset PENDING"
              extraFields={{ status: LawyerVerificationStatus.PENDING }}
            />
          )}
          <DevActionButton
            action={adminDevEnsureOfferingAction}
            userId={userId}
            label="Ensure offering"
          />
          <DevActionButton
            action={adminDevSetListedAction}
            userId={userId}
            label={isListed ? "Unlist" : "List"}
            extraFields={{ isListed: isListed ? "false" : "true" }}
          />
        </div>
      ) : null}
    </div>
  );
}
