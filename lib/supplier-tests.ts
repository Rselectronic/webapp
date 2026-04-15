/**
 * Live supplier credential connection tests.
 *
 * Each distributor has a dedicated test function that does the cheapest
 * reliable call proving auth works — typically an OAuth token exchange
 * followed by a search probe for a ubiquitous part (ERJ-2GE0R00X, a
 * Panasonic 0R 0402 resistor that every distributor stocks).
 *
 * These tests are INTENTIONALLY separate from lib/pricing/* production
 * clients — they should fail loudly and never pollute the pricing path.
 * No caching, no retries, no rate limiting.
 *
 * All test functions are wrapped in a 15 second AbortController timeout.
 */

import { createHash, createHmac, randomBytes } from "crypto";
import type { SupplierName } from "@/lib/supplier-credentials";

export interface TestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

const PROBE_MPN = "ERJ-2GE0R00X"; // Panasonic 0 ohm 0402 — universal stock
const TIMEOUT_MS = 15_000;

/**
 * fetch with an AbortController timeout. Always throws on timeout.
 */
async function timedFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function log(supplier: SupplierName, result: TestResult): TestResult {
  // eslint-disable-next-line no-console
  console.log(
    `[supplier-test] ${supplier}: ${result.ok ? "OK" : "FAIL"} — ${result.message}`
  );
  return result;
}

/**
 * Dispatch entry point. Routes to the per-distributor test function.
 */
