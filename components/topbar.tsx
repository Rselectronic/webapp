import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SearchCommand } from "@/components/search-command";

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

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() ?? "?";

  const roleLabel: Record<string, string> = {
    ceo: "CEO",
    operations_manager: "Operations",
    shop_floor: "Shop Floor",
  };

  return (
    <div className="flex h-full w-full items-center justify-between">
      <SearchCommand />
      <div className="flex items-center gap-4">
        {profile && (
          <>
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {roleLabel[profile.role] ?? profile.role}
            </Badge>
            <span className="hidden sm:inline text-sm text-gray-600">{profile.full_name}</span>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
          </>
        )}
        <form action={logout}>
          <Button variant="ghost" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
