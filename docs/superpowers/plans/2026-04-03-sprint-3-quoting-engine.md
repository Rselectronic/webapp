# Sprint 3: Quoting Engine + PDF Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full quoting system that turns a parsed BOM into a 4-tier priced quote with a downloadable PDF, end-to-end in the browser.

**Architecture:** A TypeScript pricing engine in `lib/pricing/` calculates per-tier totals (component cost + PCB + assembly + NRE) using overage data from the DB and part prices fetched from DigiKey V4 OAuth2 API (cached 7 days in `api_pricing_cache`). Quotes are stored in the `quotes` table, PDFs generated server-side with `@react-pdf/renderer` and stored in Supabase Storage. A settings page lets the CEO adjust markup rates without code changes.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL), `@react-pdf/renderer`, `@base-ui/react` (NOT Radix UI — `asChild` doesn't exist, `Select.onValueChange` is `(v: string | null) => void`), shadcn/ui components, DigiKey V4 API.

**Critical patterns to follow (learned from Sprints 1-2):**
- `params` and `searchParams` in server components are `Promise<{...}>` — always `await` them
- Supabase clients are untyped — cast join results with `as unknown as Type`
- `@base-ui/react` Select's `onValueChange` passes `string | null` — guard with `if (!v) return`
- No `asChild` prop on any `@base-ui` component — render button content directly inside trigger
- Quote numbers: `QT-YYMM-NNN` (e.g. `QT-2604-001`)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/005_app_settings.sql` | Create | `app_settings` key/value table + pricing defaults seed |
| `supabase/migrations/006_fix_overage_seed.sql` | Create | Fix overage_table seed (Sprint 2 used wrong columns) |
| `lib/pricing/types.ts` | Create | QuoteInput, PricingTier, QuotePricing, PricingSettings types |
| `lib/pricing/overage.ts` | Create | `getOverage(mCode, qty, tiers)` — matches Python logic |
| `lib/pricing/engine.ts` | Create | `calculateQuote(input, settings)` — full 4-tier pricing |
| `lib/pricing/digikey.ts` | Create | DigiKey V4 OAuth2 client — `getPartPrice(mpn)` |
| `app/api/pricing/[mpn]/route.ts` | Create | GET: DigiKey lookup + `api_pricing_cache` (7-day TTL) |
| `app/api/settings/route.ts` | Create | GET pricing settings, PATCH update (CEO only) |
| `app/api/quotes/route.ts` | Create | GET list, POST create quote |
| `app/api/quotes/[id]/route.ts` | Create | GET detail, PATCH status |
| `app/api/quotes/[id]/pdf/route.ts` | Create | GET: generate PDF, upload to storage, return URL |
| `components/quotes/quote-pdf.tsx` | Create | `@react-pdf/renderer` PDF template |
| `components/quotes/pricing-table.tsx` | Create | 4-tier side-by-side pricing display |
| `components/quotes/quote-status-badge.tsx` | Create | Status badge with colour coding |
| `app/(dashboard)/quotes/page.tsx` | Create | Quote list with status filter |
| `app/(dashboard)/quotes/new/page.tsx` | Create | Quote creation form (BOM select → quantities → review) |
| `app/(dashboard)/quotes/[id]/page.tsx` | Create | Quote detail + approve/send actions |
| `app/(dashboard)/settings/pricing/page.tsx` | Create | CEO pricing settings editor |
| `components/sidebar.tsx` | Modify | Enable Quotes and Settings nav items |

---

## Task 1: Setup — package, migrations, sidebar

**Files:**
- Create: `supabase/migrations/005_app_settings.sql`
- Create: `supabase/migrations/006_fix_overage_seed.sql`
- Modify: `components/sidebar.tsx`

- [ ] **Step 1: Install @react-pdf/renderer**

```bash
cd /Users/rselectronicpc/Documents/GitHub/webapp
npm install @react-pdf/renderer
npm install --save-dev @types/react-pdf
```

Expected: `@react-pdf/renderer` appears in `package.json` dependencies. `@types/react-pdf` may 404 — that's fine, skip it if so.

- [ ] **Step 2: Create app_settings migration**

Create `supabase/migrations/005_app_settings.sql`:

```sql
-- App-wide settings key/value store
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- CEO can read and write all settings
CREATE POLICY settings_ceo ON public.app_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ceo')
);

-- Operations manager can read settings
CREATE POLICY settings_ops_read ON public.app_settings FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ceo', 'operations_manager'))
);

