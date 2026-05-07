import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { MobileNav } from "@/components/mobile-nav";
import { AIChat } from "@/components/chat/ai-chat";
import { getCurrentUserRole } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already resolved the role and forwarded it on the
  // `x-user-role` request header — `getCurrentUserRole` reads that first
  // and only hits Supabase if the header is absent. Saves two round-trips
  // per navigation.
  const role = await getCurrentUserRole();

  return (
    <div className="flex h-screen bg-white dark:bg-gray-950">
      <div className="hidden md:flex">
        <Sidebar role={role} />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="sticky top-0 z-30 flex h-16 shrink-0 items-center border-b bg-white px-4 dark:border-gray-800 dark:bg-gray-950 md:px-6">
          <div className="md:hidden mr-2">
            <MobileNav role={role} />
          </div>
          <div className="flex-1 min-w-0">
            <Topbar />
          </div>
        </div>
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 dark:bg-gray-900 md:p-6">
          {children}
        </main>
      </div>
      <AIChat />
    </div>
  );
}
