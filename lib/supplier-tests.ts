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
 *
 * Each test function accepts an optional `mpn` override. If not provided,
 * a per-distributor default is used (ERJ-2GE0R00X for most, IPL1-110-01-S-D
 * for Samtec, LM358N for TI).
 *
 * The TestResult captures the parsed JSON body of the search/probe call into
 * raw_response so the UI can show the user exactly what the distributor
 * returned. The request_url is ALWAYS redacted — any API key/secret/token
 * in a query string is stripped before capture. See redactUrl() below.
 */

import { createHash, createHmac, randomBytes } from "crypto";
import type { SupplierName } from "@/lib/supplier-credentials";

export interface TestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
  raw_response?: unknown;
  status_code?: number;
  request_url?: string;
}

const DEFAULT_PROBE_MPN = "ERJ-2GE0R00X"; // Panasonic 0 ohm 0402 — universal stock
const SAMTEC_PROBE_MPN = "IPL1-110-01-S-D";
const TI_PROBE_MPN = "AFE7799IABJ";
const TIMEOUT_MS = 15_000;

/**
 * Strip sensitive query-string params from a URL before it is captured
 * into a TestResult. NEVER let a raw API key, secret, signature, token,
 * nonce, or timestamp leak into the UI — the CEO's browser console,
 * Vercel logs, and screenshots would all expose it.
 */
function redactUrl(rawUrl: string, paramsToStrip: string[]): string {
  try {
    const url = new URL(rawUrl);
    for (const p of paramsToStrip) {
      if (url.searchParams.has(p)) {
        url.searchParams.set(p, "<redacted>");
      }
    }
    return url.toString();
  } catch {
    // Not a parseable URL (shouldn't happen) — return as-is minus any
    // obvious api_key= patterns.
    return rawUrl.replace(
      /([?&](?:apiKey|api_key|key|signature|token|secret|nonce|timestamp)=)[^&]*/gi,
      "$1<redacted>"
    );
  }
}

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

/**
 * Parse a Response body as JSON, falling back to text wrapped in a stub
 * envelope. This guarantees raw_response is always defined (even when the
 * API returns text/html or an empty body), so the UI can display *something*.
 */
