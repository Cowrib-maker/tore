import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Native &lt;select&gt; styled to match Input / .ds-field.
 * Prefer this over one-off select className copies.
 */
function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn("ds-field", className)}
      {...props}
    >
      {children}
    </select>
  );
}

/**
 * Native textarea matching Input radius/border/focus tokens.
 */
function NativeTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="native-textarea"
      className={cn("ds-textarea", className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeTextarea };
