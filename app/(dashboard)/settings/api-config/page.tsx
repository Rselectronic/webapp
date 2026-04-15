import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ApiConfigManager } from "@/components/settings/api-config-manager";
import {
  listCredentialStatus,
  type CredentialStatus,
} from "@/lib/supplier-credentials";

export default async function ApiConfigPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "ceo") redirect("/");

  const hasMasterKey = !!process.env.SUPPLIER_CREDENTIALS_KEY;

  const header = (
    <>
      <Link href="/settings">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
      </Link>

      <div>
        <h2 className="text-2xl font-bold text-gray-900">API Configuration</h2>
        <p className="text-sm text-gray-500">
          Manage distributor API credentials and preferred currencies.
          Credentials are AES-256 encrypted at rest. CEO only.
        </p>
      </div>
    </>
  );

  if (!hasMasterKey) {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">
              Master encryption key not configured
            </p>
            <p>
              This page requires the{" "}
              <code className="rounded bg-red-100 px-1 font-mono text-xs dark:bg-red-950/50">
                SUPPLIER_CREDENTIALS_KEY
              </code>{" "}
              environment variable to be set (32-byte base64-encoded key).
              Without it, credentials cannot be encrypted or decrypted. Add it
              to your <code className="font-mono text-xs">.env.local</code> and
              Vercel project settings, then redeploy.
            </p>
            <p className="pt-1 text-xs">
              Generate one with:{" "}
              <code className="rounded bg-red-100 px-1 font-mono dark:bg-red-950/50">
                openssl rand -base64 32
              </code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  let initialSuppliers: CredentialStatus[] = [];
  let loadError: string | null = null;
  try {
    initialSuppliers = await listCredentialStatus();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>
          <span className="font-semibold">Master encryption key required.</span>{" "}
          This page only works if{" "}
          <code className="font-mono text-xs">SUPPLIER_CREDENTIALS_KEY</code> is
          set in the environment. Without it, credentials cannot be decrypted.
        </p>
      </div>

      {loadError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          Failed to load supplier credentials: {loadError}
        </div>
      )}

      <ApiConfigManager initialSuppliers={initialSuppliers} />
    </div>
  );
}