-- Seed default pricing settings
INSERT INTO public.app_settings (key, value) VALUES (
  'pricing',
  '{
    "component_markup_pct": 20,
    "pcb_markup_pct": 30,
    "smt_cost_per_placement": 0.35,
    "th_cost_per_placement": 0.75,
    "mansmt_cost_per_placement": 1.25,
    "default_nre": 350,
    "default_shipping": 200,
    "quote_validity_days": 30,
    "labour_rate_per_hour": 75,
    "currency": "CAD"
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 3: Fix overage seed migration**

The Sprint 2 `004_seed_overage_table.sql` used wrong columns (`qty_min`, `qty_max`, `overage_pct`) — the real schema has `qty_threshold` and `extras`. Create `supabase/migrations/006_fix_overage_seed.sql`:

```sql
-- Fix overage seed: Sprint 2 used wrong column names.
-- Schema is: m_code TEXT, qty_threshold INT, extras INT
-- Logic: for a given board qty, find the highest matching threshold → use that extras value.

TRUNCATE public.overage_table;

INSERT INTO public.overage_table (m_code, qty_threshold, extras) VALUES
-- 0201 ultra-tiny: very high loss
('0201', 1,    50),
('0201', 100,  70),
('0201', 500,  100),
('0201', 1000, 150),

-- 0402 small passives
('0402', 1,    50),
('0402', 60,   60),
('0402', 100,  70),
('0402', 200,  80),
('0402', 300,  100),
('0402', 500,  120),

-- CP chip package (most common ~59%)
('CP',   1,    10),
('CP',   60,   30),
('CP',   100,  35),
('CP',   200,  40),
('CP',   300,  50),
('CP',   500,  60),

-- CPEXP expanded SMT
('CPEXP', 1,   10),
('CPEXP', 60,  25),
('CPEXP', 100, 30),
('CPEXP', 200, 35),
('CPEXP', 500, 45),

-- IP large ICs
('IP',   1,    5),
('IP',   10,   5),
('IP',   20,   10),
('IP',   50,   15),
('IP',   100,  20),
('IP',   250,  20),

-- TH through-hole
('TH',   1,    1),
('TH',   10,   1),
('TH',   20,   2),
('TH',   50,   5),
('TH',   100,  5),
('TH',   250,  20),

-- MANSMT manual SMT
('MANSMT', 1,   2),
('MANSMT', 50,  3),
('MANSMT', 100, 5),

-- MEC mechanical
('MEC',  1,    1),
('MEC',  100,  2),

-- Accs, CABLE, DEV B — minimal loss
('Accs', 1,    1),
('CABLE', 1,   1),
('DEV B', 1,   1)

ON CONFLICT (m_code, qty_threshold) DO UPDATE SET extras = EXCLUDED.extras;
```

- [ ] **Step 4: Enable Quotes and Settings in sidebar**

Modify `components/sidebar.tsx` — change `enabled: false` to `enabled: true` for Quotes and Settings:

```typescript
const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, enabled: true },
  { name: "Customers", href: "/customers", icon: Users, enabled: true },
  { name: "BOMs", href: "/bom", icon: FileSpreadsheet, enabled: true },
  { name: "Quotes", href: "/quotes", icon: Calculator, enabled: true },
  { name: "Jobs", href: "/jobs", icon: Briefcase, enabled: false },
  { name: "Procurement", href: "/procurement", icon: ShoppingCart, enabled: false },
  { name: "Production", href: "/production", icon: Factory, enabled: false },
  { name: "Invoices", href: "/invoices", icon: FileText, enabled: false },
  { name: "Reports", href: "/reports", icon: BarChart3, enabled: false },
  { name: "Settings", href: "/settings", icon: Settings, enabled: true },
];
```

- [ ] **Step 5: Verify build compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: No type errors. New routes not built yet — that's fine.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Sprint 3 setup — @react-pdf/renderer, settings migration, fix overage seed, enable Quotes nav"
```

---

## Task 2: Pricing types

**Files:**
- Create: `lib/pricing/types.ts`

- [ ] **Step 1: Create the file**

Create `lib/pricing/types.ts`:

```typescript
import type { MCode } from "@/lib/mcode/types";

/** A single component line contributing to quote pricing */
export interface PricingLine {
  bom_line_id: string;
  mpn: string;
  description: string;
  m_code: MCode | null;
  qty_per_board: number;
  unit_price: number | null;    // null = price not found
  price_source: "cache" | "digikey" | "manual" | null;
}

/** Overage tier row from overage_table */
export interface OverageTier {
  m_code: string;
  qty_threshold: number;
  extras: number;
}

/** Pricing settings from app_settings table */
export interface PricingSettings {
  component_markup_pct: number;       // e.g. 20 → 20%
  pcb_markup_pct: number;
  smt_cost_per_placement: number;     // e.g. 0.35 CAD
  th_cost_per_placement: number;      // e.g. 0.75 CAD
  mansmt_cost_per_placement: number;  // e.g. 1.25 CAD
  default_nre: number;
  default_shipping: number;
  quote_validity_days: number;
  labour_rate_per_hour: number;
  currency: string;
}

/** Per-quantity-tier pricing breakdown */
export interface PricingTier {
  board_qty: number;
  component_cost: number;
  pcb_cost: number;
  assembly_cost: number;
  nre_charge: number;
  shipping: number;
  subtotal: number;
  per_unit: number;
  smt_placements: number;
  th_placements: number;
  components_with_price: number;
  components_missing_price: number;
}

/** Input to the pricing engine */
export interface QuoteInput {
  lines: PricingLine[];
  quantities: [number, number, number, number];  // 4 tiers
  pcb_unit_price: number;
  nre_charge: number;
  shipping_flat: number;
  overages: OverageTier[];
  settings: PricingSettings;
}

/** Output from the pricing engine — one entry per tier */
export interface QuotePricing {
  tiers: PricingTier[];
  warnings: string[];   // e.g. "3 components missing prices — using $0"
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors in `lib/pricing/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/pricing/types.ts
git commit -m "feat: pricing types (QuoteInput, PricingTier, PricingSettings)"
```

---

## Task 3: Overage calculator

**Files:**
- Create: `lib/pricing/overage.ts`

- [ ] **Step 1: Create the file**

This mirrors the Python logic exactly: iterate tiers in order, keep updating `extras` as long as `qty >= threshold`. Return the last matched value.

Create `lib/pricing/overage.ts`:

```typescript
import type { OverageTier } from "./types";

/**
 * Return the number of extra parts to order for a given m_code at a given board qty.
 * Mirrors the Python get_overage() function from cp_ip_v3.py.
 *
 * Logic: find the highest threshold that qty meets → return that extras value.
 * Example: CP at qty=150 → thresholds 1,60,100 are all ≤ 150 → return extras for threshold=100 (35).
 */
export function getOverage(
  mCode: string | null,
  boardQty: number,
  tiers: OverageTier[]
): number {
  if (!mCode) return 0;

  const relevant = tiers
    .filter((t) => t.m_code === mCode)
    .sort((a, b) => a.qty_threshold - b.qty_threshold);

  if (relevant.length === 0) return 0;

  let extras = 0;
  for (const tier of relevant) {
    if (boardQty >= tier.qty_threshold) {
      extras = tier.extras;
    }
  }
  return extras;
}

/**
 * Total quantity to order for one component type.
 * order_qty = (qty_per_board × board_qty) + overage_extras
 */
export function getOrderQty(
  qtyPerBoard: number,
  boardQty: number,
  mCode: string | null,
  tiers: OverageTier[]
): number {
  const extras = getOverage(mCode, boardQty, tiers);
  return qtyPerBoard * boardQty + extras;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/pricing/overage.ts
git commit -m "feat: overage calculator (mirrors Python get_overage logic)"
```

---

## Task 4: Pricing engine

**Files:**
- Create: `lib/pricing/engine.ts`

- [ ] **Step 1: Create the file**

SMT m-codes that use `smt_cost_per_placement`: `CP`, `CPEXP`, `0402`, `0201`.
TH m-code uses `th_cost_per_placement`: `TH`.
MANSMT uses `mansmt_cost_per_placement`.
MEC, Accs, CABLE, DEV B — no placement cost.

Create `lib/pricing/engine.ts`:

```typescript
import type { QuoteInput, QuotePricing, PricingTier } from "./types";
import { getOrderQty } from "./overage";

const SMT_MCODES = new Set(["CP", "CPEXP", "0402", "0201"]);
const TH_MCODES = new Set(["TH"]);
const MANSMT_MCODES = new Set(["MANSMT"]);

export function calculateQuote(input: QuoteInput): QuotePricing {
  const { lines, quantities, pcb_unit_price, nre_charge, shipping_flat, overages, settings } = input;
  const markupMultiplier = 1 + settings.component_markup_pct / 100;
  const pcbMarkupMultiplier = 1 + settings.pcb_markup_pct / 100;

  const warnings: string[] = [];
  const tiers: PricingTier[] = [];

  for (const boardQty of quantities) {
    let componentCost = 0;
    let smtPlacements = 0;
    let thPlacements = 0;
    let mansmtPlacements = 0;
    let componentsWithPrice = 0;
    let componentsMissingPrice = 0;

    for (const line of lines) {
      const orderQty = getOrderQty(line.qty_per_board, boardQty, line.m_code, overages);
      const unitPrice = line.unit_price ?? 0;

      if (line.unit_price === null) {
        componentsMissingPrice++;
      } else {
        componentsWithPrice++;
      }

      componentCost += unitPrice * orderQty * markupMultiplier;

      // Placement counts (for assembly cost)
      if (line.m_code && SMT_MCODES.has(line.m_code)) {
        smtPlacements += line.qty_per_board;
      } else if (line.m_code && TH_MCODES.has(line.m_code)) {
        thPlacements += line.qty_per_board;
      } else if (line.m_code && MANSMT_MCODES.has(line.m_code)) {
        mansmtPlacements += line.qty_per_board;
      }
    }

    const pcbCost = pcb_unit_price * boardQty * pcbMarkupMultiplier;

    const assemblyCost =
      (smtPlacements * settings.smt_cost_per_placement +
       thPlacements * settings.th_cost_per_placement +
       mansmtPlacements * settings.mansmt_cost_per_placement) *
      boardQty;

    const subtotal = componentCost + pcbCost + assemblyCost + nre_charge + shipping_flat;
    const perUnit = boardQty > 0 ? subtotal / boardQty : 0;

    tiers.push({
      board_qty: boardQty,
      component_cost: round2(componentCost),
      pcb_cost: round2(pcbCost),
      assembly_cost: round2(assemblyCost),
      nre_charge: round2(nre_charge),
      shipping: round2(shipping_flat),
      subtotal: round2(subtotal),
      per_unit: round2(perUnit),
      smt_placements: smtPlacements,
      th_placements: thPlacements,
      components_with_price: componentsWithPrice,
      components_missing_price: componentsMissingPrice,
    });
  }

  if (tiers.some((t) => t.components_missing_price > 0)) {
    const max = Math.max(...tiers.map((t) => t.components_missing_price));
    warnings.push(`${max} component(s) have no price — using $0. Review before sending.`);
  }

  return { tiers, warnings };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/pricing/engine.ts
git commit -m "feat: pricing engine (4-tier calculation, overage, assembly cost)"
```

---

## Task 5: DigiKey client + pricing cache API

**Files:**
- Create: `lib/pricing/digikey.ts`
- Create: `app/api/pricing/[mpn]/route.ts`

- [ ] **Step 1: Create DigiKey OAuth2 client**

DigiKey V4 uses OAuth2 client_credentials. Token endpoint: `https://api.digikey.com/v1/oauth2/token`. Keyword search: `https://api.digikey.com/products/v4/search/keyword`.

Create `lib/pricing/digikey.ts`:

```typescript
/** DigiKey V4 OAuth2 client — server-side only */

const DIGIKEY_TOKEN_URL = "https://api.digikey.com/v1/oauth2/token";
const DIGIKEY_SEARCH_URL = "https://api.digikey.com/products/v4/search/keyword";

// In-memory token cache (reused within the same process/worker lifetime)
let cachedToken: { access_token: string; expires_at: number } | null = null;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.DIGIKEY_CLIENT_ID;
  const clientSecret = process.env.DIGIKEY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("DIGIKEY_CLIENT_ID and DIGIKEY_CLIENT_SECRET must be set");
  }

  if (cachedToken && Date.now() < cachedToken.expires_at - 60_000) {
    return cachedToken.access_token;
  }

  const res = await fetch(DIGIKEY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`DigiKey token error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.access_token;
}

export interface DigiKeyPartResult {
  mpn: string;
  description: string;
  unit_price: number;    // best price for qty=1
  currency: string;
  in_stock: boolean;
  digikey_pn: string;
}

export async function searchPartPrice(mpn: string): Promise<DigiKeyPartResult | null> {
  const token = await getAccessToken();
  const clientId = process.env.DIGIKEY_CLIENT_ID!;

  const res = await fetch(DIGIKEY_SEARCH_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "X-DIGIKEY-Client-Id": clientId,
      "X-DIGIKEY-Locale-Site": "CA",
      "X-DIGIKEY-Locale-Language": "en",
      "X-DIGIKEY-Locale-Currency": "CAD",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Keywords: mpn,
      Limit: 1,
      Offset: 0,
      FilterOptionsRequest: {},
      SortOptions: { Field: "None", SortOrder: "Ascending" },
    }),
  });

  if (!res.ok) return null;

  const data = await res.json() as {
    Products?: Array<{
      ManufacturerPartNumber: string;
      Description: { ProductDescription: string };
      UnitPrice: number;
      QuantityAvailable: number;
      DigiKeyPartNumber: string;
    }>;
  };

  const product = data.Products?.[0];
  if (!product) return null;

  return {
    mpn: product.ManufacturerPartNumber,
    description: product.Description.ProductDescription,
    unit_price: product.UnitPrice,
    currency: "CAD",
    in_stock: product.QuantityAvailable > 0,
    digikey_pn: product.DigiKeyPartNumber,
  };
}
```

- [ ] **Step 2: Create pricing cache API route**

Create `app/api/pricing/[mpn]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchPartPrice } from "@/lib/pricing/digikey";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mpn: string }> }
) {
  const { mpn } = await params;
  const supabase = await createClient();

  // Check cache first
  const { data: cached } = await supabase
    .from("api_pricing_cache")
    .select("unit_price, stock_qty, fetched_at, expires_at, source")
    .eq("source", "digikey")
    .eq("search_key", mpn)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (cached) {
    return NextResponse.json({
      mpn,
      unit_price: cached.unit_price,
      stock_qty: cached.stock_qty,
      source: "cache",
      fetched_at: cached.fetched_at,
    });
  }

  // Fetch from DigiKey
  try {
    const result = await searchPartPrice(mpn);

    if (!result) {
      return NextResponse.json({ mpn, unit_price: null, source: "digikey", error: "Not found" }, { status: 404 });
    }

    // Cache for 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("api_pricing_cache").upsert({
      source: "digikey",
      mpn: result.mpn,
      search_key: mpn,
      response: result as unknown as Record<string, unknown>,
      unit_price: result.unit_price,
      stock_qty: null,
      currency: result.currency,
      expires_at: expiresAt,
    }, { onConflict: "source,search_key" });

    return NextResponse.json({
      mpn: result.mpn,
      unit_price: result.unit_price,
      currency: result.currency,
      in_stock: result.in_stock,
      digikey_pn: result.digikey_pn,
      source: "digikey",
    });
  } catch (err) {
    return NextResponse.json(
      { mpn, unit_price: null, error: err instanceof Error ? err.message : "DigiKey unavailable" },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add lib/pricing/digikey.ts app/api/pricing
git commit -m "feat: DigiKey V4 OAuth2 client + pricing cache API route"
```

---

## Task 6: Settings API

**Files:**
- Create: `app/api/settings/route.ts`

- [ ] **Step 1: Create the file**

Create `app/api/settings/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { PricingSettings } from "@/lib/pricing/types";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const key = new URL(req.url).searchParams.get("key") ?? "pricing";

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Settings not found" }, { status: 404 });
  }

  return NextResponse.json(data.value);
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();

  // Verify CEO role
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "ceo") {
    return NextResponse.json({ error: "CEO role required" }, { status: 403 });
  }

  const key = new URL(req.url).searchParams.get("key") ?? "pricing";
  const updates = await req.json() as Partial<PricingSettings>;

  // Merge with existing
  const { data: existing } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .single();

  const merged = { ...(existing?.value as object ?? {}), ...updates };

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value: merged, updated_by: user.id, updated_at: new Date().toISOString() });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(merged);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/settings
git commit -m "feat: settings API (GET/PATCH pricing settings, CEO-only write)"
```

---

## Task 7: Quotes API — list + create

**Files:**
- Create: `app/api/quotes/route.ts`

- [ ] **Step 1: Create the file**

Quote number format: `QT-YYMM-NNN`. Count existing quotes for current month to get sequence.

Create `app/api/quotes/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateQuote } from "@/lib/pricing/engine";
import type { PricingLine, OverageTier, PricingSettings } from "@/lib/pricing/types";
import type { MCode } from "@/lib/mcode/types";

