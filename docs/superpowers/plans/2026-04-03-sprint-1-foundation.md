# Sprint 1: Foundation + Customer Database — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the RS PCB Assembly ERP web app with auth, dashboard layout, sidebar navigation, and a fully functional customer management module with seed data.

**Architecture:** Next.js 15 App Router with TypeScript, Tailwind CSS, and shadcn/ui for the frontend. Supabase provides PostgreSQL database, auth (email/password with 3 roles: ceo, operations_manager, shop_floor), and cookie-based sessions via `@supabase/ssr`. Route groups `(auth)` and `(dashboard)` separate public and protected pages. Database schema defined as raw SQL migration files to be applied to the existing Supabase project.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase (PostgreSQL 17, Auth, SSR), Vercel deployment

**Supabase Project:** `leynvlptisjjykfndjme` — `https://leynvlptisjjykfndjme.supabase.co` (us-west-2)

---

## File Structure

```
app/
├── (auth)/
│   ├── login/page.tsx              ← Login form with email/password
│   └── layout.tsx                  ← Centered auth layout
├── (dashboard)/
│   ├── layout.tsx                  ← Sidebar + topbar + auth guard
│   ├── page.tsx                    ← Dashboard home with placeholder KPIs
│   └── customers/
│       ├── page.tsx                ← Customer list with search/filter
│       └── [id]/page.tsx           ← Customer detail view
├── api/
│   └── auth/
│       └── callback/route.ts       ← Supabase auth callback handler
├── layout.tsx                      ← Root layout + providers
├── globals.css                     ← Tailwind + shadcn theme
└── middleware.ts                   ← Auth enforcement + role extraction
lib/
├── supabase/
│   ├── client.ts                   ← Browser Supabase client
│   ├── server.ts                   ← Server-side Supabase client (cookies)
│   └── types.ts                    ← Database types (hand-written for Sprint 1)
└── utils/
    └── format.ts                   ← Currency, phone, date formatting helpers
components/
├── ui/                             ← shadcn/ui components (installed via CLI)
├── sidebar.tsx                     ← Main navigation sidebar
├── topbar.tsx                      ← Top bar with user info + logout
└── kpi-card.tsx                    ← Reusable KPI display card
supabase/
└── migrations/
    ├── 001_initial_schema.sql      ← All 18 tables + indexes
    ├── 002_rls_policies.sql        ← Row Level Security policies
    └── 005_seed_customers.sql      ← 11 customers with bom_config
```

---

### Task 1: Scaffold Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/globals.css`, `tailwind.config.ts`, `postcss.config.mjs`, `.env.local.example`

- [ ] **Step 1: Create Next.js app with TypeScript and Tailwind**

```bash
cd /Users/rselectronicpc/Documents/GitHub/webapp
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --turbopack --yes
```