async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return { _empty: true };
  try {
    return JSON.parse(text);
  } catch {
    return { _raw_text: text.slice(0, 4000) };
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
  credentials: Record<string, string>,
  mpn?: string
): Promise<TestResult> {
  try {
    let result: TestResult;
    switch (supplier) {
      case "digikey":
        result = await testDigiKey(credentials, mpn);
        break;
      case "mouser":
        result = await testMouser(credentials, mpn);
        break;
      case "lcsc":
        result = await testLcsc(credentials, mpn);
        break;
      case "future":
        result = await testFuture(credentials, mpn);
        break;
      case "avnet":
        result = await testAvnet(credentials, mpn);
        break;
      case "arrow":
        result = await testArrow(credentials, mpn);
        break;
      case "arrow_com":
        result = await testArrowCom(credentials, mpn);
        break;
      case "tti":
        result = await testTti(credentials, mpn);
        break;
      case "esonic":
        result = await testEsonic(credentials, mpn);
        break;
      case "newark":
        result = await testNewark(credentials, mpn);
        break;
      case "samtec":
        result = await testSamtec(credentials, mpn);
        break;
      case "ti":
        result = await testTi(credentials, mpn);
        break;
      case "tme":
        result = await testTme(credentials, mpn);
        break;
      default: {
        // Custom (user-defined) distributors fall through here — they have
        // no hardcoded test implementation. Credentials are stored encrypted
        // but we cannot verify them from this UI.
        result = {
          ok: false,
          message:
            "Custom distributor — no built-in test connection. Credentials are stored encrypted but cannot be verified from this UI.",
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
  creds: Record<string, string>,
  mpn?: string
): Promise<TestResult> {
  const probeMpn = mpn ?? DEFAULT_PROBE_MPN;
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

  // Phase 2: search probe — capture response for UI display
  const searchUrl = `${base}/products/v4/search/keyword`;
  try {
    const searchRes = await timedFetch(searchUrl, {
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
        Keywords: probeMpn,
        RecordCount: 1,
        RecordStartPosition: 0,
      }),
    });
    const body = await readBody(searchRes);
    if (!searchRes.ok) {
      return {
        ok: true,
        message: `Connected to DigiKey ${envLabel} — auth OK but search failed: HTTP ${searchRes.status}`,
        raw_response: body,
        status_code: searchRes.status,
        request_url: searchUrl,
      };
    }
    const data = body as {
      ExactMatches?: unknown[];
      Products?: unknown[];
      ProductsCount?: number;
    };
    const count =
      (data.ExactMatches?.length ?? 0) + (data.Products?.length ?? 0);
    return {
      ok: true,
      message: `Connected to DigiKey ${envLabel} — auth OK, search returned ${count} parts`,
      details: { environment: envLabel, productsCount: data.ProductsCount },
      raw_response: body,
      status_code: searchRes.status,
      request_url: searchUrl,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: true,
      message: `Connected to DigiKey ${envLabel} — auth OK but search network error: ${msg}`,
      request_url: searchUrl,
    };
  }
}

// ---------------------------------------------------------------------------
// Mouser — API key in query string
// ---------------------------------------------------------------------------
async function testMouser(
  creds: Record<string, string>,
  mpn?: string
): Promise<TestResult> {
  const probeMpn = mpn ?? DEFAULT_PROBE_MPN;
  const { api_key } = creds;
  if (!api_key) return { ok: false, message: "Missing api_key" };

  const rawUrl = `https://api.mouser.com/api/v2/search/partnumber?apiKey=${encodeURIComponent(api_key)}`;
  const safeUrl = redactUrl(rawUrl, ["apiKey"]);
  try {
    const res = await timedFetch(rawUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "en-CA",
      },
      body: JSON.stringify({
        SearchByPartRequest: {
          mouserPartNumber: probeMpn,
          partSearchOptions: "BeginsWith",
        },
      }),
    });
    const body = await readBody(res);
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: `Auth failed: HTTP ${res.status}`,
        raw_response: body,
        status_code: res.status,
        request_url: safeUrl,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        message: `HTTP ${res.status}`,
        raw_response: body,
        status_code: res.status,
        request_url: safeUrl,
      };
    }
    const data = body as {
      Errors?: Array<{ Code?: string; Message?: string }>;
      SearchResults?: { Parts?: unknown[]; NumberOfResult?: number };
    };
    if (data.Errors && data.Errors.length > 0) {
      const msg = data.Errors.map(
        (e) => `${e.Code ?? ""} ${e.Message ?? ""}`.trim()
      ).join("; ");
      return {
        ok: false,
        message: `Auth failed: ${msg}`,
        raw_response: body,
        status_code: res.status,
        request_url: safeUrl,
      };
    }
    const count = data.SearchResults?.Parts?.length ?? 0;
    return {
      ok: true,
      message: `Connected to Mouser — auth OK, search returned ${count} parts`,
      details: { numberOfResult: data.SearchResults?.NumberOfResult },
      raw_response: body,
      status_code: res.status,
      request_url: safeUrl,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `Network error: ${msg}`,
      request_url: safeUrl,
    };
  }
}

