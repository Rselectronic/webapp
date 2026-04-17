"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Bot,
  User,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Trash2,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  XCircle,
  Sparkles,
} from "lucide-react";
import { detectPageContext, getPageSuggestions } from "@/lib/chat/page-context";

// ---------- Types ----------
interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message?: string | null;
}

interface MediaAttachment {
  kind: "image" | "pdf";
  media_type: string;
  data_base64: string;
  name: string;
}

interface FileAttachment {
  file: File;
  file_name: string;
  file_path?: string;
  file_type: string;
  file_size: number;
  parsed_preview?: string | null;
  media?: MediaAttachment | null;
  uploading?: boolean;
}

// ---------- Component ----------
export function AIChat() {
  const [open, setOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [fileContext, setFileContext] = useState<string | null>(null);
  // Media (images/PDFs) pending to attach to the next outgoing user message
  const [pendingMedia, setPendingMedia] = useState<MediaAttachment[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Current page — makes the chat page-context-aware
  const pathname = usePathname();
  const pageCtx = useMemo(() => detectPageContext(pathname), [pathname]);
  const pageSuggestions = useMemo(() => getPageSuggestions(pageCtx), [pageCtx]);
  const hasEntityContext = !!(pageCtx && pageCtx.id);

  const { messages, setMessages, sendMessage, status, error } = useChat({
    api: "/api/chat",
    body: {
      conversationId: activeConversationId,
      fileContext,
      pendingMedia,
      currentPage: pathname,
      attachments: attachments
        .filter((a) => a.file_path)
        .map((a) => ({
          file_name: a.file_name,
          file_path: a.file_path,
          file_type: a.file_type,
          file_size: a.file_size,
        })),
    },
  } as Parameters<typeof useChat>[0]);

  const isLoading = status === "streaming" || status === "submitted";

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Load conversations when sidebar opens
  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const res = await fetch("/api/chat/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    if (open && sidebarOpen) {
      loadConversations();
    }
  }, [open, sidebarOpen, loadConversations]);

  // Load a conversation's messages
  async function loadConversation(convId: string) {
    setActiveConversationId(convId);
    setAttachments([]);
    setFileContext(null);
    setPendingMedia([]);

    try {
      const res = await fetch(`/api/chat/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        // Convert DB messages to useChat format
        const chatMessages = (data.messages ?? []).map(
          (m: { id: string; role: string; content: string; created_at: string; chat_attachments?: unknown[] }) => ({
            id: m.id,
            role: m.role,
            parts: [{ type: "text" as const, text: m.content }],
            content: m.content,
            createdAt: new Date(m.created_at),
          })
        );
        setMessages(chatMessages);
      }
    } catch {
      // silently fail
    }
  }

  // Create new conversation
  async function createNewConversation() {
    setMessages([]);
    setAttachments([]);
    setFileContext(null);
    setPendingMedia([]);

    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New conversation" }),
      });
      if (res.ok) {
        const conv = await res.json();
        setActiveConversationId(conv.id);
        setConversations((prev) => [conv, ...prev]);
      }
    } catch {
      // Fall back to ephemeral (no persistence)
      setActiveConversationId(null);
    }
  }

  // Delete conversation
  async function deleteConversation(convId: string) {
    try {
      await fetch(`/api/chat/conversations/${convId}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConversationId === convId) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch {
      // silently fail
    }
  }

  // File upload handler
  async function handleFileUpload(files: FileList | File[]) {
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      const attachment: FileAttachment = {
        file,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        uploading: true,
      };
      setAttachments((prev) => [...prev, attachment]);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/chat/upload", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const result = await res.json();
          const mediaPart: MediaAttachment | null = result.media
            ? {
                kind: result.media.kind,
                media_type: result.media.media_type,
                data_base64: result.media.data_base64,
                name: file.name,
              }
            : null;

          setAttachments((prev) =>
            prev.map((a) =>
              a.file === file
                ? {
                    ...a,
                    file_path: result.file_path,
                    parsed_preview: result.parsed_preview,
                    media: mediaPart,
                    uploading: false,
                  }
                : a
            )
          );
          // Add parsed text preview to file context (BOM, text file, or the
          // "[Uploaded image/PDF: ...]" marker from the upload route).
          if (result.parsed_preview) {
            setFileContext((prev) =>
              prev ? prev + "\n\n" + result.parsed_preview : result.parsed_preview
            );
          }
          // Queue images/PDFs as multipart inputs for the next message
          if (mediaPart) {
            setPendingMedia((prev) => [...prev, mediaPart]);
          }
        } else {
          const err = await res.json().catch(() => ({ error: "Upload failed" }));
          setAttachments((prev) => prev.filter((a) => a.file !== file));
          alert(err.error || "Upload failed");
        }
      } catch {
        setAttachments((prev) => prev.filter((a) => a.file !== file));
      }
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => {
      const removed = prev[index];
      const next = prev.filter((_, i) => i !== index);
      // Remove this file's parsed_preview from file context
      if (removed?.parsed_preview && fileContext) {
        setFileContext(fileContext.replace(removed.parsed_preview, "").trim() || null);
      }
      // Remove any queued media for this file
      if (removed?.media) {
        setPendingMedia((curr) =>
          curr.filter(
            (m) =>
              !(
                m.name === removed.media!.name &&
                m.data_base64 === removed.media!.data_base64
              )
          )
        );
      }
      return next;
    });
  }

  // Handle drag-and-drop
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  }

  function handleSend(text?: string) {
    const msg = text ?? input.trim();
    if (!msg || isLoading) return;

    // If no active conversation, create one first
    if (!activeConversationId) {
      fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: msg.slice(0, 80) }),
      })
        .then((res) => res.json())
        .then((conv) => {
          setActiveConversationId(conv.id);
          setConversations((prev) => [conv, ...prev]);
          sendMessage({ text: msg });
        })
        .catch(() => {
          // Send without persistence
          sendMessage({ text: msg });
        });
    } else {
      sendMessage({ text: msg });
    }

    setInput("");
    // Clear attachments after sending (they're already in context)
    if (attachments.length > 0) {
      setAttachments([]);
    }
    // Media (images/PDFs) are only attached to ONE outgoing message.
    // Clear after sending so the next turn doesn't re-upload them. The text
    // preview/marker stays in fileContext so the AI remembers the file exists.
    if (pendingMedia.length > 0) {
      setPendingMedia([]);
    }
  }

  function getFileIcon(type: string) {
    if (type.includes("spreadsheet") || type.includes("csv") || type.includes("excel")) {
      return <FileSpreadsheet className="h-3 w-3" />;
    }
    if (type.includes("image")) {
      return <ImageIcon className="h-3 w-3" />;
    }
    return <FileText className="h-3 w-3" />;
  }

  // ---------- Closed State (FAB) ----------
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-800 transition-colors dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
        aria-label="Open AI Assistant"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  // ---------- Open State ----------
  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[600px] w-[420px] rounded-2xl border bg-white shadow-2xl overflow-hidden dark:border-gray-700 dark:bg-gray-950">
      {/* Conversation Sidebar */}
      {sidebarOpen && (
        <div className="w-[180px] border-r bg-gray-50 flex flex-col shrink-0 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between px-2 py-2 border-b">
            <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">History</span>
            <button
              onClick={createNewConversation}
              className="rounded p-1 hover:bg-gray-200 text-gray-500 dark:hover:bg-gray-700 dark:text-gray-400"
              title="New chat"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingConversations ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No conversations yet</p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex items-center gap-1 px-2 py-2 cursor-pointer hover:bg-gray-100 border-b border-gray-100 dark:hover:bg-gray-800 dark:border-gray-800 ${
                    activeConversationId === conv.id ? "bg-gray-100 dark:bg-gray-800" : ""
                  }`}
                >
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => loadConversation(conv.id)}
                  >
                    <p className="text-xs font-medium text-gray-700 truncate dark:text-gray-200">
                      {conv.title}
                    </p>
                    {conv.last_message && (
                      <p className="text-[10px] text-gray-400 truncate">
                        {conv.last_message}
                      </p>
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-gray-200 text-gray-400 shrink-0 dark:hover:bg-gray-700"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Chat Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-md p-1 hover:bg-gray-100 shrink-0 dark:hover:bg-gray-800"
              title={sidebarOpen ? "Hide history" : "Show history"}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4 text-gray-500" />
              ) : (
                <PanelLeftOpen className="h-4 w-4 text-gray-500" />
              )}
            </button>
            <Bot className="h-4 w-4 text-gray-700 shrink-0 dark:text-gray-300" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">RS Assistant</p>
              <p className="text-[10px] text-gray-500 truncate flex items-center gap-1">
                {hasEntityContext ? (
                  <>
                    <Sparkles className="h-2.5 w-2.5 text-emerald-500" />
                    <span className="truncate">
                      Viewing {pageCtx!.type.replace("_", " ")}
                    </span>
                  </>
                ) : (
                  "Customers, quotes, jobs, BOMs"
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={createNewConversation}
              className="rounded-md p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
              title="New chat"
            >
              <Plus className="h-4 w-4 text-gray-500" />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {messages.length === 0 && (
            <div className="text-center text-sm text-gray-400 mt-6 space-y-3">
              <Bot className="h-10 w-10 mx-auto text-gray-300" />
              <p className="font-medium text-gray-500">
                {hasEntityContext ? "Ask me anything about this page" : "How can I help?"}
              </p>
              {hasEntityContext && (
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                  <Sparkles className="h-2.5 w-2.5" />
                  I can see this {pageCtx!.type.replace("_", " ")} — no need to re-explain
                </p>
              )}
              <div className="space-y-1.5">
                {(pageSuggestions.length > 0
                  ? pageSuggestions
                  : [
                      "Show me all customers",
                      "Business overview",
                      "Classify MPN RC0603FR-0710KL",
                    ]
                ).map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="block w-full rounded-lg border px-3 py-2 text-left text-xs text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                Drop files here or use the paperclip to upload BOMs
              </p>
            </div>
          )}

          {/* Compact suggestion chips shown above messages once the chat has content */}
          {messages.length > 0 && hasEntityContext && pageSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 -mt-1">
              {pageSuggestions.slice(0, 3).map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  disabled={isLoading}
                  className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}
            >
              {m.role === "assistant" && (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                  <Bot className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                }`}
              >
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <div
                        key={i}
                        className="whitespace-pre-wrap break-words leading-relaxed"
                      >
                        {part.text}
                      </div>
                    );
                  }
                  if (part.type.startsWith("tool-")) {
                    return (
                      <div key={i} className="text-xs text-gray-400 italic">
                        Querying data...
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
              {m.role === "user" && (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 dark:bg-gray-100">
                  <User className="h-3.5 w-3.5 text-white dark:text-gray-900" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <Bot className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
              </div>
              <div className="rounded-xl bg-gray-100 px-3 py-2 dark:bg-gray-800">
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500 text-center">{error.message}</p>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Attachment Chips */}
        {attachments.length > 0 && (
          <div className="px-3 pb-1 flex flex-wrap gap-1.5">
            {attachments.map((att, i) => (
              <div
                key={i}
                className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              >
                {att.uploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  getFileIcon(att.file_type)
                )}
                <span className="max-w-[100px] truncate">{att.file_name}</span>
                {att.parsed_preview && (
                  <span className="text-green-600 text-[10px]">parsed</span>
                )}
                <button
                  onClick={() => removeAttachment(i)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Area */}
        <div className="border-t px-3 py-2.5">
          <div className="flex gap-2 items-end">
            {/* File Upload Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md p-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0 self-center dark:hover:bg-gray-800 dark:hover:text-gray-300"
              title="Attach file (BOM, PDF, image)"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.gif,.webp,.txt"
              multiple
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileUpload(e.target.files);
                  e.target.value = "";
                }
              }}
            />
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                attachments.length > 0
                  ? "Ask about the uploaded file..."
                  : "Ask about customers, quotes, jobs..."
              }
              rows={1}
              className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-gray-600"
            />
            <Button
              type="button"
              size="sm"
              disabled={isLoading || (!input.trim() && attachments.length === 0)}
              onClick={() => handleSend()}
              className="shrink-0 self-center"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