This scaffolds into the current directory. Accept defaults. The `--src-dir=false` puts `app/` at root level (matching the spec's project structure).

- [ ] **Step 2: Verify the app runs**

```bash
npm run dev
```

Expected: Dev server starts on http://localhost:3000, shows the Next.js welcome page.
Stop the dev server after confirming.

- [ ] **Step 3: Install core dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 4: Create environment variable example file**

Create `.env.local.example`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://leynvlptisjjykfndjme.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# FastAPI Python Service (Sprint 2+)
FASTAPI_URL=https://erp-rs-python.railway.app
```

Also add `.env.local` to `.gitignore` (should already be there from create-next-app).

- [ ] **Step 5: Create `.env.local` with placeholder values**

Create `.env.local` (this file is gitignored):

```env
NEXT_PUBLIC_SUPABASE_URL=https://leynvlptisjjykfndjme.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
SUPABASE_SERVICE_ROLE_KEY=placeholder
```

The user will fill in real keys from Supabase dashboard.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 15 project with TypeScript, Tailwind, Supabase deps"
```

---

### Task 2: Initialize shadcn/ui

**Files:**
- Modify: `app/globals.css`, `tailwind.config.ts`
- Create: `components/ui/` (auto-generated), `lib/utils.ts`

- [ ] **Step 1: Initialize shadcn/ui**

```bash
npx shadcn@latest init --defaults
```

This sets up the shadcn config, creates `components/ui/`, adds `lib/utils.ts` with the `cn()` helper, and configures CSS variables in `globals.css`.

- [ ] **Step 2: Install required shadcn components**

```bash
npx shadcn@latest add button input label card table badge separator sheet dropdown-menu avatar dialog tabs scroll-area
```

These are the components needed for Sprint 1: auth forms, dashboard cards, customer tables, sidebar navigation.

- [ ] **Step 3: Verify installation**

```bash
ls components/ui/
```

Expected: Should see `button.tsx`, `input.tsx`, `label.tsx`, `card.tsx`, `table.tsx`, `badge.tsx`, `separator.tsx`, `sheet.tsx`, `dropdown-menu.tsx`, `avatar.tsx`, `dialog.tsx`, `tabs.tsx`, `scroll-area.tsx`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: initialize shadcn/ui with core components"
```

---

### Task 3: Supabase Client Setup

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/types.ts`

- [ ] **Step 1: Create browser Supabase client**

Create `lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2: Create server-side Supabase client**

Create `lib/supabase/server.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 3: Create database types**

Create `lib/supabase/types.ts`:

```typescript
export type UserRole = "ceo" | "operations_manager" | "shop_floor";

export type JobStatus =
  | "created"
  | "procurement"
  | "parts_ordered"
  | "parts_received"
  | "production"
  | "inspection"
  | "shipping"
  | "delivered"
  | "invoiced"
  | "archived";

export type QuoteStatus =
  | "draft"
  | "review"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired";

export type BomStatus = "uploaded" | "parsing" | "parsed" | "error";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "cancelled";

export interface Customer {
  id: string;
  code: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  billing_address: Record<string, string>;
  shipping_address: Record<string, string>;
  payment_terms: string;
  bom_config: Record<string, unknown>;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Database type for Supabase client generic
export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserProfile;
        Insert: Omit<UserProfile, "created_at" | "updated_at">;
        Update: Partial<Omit<UserProfile, "id" | "created_at">>;
      };
      customers: {
        Row: Customer;
        Insert: Omit<Customer, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Customer, "id" | "created_at">>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
```

Note: This is a minimal type definition for Sprint 1. Only `users` and `customers` are typed since those are the tables we interact with this sprint. Expand in later sprints as needed.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/
git commit -m "feat: add Supabase client setup (browser + server + types)"
```

---

### Task 4: Database Migrations

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`, `supabase/migrations/002_rls_policies.sql`, `supabase/migrations/005_seed_customers.sql`

- [ ] **Step 1: Create initial schema migration**

Create `supabase/migrations/001_initial_schema.sql` containing all 18 tables and indexes exactly as defined in `claude.md` lines 131–504. Copy the full SQL from the spec (tables: users, customers, gmps, boms, bom_lines, components, api_pricing_cache, m_code_rules, overage_table, quotes, jobs, job_status_log, procurements, procurement_lines, supplier_pos, production_events, invoices, audit_log, plus all CREATE INDEX statements).

The full SQL starts with:

```sql
-- RS PCB Assembly ERP — Initial Schema
-- Migration 001: All 18 core tables + indexes
-- Apply to Supabase project: leynvlptisjjykfndjme

-- ============================================
-- 1. USERS (extends Supabase auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ceo', 'operations_manager', 'shop_floor')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Continue with all 17 remaining tables and all indexes from the spec. Use `CREATE TABLE IF NOT EXISTS` for safety.

- [ ] **Step 2: Create RLS policies migration**

Create `supabase/migrations/002_rls_policies.sql` with all RLS policies as defined in `claude.md` lines 506–551. Enable RLS on all tables, then create policies for ceo (full access all tables), operations_manager (read all except invoices, write on operational tables), shop_floor (read active jobs, insert production events).

Full RLS policies for all 15 tables:

```sql
-- RS PCB Assembly ERP — Row Level Security Policies
-- Migration 002

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_pricing_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m_code_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overage_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_pos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- CEO: Full access to ALL tables
-- ============================================
-- (One policy per table, FOR ALL)
CREATE POLICY ceo_all_users ON public.users FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);
CREATE POLICY ceo_all_customers ON public.customers FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);
-- ... repeat for all 18 tables