// ---------------------------------------------------------------------------
// LCSC — SHA1 signed GET
// NOTE: Per HANDOFF.md, the LCSC API is currently blocked vendor-side. This
// test will likely fail until they unblock us. Still exercised so it starts
// passing automatically once unblocked.
// ---------------------------------------------------------------------------
async function testLcsc(
  creds: Record<string, string>,
  mpn?: string
): Promise<TestResult> {
  const probeMpn = mpn ?? "C2665711";
  const { api_key, api_secret } = creds;
  if (!api_key || !api_secret) {
    return { ok: false, message: "Missing api_key or api_secret" };
  }

  const nonce = randomBytes(8).toString("hex"); // 16 lowercase hex chars
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = `key=${api_key}&nonce=${nonce}&secret=${api_secret}&timestamp=${timestamp}`;
  const signature = createHash("sha1").update(payload).digest("hex");

  const params = new URLSearchParams({
    key: api_key,
    nonce,
    timestamp,
    signature,
  });
  const rawUrl = `https://ips.lcsc.com/rest/wmsc2agent/product/info/${encodeURIComponent(
    probeMpn
  )}?${params.toString()}`;
  // LCSC sends key, nonce, timestamp, signature in the query string — ALL of
  // these are secrets/credentials and must be redacted.
  const safeUrl = redactUrl(rawUrl, [
    "key",
    "nonce",
    "timestamp",
    "signature",
  ]);

  try {
    const res = await timedFetch(rawUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const body = await readBody(res);
    if (!res.ok) {
      return {
        ok: false,
        message: `LCSC HTTP ${res.status} — API is currently blocked vendor-side per HANDOFF`,
        raw_response: body,
        status_code: res.status,
        request_url: safeUrl,
      };
    }
    const data = body as {
      success?: boolean;
      message?: string;
      result?: { product_list?: unknown[] };
    };
    if (!data.success) {
      return {
        ok: false,
        message: `LCSC rejected: ${data.message ?? "unknown"} — product may not exist on LCSC or is unavailable`,
        raw_response: body,
        status_code: res.status,
        request_url: safeUrl,
      };
    }
    const count = data.result?.product_list?.length ?? 0;
    return {
      ok: true,
      message: `Connected to LCSC — auth OK, search returned ${count} parts`,
      raw_response: body,
      status_code: res.status,
      request_url: safeUrl,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `LCSC network error: ${msg}`,
      request_url: safeUrl,
    };
  }
}

// ---------------------------------------------------------------------------
// Future Electronics — REST endpoint is not publicly documented and was
// past the truncation point in the reference Python file. We attempt a
// basic auth probe against the eapi search endpoint.
// ---------------------------------------------------------------------------
async function testFuture(
  creds: Record<string, string>,
  mpn?: string
): Promise<TestResult> {
  const probeMpn = mpn ?? "RCLAMP3354S.TCT";
  const { license_key } = creds;
  if (!license_key) return { ok: false, message: "Missing license_key" };

  const params = new URLSearchParams({
    part_number: probeMpn,
    lookup_type: "contains",
  });
  const url = `https://api.futureelectronics.com/api/v1/pim-future/lookup?${params.toString()}`;
  try {
    const res = await timedFetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json,text/javascript",
        "Content-Type": "application/json",
        "x-orbweaver-licensekey": license_key,
      },
    });
    const body = await readBody(res);
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: `Auth failed: HTTP ${res.status}`,
        raw_response: body,
        status_code: res.status,
        request_url: url,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        message: `HTTP ${res.status}`,
        raw_response: body,
        status_code: res.status,
        request_url: url,
      };
    }
    return {
      ok: true,
      message: `Connected to Future Electronics — auth OK, lookup endpoint reachable`,
      raw_response: body,
      status_code: res.status,
      request_url: url,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `Network error: ${msg}`,
      request_url: url,
    };
  }
}

// ---------------------------------------------------------------------------
// Avnet — OAuth2 client_credentials. Search endpoint not 100% confirmed
// so we only verify the token call. The access_token is redacted from
// raw_response so the UI can show the envelope shape without leaking the
// secret.
// ---------------------------------------------------------------------------
async function testAvnet(
  creds: Record<string, string>,
  _mpn?: string
): Promise<TestResult> {
  void _mpn; // Avnet test is token-only — MPN not exercised
  const { subscription_key, client_id, client_secret } = creds;
  if (!subscription_key || !client_id || !client_secret) {
    return {
      ok: false,
      message: "Missing subscription_key, client_id, or client_secret",
    };
  }

  const url = "https://apigw.avnet.com/external/getToken/oauth2/v2.0/token";
  try {
    const form = new URLSearchParams();
    form.set("grant_type", "client_credentials");
    form.set("client_id", client_id);
    form.set("client_secret", client_secret);
    form.set("scope", "api://9ee39226-6a78-4bc4-8ed2-bcc547eac437/.default");

    const res = await timedFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Ocp-Apim-Subscription-Key": subscription_key,
      },
      body: form.toString(),
    });
    const body = await readBody(res);
    // Redact access_token if present — shape matters, value does not
    const redacted = redactTokenField(body);
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: `Auth failed: HTTP ${res.status}`,
        raw_response: redacted,
        status_code: res.status,
        request_url: url,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        message: `HTTP ${res.status}`,
        raw_response: redacted,
        status_code: res.status,
        request_url: url,
      };
    }
    const data = body as { access_token?: string };
    if (!data.access_token) {
      return {
        ok: false,
        message: "No access_token in response",
        raw_response: redacted,
        status_code: res.status,
        request_url: url,
      };
    }
    return {
      ok: true,
      message:
        "Connected to Avnet — OAuth token issued, search endpoint not tested (not 100% confirmed)",
      raw_response: redacted,
      status_code: res.status,
      request_url: url,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `Network error: ${msg}`,
      request_url: url,
    };
  }
}

