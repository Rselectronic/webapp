"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const URL_ERROR_MESSAGES: Record<string, string> = {
  account_disabled:
    "This account has been deactivated. Contact an admin to restore access.",
};

// Reads ?error=… from the URL into state. Split out so the Suspense
// boundary in <LoginPage> can isolate the CSR bailout — without it the
// whole route bails out of static prerendering at build time.
function UrlErrorBridge({ onError }: { onError: (msg: string) => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const code = searchParams.get("error");
    if (code && URL_ERROR_MESSAGES[code]) {
      onError(URL_ERROR_MESSAGES[code]);
    }
  }, [searchParams, onError]);
  return null;
}

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <Card>
      <Suspense fallback={null}>
        <UrlErrorBridge onError={setError} />
      </Suspense>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">
          R.S. Électronique
        </CardTitle>
        <CardDescription>
          Sign in to the manufacturing management system
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@rspcbassembly.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
