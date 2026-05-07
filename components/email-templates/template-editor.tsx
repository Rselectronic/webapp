"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, EyeOff, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIES = ["quote", "invoice", "shipping", "procurement", "general"] as const;

const AVAILABLE_VARIABLES: Record<string, string[]> = {
  quote: [
    "customer_name", "contact_name", "quote_number", "gmp_number",
    "board_name", "quantities", "expiry_date",
  ],
  invoice: [
    "customer_name", "contact_name", "invoice_number", "job_number",
    "total_amount", "issued_date", "due_date", "payment_amount",
    "payment_date", "payment_method", "remaining_balance",
  ],
  shipping: [
    "customer_name", "contact_name", "job_number", "gmp_number",
    "quantity", "carrier", "tracking_number", "ship_date", "estimated_delivery",
  ],
  procurement: [
    "supplier_contact", "po_number", "total_amount", "required_date",
  ],
  general: [
    "customer_name", "contact_name",
  ],
};

const SAMPLE_DATA: Record<string, string> = {
  customer_name: "Lanka / Knorr-Bremse",
  contact_name: "Luis Esqueda",
  quote_number: "QT-2604-001",
  gmp_number: "TL265-5040-000-T",
  board_name: "Power Controller Board",
  quantities: "50 / 100 / 250 / 500",
  expiry_date: "May 7, 2026",
  invoice_number: "RSINV_20260430210347",
  job_number: "JB-2604-TLAN-001",
  total_amount: "$12,500.00",
  issued_date: "Apr 7, 2026",
  due_date: "May 7, 2026",
  payment_amount: "$12,500.00",
  payment_date: "Apr 20, 2026",
  payment_method: "Wire Transfer",
  remaining_balance: "$0.00",
  quantity: "100",
  carrier: "Purolator",
  tracking_number: "329847561234",
  ship_date: "Apr 15, 2026",
  estimated_delivery: "Apr 18, 2026",
  supplier_contact: "Mike",
  po_number: "PO-2604-001",
  required_date: "Apr 25, 2026",
};

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  is_active: boolean;
}

interface TemplateEditorProps {
  template?: EmailTemplate;
  mode: "create" | "edit";
}

function renderTemplate(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => SAMPLE_DATA[key] ?? `[${key}]`);
}

export function TemplateEditor({ template, mode }: TemplateEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [category, setCategory] = useState(template?.category ?? "general");
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function insertVariable(variable: string) {
    const tag = `{{${variable}}}`;
    setBody((prev) => prev + tag);
  }

  async function handleSave() {
    if (!name || !subject || !body || !category) return;
    setSaving(true);
    try {
      const payload = { name, subject, body, category, ...(template ? { id: template.id } : {}) };
      const res = await fetch("/api/email-templates", {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to save template");
      }
      router.push("/settings/email-templates");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!template) return;
    if (!confirm("Are you sure you want to delete this template?")) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/email-templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: template.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to delete template");
      }
      router.push("/settings/email-templates");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  function handleCopyToClipboard() {
    const renderedSubject = renderTemplate(subject);
    const renderedBody = renderTemplate(body);
    const fullText = `Subject: ${renderedSubject}\n\n${renderedBody}`;
    navigator.clipboard.writeText(fullText);
    alert("Copied to clipboard! Paste into your email client.");
  }

  const variables = AVAILABLE_VARIABLES[category] ?? AVAILABLE_VARIABLES.general;

  return (
    <div className="space-y-6">
      {/* Form fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="template-name">Template Name</Label>
          <Input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Quote Submission"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="template-category">Category</Label>
          <Select
            value={category}
            onValueChange={(v) => setCategory(v ?? "")}
          >
            <SelectTrigger id="template-category" className="mt-1 w-full">
              <SelectValue>
                {(v: string) => v ? v.charAt(0).toUpperCase() + v.slice(1) : ""}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="template-subject">Subject Line</Label>
        <Input
          id="template-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. RS PCB Assembly — Quotation {{quote_number}}"
          className="mt-1 font-mono text-sm"
        />
      </div>

      {/* Variable insertion */}
      <div>
        <Label className="mb-2 block">Insert Variable</Label>
        <div className="flex flex-wrap gap-1">
          {variables.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => insertVariable(v)}
              className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-mono text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="template-body">Email Body</Label>
        <textarea
          id="template-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Write your email template here. Use {{variable_name}} for dynamic content..."
        />
      </div>

      {/* Preview */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? (
            <EyeOff className="mr-2 h-4 w-4" />
          ) : (
            <Eye className="mr-2 h-4 w-4" />
          )}
          {showPreview ? "Hide Preview" : "Show Preview"}
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopyToClipboard}>
          <Copy className="mr-2 h-4 w-4" />
          Copy to Clipboard
        </Button>
      </div>

      {showPreview && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-700">Preview (with sample data)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-500">Subject:</p>
              <p className="text-sm font-medium">{renderTemplate(subject)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Body:</p>
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
                {renderTemplate(body)}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 border-t pt-4">
        <Button
          onClick={handleSave}
          disabled={saving || !name || !subject || !body}
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {saving ? "Saving..." : mode === "create" ? "Create Template" : "Save Changes"}
        </Button>

        {mode === "edit" && (
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        )}
      </div>
    </div>
  );
}