export async function testSupplierConnection(
  supplier: SupplierName,
  credentials: Record<string, string>
): Promise<TestResult> {
  try {
    let result: TestResult;
    switch (supplier) {
      case "digikey":
        result = await testDigiKey(credentials);
        break;
      case "mouser":
        result = await testMouser(credentials);
        break;
      case "lcsc":
        result = await testLcsc(credentials);
        break;
      case "future":
        result = await testFuture(credentials);
        break;
      case "avnet":
        result = await testAvnet(credentials);
        break;
      case "arrow":
        result = await testArrow(credentials);
        break;
      case "tti":
        result = await testTti(credentials);
        break;
      case "esonic":
        result = await testEsonic(credentials);
        break;
      case "newark":
        result = await testNewark(credentials);
        break;
      case "samtec":
        result = await testSamtec(credentials);
        break;
      case "ti":
        result = await testTi(credentials);
        break;
      case "tme":
        result = await testTme(credentials);
        break;
      default: {
        const exhaustive: never = supplier;
        result = {
          ok: false,
          message: `Unknown supplier: ${exhaustive as string}`,
        };
      }
    }
    return log(supplier, result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return log(supplier, { ok: false, message: `Test error: ${message}` });
  }
}

// ---------------------------------------------------------------------------
// DigiKey — OAuth2 client_credentials + keyword search
// ---------------------------------------------------------------------------
async function testDigiKey(
  creds: Record<string, string>
): Promise<TestResult> {
  const { client_id, client_secret, environment } = creds;
  if (!client_id || !client_secret) {
    return { ok: false, message: "Missing client_id or client_secret" };
  }

  const isSandbox = (environment ?? "").toLowerCase().startsWith("sand");
  const base = isSandbox
    ? "https://sandbox-api.digikey.com"
    : "https://api.digikey.com";
  const envLabel = isSandbox ? "Sandbox" : "Production";

  // Phase 1: token
  let token: string;
  try {
    const form = new URLSearchParams();
    form.set("client_id", client_id);
    form.set("client_secret", client_secret);
    form.set("grant_type", "client_credentials");

    const tokenRes = await timedFetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      return {
        ok: false,
        message: `Auth failed: HTTP ${tokenRes.status} — ${body.slice(0, 200)}`,
      };
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      return { ok: false, message: "Auth failed: no access_token in response" };
    }
    token = tokenJson.access_token;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Auth network error: ${msg}` };
  }

  // Phase 2: search probe
  try {
    const searchRes = await timedFetch(`${base}/products/v4/search/keyword`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-DIGIKEY-Client-Id": client_id,
        "X-DIGIKEY-Locale-Site": "CA",
        "X-DIGIKEY-Locale-Language": "en",
        "X-DIGIKEY-Locale-Currency": "CAD",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Keywords: PROBE_MPN,
        RecordCount: 1,
        RecordStartPosition: 0,
      }),
    });
    if (!searchRes.ok) {
      const body = await searchRes.text();
      return {
        ok: true,
        message: `Connected to DigiKey ${envLabel} — auth OK but search failed: HTTP ${searchRes.status} ${body.slice(0, 120)}`,
      };
    }
    const data = (await searchRes.json()) as {
      ExactMatches?: unknown[];
      Products?: unknown[];
      ProductsCount?: number;
    };
    const count =
      (data.ExactMatches?.length ?? 0) +
      (data.Products?.length ?? 0);
    return {
      ok: true,
      message: `Connected to DigiKey ${envLabel} — auth OK, search returned ${count} parts`,
      details: { environment: envLabel, productsCount: data.ProductsCount },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: true,
      message: `Connected to DigiKey ${envLabel} — auth OK but search network error: ${msg}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Mouser — API key in query string
// ---------------------------------------------------------------------------
async function testMouser(creds: Record<string, string>): Promise<TestResult> {
  const { api_key } = creds;
  if (!api_key) return { ok: false, message: "Missing api_key" };

  try {
    const url = `https://api.mouser.com/api/v2/search/partnumber?apiKey=${encodeURIComponent(api_key)}`;
    const res = await timedFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "en-CA",
      },
      body: JSON.stringify({
        SearchByPartRequest: {
          mouserPartNumber: PROBE_MPN,
          partSearchOptions: "BeginsWith",
        },
      }),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Auth failed: HTTP ${res.status}` };
    }
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        message: `HTTP ${res.status} — ${body.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as {
      Errors?: Array<{ Code?: string; Message?: string }>;
      SearchResults?: { Parts?: unknown[]; NumberOfResult?: number };
    };
    if (data.Errors && data.Errors.length > 0) {
      const msg = data.Errors.map(
        (e) => `${e.Code ?? ""} ${e.Message ?? ""}`.trim()
      ).join("; ");
      return { ok: false, message: `Auth failed: ${msg}` };
    }
    const count = data.SearchResults?.Parts?.length ?? 0;
    return {
      ok: true,
      message: `Connected to Mouser — auth OK, search returned ${count} parts`,
      details: { numberOfResult: data.SearchResults?.NumberOfResult },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Network error: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// LCSC — SHA1 signed GET
// NOTE: Per HANDOFF.md, the LCSC API is currently blocked vendor-side. This
// test will likely fail until they unblock us. Still exercised so it starts
// passing automatically once unblocked.
// ---------------------------------------------------------------------------
async function testLcsc(creds: Record<string, string>): Promise<TestResult> {
  const { api_key, api_secret } = creds;
  if (!api_key || !api_secret) {
    return { ok: false, message: "Missing api_key or api_secret" };
  }

  const nonce = randomBytes(8).toString("hex"); // 16 lowercase hex chars
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = `key=${api_key}&nonce=${nonce}&secret=${api_secret}&timestamp=${timestamp}`;
  const signature = createHash("sha1").update(payload).digest("hex");

  const params = new URLSearchParams({
    keyword: PROBE_MPN,
    key: api_key,
    nonce,
    timestamp,
    signature,
  });
  const url = `https://ips.lcsc.com/rest/wmsc2agent/search/product?${params.toString()}`;

  try {
    const res = await timedFetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "curl/8.0",
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        message: `LCSC HTTP ${res.status} — API is currently blocked vendor-side per HANDOFF`,
      };
    }
    const data = (await res.json()) as {
      success?: boolean;
      message?: string;
      result?: { product_list?: unknown[] };
    };
    if (!data.success) {
      return {
        ok: false,
        message: `LCSC rejected: ${data.message ?? "unknown"} — API may be blocked vendor-side per HANDOFF`,
      };
    }
    const count = data.result?.product_list?.length ?? 0;
    return {
      ok: true,
      message: `Connected to LCSC — auth OK, search returned ${count} parts`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `LCSC network error: ${msg} — API is currently blocked vendor-side per HANDOFF`,
    };
  }
}

// ---------------------------------------------------------------------------
// Future Electronics — REST endpoint is not publicly documented and was
// past the truncation point in the reference Python file. We attempt a
// basic auth probe against the eapi search endpoint.
// ---------------------------------------------------------------------------
async function testFuture(creds: Record<string, string>): Promise<TestResult> {
  const { license_key } = creds;
  if (!license_key) return { ok: false, message: "Missing license_key" };

  // ASSUMPTION: Future Electronics publishes a REST search endpoint at
  // eapi.futureelectronics.com. We send an ApiKey header and a minimal
  // search body. If we get 200/204, treat as success. If 401/403, fail.
  // Any other status is reported honestly.
  try {
    const res = await timedFetch(
      "https://eapi.futureelectronics.com/Search/SearchPartNumber",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ApiKey: license_key,
          Authorization: license_key,
        },
        body: JSON.stringify({ PartNumber: PROBE_MPN, ResultsLimit: 1 }),
      }
    );
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Auth failed: HTTP ${res.status}` };
    }
    if (res.status === 404) {
      return {
        ok: false,
        message:
          "Future Electronics endpoint not found (404) — REST API path not confirmed, test not implemented yet",
      };
    }
    if (res.ok) {
      return {
        ok: true,
        message: `Connected to Future Electronics — HTTP ${res.status} (search endpoint unverified)`,
      };
    }
    const body = await res.text();
    return {
      ok: false,
      message: `HTTP ${res.status} — ${body.slice(0, 200)}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `Test not implemented yet — credentials saved but cannot verify from web (${msg})`,
    };
  }
}

