"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { data: signInData, error } = await supabase.auth.signInWithPassword(
    data
  );

  if (error) {
    return { error: error.message };
  }

  // Look up the role + active status before redirecting. Production users
  // land on /production; everyone else lands on the dashboard. Inactive
  // accounts are signed straight back out.
  //
  // Use the admin client for the profile read so RLS policy gaps can't
  // make the deactivation check silently no-op. (Historic bug: production
  // users had no policy match → profile was null → check skipped →
  // deactivated users could still sign in.)
  let target = "/";
  if (signInData?.user) {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("role, is_active")
      .eq("id", signInData.user.id)
      .maybeSingle();

    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      return {
        error:
          "This account has been deactivated. Contact an admin to restore access.",
      };
    }

    if (profile?.role === "production") {
      target = "/production";
    }

    // Best-effort last_seen_at update — don't block sign-in if it fails.
    // Use the admin client; the user-scoped client may not have UPDATE
    // permission on its own users row depending on the active policies.
    try {
      await admin
        .from("users")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", signInData.user.id);
    } catch {
      // ignore
    }
  }

  revalidatePath("/", "layout");
  redirect(target);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