-- ============================================
-- OPERATIONS MANAGER: Read all operational, write on operational
-- ============================================
CREATE POLICY ops_read_customers ON public.customers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);
CREATE POLICY ops_write_customers ON public.customers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);
CREATE POLICY ops_update_customers ON public.customers FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);
-- ... repeat for: gmps, boms, bom_lines, components, api_pricing_cache, m_code_rules,
--     overage_table, quotes, jobs, job_status_log, procurements, procurement_lines, supplier_pos

-- ============================================
-- SHOP FLOOR: Read active production jobs + log events
-- ============================================
CREATE POLICY shop_floor_jobs ON public.jobs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'shop_floor')
  AND status IN ('production', 'inspection')
);
CREATE POLICY shop_floor_events_read ON public.production_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'shop_floor')
);
CREATE POLICY shop_floor_events_insert ON public.production_events FOR INSERT WITH CHECK (
  operator_id = auth.uid()
);

-- ============================================
-- INVOICES: CEO only (already covered by ceo_all_invoices)
-- ============================================
CREATE POLICY invoices_ceo_only ON public.invoices FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);

-- ============================================
-- AUDIT LOG: CEO can read, all roles insert via triggers
-- ============================================
CREATE POLICY audit_read_ceo ON public.audit_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);
CREATE POLICY audit_insert_all ON public.audit_log FOR INSERT WITH CHECK (true);

-- ============================================
-- USERS table: users can read their own profile
-- ============================================
CREATE POLICY users_read_own ON public.users FOR SELECT USING (
  id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);
```

The implementing agent should write out ALL policies for ALL tables — no "repeat for" comments. Every table needs explicit policies for each role.

- [ ] **Step 3: Create customer seed data migration**

Create `supabase/migrations/005_seed_customers.sql`:

```sql
-- RS PCB Assembly ERP — Seed Data: Customers
-- Migration 005

INSERT INTO public.customers (code, company_name, contact_name, contact_email, payment_terms, bom_config, is_active) VALUES
(
  'TLAN',
  'Lanka / Knorr-Bremse / KB Rail Canada',
  'Luis Esqueda',
  'Luis.Esqueda@knorr-bremse.com',
  'Net 30',
  '{"header_row": null, "columns_fixed": ["qty", "designator", "cpc", "description", "mpn", "manufacturer"], "encoding": "utf-8", "format": "xlsx", "section_filter": true, "notes": "M CODES SUMMARY section headers must be filtered"}'::jsonb,
  true
),
(
  'LABO',
  'GoLabo',
  'Genevieve St-Germain',
  'gstgermain@golabo.com',
  'Net 30',
  '{"columns": "auto_detect"}'::jsonb,
  true
),
(
  'VO2',
  'VO2 Master',
  'Martin Ciuraj',
  'Martin.c@vo2master.com',
  'Net 30',
  '{"columns": "auto_detect"}'::jsonb,
  true
),
(
  'SBQ',
  'SBQuantum',
  NULL,
  NULL,
  'Net 30',
  '{"columns": "auto_detect"}'::jsonb,
  true
),
(
  'CVNS',
  'Cevians',
  'Alain Migneault',
  'AMigneault@cevians.com',
  'Net 30',
  '{"columns": "auto_detect"}'::jsonb,
  true
),
(
  'CSA',
  'Canadian Space Agency',
  'Elodie Ricard',
  NULL,
  'Net 30',
  '{"columns": "auto_detect"}'::jsonb,
  true
),
(
  'NORPIX',
  'Norpix',
  'Philippe Candelier',
  'pc@norpix.com',
  'Net 30',
  '{"columns": "auto_detect"}'::jsonb,
  true
),
(
  'DAMB',
  'Demers Ambulances',
  NULL,
  NULL,
  'Net 30',
  '{"columns": "auto_detect"}'::jsonb,
  true
),
(
  'OPKM',
  'Optikam',
  NULL,
  NULL,
  'Net 30',
  '{"columns": "auto_detect"}'::jsonb,
  true
),
(
  'QTKT',
  'Quaketek',
  NULL,
  NULL,
  'Net 30',
  '{"columns": "auto_detect"}'::jsonb,
  true
),
(
  'NUVO',
  'Nuvotronik',
  NULL,
  NULL,
  'Net 30',
  '{"columns": "auto_detect"}'::jsonb,
  true
);
```

Note: These are INSERT statements only — the `users` table rows require Supabase Auth users to be created first (done in Task 7). The bom_config for TLAN uses the full config from the spec. Other customers that don't have documented configs yet use `auto_detect`.

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add database migrations (schema, RLS policies, customer seed data)"
```

