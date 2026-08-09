import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            Password reset via email will be available in a upcoming release.
            Please contact support if you need immediate assistance.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
            Back to sign in
          </Link>
        </div>
      </Card>
    </div>
  );
}
