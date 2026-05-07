import { getCredential } from "@/lib/supplier-credentials";
import type { SupplierQuote, PriceBreak } from "./types";

// ---------------------------------------------------------------------------
// Arrow.com itemservice v4 client.
// Endpoint: GET https://api.arrow.com/itemservice/v4/en/search/list?req=<JSON>
// Auth:     login + apikey embedded inside the `req` JSON body.
//
// Two entry points share the same response parser:
//   • searchArrowComPrice(mpn, manufacturer?)  — one MPN per call
//   • searchArrowComBatch({ parts, signal? }) — up to N MPNs per call,
//     used by the pricing-review fetch route through SUPPLIER_BATCH_REGISTRY.
//     The route chunks at 250 to keep each round-trip fast.
//
// Response tree: itemserviceresult.data[].resultList[].PartList[].InvOrg
//   .webSites[].sources[].sourceParts[]
// We emit one SupplierQuote per `sourceParts[]` entry so the picker shows
// every pack-size / pricing-ladder offering as a separate row, with
// warehouse_code = "<sourceCd>/<sourcePartId>" for tie-breaking.
//
// "Call For Quote" entries (availabilityCd === "QUOTE" with fohQty === 0)
// are filtered out — their list price is just an MOQ-tier table, not a
// real offer the auto-pick should choose.
// ---------------------------------------------------------------------------

const ARROW_COM_URL = "https://api.arrow.com/itemservice/v4/en/search/list";
const REQUEST_TIMEOUT_MS = 10_000;

interface ArrowComCreds {
  login: string;
  apikey: string;
}

let cachedCreds: { creds: ArrowComCreds; expires_at: number } | null = null;
const CREDS_TTL_MS = 60_000;

async function getArrowComCredentials(): Promise<ArrowComCreds | null> {
  if (cachedCreds && Date.now() < cachedCreds.expires_at) return cachedCreds.creds;
  try {
    const fromDb = await getCredential<ArrowComCreds>("arrow_com");
    if (fromDb?.login && fromDb?.apikey) {
      cachedCreds = { creds: fromDb, expires_at: Date.now() + CREDS_TTL_MS };
      return fromDb;
    }
  } catch (e) {
    console.warn("[arrow_com] credential lookup failed:", e instanceof Error ? e.message : e);
  }
  const login = process.env.ARROW_COM_LOGIN;
  const apikey = process.env.ARROW_COM_API_KEY;
  if (!login || !apikey) return null;
  const creds = { login, apikey };
  cachedCreds = { creds, expires_at: Date.now() + CREDS_TTL_MS };
  return creds;
}

