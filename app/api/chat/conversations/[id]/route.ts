import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** GET /api/chat/conversations/[id] — get conversation with all messages */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership
  const { data: conversation, error: convErr } = await supabase
    .from("chat_conversations")
    .select("id, title, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (convErr || !conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Get all messages with attachments
  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, role, content, metadata, created_at, chat_attachments(id, file_name, file_path, file_type, file_size)")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    ...conversation,
    messages: messages ?? [],
  });
}

/** DELETE /api/chat/conversations/[id] — delete a conversation */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("chat_conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

/** PATCH /api/chat/conversations/[id] — update title */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body.title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const { data, error } = await supabase
    .from("chat_conversations")
    .update({ title: body.title, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, title, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