// ---------------------------------------------------------------------------
// Arrow — OAuth2 client_credentials. Token-only verification.
// ---------------------------------------------------------------------------
async function testArrow(
  creds: Record<string, string>,
  _mpn?: string
): Promise<TestResult> {
  void _mpn;
  const { client_id, client_secret } = creds;
  if (!client_id || !client_secret) {
    return { ok: false, message: "Missing client_id or client_secret" };
  }

  const url = "https://my.arrow.com/api/security/oauth/token";
  try {
    const auth = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

    const res = await timedFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "client_id": client_id,
        "Authorization": `Basic ${auth}`,
      },
      body: "grant_type=client_credentials",
    });
    const body = await readBody(res);
    const redacted = redactTokenField(body);
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: `Auth failed: HTTP ${res.status}`,
        raw_response: redacted,
        status_code: res.status,
        request_url: url,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        message: `HTTP ${res.status}`,
        raw_response: redacted,
        status_code: res.status,
        request_url: url,
      };
    }
    const data = body as { access_token?: string };
    if (!data.access_token) {
      return {
        ok: false,
        message: "No access_token in response",
        raw_response: redacted,
        status_code: res.status,
        request_url: url,
      };
    }
    return {
      ok: true,
      message: "Connected to Arrow — OAuth token issued, search not tested",
      raw_response: redacted,
      status_code: res.status,
      request_url: url,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `Network error: ${msg}`,
      request_url: url,
    };
  }
}

// ---------------------------------------------------------------------------
// Arrow.com (api.arrow.com itemservice v4) — login + apikey in JSON body
// ---------------------------------------------------------------------------
async function testArrowCom(
  creds: Record<string, string>,
  mpn?: string
): Promise<TestResult> {
  const probeMpn = mpn ?? DEFAULT_PROBE_MPN;
  const { login, apikey } = creds;
  if (!login || !apikey) {
    return { ok: false, message: "Missing login or apikey" };
  }

  const reqBody = {
    request: {
      login,
      apikey,
      remoteIp: "",
      useExact: true,
      parts: [{ partNum: probeMpn }],
    },
  };
  const rawUrl = `https://api.arrow.com/itemservice/v4/en/search/list?req=${encodeURIComponent(
    JSON.stringify(reqBody)
  )}`;
  // The whole `req` blob carries the apikey — redact it entirely from the
  // captured URL so secrets never reach the UI / logs / screenshots.
  const safeUrl = redactUrl(rawUrl, ["req"]);

  try {
    const res = await timedFetch(rawUrl, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const body = await readBody(res);
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: `Auth failed: HTTP ${res.status}`,
        raw_response: body,
        status_code: res.status,
        request_url: safeUrl,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        message: `HTTP ${res.status}`,
        raw_response: body,
        status_code: res.status,
        request_url: safeUrl,
      };
    }
    const parsed = body as {
      itemserviceresult?: {
        transactionArea?: Array<{ response?: { success?: boolean; returnMsg?: string } }>;
        data?: Array<{ partsFound?: number; partsRequested?: number }>;
      };
    };
    const apiResp = parsed?.itemserviceresult?.transactionArea?.[0]?.response;
    if (apiResp && apiResp.success === false) {
      return {
        ok: false,
        message: `API error: ${apiResp.returnMsg || "unknown"}`,
        raw_response: body,
        status_code: res.status,
        request_url: safeUrl,
      };
    }
    const data = parsed?.itemserviceresult?.data?.[0];
    const found = data?.partsFound ?? 0;
    return {
      ok: true,
      message: `Connected to Arrow.com — probe ${probeMpn} returned ${found} match${found === 1 ? "" : "es"}`,
      raw_response: body,
      status_code: res.status,
      request_url: safeUrl,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `Network error: ${msg}`,
      request_url: safeUrl,
    };
  }
}