// ---- Types for the bits of the v4 response we actually consume ----
interface ArrowComResale {
  price?: unknown;
  minQty?: unknown;
  maxQty?: unknown;
}
interface ArrowComAvailability {
  fohQty?: unknown;
  availabilityCd?: unknown;
}
interface ArrowComSourcePart {
  sourcePartId?: unknown;
  packSize?: unknown;
  minimumOrderQuantity?: unknown;
  Prices?: { resaleList?: ArrowComResale[] };
  Availability?: ArrowComAvailability[];
  inStock?: unknown;
  mfrLeadTime?: unknown;
  arrowLeadTime?: unknown;
  isNcnr?: unknown;
  productCode?: unknown;
}
interface ArrowComSource {
  sourceCd?: unknown;
  displayName?: unknown;
  currency?: unknown;
  sourceParts?: ArrowComSourcePart[];
}
interface ArrowComWebSite {
  sources?: ArrowComSource[];
}
interface ArrowComPart {
  partNum?: unknown;
  manufacturer?: { mfrName?: unknown; mfrCd?: unknown };
  desc?: unknown;
  status?: unknown;
  resources?: Array<{ type?: unknown; uri?: unknown }>;
  InvOrg?: { webSites?: ArrowComWebSite[] };
}
interface ArrowComResult {
  numberFound?: unknown;
  /** Sent back as e.g. "MMBTA06LT1G|ONSEMI" when mfr was supplied,
   *  just "MMBTA06LT1G" otherwise. We split on '|' to recover the MPN. */
  requestedPartNum?: unknown;
  PartList?: ArrowComPart[];
}
interface ArrowComResponseBody {
  itemserviceresult?: {
    data?: Array<{ resultList?: ArrowComResult[] }>;
  };
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function findUri(resources: ArrowComPart["resources"], type: string): string | null {
  if (!Array.isArray(resources)) return null;
  for (const r of resources) {
    if (r?.type === type && typeof r.uri === "string") return r.uri;
  }
  return null;
}

/**
 * Walk one PartList[] entry and produce zero-or-more SupplierQuote rows.
 * Pure parsing — does no I/O, no auth, no logging. Reused by both the
 * single-MPN entry point and the batch entry point.
 *
 * `fallbackMpn` is what we report on the SupplierQuote when the response's
 * own `partNum` is missing — for the single path it's the requested MPN,
 * for the batch path it's the resolved MPN from `requestedPartNum`.
 */
function parseArrowComPart(part: ArrowComPart, fallbackMpn: string): SupplierQuote[] {
  const out: SupplierQuote[] = [];

  const partMpn = typeof part.partNum === "string" ? part.partNum : fallbackMpn;
  const mfrName =
    typeof part.manufacturer?.mfrName === "string"
      ? part.manufacturer.mfrName
      : null;
  const description = typeof part.desc === "string" ? part.desc : null;
  const lifecycle = typeof part.status === "string" ? part.status : null;
  const datasheetUrl = findUri(part.resources, "datasheet");
  const productUrl = findUri(part.resources, "cloud_part_detail");

  const websites = part.InvOrg?.webSites;
  if (!Array.isArray(websites)) return out;

  for (const site of websites) {
    const sources = Array.isArray(site?.sources) ? site.sources : [];
    for (const source of sources) {
      const sourceCd = typeof source.sourceCd === "string" ? source.sourceCd : "ARROW";
      const currency = typeof source.currency === "string" ? source.currency : "USD";
      const sourceParts = Array.isArray(source.sourceParts) ? source.sourceParts : [];

      for (const sp of sourceParts) {
        // Filter "Call For Quote" rows — list price isn't a real offer.
        const availability = Array.isArray(sp.Availability) ? sp.Availability[0] : undefined;
        const fohQty = toNum(availability?.fohQty);
        const availabilityCd =
          typeof availability?.availabilityCd === "string" ? availability.availabilityCd : null;
        if (availabilityCd === "QUOTE" && (fohQty === null || fohQty <= 0)) continue;

        const resaleList = Array.isArray(sp.Prices?.resaleList) ? sp.Prices.resaleList : [];
        const priceBreaks: PriceBreak[] = [];
        for (const r of resaleList) {
          const minQ = toNum(r.minQty);
          const maxQ = toNum(r.maxQty);
          const price = toNum(r.price);
          if (minQ === null || price === null || !(price > 0)) continue;
          // Arrow.com uses 99_999_999 as the open-ended sentinel.
          const maxQty = maxQ !== null && maxQ < 99_999_999 ? maxQ : null;
          priceBreaks.push({
            min_qty: minQ,
            max_qty: maxQty,
            unit_price: price,
            currency,
          });
        }

        const firstPrice = priceBreaks[0]?.unit_price;
        if (firstPrice === undefined || !(firstPrice > 0)) continue;

        // Lead time: prefer Arrow's own (in-house) over manufacturer.
        // mfrLeadTime is in days. Treat 0 as "in stock, no lead time".
        const arrowLt =
          typeof sp.arrowLeadTime === "number"
            ? sp.arrowLeadTime
            : toNum(sp.arrowLeadTime);
        const mfrLt = toNum(sp.mfrLeadTime);
        const leadTimeDays =
          (arrowLt !== null && arrowLt > 0 ? arrowLt : null) ??
          (mfrLt !== null && mfrLt > 0 ? mfrLt : null);

        const sourcePartId =
          typeof sp.sourcePartId === "string" ? sp.sourcePartId : null;

        out.push({
          source: "arrow_com",
          mpn: partMpn,
          manufacturer: mfrName,
          supplier_part_number:
            (typeof sp.productCode === "string" && sp.productCode) || partMpn,
          unit_price: firstPrice,
          currency,
          price_breaks: priceBreaks,
          stock_qty: fohQty,
          moq: toNum(sp.minimumOrderQuantity),
          order_multiple: toNum(sp.packSize),
          lead_time_days: leadTimeDays,
          warehouse_code: sourcePartId ? `${sourceCd}/${sourcePartId}` : sourceCd,
          ncnr: typeof sp.isNcnr === "boolean" ? sp.isNcnr : null,
          // v4 doesn't expose a per-source "franchised" flag the way myArrow
          // did — Arrow.com sources are all authorized distribution by
          // definition, so default true.
          franchised: true,
          lifecycle_status: lifecycle,
          datasheet_url: datasheetUrl,
          product_url: productUrl,
          description,
        });
      }
    }
  }

  return out;
}

/** Pull the MPN out of `requestedPartNum`, which is "MPN|MFRCD" when the
 *  request included `mfr`, plain "MPN" otherwise. Returns null when the
 *  field is missing/non-string so the caller can decide what to do. */
function extractRequestedMpn(requestedPartNum: unknown): string | null {
  if (typeof requestedPartNum !== "string" || requestedPartNum.length === 0) return null;
  const pipeIdx = requestedPartNum.indexOf("|");
  return pipeIdx === -1 ? requestedPartNum : requestedPartNum.slice(0, pipeIdx);
}

/**
 * Search the Arrow.com v4 itemservice for a single MPN.
 * `manufacturer` is included in the request when present so the API can
 * tighten the match — the BOM line's mfr field is passed straight through.
 */
export async function searchArrowComPrice(
  mpn: string,
  manufacturer?: string | null
): Promise<SupplierQuote[]> {
  const creds = await getArrowComCredentials();
  if (!creds) return [];

  const part: { partNum: string; mfr?: string } = { partNum: mpn };
  if (manufacturer && manufacturer.trim()) part.mfr = manufacturer.trim();

  const reqBody = {
    request: {
      login: creds.login,
      apikey: creds.apikey,
      remoteIp: "",
      useExact: true,
      parts: [part],
    },
  };
  const url = `${ARROW_COM_URL}?req=${encodeURIComponent(JSON.stringify(reqBody))}`;

  let json: ArrowComResponseBody | null = null;
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`[arrow_com] HTTP ${res.status} for mpn=${mpn}`);
      return [];
    }
    json = (await res.json()) as ArrowComResponseBody;
  } catch (e) {
    console.warn(`[arrow_com] fetch failed for mpn=${mpn}:`, e instanceof Error ? `${e.name}: ${e.message}` : e);
    return [];
  }

  const data = json?.itemserviceresult?.data?.[0];
  const results = Array.isArray(data?.resultList) ? data.resultList : [];
  const quotes: SupplierQuote[] = [];
  for (const result of results) {
    const parts = Array.isArray(result?.PartList) ? result.PartList : [];
    for (const p of parts) quotes.push(...parseArrowComPart(p, mpn));
  }

  return quotes;
}