// ---------------------------------------------------------------------------
// Avnet — OAuth2 client_credentials. Search endpoint not 100% confirmed
// so we only verify the token call.
// ---------------------------------------------------------------------------
async function testAvnet(creds: Record<string, string>): Promise<TestResult> {
  const { subscription_key, client_id, client_secret } = creds;
  if (!subscription_key || !client_id || !client_secret) {
    return {
      ok: false,
      message: "Missing subscription_key, client_id, or client_secret",
    };
  }

  try {
    const form = new URLSearchParams();
    form.set("grant_type", "client_credentials");
    form.set("client_id", client_id);
    form.set("client_secret", client_secret);
    form.set("scope", "avnet.api");

    const res = await timedFetch("https://api.avnet.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Ocp-Apim-Subscription-Key": subscription_key,
      },
      body: form.toString(),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Auth failed: HTTP ${res.status}` };
    }
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        message: `HTTP ${res.status} — ${body.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) {
      return { ok: false, message: "No access_token in response" };
    }
    return {
      ok: true,
      message:
        "Connected to Avnet — OAuth token issued, search endpoint not tested (not 100% confirmed)",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Network error: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Arrow — OAuth2 client_credentials
// ---------------------------------------------------------------------------
async function testArrow(creds: Record<string, string>): Promise<TestResult> {
  const { client_id, client_secret } = creds;
  if (!client_id || !client_secret) {
    return { ok: false, message: "Missing client_id or client_secret" };
  }

  try {
    const form = new URLSearchParams();
    form.set("grant_type", "client_credentials");
    form.set("client_id", client_id);
    form.set("client_secret", client_secret);

    const res = await timedFetch("https://api.arrow.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Auth failed: HTTP ${res.status}` };
    }
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        message: `HTTP ${res.status} — ${body.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) {
      return { ok: false, message: "No access_token in response" };
    }
    return {
      ok: true,
      message: "Connected to Arrow — OAuth token issued, search not tested",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Network error: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// TTI — API key via query string
// ---------------------------------------------------------------------------
async function testTti(creds: Record<string, string>): Promise<TestResult> {
  const { api_key } = creds;
  if (!api_key) return { ok: false, message: "Missing api_key" };

  try {
    const url = `https://api.ttiinc.com/v1/items/search?apiKey=${encodeURIComponent(api_key)}&query=${encodeURIComponent(PROBE_MPN)}`;
    const res = await timedFetch(url, {
      method: "GET",
      headers: { Accept: "application/json", Apikey: api_key },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Auth failed: HTTP ${res.status}` };
    }
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        message: `HTTP ${res.status} — ${body.slice(0, 200)}`,
      };
    }
    return {
      ok: true,
      message: `Connected to TTI — HTTP ${res.status}, search endpoint reachable`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Network error: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// e-Sonic — documentation sparse. Not currently testable from web.
// ---------------------------------------------------------------------------
async function testEsonic(creds: Record<string, string>): Promise<TestResult> {
  const { api_key } = creds;
  if (!api_key) return { ok: false, message: "Missing api_key" };

  // TODO: e-Sonic API endpoint not documented / not publicly confirmed.
  // Do not fake success — honestly report the limitation.
  return {
    ok: false,
    message:
      "e-Sonic API endpoint not configured — credentials saved but not testable from web",
  };
}

// ---------------------------------------------------------------------------
// Newark / Element14 — REST GET with API key in query params
// ---------------------------------------------------------------------------
async function testNewark(creds: Record<string, string>): Promise<TestResult> {
  const { api_key } = creds;
  if (!api_key) return { ok: false, message: "Missing api_key" };

  try {
    const params = new URLSearchParams({
      "callInfo.responseDataFormat": "json",
      "callInfo.apiKey": api_key,
      term: `any:${PROBE_MPN}`,
      "storeInfo.id": "Newark.com",
      resultsSettings: "0",
      "resultsSettings.numberOfResults": "1",
    });
    const url = `https://api.element14.com/catalog/products?${params.toString()}`;
    const res = await timedFetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Auth failed: HTTP ${res.status}` };
    }
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        message: `HTTP ${res.status} — ${body.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as {
      manufacturerPartNumberSearchReturn?: {
        numberOfResults?: number;
        products?: unknown[];
      };
      keywordSearchReturn?: { products?: unknown[]; numberOfResults?: number };
    };
    const results =
      data.manufacturerPartNumberSearchReturn?.products ??
      data.keywordSearchReturn?.products ??
      [];
    return {
      ok: true,
      message: `Connected to Newark — auth OK, search returned ${results.length} parts`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Network error: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Samtec — Bearer JWT, direct catalog API
// ---------------------------------------------------------------------------
async function testSamtec(creds: Record<string, string>): Promise<TestResult> {
  const { bearer_token } = creds;
  if (!bearer_token) return { ok: false, message: "Missing bearer_token" };

  try {
    const url =
      "https://samtec.com/services/api/catalog/v1/parts?partNumber=IPL1-110-01-S-D";
    const res = await timedFetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${bearer_token}`,
        Accept: "application/json",
      },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Auth failed: HTTP ${res.status}` };
    }
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        message: `HTTP ${res.status} — ${body.slice(0, 200)}`,
      };
    }
    return {
      ok: true,
      message: `Connected to Samtec — HTTP ${res.status}, catalog endpoint reachable`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Network error: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Texas Instruments — OAuth2 client_credentials + product probe
// ---------------------------------------------------------------------------
async function testTi(creds: Record<string, string>): Promise<TestResult> {
  const { client_id, client_secret } = creds;
  if (!client_id || !client_secret) {
    return { ok: false, message: "Missing client_id or client_secret" };
  }

  let token: string;
  try {
    const form = new URLSearchParams();
    form.set("grant_type", "client_credentials");
    form.set("client_id", client_id);
    form.set("client_secret", client_secret);

    const res = await timedFetch(
      "https://transact.ti.com/v1/oauth/accesstoken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        message: `Auth failed: HTTP ${res.status} — ${body.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) {
      return { ok: false, message: "No access_token in response" };
    }
    token = data.access_token;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Auth network error: ${msg}` };
  }

  try {
    const res = await timedFetch(
      "https://transact.ti.com/v1/store/products/LM358N",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) {
      return {
        ok: true,
        message: `Connected to TI — auth OK but product probe returned HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      message: "Connected to TI — auth OK, product probe reachable",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: true,
      message: `Connected to TI — auth OK but product probe network error: ${msg}`,
    };
  }
}

// ---------------------------------------------------------------------------
// TME — HMAC-SHA1 signed POST (Polish distributor)
// Signature = base64(HMAC-SHA1(secret, METHOD&urlenc(url)&urlenc(sorted_params)))
// ---------------------------------------------------------------------------
async function testTme(creds: Record<string, string>): Promise<TestResult> {
  const { token, secret } = creds;
  if (!token || !secret) {
    return { ok: false, message: "Missing token or secret" };
  }

  try {
    const url = "https://api.tme.eu/Products/Search.json";
    const params: Record<string, string> = {
      Token: token,
      Country: "CA",
      Language: "EN",
      SearchPlain: PROBE_MPN,
    };

    // Build signature per TME docs:
    //   signatureBase = METHOD + "&" + urlencode(URL) + "&" + urlencode(sortedParams)
    //   signature = base64(HMAC-SHA1(secret, signatureBase))
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys
      .map(
        (k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`
      )
      .join("&");
    const signatureBase = `POST&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
    const signature = createHmac("sha1", secret)
      .update(signatureBase)
      .digest("base64");

    const body = new URLSearchParams();
    for (const k of sortedKeys) body.set(k, params[k]);
    body.set("ApiSignature", signature);

    const res = await timedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Auth failed: HTTP ${res.status}` };
    }
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        message: `HTTP ${res.status} — ${text.slice(0, 200)} (TME signature scheme may need adjustment)`,
      };
    }
    const data = (await res.json()) as {
      Status?: string;
      Data?: { ProductList?: unknown[] };
    };
    if (data.Status && data.Status !== "OK") {
      return {
        ok: false,
        message: `TME rejected: Status=${data.Status}`,
      };
    }
    const count = data.Data?.ProductList?.length ?? 0;
    return {
      ok: true,
      message: `Connected to TME — auth OK, search returned ${count} parts`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `TME network error: ${msg} (signature scheme may need adjustment)`,
    };
  }
}