// ---------------------------------------------------------------------------
// TTI — API key via query string
// ---------------------------------------------------------------------------
async function testTti(
  creds: Record<string, string>,
  mpn?: string
): Promise<TestResult> {
  const probeMpn = mpn ?? DEFAULT_PROBE_MPN;
  const { api_key } = creds;
  if (!api_key) return { ok: false, message: "Missing api_key" };

  const rawUrl = `https://api.tti.com/service/api/v1/search/keyword?searchTerms=${encodeURIComponent(probeMpn)}`;
  // Strip apiKey (secret) but keep the query param so the user can see what
  // MPN was sent.
  const safeUrl = redactUrl(rawUrl, ["apiKey"]);
  try {
    const res = await timedFetch(rawUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        apiKey: api_key,
        "Cache-Control": "no-cache",
      },
    });
    const body = await readBody(res);
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: `Auth failed: HTTP ${res.status}`,
        raw_response: body,
        status_code: res.status,
        request_url: safeUrl,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        message: `HTTP ${res.status}`,
        raw_response: body,
        status_code: res.status,
        request_url: safeUrl,
      };
    }
    return {
      ok: true,
      message: `Connected to TTI — HTTP ${res.status}, search endpoint reachable`,
      raw_response: body,
      status_code: res.status,
      request_url: safeUrl,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `Network error: ${msg}`,
      request_url: safeUrl,
    };
  }
}

// ---------------------------------------------------------------------------
// e-Sonic — HTTP GET to the published WAPI price/availability endpoint.
// ---------------------------------------------------------------------------
async function testEsonic(
  creds: Record<string, string>,
  mpn?: string
): Promise<TestResult> {
  const probeMpn = mpn ?? "XF2M-5015-1A-R100";
  const { api_key } = creds;
  if (!api_key) return { ok: false, message: "Missing api_key" };

  const rawUrl = `https://api.e-sonic.com/wapi/v3/cgpriceavailability/${encodeURIComponent(
    probeMpn
  )}/0/1/10/${encodeURIComponent(api_key)}`;
  const safeUrl = rawUrl.replace(api_key, "<redacted>");

  try {
    const res = await timedFetch(rawUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const body = await readBody(res);
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: `Auth failed: HTTP ${res.status}`,
        raw_response: body,
        status_code: res.status,
        request_url: safeUrl,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        message: `HTTP ${res.status}`,
        raw_response: body,
        status_code: res.status,
        request_url: safeUrl,
      };
    }
    return {
      ok: true,
      message: `Connected to e-Sonic — auth OK, price/availability endpoint reachable`,
      raw_response: body,
      status_code: res.status,
      request_url: safeUrl,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `Network error: ${msg}`,
      request_url: safeUrl,
    };
  }
}

// ---------------------------------------------------------------------------
// Newark — REST GET with API key in query params
// ---------------------------------------------------------------------------
async function testNewark(
  creds: Record<string, string>,
  mpn?: string
): Promise<TestResult> {
  const probeMpn = mpn ?? DEFAULT_PROBE_MPN;
  const { api_key } = creds;
  if (!api_key) return { ok: false, message: "Missing api_key" };

  const params = new URLSearchParams({
    versionNumber: "1.4",
    term: `manuPartNum: ${probeMpn}`,
    "storeInfo.id": "canada.newark.com",
    "resultsSettings.offset": "0",
    "resultsSettings.numberOfResults": "1",
    "resultsSettings.responseGroup": "large",
    "callInfo.omitXmlSchema": "false",
    "callInfo.responseDataFormat": "json",
    "callInfo.apiKey": api_key,
  });
  const rawUrl = `https://api.element14.com/catalog/products?${params.toString()}`;
  const safeUrl = redactUrl(rawUrl, ["callInfo.apiKey"]);
  try {
    const res = await timedFetch(rawUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const body = await readBody(res);
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: `Auth failed: HTTP ${res.status}`,
        raw_response: body,
        status_code: res.status,
        request_url: safeUrl,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        message: `HTTP ${res.status}`,
        raw_response: body,
        status_code: res.status,
        request_url: safeUrl,
      };
    }
    const data = body as {
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
      raw_response: body,
      status_code: res.status,
      request_url: safeUrl,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `Network error: ${msg}`,
      request_url: safeUrl,
    };
  }
}

