import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/login/actions";
import { SearchCommand } from "@/components/search-command";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";

export async function Topbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { full_name: string; role: string } | null = null;
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("full_name, role")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  const initials =
    profile?.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() ?? "?";

  const roleLabel: Record<string, string> = {
    admin: "Admin",
    ceo: "CEO",
    operations_manager: "Operations",
    production: "Production",
    shop_floor: "Shop Floor",
  };

  return (
    <div className="flex h-full w-full items-center justify-between">
      <SearchCommand />
      <div className="flex items-center gap-3">
        <ThemeToggle />
        {profile ? (
          <UserMenu
            fullName={profile.full_name}
            email={user?.email ?? null}
            roleLabel={roleLabel[profile.role] ?? profile.role}
            initials={initials}
            logoutAction={logout}
          />
        ) : null}
      </div>
    </div>
  );
}