---

### Task 5: Auth Middleware

**Files:**
- Create: `app/middleware.ts`, `app/api/auth/callback/route.ts`

- [ ] **Step 1: Create auth middleware**

Create `middleware.ts` at project root (not inside `app/`):

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Use getUser(), not getSession() — server-side validation
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login (except for auth routes)
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/api/auth")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 2: Create auth callback route**

Create `app/api/auth/callback/route.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth code exchange failed — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
```

- [ ] **Step 3: Commit**

```bash
git add middleware.ts app/api/
git commit -m "feat: add auth middleware and callback route"
```

---

### Task 6: Utility Helpers

**Files:**
- Create: `lib/utils/format.ts`

- [ ] **Step 1: Create formatting utilities**

Create `lib/utils/format.ts`:

```typescript
/**
 * Format a number as Canadian dollars (CAD).
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

/**
 * Format a phone number for display.
 * Input: "+14388338477" or "4388338477"
 * Output: "+1 (438) 833-8477"
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone; // Return as-is if not a recognized format
}

/**
 * Format a date string for display.
 * Input: ISO 8601 string
 * Output: "Apr 3, 2026"
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a date string with time.
 * Output: "Apr 3, 2026 2:30 PM"
 */
export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/utils/
git commit -m "feat: add formatting utility helpers (currency, phone, date)"
```

---

### Task 7: Login Page

**Files:**
- Create: `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/login/actions.ts`

- [ ] **Step 1: Create auth layout**

Create `app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create login server action**

Create `app/(auth)/login/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
```

- [ ] **Step 3: Create login page**

Create `app/(auth)/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">
          R.S. Électronique
        </CardTitle>
        <CardDescription>
          Sign in to the manufacturing management system
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@rspcbassembly.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Clean up the default root page**

Replace the default Next.js `app/page.tsx` content — this file should just redirect to the dashboard. Replace its entire content with:

```tsx
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/");
}
```

Actually, the root `/` will be handled by the `(dashboard)` route group's `page.tsx` in the next task. Delete the default `app/page.tsx` — the `(dashboard)/page.tsx` will serve `/`.

- [ ] **Step 5: Verify login page renders**

```bash
npm run dev
```

Navigate to http://localhost:3000/login — should see the login card with email/password fields and "R.S. Électronique" heading. Auth won't work yet without real Supabase keys, but the UI should render.

- [ ] **Step 6: Commit**

```bash
git add app/(auth)/ app/page.tsx
git commit -m "feat: add login page with Supabase email/password auth"
```

---

### Task 8: Dashboard Layout with Sidebar