// ---------------------------------------------------------------------------
// Samtec — Bearer JWT, direct catalog API. Default MPN is IPL1-110-01-S-D.
// ---------------------------------------------------------------------------
async function testSamtec(
  creds: Record<string, string>,
  mpn?: string
): Promise<TestResult> {
  const probeMpn = mpn ?? SAMTEC_PROBE_MPN;
  const { bearer_token } = creds;
  if (!bearer_token) return { ok: false, message: "Missing bearer_token" };

  // partNumber is the MPN (not a secret), bearer is in the header
  const url = `https://api.samtec.com/catalog/v3/${encodeURIComponent(
    probeMpn
  )}?includeRelatedParts=false&includeAdditionalDocuments=false`;
  try {
    const res = await timedFetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${bearer_token}`,
        "client-app-name": "swagger-ui",
        Accept: "application/json",
      },
    });
    const body = await readBody(res);
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: `Auth failed: HTTP ${res.status}`,
        raw_response: body,
        status_code: res.status,
        request_url: url,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        message: `HTTP ${res.status}`,
        raw_response: body,
        status_code: res.status,
        request_url: url,
      };
    }
    return {
      ok: true,
      message: `Connected to Samtec — HTTP ${res.status}, catalog endpoint reachable`,
      raw_response: body,
      status_code: res.status,
      request_url: url,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `Network error: ${msg}`,
      request_url: url,
    };
  }
}

// ---------------------------------------------------------------------------
// Texas Instruments — OAuth2 client_credentials + product probe.
// Default MPN is LM358N.
// ---------------------------------------------------------------------------
async function testTi(
  creds: Record<string, string>,
  mpn?: string
): Promise<TestResult> {
  const probeMpn = mpn ?? TI_PROBE_MPN;
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

  const probeUrl = `https://transact.ti.com/v2/store/products/${encodeURIComponent(probeMpn)}?currency=CAD&exclude-evms=true`;
  try {
    const res = await timedFetch(probeUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    const body = await readBody(res);
    if (!res.ok) {
      return {
        ok: true,
        message: `Connected to TI — auth OK but product probe returned HTTP ${res.status}`,
        raw_response: body,
        status_code: res.status,
        request_url: probeUrl,
      };
    }
    return {
      ok: true,
      message: "Connected to TI — auth OK, product probe reachable",
      raw_response: body,
      status_code: res.status,
      request_url: probeUrl,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: true,
      message: `Connected to TI — auth OK but product probe network error: ${msg}`,
      request_url: probeUrl,
    };
  }
}

// ---------------------------------------------------------------------------
// TME — HMAC-SHA1 signed POST (Polish distributor)
// Signature = base64(HMAC-SHA1(secret, METHOD&urlenc(url)&urlenc(sorted_params)))
// Secrets are in the POST body (not URL), so URL capture is safe as-is.
// ---------------------------------------------------------------------------
async function testTme(
  creds: Record<string, string>,
  mpn?: string
): Promise<TestResult> {
  const probeMpn = mpn ?? DEFAULT_PROBE_MPN;
  const { token, secret } = creds;
  if (!token || !secret) {
    return { ok: false, message: "Missing token or secret" };
  }

  const url = "https://api.tme.eu/Products/Search.json";
  try {
    const params: Record<string, string> = {
      Token: token,
      Country: "CA",
      Language: "EN",
      SearchPlain: probeMpn,
    };

    // Build signature per TME docs:
    //   signatureBase = METHOD + "&" + urlencode(URL) + "&" + urlencode(sortedParams)
    //   signature = base64(HMAC-SHA1(secret, signatureBase))
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
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
    const parsed = await readBody(res);
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: `Auth failed: HTTP ${res.status}`,
        raw_response: parsed,
        status_code: res.status,
        request_url: url,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        message: `HTTP ${res.status} (TME signature scheme may need adjustment)`,
        raw_response: parsed,
        status_code: res.status,
        request_url: url,
      };
    }
    const data = parsed as {
      Status?: string;
      Data?: { ProductList?: unknown[] };
    };
    if (data.Status && data.Status !== "OK") {
      return {
        ok: false,
        message: `TME rejected: Status=${data.Status}`,
        raw_response: parsed,
        status_code: res.status,
        request_url: url,
      };
    }
    const count = data.Data?.ProductList?.length ?? 0;
    return {
      ok: true,
      message: `Connected to TME — auth OK, search returned ${count} parts`,
      raw_response: parsed,
      status_code: res.status,
      request_url: url,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message: `TME network error: ${msg} (signature scheme may need adjustment)`,
      request_url: url,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * For OAuth token responses (Avnet, Arrow) — replace the actual access_token
 * value with the literal "<redacted>" but keep the shape of the envelope so
 * the user can verify the response structure.
 */
function redactTokenField(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const obj = body as Record<string, unknown>;
  const redacted: Record<string, unknown> = { ...obj };
  for (const key of [
    "access_token",
    "refresh_token",
    "id_token",
  ]) {
    if (key in redacted && typeof redacted[key] === "string") {
      redacted[key] = "<redacted>";
    }
  }
  return redacted;
}
