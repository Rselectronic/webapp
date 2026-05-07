"use client";

// ----------------------------------------------------------------------------
// UserMenu
//
// Topbar avatar dropdown — replaces the inline strip of role badge, name,
// avatar, sign-out button with a single avatar trigger that opens a menu
// containing those same details plus the sign-out action. Tightens the
// topbar at narrow widths and gives us a place to add future profile/
// preference items without crowding the bar.
// ----------------------------------------------------------------------------

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, ChevronDown } from "lucide-react";

interface UserMenuProps {
  fullName: string;
  email: string | null;
  roleLabel: string;
  initials: string;
  /**
   * Server action wired to /app/(auth)/login/actions.ts `logout`. Passed
   * down so the menu doesn't need its own auth wiring — the form submit
   * inside the menu item handles the round-trip to Supabase.
   */
  logoutAction: () => Promise<void>;
}

export function UserMenu({
  fullName,
  email,
  roleLabel,
  initials,
  logoutAction,
}: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
        aria-label="User menu"
      >
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <span className="hidden text-sm text-gray-700 dark:text-gray-300 sm:inline">
          {fullName}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col items-start gap-1 px-2 py-2 font-normal">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {fullName}
            </span>
            {email ? (
              <span className="text-xs text-gray-500">{email}</span>
            ) : null}
            <Badge variant="secondary" className="mt-1 text-[10px]">
              {roleLabel}
            </Badge>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          {/* Sign-out is a server action — submitting the form inside the
              menu fires the auth round-trip without us having to wire any
              client-side auth code here. */}
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
