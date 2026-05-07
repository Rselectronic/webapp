// Process-local registry of in-flight pricing-fetch requests, used by the
// /pricing-review/cancel endpoint to abort work that's already streaming.
//
// IMPORTANT: This is in-memory and per-instance. On a multi-instance deploy
// (Vercel scaling, multiple Node workers) a cancel hitting instance B won't
// reach a fetch running on instance A. For RS's single-instance deploy this
// is fine; if we ever scale out, swap the Map for Redis pub/sub keyed on
// request_id.

interface RequestEntry {
  /** Master controller — abort cancels every supplier in this request. */
  all: AbortController;
  /** Per-supplier controllers. Aborting one stops only that supplier's
   *  remaining work; the others keep running. */
  perSupplier: Map<string, AbortController>;
}

const requests = new Map<string, RequestEntry>();

export function registerRequest(requestId: string, suppliers: readonly string[]): RequestEntry {
  const all = new AbortController();
  const perSupplier = new Map<string, AbortController>();
  for (const s of suppliers) {
    const c = new AbortController();
    // Master abort propagates to every supplier signal.
    all.signal.addEventListener("abort", () => c.abort(), { once: true });
    perSupplier.set(s, c);
  }
  const entry: RequestEntry = { all, perSupplier };
  requests.set(requestId, entry);
  return entry;
}

export function unregisterRequest(requestId: string): void {
  requests.delete(requestId);
}

export function cancelSupplier(requestId: string, supplier: string): boolean {
  const entry = requests.get(requestId);
  if (!entry) return false;
  const c = entry.perSupplier.get(supplier);
  if (!c) return false;
  if (!c.signal.aborted) c.abort();
  return true;
}

export function cancelAll(requestId: string): boolean {
  const entry = requests.get(requestId);
  if (!entry) return false;
  if (!entry.all.signal.aborted) entry.all.abort();
  return true;
}

export function getSupplierSignal(requestId: string, supplier: string): AbortSignal | null {
  const entry = requests.get(requestId);
  if (!entry) return null;
  return entry.perSupplier.get(supplier)?.signal ?? null;
}
