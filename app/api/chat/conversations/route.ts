import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** GET /api/chat/conversations — list user's conversations (recent first) */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get conversations with the latest message preview
  const { data: conversations, error } = await supabase
    .from("chat_conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch last message for each conversation (batch)
  const convIds = (conversations ?? []).map((c) => c.id);
  let previews: Record<string, string> = {};

  if (convIds.length > 0) {
    // Get the most recent message per conversation using a lateral join workaround
    // Supabase JS doesn't support lateral joins, so we fetch recent messages and dedupe
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("conversation_id, content, role, created_at")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false })
      .limit(convIds.length * 2);

    const seen = new Set<string>();
    for (const msg of msgs ?? []) {
      if (!seen.has(msg.conversation_id)) {
        seen.add(msg.conversation_id);
        const preview = msg.content.slice(0, 100) + (msg.content.length > 100 ? "..." : "");
        previews[msg.conversation_id] = `${msg.role === "user" ? "You" : "AI"}: ${preview}`;
      }
    }
  }

  const result = (conversations ?? []).map((c) => ({
    ...c,
    last_message: previews[c.id] ?? null,
  }));

  return NextResponse.json(result);
}

/** POST /api/chat/conversations — create new conversation */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = body.title || "New conversation";

  const { data, error } = await supabase
    .from("chat_conversations")
    .insert({ user_id: user.id, title })
    .select("id, title, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
