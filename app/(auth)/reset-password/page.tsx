"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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

// Recovery callback page. Supabase delivers the recovery session by
// redirecting here with the access/refresh token in the URL hash
// (#access_token=…&refresh_token=…&type=recovery). The Supabase JS client
// auto-detects the hash on first call and creates a recovery session — at
// that point `auth.updateUser({ password })` is allowed without a current
// password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase admin `generateLink({ type: "recovery" })` returns an
    // implicit-flow link that lands here with tokens in the URL hash:
    //   #access_token=…&refresh_token=…&type=recovery&expires_in=…
    // The @supabase/ssr browser client defaults to PKCE flow and will not
    // pick up these hash tokens on its own, so we parse them ourselves and
    // hand them to setSession(). After that, updateUser({ password }) works
    // because the session is a recovery session.
    let cancelled = false;

    async function bootstrap() {
      // Already-active session (e.g., admin already signed in elsewhere) —
      // safe to let them set a new password directly.
      const existing = await supabase.auth.getSession();
      if (cancelled) return;
      if (existing.data.session) {
        setReady(true);
        return;
      }

      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : "";
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const errorDescription = params.get("error_description");

      if (errorDescription) {
        setError(errorDescription.replace(/\+/g, " "));
        return;
      }
      if (!accessToken || !refreshToken) {
        setError(
          "Recovery link is missing tokens. Ask an admin to generate a fresh link."
        );
        return;
      }

      const { error: setErr } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (cancelled) return;
      if (setErr) {
        setError(setErr.message);
        return;
      }
      // Strip the tokens from the URL so they don't leak into history /
      // referrer headers.
      window.history.replaceState(null, "", window.location.pathname);
      setReady(true);
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const { error: updErr } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.replace("/login"), 1500);
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Set a new password</CardTitle>
        <CardDescription>
          Choose a password for your R.S. Électronique account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!ready && !done && !error && (
          <p className="text-sm text-gray-600">
            Verifying recovery link…
          </p>
        )}
        {!ready && error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        {done && (
          <p className="text-sm text-green-700">
            Password updated. Redirecting to sign-in…
          </p>
        )}
        {ready && !done && (
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Saving…" : "Update password"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
