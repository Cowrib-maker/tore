"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password <Input> with a show/hide toggle (eye icon), matching the
 * common pattern of not having to retype a password blind. Wraps the base
 * Input rather than replacing it, so every existing prop (id, name,
 * required, autoComplete, aria-*, …) still works unchanged.
 */
function PasswordInput({
  className,
  showLabel,
  hideLabel,
  ...props
}: React.ComponentProps<typeof Input> & {
  /** aria-label shown while the password is hidden (button reveals it). */
  showLabel: string;
  /** aria-label shown while the password is visible (button hides it). */
  hideLabel: string;
}) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-9", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        tabIndex={-1}
        aria-label={visible ? hideLabel : showLabel}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export { PasswordInput };