**Files:**
- Create: `components/sidebar.tsx`, `components/topbar.tsx`, `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create the sidebar component**

Create `components/sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  Calculator,
  Briefcase,
  ShoppingCart,
  Factory,
  FileText,
  Settings,
  BarChart3,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, enabled: true },
  { name: "Customers", href: "/customers", icon: Users, enabled: true },
  { name: "BOMs", href: "/bom", icon: FileSpreadsheet, enabled: false },
  { name: "Quotes", href: "/quotes", icon: Calculator, enabled: false },
  { name: "Jobs", href: "/jobs", icon: Briefcase, enabled: false },
  { name: "Procurement", href: "/procurement", icon: ShoppingCart, enabled: false },
  { name: "Production", href: "/production", icon: Factory, enabled: false },
  { name: "Invoices", href: "/invoices", icon: FileText, enabled: false },
  { name: "Reports", href: "/reports", icon: BarChart3, enabled: false },
  { name: "Settings", href: "/settings", icon: Settings, enabled: false },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-white">
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-lg font-bold text-gray-900">RS PCB Assembly</h1>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.enabled ? item.href : "#"}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gray-100 text-gray-900"
                  : item.enabled
                    ? "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    : "cursor-not-allowed text-gray-300"
              )}
              onClick={(e) => {
                if (!item.enabled) e.preventDefault();
              }}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
              {!item.enabled && (
                <span className="ml-auto text-xs text-gray-300">Soon</span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Install lucide-react icons**

```bash
npm install lucide-react
```

- [ ] **Step 3: Create the topbar component**

Create `components/topbar.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

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
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <div />
      <div className="flex items-center gap-4">
        {profile && (
          <>
            <Badge variant="secondary">
              {roleLabel[profile.role] ?? profile.role}
            </Badge>
            <span className="text-sm text-gray-600">{profile.full_name}</span>
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
    </header>
  );
}
```

- [ ] **Step 4: Create the dashboard layout**

Create `app/(dashboard)/layout.tsx`:

```tsx
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Delete the default root `app/page.tsx`**

If it still exists, delete `app/page.tsx` — the dashboard page at `app/(dashboard)/page.tsx` will serve the `/` route.

- [ ] **Step 6: Commit**

```bash
git add components/sidebar.tsx components/topbar.tsx app/\(dashboard\)/layout.tsx
git commit -m "feat: add dashboard layout with sidebar navigation and topbar"
```

---

### Task 9: Dashboard Home Page with Placeholder KPIs

**Files:**
- Create: `components/kpi-card.tsx`, `app/(dashboard)/page.tsx`

- [ ] **Step 1: Create KPI card component**

Create `components/kpi-card.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
}

export function KpiCard({ title, value, description, icon: Icon }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-gray-400" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-gray-500 mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create dashboard home page**

Create `app/(dashboard)/page.tsx`:

```tsx
import { KpiCard } from "@/components/kpi-card";
import {
  Briefcase,
  Calculator,
  FileText,
  Users,
} from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-500">
          Welcome to the RS PCB Assembly management system.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Active Customers"
          value={11}
          description="Total active accounts"
          icon={Users}
        />
        <KpiCard
          title="Open Quotes"
          value={0}
          description="Pending review"
          icon={Calculator}
        />
        <KpiCard
          title="Active Jobs"
          value={0}
          description="In progress"
          icon={Briefcase}
        />
        <KpiCard
          title="Unpaid Invoices"
          value="$0.00"
          description="Outstanding balance"
          icon={FileText}
        />
      </div>

      <div className="rounded-lg border bg-white p-8 text-center text-gray-500">
        <p className="text-lg font-medium">Recent Activity</p>
        <p className="mt-2 text-sm">
          Activity feed will appear here as quotes, jobs, and invoices are created.
        </p>
      </div>
    </div>
  );
}
```

Note: KPI values are hardcoded placeholders for Sprint 1. They will be replaced with live Supabase queries in later sprints as quotes/jobs/invoices are implemented.

- [ ] **Step 3: Commit**

```bash
git add components/kpi-card.tsx app/\(dashboard\)/page.tsx
git commit -m "feat: add dashboard home page with placeholder KPI cards"
```

---

### Task 10: Customer List Page

**Files:**
- Create: `app/(dashboard)/customers/page.tsx`

- [ ] **Step 1: Create the customer list page**

Create `app/(dashboard)/customers/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SearchParams {
  search?: string;
  status?: string;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("*")
    .order("company_name", { ascending: true });

  // Filter by active/inactive
  if (params.status === "inactive") {
    query = query.eq("is_active", false);
  } else if (params.status !== "all") {
    query = query.eq("is_active", true);
  }

  // Search by code or company name
  if (params.search) {
    query = query.or(
      `code.ilike.%${params.search}%,company_name.ilike.%${params.search}%`
    );
  }

  const { data: customers, error } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Customers</h2>
          <p className="text-gray-500">
            {customers?.length ?? 0} customer{customers?.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <form className="flex items-center gap-2">
          <Input
            name="search"
            placeholder="Search customers..."
            defaultValue={params.search ?? ""}
            className="w-64"
          />
          <input type="hidden" name="status" value={params.status ?? ""} />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>
        <div className="flex gap-1">
          {["active", "inactive", "all"].map((s) => (
            <Link
              key={s}
              href={`/customers?status=${s}${params.search ? `&search=${params.search}` : ""}`}
            >
              <Button
                variant={(params.status ?? "active") === s ? "default" : "outline"}
                size="sm"
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            </Link>
          ))}
        </div>
      </div>

      {/* Table */}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load customers. Make sure your Supabase connection is configured.
        </div>
      ) : (
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Company Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Payment Terms</TableHead>
                <TableHead className="w-24">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers && customers.length > 0 ? (
                customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link
                        href={`/customers/${customer.id}`}
                        className="font-mono font-medium text-blue-600 hover:underline"
                      >
                        {customer.code}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      {customer.company_name}
                    </TableCell>
                    <TableCell>{customer.contact_name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {customer.contact_email ?? "—"}
                    </TableCell>
                    <TableCell>{customer.payment_terms}</TableCell>
                    <TableCell>
                      <Badge variant={customer.is_active ? "default" : "secondary"}>
                        {customer.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                    No customers found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

```bash
npm run dev
```

Navigate to http://localhost:3000/customers — should see the customer table. If Supabase isn't connected yet, the error message should display cleanly instead of crashing.

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/customers/
git commit -m "feat: add customer list page with search and status filters"
```

---

### Task 11: Customer Detail Page

**Files:**
- Create: `app/(dashboard)/customers/[id]/page.tsx`

- [ ] **Step 1: Create the customer detail page**

Create `app/(dashboard)/customers/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { formatPhone } from "@/lib/utils/format";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !customer) {
    notFound();
  }

  const bomConfig = customer.bom_config as Record<string, unknown>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/customers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Customers
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">
              {customer.company_name}
            </h2>
            <Badge variant={customer.is_active ? "default" : "secondary"}>
              {customer.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="font-mono text-gray-500">{customer.code}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
            <CardDescription>Primary contact details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Contact Name</p>
              <p className="text-sm">{customer.contact_name ?? "Not specified"}</p>
            </div>
            {customer.contact_email && (
              <div>
                <p className="text-sm font-medium text-gray-500">Email</p>
                <p className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <a
                    href={`mailto:${customer.contact_email}`}
                    className="text-blue-600 hover:underline"
                  >
                    {customer.contact_email}
                  </a>
                </p>
              </div>
            )}
            {customer.contact_phone && (
              <div>
                <p className="text-sm font-medium text-gray-500">Phone</p>
                <p className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-gray-400" />
                  {formatPhone(customer.contact_phone)}
                </p>
              </div>
            )}
            <Separator />
            <div>
              <p className="text-sm font-medium text-gray-500">Payment Terms</p>
              <p className="text-sm">{customer.payment_terms}</p>
            </div>
          </CardContent>
        </Card>

        {/* BOM Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>BOM Configuration</CardTitle>
            <CardDescription>
              How this customer's Bill of Materials files are parsed
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bomConfig && Object.keys(bomConfig).length > 0 ? (
              <pre className="overflow-x-auto rounded-md bg-gray-50 p-4 text-xs font-mono text-gray-700">
                {JSON.stringify(bomConfig, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-gray-500">
                No BOM configuration set. Auto-detection will be used.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {customer.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {customer.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Placeholder: Order History */}
      <Card>
        <CardHeader>
          <CardTitle>Order History</CardTitle>
          <CardDescription>
            Recent quotes, jobs, and invoices for this customer
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-gray-500">
            Order history will appear here once quotes and jobs are created (Sprint 2+).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(dashboard\)/customers/\[id\]/
git commit -m "feat: add customer detail page with contact info and BOM config"
```

---

### Task 12: Root Layout and Global Styles

**Files:**
- Modify: `app/layout.tsx`, `app/globals.css`

- [ ] **Step 1: Update root layout**

Replace `app/layout.tsx` content with:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "RS PCB Assembly — ERP",
  description: "Manufacturing management system for R.S. Électronique Inc.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify the full app flow**

```bash
npm run dev
```

Verify:
1. http://localhost:3000/login — shows login form
2. Dashboard layout with sidebar visible at `/` (after auth, or temporarily disable middleware to test)
3. Customer list at `/customers`
4. No console errors

- [ ] **Step 3: Run build check**

```bash
npm run build
```

Expected: Build succeeds with no errors. Fix any TypeScript or import issues.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "feat: configure root layout with Inter font and metadata"
```

---

### Task 13: Final Verification and Cleanup

**Files:**
- Modify: various (fix any issues found)
- Create: `.gitignore` additions if needed

- [ ] **Step 1: Verify `.gitignore` covers sensitive files**

Ensure `.gitignore` includes:
```
.env.local
.env*.local
```

These should already be present from create-next-app.

- [ ] **Step 2: Run a clean build**

```bash
rm -rf .next
npm run build
```

Expected: Clean build with no errors.

- [ ] **Step 3: Review all files for completeness**

Quick checklist:
- [ ] `middleware.ts` exists at project root (not inside `app/`)
- [ ] `lib/supabase/client.ts` and `lib/supabase/server.ts` exist
- [ ] `app/(auth)/login/page.tsx` renders
- [ ] `app/(dashboard)/layout.tsx` includes Sidebar and Topbar
- [ ] `app/(dashboard)/page.tsx` shows KPI cards
- [ ] `app/(dashboard)/customers/page.tsx` has search + filter
- [ ] `app/(dashboard)/customers/[id]/page.tsx` shows detail view
- [ ] `supabase/migrations/` has 3 SQL files
- [ ] All sidebar nav items present (most marked as "Soon")

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: Sprint 1 cleanup and verification"
```

---

## Acceptance Criteria

Once all tasks are complete and Supabase keys are configured in `.env.local`:

1. **Anas logs in** → sees the dashboard with 4 KPI cards
2. **Clicks "Customers"** in sidebar → sees table with Lanka, LABO, CSA, SBQuantum, etc.
3. **Searches "Lanka"** → table filters to show only TLAN
4. **Clicks "TLAN"** → sees Lanka contact info (Luis Esqueda) and BOM config JSON
5. **Other sidebar items** show "Soon" badge and are non-clickable
6. **Sign out** → returns to login page

## Post-Plan Notes

- **Database migrations** are SQL files stored in `supabase/migrations/`. They need to be applied manually via the Supabase SQL Editor or Supabase CLI (`supabase db push`). The implementing agent should note this clearly.
- **Supabase Auth users** (anas@, piyush@, hammad@) must be created manually in the Supabase dashboard under Authentication → Users. After creating auth users, insert corresponding rows into the `public.users` table with their roles.
- **FastAPI scaffolding** is deferred — it's a separate repo (`erp-rs-python/`) and the user can scaffold it independently. Sprint 1 doesn't need it.
- **Vercel deployment** is a `vercel` CLI operation after the code is pushed to GitHub — not a code task.
