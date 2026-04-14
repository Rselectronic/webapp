import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";

export const API_KEY_PREFIX = "rs_live_";

export type ApiKeyRole = "ceo" | "operations_manager" | "shop_floor";

export interface ValidatedApiKey {
  id: string;
  name: string;
  role: ApiKeyRole;
}

/**
 * Generate a new raw API key: "rs_live_" + 32 url-safe base64 chars.
 * 24 random bytes → 32 base64url chars → 192 bits of entropy.
 * The raw key is returned to the caller and must be shown to the user
 * exactly ONCE — only its hash is persisted.
 */
export function generateApiKey(): string {
  const random = randomBytes(24).toString("base64url");
  return `${API_KEY_PREFIX}${random}`;
}

/**
 * Deterministic SHA-256 hash of the raw key, hex-encoded.
 * Used for both write (on create) and lookup (on validate).
 */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Check if a string looks like an RS API key (starts with the prefix).
 * Used by MCP auth to decide whether to try API-key lookup or Supabase JWT.
 */
export function isApiKeyFormat(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}

/**
 * Look up a raw key in the api_keys table. Returns the key's role/name/id
 * on success, or null if the key doesn't exist or has been revoked.
 *
 * On success, fires a non-blocking update of last_used_at (we do NOT await
 * the update — the auth path must stay fast and the update is best-effort).
 *
 * Uses the service-role admin client to bypass RLS. Access control is
 * enforced by possession of the raw key, not by RLS.
 */
export async function validateApiKey(
  rawKey: string
): Promise<ValidatedApiKey | null> {
  if (!isApiKeyFormat(rawKey)) return null;
  const keyHash = hashApiKey(rawKey);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .select("id, name, role, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !data) return null;
  if (data.revoked_at !== null) return null;

  // Fire-and-forget: update last_used_at. Do NOT await — the auth path
  // must stay fast, and this is best-effort telemetry.
  admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(
      () => {},
      () => {}
    );

  return {
    id: data.id,
    name: data.name,
    role: data.role as ApiKeyRole,
  };
}
