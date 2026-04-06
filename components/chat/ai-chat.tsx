"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle, X, Send, Loader2, Bot, User } from "lucide-react";

export function AIChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    api: "/api/chat",
  } as Parameters<typeof useChat>[0]);

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function handleSend(text?: string) {
    const msg = text ?? input.trim();
    if (!msg || isLoading) return;
    sendMessage({ text: msg });
    setInput("");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-800 transition-colors"
        aria-label="Open AI Assistant"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[600px] w-[420px] flex-col rounded-2xl border bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-gray-700" />
          <div>
            <p className="text-sm font-semibold">RS Assistant</p>
            <p className="text-xs text-gray-500">Ask about customers, quotes, jobs, BOMs</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-gray-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-sm text-gray-400 mt-8 space-y-3">
            <Bot className="h-10 w-10 mx-auto text-gray-300" />
            <p className="font-medium text-gray-500">How can I help?</p>
            <div className="space-y-1.5">
              {["Show me all customers", "Business overview", "Classify MPN RC0603FR-0710KL"].map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  className="block w-full rounded-lg border px-3 py-2 text-left text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100">
                <Bot className="h-4 w-4 text-gray-600" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-800"}`}>
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return <div key={i} className="whitespace-pre-wrap break-words leading-relaxed">{part.text}</div>;
                }
                if (part.type.startsWith("tool-")) {
                  return <div key={i} className="text-xs text-gray-400 italic">Querying data...</div>;
                }
                return null;
              })}
            </div>
            {m.role === "user" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900">
                <User className="h-4 w-4 text-white" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100">
              <Bot className="h-4 w-4 text-gray-600" />
            </div>
            <div className="rounded-xl bg-gray-100 px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-500 text-center">{error.message}</p>}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t px-3 py-3">
        <div className="flex gap-2">
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
            placeholder="Ask about customers, quotes, jobs..."
            rows={1}
            className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <Button type="button" size="sm" disabled={isLoading || !input.trim()} onClick={() => handleSend()} className="shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
