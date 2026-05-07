import { isAdminRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentTermsSettings } from "@/components/settings/payment-terms-settings";
const DEFAULT_TERMS = [
  "Net 30",
  "Net 15",
  "Net 45",
  "Net 60",
  "Due on receipt",
  "Prepaid",
];

export default async function PaymentTermsPage() {
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

  const { data: settingsRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "payment_terms")
    .single();

  const terms = Array.isArray(settingsRow?.value)
    ? (settingsRow.value as string[])
    : DEFAULT_TERMS;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/settings">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
      </Link>
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Payment Terms
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configure the payment terms options available in customer forms.
          Changes here will update the dropdown in both the create and edit
          customer dialogs.
        </p>
      </div>
      <PaymentTermsSettings terms={terms} />
    </div>
  );
}
