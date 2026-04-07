import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** POST /api/chat/conversations/[id]/messages — save a message to the conversation */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify conversation ownership
  const { data: conv } = await supabase
    .from("chat_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .single();

  if (!conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const body = await req.json();
  const { role, content, metadata, attachments } = body;

  if (!role || !content) {
    return NextResponse.json({ error: "role and content are required" }, { status: 400 });
  }

  // Insert message
  const { data: message, error: msgErr } = await supabase
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      role,
      content,
      metadata: metadata ?? {},
    })
    .select("id, role, content, metadata, created_at")
    .single();

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  // Insert attachments if any
  let savedAttachments: unknown[] = [];
  if (attachments && Array.isArray(attachments) && attachments.length > 0) {
    const attachmentRows = attachments.map((a: { file_name: string; file_path: string; file_type: string; file_size: number }) => ({
      message_id: message.id,
      file_name: a.file_name,
      file_path: a.file_path,
      file_type: a.file_type,
      file_size: a.file_size,
    }));

    const { data: attData } = await supabase
      .from("chat_attachments")
      .insert(attachmentRows)
      .select("id, file_name, file_path, file_type, file_size");

    savedAttachments = attData ?? [];
  }

  // Update conversation timestamp + auto-title from first user message
  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (role === "user") {
    // Check if this is the first user message — auto-generate title
    const { count } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("role", "user");

    if ((count ?? 0) <= 1) {
      // First user message: use as title (truncated)
      updates.title = content.slice(0, 80) + (content.length > 80 ? "..." : "");
    }
  }

  await supabase
    .from("chat_conversations")
    .update(updates)
    .eq("id", conversationId);

  return NextResponse.json({
    ...message,
    attachments: savedAttachments,
  }, { status: 201 });
}
