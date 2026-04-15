import { createAdminClient } from "@/lib/supabase/server";

/**
 * AI call telemetry — writes one row to ai_call_log per invocation.
 *
 * Every AI call site in the webapp (mcode classifier, BOM column mapper,
 * chat assistant) should wrap its Anthropic / AI-SDK call in
 * `recordAiCall(...)` so we get unified visibility: token usage, latency,
 * success/failure, per-purpose breakdown.
 *
 * Design notes:
 *   - Uses the admin Supabase client so it works from server routes that
 *     may not have an authenticated user (e.g. BOM parse triggered by a
 *     webhook). Pass `user_id` explicitly when available.
 *   - Insert is fire-and-forget with a catch so a telemetry failure never
 *     breaks the actual AI call. We log to console if the insert throws.
 *   - Zero external dependencies — no Vercel Analytics, no PostHog, no
 *     OpenTelemetry. Everything lands in Supabase where the rest of the
 *     business data lives.
 */

export type AiCallPurpose =
  | "mcode_classifier"
  | "bom_column_mapper"
  | "chat_assistant"
  | "other";

export interface AiCallRecord {
  purpose: AiCallPurpose;
  provider?: string;         // default 'anthropic'
  model: string;
  input_tokens?: number | null;
  output_tokens?: number | null;
  latency_ms: number;
  success: boolean;
  error_message?: string | null;
  user_id?: string | null;
  bom_id?: string | null;
  mpn?: string | null;
  conversation_id?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Insert one telemetry row. Fire-and-forget — errors are swallowed after
 * logging, so a telemetry outage never blocks the AI call it wraps.
 */
export async function recordAiCall(record: AiCallRecord): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("ai_call_log").insert({
      purpose: record.purpose,
      provider: record.provider ?? "anthropic",
      model: record.model,
      input_tokens: record.input_tokens ?? null,
      output_tokens: record.output_tokens ?? null,
      latency_ms: Math.round(record.latency_ms),
      success: record.success,
      error_message: record.error_message ?? null,
      user_id: record.user_id ?? null,
      bom_id: record.bom_id ?? null,
      mpn: record.mpn ?? null,
      conversation_id: record.conversation_id ?? null,
      metadata: record.metadata ?? {},
    });
    if (error) {
      console.warn("[ai-telemetry] insert failed:", error.message);
    }
  } catch (err) {
    console.warn(
      "[ai-telemetry] threw:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Convenience wrapper: run an async AI call, time it, then record the
 * telemetry row based on the outcome. Re-throws whatever the wrapped
 * function throws so the caller's error handling is unchanged.
 *
 * Usage:
 *   const params = await withAiTelemetry(
 *     { purpose: 'mcode_classifier', model: 'claude-haiku-4-5-20251001', mpn },
 *     async () => {
 *       const response = await anthropic.messages.create(...);
 *       return {
 *         result: parseResponse(response),
 *         input_tokens: response.usage.input_tokens,
 *         output_tokens: response.usage.output_tokens,
 *       };
 *     }
 *   );
 */
export async function withAiTelemetry<T>(
  base: Omit<AiCallRecord, "latency_ms" | "success" | "input_tokens" | "output_tokens">,
  fn: () => Promise<{
    result: T;
    input_tokens?: number | null;
    output_tokens?: number | null;
  }>
): Promise<T> {
  const start = Date.now();
  try {
    const { result, input_tokens, output_tokens } = await fn();
    // Fire telemetry but do NOT await — return the result immediately.
    void recordAiCall({
      ...base,
      latency_ms: Date.now() - start,
      success: true,
      input_tokens: input_tokens ?? null,
      output_tokens: output_tokens ?? null,
    });
    return result;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err ?? "unknown error");
    void recordAiCall({
      ...base,
      latency_ms: Date.now() - start,
      success: false,
      error_message: message,
    });
    throw err;
  }
}