async function generateQuoteNumber(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `QT-${yy}${mm}-`;

  const { count } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .like("quote_number", `${prefix}%`);

  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const customerId = url.searchParams.get("customer_id");

  let query = supabase
    .from("quotes")
    .select("id, quote_number, status, created_at, quantities, pricing, customers(code, company_name), gmps(gmp_number, board_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);
  if (customerId) query = query.eq("customer_id", customerId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ quotes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    bom_id: string;
    gmp_id: string;
    customer_id: string;
    quantities: [number, number, number, number];
    pcb_unit_price: number;
    nre_charge: number;
    shipping_flat: number;
    notes?: string;
  };

  const { bom_id, gmp_id, customer_id, quantities, pcb_unit_price, nre_charge, shipping_flat, notes } = body;
  if (!bom_id || !gmp_id || !customer_id || !quantities?.length) {
    return NextResponse.json({ error: "bom_id, gmp_id, customer_id, quantities required" }, { status: 400 });
  }

  // Fetch BOM lines
  const { data: bomLines } = await supabase
    .from("bom_lines")
    .select("id, mpn, description, m_code, quantity, is_pcb")
    .eq("bom_id", bom_id)
    .eq("is_pcb", false);

  if (!bomLines?.length) {
    return NextResponse.json({ error: "No non-PCB BOM lines found" }, { status: 400 });
  }

  // Fetch pricing from cache for all MPNs
  const mpns = [...new Set(bomLines.map((l) => l.mpn).filter(Boolean))];
  const { data: cachedPrices } = await supabase
    .from("api_pricing_cache")
    .select("search_key, unit_price")
    .in("search_key", mpns)
    .gt("expires_at", new Date().toISOString());

  const priceMap = new Map<string, number>();
  for (const p of cachedPrices ?? []) {
    if (p.unit_price != null) priceMap.set(p.search_key, p.unit_price);
  }

  // Fetch overage tiers
  const { data: overageTiers } = await supabase
    .from("overage_table")
    .select("m_code, qty_threshold, extras");

  // Fetch pricing settings
  const { data: settingsRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "pricing")
    .single();

  const settings = (settingsRow?.value ?? {
    component_markup_pct: 20,
    pcb_markup_pct: 30,
    smt_cost_per_placement: 0.35,
    th_cost_per_placement: 0.75,
    mansmt_cost_per_placement: 1.25,
    default_nre: 350,
    default_shipping: 200,
    quote_validity_days: 30,
    labour_rate_per_hour: 75,
    currency: "CAD",
  }) as PricingSettings;

  const lines: PricingLine[] = bomLines.map((l) => ({
    bom_line_id: l.id,
    mpn: l.mpn ?? "",
    description: l.description ?? "",
    m_code: (l.m_code as MCode) ?? null,
    qty_per_board: l.quantity,
    unit_price: l.mpn ? (priceMap.get(l.mpn) ?? null) : null,
    price_source: l.mpn && priceMap.has(l.mpn) ? "cache" : null,
  }));

  const result = calculateQuote({
    lines,
    quantities,
    pcb_unit_price: pcb_unit_price ?? 0,
    nre_charge: nre_charge ?? settings.default_nre,
    shipping_flat: shipping_flat ?? settings.default_shipping,
    overages: (overageTiers ?? []) as OverageTier[],
    settings,
  });

  const quoteNumber = await generateQuoteNumber(supabase);
  const expiresAt = new Date(Date.now() + settings.quote_validity_days * 24 * 60 * 60 * 1000).toISOString();

  const { data: quote, error: insertError } = await supabase
    .from("quotes")
    .insert({
      quote_number: quoteNumber,
      customer_id,
      gmp_id,
      bom_id,
      status: "draft",
      quantities: { qty_1: quantities[0], qty_2: quantities[1], qty_3: quantities[2], qty_4: quantities[3] },
      pricing: result as unknown as Record<string, unknown>,
      component_markup: settings.component_markup_pct,
      pcb_cost_per_unit: pcb_unit_price,
      nre_charge,
      assembly_cost: result.tiers[0]?.assembly_cost ?? 0,
      validity_days: settings.quote_validity_days,
      notes: notes ?? null,
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select("id, quote_number")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ quote_id: quote.id, quote_number: quote.quote_number, pricing: result });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/quotes/route.ts
git commit -m "feat: quotes API list + create (auto quote number, 4-tier pricing)"
```

---

## Task 8: Quotes API — get + update status

**Files:**
- Create: `app/api/quotes/[id]/route.ts`

- [ ] **Step 1: Create the file**

Create `app/api/quotes/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quote, error } = await supabase
    .from("quotes")
    .select("*, customers(code, company_name, contact_name, contact_email), gmps(gmp_number, board_name), boms(file_name, revision)")
    .eq("id", id)
    .single();

  if (error || !quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  return NextResponse.json(quote);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { status?: string; notes?: string };
  const allowed = ["draft", "review", "sent", "accepted", "rejected", "expired"];

  if (body.status && !allowed.includes(body.status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${allowed.join(", ")}` }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) {
    updates.status = body.status;
    if (body.status === "sent") updates.issued_at = new Date().toISOString();
    if (body.status === "accepted") updates.accepted_at = new Date().toISOString();
  }
  if (body.notes !== undefined) updates.notes = body.notes;

  const { data, error } = await supabase
    .from("quotes")
    .update(updates)
    .eq("id", id)
    .select("id, quote_number, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/quotes/[id]/route.ts"
git commit -m "feat: quotes API GET detail + PATCH status (draft→sent→accepted)"
```

---

## Task 9: Quote status badge + pricing table components

**Files:**
- Create: `components/quotes/quote-status-badge.tsx`
- Create: `components/quotes/pricing-table.tsx`

- [ ] **Step 1: Create quote status badge**

Create `components/quotes/quote-status-badge.tsx`:

```typescript
import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  draft:    { label: "Draft",    variant: "secondary" },
  review:   { label: "Review",   variant: "secondary" },
  sent:     { label: "Sent",     variant: "default" },
  accepted: { label: "Accepted", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  expired:  { label: "Expired",  variant: "destructive" },
};

export function QuoteStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
```

- [ ] **Step 2: Create pricing table component**

Create `components/quotes/pricing-table.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import type { PricingTier } from "@/lib/pricing/types";

interface PricingTableProps {
  tiers: PricingTier[];
  warnings?: string[];
}

const ROWS: { key: keyof PricingTier; label: string; highlight?: boolean }[] = [
  { key: "component_cost",   label: "Components" },
  { key: "pcb_cost",         label: "PCB" },
  { key: "assembly_cost",    label: "Assembly" },
  { key: "nre_charge",       label: "NRE" },
  { key: "shipping",         label: "Shipping" },
  { key: "subtotal",         label: "Total",    highlight: true },
  { key: "per_unit",         label: "Per Unit", highlight: true },
];

export function PricingTable({ tiers, warnings }: PricingTableProps) {
  return (
    <div className="space-y-3">
      {warnings && warnings.length > 0 && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-2">
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-orange-700">{w}</p>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-2 text-left text-xs text-gray-500 font-medium">Cost Breakdown</th>
              {tiers.map((t) => (
                <th key={t.board_qty} className="px-4 py-2 text-right text-xs text-gray-500 font-medium">
                  {t.board_qty} units
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ key, label, highlight }) => (
              <tr
                key={key}
                className={highlight ? "border-t bg-gray-50 font-semibold" : "border-t"}
              >
                <td className="px-4 py-2 text-gray-600">{label}</td>
                {tiers.map((t) => (
                  <td key={t.board_qty} className={`px-4 py-2 text-right font-mono ${highlight ? "text-gray-900" : "text-gray-700"}`}>
                    {formatCurrency(t[key] as number)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {tiers.map((t) => (
          <Card key={t.board_qty} className="text-center">
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-xs text-gray-500">{t.board_qty} units</CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <p className="text-xl font-bold">{formatCurrency(t.per_unit)}</p>
              <p className="text-xs text-gray-400">/unit</p>
              {t.components_missing_price > 0 && (
                <p className="text-xs text-orange-500 mt-1">{t.components_missing_price} missing prices</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/quotes
git commit -m "feat: QuoteStatusBadge + PricingTable components"
```

---

## Task 10: Settings pricing page

**Files:**
- Create: `app/(dashboard)/settings/pricing/page.tsx`

- [ ] **Step 1: Create the file**

Create `app/(dashboard)/settings/pricing/page.tsx`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PricingSettingsForm } from "@/components/settings/pricing-settings-form";
import type { PricingSettings } from "@/lib/pricing/types";

export default async function PricingSettingsPage() {
  const supabase = await createClient();

  // CEO only
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("users").select("role").eq("id", user!.id).single();
  if (profile?.role !== "ceo") redirect("/");

  const { data: settingsRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "pricing")
    .single();

  const settings = (settingsRow?.value ?? {}) as PricingSettings;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Pricing Settings</h2>
        <p className="text-sm text-gray-500">Adjust markup rates, assembly costs, and NRE defaults.</p>
      </div>
      <PricingSettingsForm settings={settings} />
    </div>
  );
}
```

- [ ] **Step 2: Create the form component**

Create `components/settings/pricing-settings-form.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PricingSettings } from "@/lib/pricing/types";

interface Props {
  settings: PricingSettings;
}

export function PricingSettingsForm({ settings: initial }: Props) {
  const [settings, setSettings] = useState<PricingSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof PricingSettings, value: string) {
    const num = parseFloat(value);
    setSettings((prev) => ({ ...prev, [key]: isNaN(num) ? value : num }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings?key=pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Save failed");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const fields: { key: keyof PricingSettings; label: string; suffix: string }[] = [
    { key: "component_markup_pct",      label: "Component markup",         suffix: "%" },
    { key: "pcb_markup_pct",            label: "PCB markup",               suffix: "%" },
    { key: "smt_cost_per_placement",    label: "SMT cost / placement",     suffix: "CAD" },
    { key: "th_cost_per_placement",     label: "TH cost / placement",      suffix: "CAD" },
    { key: "mansmt_cost_per_placement", label: "Manual SMT cost / placement", suffix: "CAD" },
    { key: "default_nre",               label: "Default NRE",              suffix: "CAD" },
    { key: "default_shipping",          label: "Default shipping",         suffix: "CAD" },
    { key: "quote_validity_days",       label: "Quote validity",           suffix: "days" },
    { key: "labour_rate_per_hour",      label: "Labour rate",              suffix: "CAD/hr" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quote Pricing Defaults</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map(({ key, label, suffix }) => (
          <div key={key} className="flex items-center gap-4">
            <Label className="w-48 shrink-0 text-sm">{label}</Label>
            <div className="flex flex-1 items-center gap-2">
              <Input
                type="number"
                step="0.01"
                value={String(settings[key] ?? "")}
                onChange={(e) => set(key, e.target.value)}
                className="max-w-[140px] font-mono"
              />
              <span className="text-xs text-gray-500">{suffix}</span>
            </div>
          </div>
        ))}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">Settings saved.</p>}

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/settings" components/settings
git commit -m "feat: pricing settings page (CEO-only, editable rates)"
```

---

## Task 11: Quote list page

**Files:**
- Create: `app/(dashboard)/quotes/page.tsx`

- [ ] **Step 1: Create the file**

Create `app/(dashboard)/quotes/page.tsx`:

```typescript
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";
import { formatDateTime, formatCurrency } from "@/lib/utils/format";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("quotes")
    .select("id, quote_number, status, quantities, pricing, created_at, customers(code, company_name), gmps(gmp_number)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);

  const { data: quotes } = await query;

  const statuses = ["draft", "review", "sent", "accepted", "rejected", "expired"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Quotes</h2>
          <p className="text-sm text-gray-500 mt-1">{quotes?.length ?? 0} quotes</p>
        </div>
        <Link href="/quotes/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Quote
          </Button>
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        <Link href="/quotes">
          <Button variant={!status ? "default" : "outline"} size="sm">All</Button>
        </Link>
        {statuses.map((s) => (
          <Link key={s} href={`/quotes?status=${s}`}>
            <Button variant={status === s ? "default" : "outline"} size="sm" className="capitalize">
              {s}
            </Button>
          </Link>
        ))}
      </div>

      {(!quotes || quotes.length === 0) ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-gray-500 mb-4">No quotes found.</p>
            <Link href="/quotes/new">
              <Button variant="outline">Create your first quote</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Quotes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quote #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>GMP</TableHead>
                    <TableHead>Quantities</TableHead>
                    <TableHead className="text-right">Per Unit (min qty)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((q) => {
                    const customer = q.customers as unknown as { code: string; company_name: string } | null;
                    const gmp = q.gmps as unknown as { gmp_number: string } | null;
                    const qtys = q.quantities as Record<string, number> | null;
                    const pricing = q.pricing as unknown as { tiers?: Array<{ per_unit: number }> } | null;
                    const maxTierPerUnit = pricing?.tiers?.[0]?.per_unit;
                    return (
                      <TableRow key={q.id}>
                        <TableCell>
                          <Link href={`/quotes/${q.id}`} className="font-mono text-blue-600 hover:underline text-sm">
                            {q.quote_number}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="font-mono text-xs text-gray-500">{customer?.code}</span>
                          {" "}{customer?.company_name}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{gmp?.gmp_number}</TableCell>
                        <TableCell className="text-xs text-gray-600">
                          {qtys ? Object.values(qtys).join(" / ") : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {maxTierPerUnit != null ? formatCurrency(maxTierPerUnit) : "—"}
                        </TableCell>
                        <TableCell>
                          <QuoteStatusBadge status={q.status} />
                        </TableCell>
                        <TableCell className="text-xs text-gray-500">
                          {formatDateTime(q.created_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/quotes/page.tsx"
git commit -m "feat: quote list page with status filter tabs"
```

---

## Task 12: Quote creation form (new quote page)

**Files:**
- Create: `app/(dashboard)/quotes/new/page.tsx`
- Create: `components/quotes/new-quote-form.tsx`

- [ ] **Step 1: Create the server page**

Create `app/(dashboard)/quotes/new/page.tsx`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NewQuoteForm } from "@/components/quotes/new-quote-form";

export default async function NewQuotePage() {
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("customers")
    .select("id, code, company_name")
    .eq("is_active", true)
    .order("code");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">New Quote</h2>
        <p className="text-sm text-gray-500">Select a parsed BOM, enter quantities, and generate pricing.</p>
      </div>
      <NewQuoteForm customers={customers ?? []} />
    </div>
  );
}
```

- [ ] **Step 2: Create the quote form component**

Create `components/quotes/new-quote-form.tsx`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw } from "lucide-react";
import { PricingTable } from "./pricing-table";
import type { PricingTier } from "@/lib/pricing/types";

interface Customer { id: string; code: string; company_name: string; }
interface Bom { id: string; file_name: string; revision: string; gmp_id: string; gmps: { gmp_number: string } | null; }

interface Props {
  customers: Customer[];
}

export function NewQuoteForm({ customers }: Props) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [boms, setBoms] = useState<Bom[]>([]);
  const [bomId, setBomId] = useState("");
  const [quantities, setQuantities] = useState(["50", "100", "250", "500"]);
  const [pcbPrice, setPcbPrice] = useState("0");
  const [nre, setNre] = useState("350");
  const [shipping, setShipping] = useState("200");
  const [preview, setPreview] = useState<{ tiers: PricingTier[]; warnings: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCustomerChange = useCallback(async (id: string | null) => {
    if (!id) return;
    setCustomerId(id);
    setBomId("");
    setPreview(null);
    setBoms([]);
    const res = await fetch(`/api/boms?customer_id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setBoms(data.boms ?? []);
    }
  }, []);

  async function handlePreview() {
    if (!bomId || quantities.some((q) => !q || isNaN(Number(q)))) {
      setError("Select a BOM and enter 4 valid quantities.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/quotes/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bom_id: bomId,
          quantities: quantities.map(Number),
          pcb_unit_price: parseFloat(pcbPrice) || 0,
          nre_charge: parseFloat(nre) || 0,
          shipping_flat: parseFloat(shipping) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      setPreview(data.pricing);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!preview || !bomId) return;
    const selectedBom = boms.find((b) => b.id === bomId);
    if (!selectedBom) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bom_id: bomId,
          gmp_id: selectedBom.gmp_id,
          customer_id: customerId,
          quantities: quantities.map(Number),
          pcb_unit_price: parseFloat(pcbPrice) || 0,
          nre_charge: parseFloat(nre) || 0,
          shipping_flat: parseFloat(shipping) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      router.push(`/quotes/${data.quote_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Customer */}
      <div className="space-y-2">
        <Label>Customer</Label>
        <Select value={customerId} onValueChange={handleCustomerChange}>
          <SelectTrigger><SelectValue placeholder="Select a customer..." /></SelectTrigger>
          <SelectContent>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.code} — {c.company_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* BOM select */}
      {customerId && (
        <div className="space-y-2">
          <Label>Parsed BOM</Label>
          {boms.length === 0 ? (
            <p className="text-sm text-gray-500">No parsed BOMs for this customer. <a href="/bom/upload" className="text-blue-600 hover:underline">Upload one first.</a></p>
          ) : (
            <Select value={bomId} onValueChange={(v) => { if (v) { setBomId(v); setPreview(null); } }}>
              <SelectTrigger><SelectValue placeholder="Select a BOM..." /></SelectTrigger>
              <SelectContent>
                {boms.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.file_name} — Rev {b.revision} ({(b.gmps as unknown as { gmp_number: string } | null)?.gmp_number ?? ""})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Quantities + costs */}
      {bomId && (
        <Card>
          <CardHeader><CardTitle className="text-base">Quantities & Costs</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-2 block">Board Quantities (4 tiers)</Label>
              <div className="grid grid-cols-4 gap-2">
                {quantities.map((q, i) => (
                  <Input
                    key={i}
                    type="number"
                    value={q}
                    placeholder={`Qty ${i + 1}`}
                    onChange={(e) => {
                      const next = [...quantities];
                      next[i] = e.target.value;
                      setQuantities(next);
                      setPreview(null);
                    }}
                    className="font-mono text-center"
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "PCB unit price (CAD)", value: pcbPrice, set: setPcbPrice },
                { label: "NRE charge (CAD)",      value: nre,      set: setNre },
                { label: "Shipping flat (CAD)",    value: shipping, set: setShipping },
              ].map(({ label, value, set }) => (
                <div key={label} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={value}
                    onChange={(e) => { set(e.target.value); setPreview(null); }}
                    className="font-mono"
                  />
                </div>
              ))}
            </div>
            <Button variant="outline" onClick={handlePreview} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Calculate Pricing
            </Button>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Pricing preview */}
      {preview && (
        <div className="space-y-4">
          <PricingTable tiers={preview.tiers} warnings={preview.warnings} />
          <Button onClick={handleCreate} disabled={saving} className="w-full">
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating Quote...</> : "Save Quote as Draft"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create quote preview API route**

The form calls `/api/quotes/preview` to calculate pricing without saving. Create `app/api/quotes/preview/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateQuote } from "@/lib/pricing/engine";
import type { PricingLine, OverageTier, PricingSettings } from "@/lib/pricing/types";
import type { MCode } from "@/lib/mcode/types";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json() as {
    bom_id: string;
    quantities: [number, number, number, number];
    pcb_unit_price: number;
    nre_charge: number;
    shipping_flat: number;
  };

  const { bom_id, quantities, pcb_unit_price, nre_charge, shipping_flat } = body;
  if (!bom_id || !quantities?.length) {
    return NextResponse.json({ error: "bom_id and quantities required" }, { status: 400 });
  }

  const [bomLinesResult, overagesResult, settingsResult] = await Promise.all([
    supabase.from("bom_lines").select("id, mpn, description, m_code, quantity").eq("bom_id", bom_id).eq("is_pcb", false),
    supabase.from("overage_table").select("m_code, qty_threshold, extras"),
    supabase.from("app_settings").select("value").eq("key", "pricing").single(),
  ]);

  const bomLines = bomLinesResult.data ?? [];
  const mpns = [...new Set(bomLines.map((l) => l.mpn).filter(Boolean))];

  const { data: cachedPrices } = await supabase
    .from("api_pricing_cache")
    .select("search_key, unit_price")
    .in("search_key", mpns)
    .gt("expires_at", new Date().toISOString());

  const priceMap = new Map<string, number>();
  for (const p of cachedPrices ?? []) {
    if (p.unit_price != null) priceMap.set(p.search_key, p.unit_price);
  }

  const settings = (settingsResult.data?.value ?? {
    component_markup_pct: 20, pcb_markup_pct: 30,
    smt_cost_per_placement: 0.35, th_cost_per_placement: 0.75,
    mansmt_cost_per_placement: 1.25, default_nre: 350,
    default_shipping: 200, quote_validity_days: 30,
    labour_rate_per_hour: 75, currency: "CAD",
  }) as PricingSettings;

  const lines: PricingLine[] = bomLines.map((l) => ({
    bom_line_id: l.id,
    mpn: l.mpn ?? "",
    description: l.description ?? "",
    m_code: (l.m_code as MCode) ?? null,
    qty_per_board: l.quantity,
    unit_price: l.mpn ? (priceMap.get(l.mpn) ?? null) : null,
    price_source: l.mpn && priceMap.has(l.mpn) ? "cache" : null,
  }));

  const result = calculateQuote({
    lines,
    quantities,
    pcb_unit_price: pcb_unit_price ?? 0,
    nre_charge: nre_charge ?? settings.default_nre,
    shipping_flat: shipping_flat ?? settings.default_shipping,
    overages: (overagesResult.data ?? []) as OverageTier[],
    settings,
  });

  return NextResponse.json({ pricing: result });
}
```

- [ ] **Step 4: Create BOMs list API (needed by new-quote-form)**

Create `app/api/boms/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const customerId = new URL(req.url).searchParams.get("customer_id");

  let query = supabase
    .from("boms")
    .select("id, file_name, revision, status, gmp_id, gmps(gmp_number)")
    .eq("status", "parsed")
    .order("created_at", { ascending: false });

  if (customerId) query = query.eq("customer_id", customerId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ boms: data ?? [] });
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/quotes/new" components/quotes/new-quote-form.tsx app/api/quotes/preview app/api/boms
git commit -m "feat: new quote form — BOM select, quantities, pricing preview, save as draft"
```

---

## Task 13: Quote detail page

**Files:**
- Create: `app/(dashboard)/quotes/[id]/page.tsx`

- [ ] **Step 1: Create the file**

Create `app/(dashboard)/quotes/[id]/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileDown } from "lucide-react";
import { formatDateTime, formatDate } from "@/lib/utils/format";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import { PricingTable } from "@/components/quotes/pricing-table";
import { QuoteActions } from "@/components/quotes/quote-actions";
import type { PricingTier } from "@/lib/pricing/types";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, customers(code, company_name, contact_name, contact_email), gmps(gmp_number, board_name), boms(file_name, revision)")
    .eq("id", id)
    .single();

  if (!quote) notFound();

  const customer = quote.customers as unknown as { code: string; company_name: string; contact_name: string | null; contact_email: string | null } | null;
  const gmp = quote.gmps as unknown as { gmp_number: string; board_name: string | null } | null;
  const bom = quote.boms as unknown as { file_name: string; revision: string } | null;
  const pricing = quote.pricing as unknown as { tiers?: PricingTier[]; warnings?: string[] } | null;
  const quantities = quote.quantities as Record<string, number> | null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/quotes">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />All Quotes
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold font-mono text-gray-900">{quote.quote_number}</h2>
          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
            <span className="font-mono">{customer?.code}</span>
            <span>—</span>
            <span>{customer?.company_name}</span>
            <span>·</span>
            <span className="font-mono">{gmp?.gmp_number}</span>
            {gmp?.board_name && <><span>·</span><span>{gmp.board_name}</span></>}
          </div>
        </div>
        <QuoteStatusBadge status={quote.status} />
      </div>

      {/* Meta info */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "BOM File", value: bom ? `${bom.file_name} (Rev ${bom.revision})` : "—" },
          { label: "Quantities", value: quantities ? Object.values(quantities).join(" / ") : "—" },
          { label: "Expires", value: quote.expires_at ? formatDate(quote.expires_at) : "—" },
          { label: "NRE", value: `$${quote.nre_charge ?? 0}` },
          { label: "PCB Unit Price", value: `$${quote.pcb_cost_per_unit ?? 0}` },
          { label: "Component Markup", value: `${quote.component_markup ?? 0}%` },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-xs text-gray-500">{label}</CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <p className="text-sm font-medium">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pricing table */}
      {pricing?.tiers && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Pricing Breakdown</h3>
          <PricingTable tiers={pricing.tiers} warnings={pricing.warnings} />
        </div>
      )}

      {/* Contact info */}
      {customer?.contact_email && (
        <Card>
          <CardHeader><CardTitle className="text-base">Customer Contact</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {customer.contact_name && <p><span className="text-gray-500">Name:</span> {customer.contact_name}</p>}
            <p><span className="text-gray-500">Email:</span> <a href={`mailto:${customer.contact_email}`} className="text-blue-600 hover:underline">{customer.contact_email}</a></p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <QuoteActions quoteId={id} currentStatus={quote.status} pdfPath={quote.pdf_path} />
        <a href={`/api/quotes/${id}/pdf`} target="_blank" rel="noopener noreferrer">
          <Button variant="outline">
            <FileDown className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </a>
      </div>

      {/* Notes */}
      {quote.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-gray-700">{quote.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <p className="text-xs text-gray-400">
        Created {formatDateTime(quote.created_at)}
        {quote.issued_at && ` · Sent ${formatDateTime(quote.issued_at)}`}
        {quote.accepted_at && ` · Accepted ${formatDateTime(quote.accepted_at)}`}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create QuoteActions client component**

Create `components/quotes/quote-actions.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface Props {
  quoteId: string;
  currentStatus: string;
  pdfPath: string | null;
}

const NEXT_STATUS: Record<string, { label: string; status: string }> = {
  draft:   { label: "Submit for Review", status: "review" },
  review:  { label: "Mark as Sent",      status: "sent" },
  sent:    { label: "Mark as Accepted",  status: "accepted" },
};

export function QuoteActions({ quoteId, currentStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = NEXT_STATUS[currentStatus];
  if (!next) return null;

  async function advance() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next.status }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Update failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={advance} disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {next.label}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/quotes/[id]" components/quotes/quote-actions.tsx
git commit -m "feat: quote detail page with pricing breakdown + approval actions"
```

---

## Task 14: PDF generation

**Files:**
- Create: `components/quotes/quote-pdf.tsx`
- Create: `app/api/quotes/[id]/pdf/route.ts`

- [ ] **Step 1: Create the PDF template**

`@react-pdf/renderer` uses its own JSX elements (`Document`, `Page`, `View`, `Text`, `StyleSheet`) — NOT HTML. Import from `@react-pdf/renderer`.

Create `components/quotes/quote-pdf.tsx`:

```typescript
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { PricingTier } from "@/lib/pricing/types";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, padding: 40, color: "#1a1a1a" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24, borderBottom: "1 solid #e5e7eb", paddingBottom: 12 },
  companyName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#111827" },
  companyDetail: { fontSize: 8, color: "#6b7280", marginTop: 1 },
  quoteTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", textAlign: "right", color: "#111827" },
  quoteNumber: { fontSize: 10, color: "#6b7280", textAlign: "right", marginTop: 2 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 6, color: "#374151" },
  row: { flexDirection: "row", marginBottom: 2 },
  label: { width: 120, color: "#6b7280" },
  value: { flex: 1, color: "#111827" },
  table: { borderTop: "1 solid #e5e7eb" },
  tableHeader: { flexDirection: "row", backgroundColor: "#f9fafb", borderBottom: "1 solid #e5e7eb", paddingVertical: 4, paddingHorizontal: 6 },
  tableHeaderCell: { fontFamily: "Helvetica-Bold", color: "#374151", textAlign: "right" },
  tableRow: { flexDirection: "row", borderBottom: "1 solid #f3f4f6", paddingVertical: 4, paddingHorizontal: 6 },
  tableCell: { textAlign: "right", color: "#374151" },
  totalRow: { flexDirection: "row", borderTop: "2 solid #e5e7eb", paddingVertical: 5, paddingHorizontal: 6, backgroundColor: "#f9fafb" },
  totalCell: { textAlign: "right", fontFamily: "Helvetica-Bold", color: "#111827" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, borderTop: "1 solid #e5e7eb", paddingTop: 8, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 7, color: "#9ca3af" },
  warning: { backgroundColor: "#fff7ed", border: "1 solid #fed7aa", padding: 8, marginBottom: 12, borderRadius: 4 },
  warningText: { color: "#c2410c", fontSize: 8 },
  validity: { backgroundColor: "#eff6ff", padding: 8, marginTop: 12, borderRadius: 4 },
  validityText: { color: "#1d4ed8", fontSize: 8 },
});

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

interface QuotePDFProps {
  quoteNumber: string;
  customerName: string;
  contactName?: string | null;
  gmpNumber: string;
  boardName?: string | null;
  bomFile: string;
  quantities: number[];
  tiers: PricingTier[];
  warnings: string[];
  nreCharge: number;
  validityDays: number;
  issuedAt?: string | null;
  notes?: string | null;
}

export function QuotePDF({
  quoteNumber, customerName, contactName, gmpNumber, boardName,
  bomFile, quantities, tiers, warnings, nreCharge, validityDays, issuedAt, notes,
}: QuotePDFProps) {
  const qtyColWidth = String(Math.floor(300 / tiers.length));
  const today = issuedAt ? new Date(issuedAt).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }) : new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });

  const BREAKDOWN: { key: keyof PricingTier; label: string; bold?: boolean }[] = [
    { key: "component_cost", label: "Components" },
    { key: "pcb_cost",       label: "PCB" },
    { key: "assembly_cost",  label: "Assembly" },
    { key: "nre_charge",     label: "NRE / Setup" },
    { key: "shipping",       label: "Shipping" },
    { key: "subtotal",       label: "Total (CAD)",  bold: true },
    { key: "per_unit",       label: "Per Unit (CAD)", bold: true },
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>R.S. ÉLECTRONIQUE INC.</Text>
            <Text style={styles.companyDetail}>5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9</Text>
            <Text style={styles.companyDetail}>+1 (438) 833-8477 · info@rspcbassembly.com</Text>
            <Text style={styles.companyDetail}>GST: 840134829 · QST: 1214617001</Text>
          </View>
          <View>
            <Text style={styles.quoteTitle}>QUOTATION</Text>
            <Text style={styles.quoteNumber}>{quoteNumber}</Text>
            <Text style={[styles.quoteNumber, { marginTop: 4 }]}>{today}</Text>
          </View>
        </View>

        {/* Bill To */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill To</Text>
          <Text style={styles.value}>{customerName}</Text>
          {contactName && <Text style={[styles.value, { color: "#6b7280" }]}>{contactName}</Text>}
        </View>

        {/* Quote details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quote Details</Text>
          <View style={styles.row}>
            <Text style={styles.label}>GMP Number</Text>
            <Text style={styles.value}>{gmpNumber}{boardName ? ` — ${boardName}` : ""}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>BOM File</Text>
            <Text style={styles.value}>{bomFile}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Validity</Text>
            <Text style={styles.value}>{validityDays} days from issue date</Text>
          </View>
          {nreCharge > 0 && (
            <View style={styles.row}>
              <Text style={styles.label}>NRE / Setup</Text>
              <Text style={styles.value}>{fmt(nreCharge)} (one-time, included in pricing)</Text>
            </View>
          )}
        </View>

        {/* Warnings */}
        {warnings.length > 0 && (
          <View style={styles.warning}>
            {warnings.map((w, i) => <Text key={i} style={styles.warningText}>⚠ {w}</Text>)}
          </View>
        )}

        {/* Pricing table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pricing by Quantity</Text>
          <View style={styles.table}>
            {/* Table header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: "left" }]}>Description</Text>
              {tiers.map((t) => (
                <Text key={t.board_qty} style={[styles.tableHeaderCell, { width: qtyColWidth }]}>
                  {t.board_qty} units
                </Text>
              ))}
            </View>
            {/* Rows */}
            {BREAKDOWN.map(({ key, label, bold }) => (
              <View key={key} style={bold ? styles.totalRow : styles.tableRow}>
                <Text style={[bold ? styles.totalCell : styles.tableCell, { flex: 2, textAlign: "left" }]}>{label}</Text>
                {tiers.map((t) => (
                  <Text key={t.board_qty} style={[bold ? styles.totalCell : styles.tableCell, { width: qtyColWidth }]}>
                    {fmt(t[key] as number)}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </View>

        {notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={{ color: "#374151", fontSize: 8, lineHeight: 1.5 }}>{notes}</Text>
          </View>
        )}

        <View style={styles.validity}>
          <Text style={styles.validityText}>
            This quotation is valid for {validityDays} days from the issue date. Prices are in Canadian dollars (CAD) and exclude applicable taxes (TPS/GST 5%, TVQ/QST 9.975%).
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>R.S. ÉLECTRONIQUE INC. · rspcbassembly.com</Text>
          <Text style={styles.footerText}>{quoteNumber}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Create the PDF API route**

Create `app/api/quotes/[id]/pdf/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { QuotePDF } from "@/components/quotes/quote-pdf";
import type { PricingTier } from "@/lib/pricing/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, customers(code, company_name, contact_name), gmps(gmp_number, board_name), boms(file_name, revision)")
    .eq("id", id)
    .single();

  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  const customer = quote.customers as unknown as { code: string; company_name: string; contact_name: string | null } | null;
  const gmp = quote.gmps as unknown as { gmp_number: string; board_name: string | null } | null;
  const bom = quote.boms as unknown as { file_name: string; revision: string } | null;
  const pricing = quote.pricing as unknown as { tiers?: PricingTier[]; warnings?: string[] } | null;
  const quantities = quote.quantities as Record<string, number> | null;

  const tiers = pricing?.tiers ?? [];
  const warnings = pricing?.warnings ?? [];

  const pdfBuffer = await renderToBuffer(
    createElement(QuotePDF, {
      quoteNumber: quote.quote_number,
      customerName: customer?.company_name ?? "Unknown",
      contactName: customer?.contact_name,
      gmpNumber: gmp?.gmp_number ?? "—",
      boardName: gmp?.board_name,
      bomFile: bom ? `${bom.file_name} Rev ${bom.revision}` : "—",
      quantities: quantities ? Object.values(quantities) : [],
      tiers,
      warnings,
      nreCharge: quote.nre_charge ?? 0,
      validityDays: quote.validity_days ?? 30,
      issuedAt: quote.issued_at,
      notes: quote.notes,
    })
  );

  // Upload to Supabase Storage
  const path = `${customer?.code ?? "unknown"}/${gmp?.gmp_number ?? "unknown"}/${quote.quote_number}.pdf`;
  await supabase.storage.from("quotes").upload(path, pdfBuffer, {
    contentType: "application/pdf",
    upsert: true,
  });

  // Update quote with pdf_path
  await supabase.from("quotes").update({ pdf_path: path }).eq("id", id);

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.quote_number}.pdf"`,
    },
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/quotes/quote-pdf.tsx "app/api/quotes/[id]/pdf"
git commit -m "feat: PDF generation with @react-pdf/renderer (RS branding, 4-tier table)"
```

---

## Task 15: Build verification + cleanup

**Files:**
- Modify: `components/sidebar.tsx` (already updated in Task 1, verify)

- [ ] **Step 1: Run full build**

```bash
npm run build 2>&1
```

Expected: Clean compile, all routes listed:
```
ƒ /quotes
ƒ /quotes/new
ƒ /quotes/[id]
ƒ /settings/pricing
ƒ /api/quotes
ƒ /api/quotes/[id]
ƒ /api/quotes/[id]/pdf
ƒ /api/quotes/preview
ƒ /api/boms
ƒ /api/pricing/[mpn]
ƒ /api/settings
```

- [ ] **Step 2: Fix any TypeScript errors**

Common issues to watch for:
- `as unknown as X` needed on Supabase join results (customers, gmps, boms)
- `Select onValueChange` takes `string | null` — guard with `if (!v) return`
- `@react-pdf/renderer` types: `Text` render prop is `(info: { pageNumber: number; totalPages: number }) => string`
- `createElement` second arg must match `QuotePDFProps` exactly

Fix inline as needed.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: Sprint 3 complete — quoting engine, pricing settings, PDF generation"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Quote creation form (BOM select → quantities → pricing preview → save)
- ✅ DigiKey/Mouser API integration (DigiKey V4 OAuth2 in `lib/pricing/digikey.ts`)
- ✅ API pricing cache (7-day TTL in `api_pricing_cache` via `/api/pricing/[mpn]`)
- ✅ Pricing engine (4-tier: components + PCB + assembly + NRE + shipping)
- ✅ Overage calculation per M-Code per tier (mirrors Python logic)
- ✅ Quote review page — 4 tiers side-by-side (`PricingTable` component)
- ✅ Quote approval workflow (draft → review → sent → accepted via `QuoteActions`)
- ✅ PDF quote generation with RS branding, 4-tier table (`QuotePDF` + `/api/quotes/[id]/pdf`)
- ✅ PDF stored in Supabase Storage `quotes/` bucket
- ✅ Quote list page with status filter tabs
- ✅ Settings page: markup rates, labour rate, NRE defaults (CEO-editable)
- ✅ Quote expiry (`expires_at` set at creation, `validity_days` in settings)

**Type consistency:**
- `PricingTier` defined in Task 2, used in Tasks 4, 9, 10, 13, 14 — ✅ consistent
- `OverageTier` has `m_code`, `qty_threshold`, `extras` — matches schema and used in Task 3, 7, 12 — ✅
- `PricingSettings` fields match `app_settings` seed keys — ✅

**Placeholder scan:** No TBD/TODO items. Every step has complete code.
