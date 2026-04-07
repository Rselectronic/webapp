"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TemplateRenderButtonProps {
  subject: string;
  body: string;
  variables: Record<string, string>;
}

function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `[${key}]`);
}

export function TemplateRenderButton({
  subject,
  body,
  variables,
}: TemplateRenderButtonProps) {
  function handleCopy() {
    const renderedSubject = renderTemplate(subject, variables);
    const renderedBody = renderTemplate(body, variables);
    const fullText = `Subject: ${renderedSubject}\n\n${renderedBody}`;
    navigator.clipboard.writeText(fullText);
    alert("Copied to clipboard! Paste into your email client.");
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      <Copy className="mr-2 h-4 w-4" />
      Copy to Clipboard
    </Button>
  );
}
