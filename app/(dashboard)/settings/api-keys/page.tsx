import { isAdminRole } from "@/lib/auth/roles";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  ApiKeysManager,
  type ApiKeyRow,
} from "@/components/settings/api-keys-manager";

export default async function ApiKeysPage() {
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

  if (!isAdminRole(profile?.role)) redirect("/");

  const { data: keys } = await supabase
    .from("api_keys")
    .select("id, name, role, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <Link href="/settings">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
      </Link>

      <div>
        <h2 className="text-2xl font-bold text-gray-900">API Keys</h2>
        <p className="text-sm text-gray-500">
          Permanent API keys for connecting AI agents (Claude Desktop, Claude
          Code, n8n, etc.) to the RS MCP server. Keys never expire â€” revoke to
          deactivate.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>
          Raw keys are shown <span className="font-semibold">ONCE</span> at
          creation. If you lose a key, revoke it and generate a new one.
        </p>
      </div>

      <ApiKeysManager initialKeys={(keys ?? []) as ApiKeyRow[]} />
    </div>
  );
}