/**
 * Batch entry point — looks up many MPNs in one HTTP call.
 *
 * Result map keys are uppercased MPNs (the route normalizes the same way for
 * cache lookups). MPNs that the API confirmed-but-found-nothing-for land in
 * `emptyMpns` so the caller can negative-cache them. A batch-level error
 * (HTTP failure, timeout, parse failure) populates `error` and leaves both
 * collections empty — the caller MUST NOT negative-cache in that case.
 */
export async function searchArrowComBatch(ctx: {
  parts: Array<{ mpn: string; manufacturer?: string | null }>;
  signal?: AbortSignal;
}): Promise<{
  resultsByMpn: Map<string, SupplierQuote[]>;
  emptyMpns: Set<string>;
  error: string | null;
}> {
  const empty = {
    resultsByMpn: new Map<string, SupplierQuote[]>(),
    emptyMpns: new Set<string>(),
  };

  if (!Array.isArray(ctx.parts) || ctx.parts.length === 0) {
    return { ...empty, error: null };
  }

  const creds = await getArrowComCredentials();
  if (!creds) return { ...empty, error: "missing arrow_com credentials" };

  const reqParts = ctx.parts.map((p) => {
    const out: { partNum: string; mfr?: string } = { partNum: p.mpn };
    if (p.manufacturer && p.manufacturer.trim()) out.mfr = p.manufacturer.trim();
    return out;
  });

  // Track which MPNs we asked about (uppercased) so we can compute "empty"
  // by set difference once we've parsed the response.
  const requestedSet = new Set<string>();
  for (const p of ctx.parts) requestedSet.add(p.mpn.toUpperCase());

  const reqBody = {
    request: {
      login: creds.login,
      apikey: creds.apikey,
      remoteIp: "",
      useExact: true,
      parts: reqParts,
    },
  };
  const url = `${ARROW_COM_URL}?req=${encodeURIComponent(JSON.stringify(reqBody))}`;

  // Combine the caller's cancel signal with our own request timeout.
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = ctx.signal
    ? AbortSignal.any([ctx.signal, timeoutSignal])
    : timeoutSignal;

  let json: ArrowComResponseBody | null = null;
  try {
    const res = await fetch(url, {
      method: "GET",
      signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      const msg = `HTTP ${res.status}`;
      console.warn(`[arrow_com] batch ${msg} for ${ctx.parts.length} part(s)`);
      return { ...empty, error: msg };
    }
    json = (await res.json()) as ArrowComResponseBody;
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.warn(`[arrow_com] batch fetch failed (${ctx.parts.length} part(s)): ${msg}`);
    return { ...empty, error: msg };
  }

  const data = json?.itemserviceresult?.data?.[0];
  const results = Array.isArray(data?.resultList) ? data.resultList : [];
  const resultsByMpn = new Map<string, SupplierQuote[]>();
  const seenInResponse = new Set<string>();

  for (const result of results) {
    const requestedMpn = extractRequestedMpn(result?.requestedPartNum);
    if (!requestedMpn) continue;
    const key = requestedMpn.toUpperCase();
    seenInResponse.add(key);
    const partsList = Array.isArray(result?.PartList) ? result.PartList : [];
    if (partsList.length === 0) continue;
    const acc = resultsByMpn.get(key) ?? [];
    for (const p of partsList) acc.push(...parseArrowComPart(p, requestedMpn));
    if (acc.length > 0) resultsByMpn.set(key, acc);
  }

  // Anything we asked about that either wasn't in the response or returned
  // zero quotes is "empty" — confirmed not carried at the moment.
  const emptyMpns = new Set<string>();
  for (const k of requestedSet) {
    if (!resultsByMpn.has(k)) emptyMpns.add(k);
  }
  // Lint: requestedSet/seenInResponse only diverge when the API silently
  // drops a part — log so we notice. seenInResponse is informational only.
  if (seenInResponse.size < requestedSet.size) {
    console.info(
      `[arrow_com] batch: requested ${requestedSet.size} MPN(s), response listed ${seenInResponse.size}; missing parts will be negative-cached`
    );
  }

  return { resultsByMpn, emptyMpns, error: null };
}
