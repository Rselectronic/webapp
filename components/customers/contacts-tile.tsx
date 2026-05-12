"use client";

import { Mail, Phone, User } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatPhone } from "@/lib/utils/format";

type Contact = {
  name?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean | null;
};

function ContactBlock({ c, dense = false }: { c: Contact; dense?: boolean }) {
  return (
    <div className={dense ? "space-y-1" : "rounded-lg border p-3 space-y-1.5 dark:border-gray-800"}>
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-gray-400" />
        <span className="text-sm font-medium">{c.name || "Unnamed"}</span>
        {c.is_primary && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
            Primary
          </span>
        )}
      </div>
      {c.role && <p className="text-xs text-gray-500">{c.role}</p>}
      {c.email && (
        <p className="flex items-center gap-1.5 text-sm">
          <Mail className="h-3.5 w-3.5 text-gray-400" />
          <a
            href={`mailto:${c.email}`}
            className="text-blue-600 hover:underline truncate"
          >
            {c.email}
          </a>
        </p>
      )}
      {c.phone && (
        <p className="flex items-center gap-1.5 text-sm">
          <Phone className="h-3.5 w-3.5 text-gray-400" />
          {formatPhone(c.phone)}
        </p>
      )}
    </div>
  );
}

export function ContactsTile({ contacts }: { contacts: Contact[] }) {
  if (contacts.length === 0) return null;

  const primaryIdx = contacts.findIndex((c) => c.is_primary);
  const primary = primaryIdx >= 0 ? contacts[primaryIdx] : contacts[0];
  const others = contacts.filter((_, i) => i !== (primaryIdx >= 0 ? primaryIdx : 0));

  return (
    <div className="space-y-3">
      <ContactBlock c={primary} />
      {others.length > 0 && (
        <Popover>
          <PopoverTrigger
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            aria-label={`Show ${others.length} more contact${others.length === 1 ? "" : "s"}`}
          >
            +{others.length} more
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 max-h-96 overflow-y-auto">
            <div className="space-y-3">
              {others.map((c, i) => (
                <ContactBlock key={i} c={c} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
