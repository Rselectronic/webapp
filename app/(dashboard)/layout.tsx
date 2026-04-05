import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { MobileNav } from "@/components/mobile-nav";
import { AIChat } from "@/components/chat/ai-chat";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex h-16 shrink-0 items-center border-b bg-white px-4 md:px-6">
          <div className="md:hidden mr-2">
            <MobileNav />
          </div>
          <div className="flex-1 min-w-0">
            <Topbar />
          </div>
        </div>
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 md:p-6">
          {children}
        </main>
      </div>
      <AIChat />
    </div>
  );
}
