import Link from "next/link";
import { ArrowLeft, Mail, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TemplateEditor } from "@/components/email-templates/template-editor";

interface SearchParams {
  action?: string;
  id?: string;
}

const CATEGORY_COLORS: Record<string, "default" | "secondary" | "destructive"> = {
  quote: "default",
  invoice: "default",
  shipping: "secondary",
  procurement: "secondary",
  general: "secondary",
};

export default async function EmailTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: templates, error } = await supabase
    .from("email_templates")
    .select("*")
    .order("category")
    .order("name");

  // Create mode
  if (params.action === "new") {
    return (
      <div className="space-y-6">
        <Link href="/settings/email-templates">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Templates
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Create Email Template</h2>
          <p className="text-gray-500">Define a reusable email template with variable placeholders.</p>
        </div>
        <TemplateEditor mode="create" />
      </div>
    );
  }

  // Edit mode
  if (params.action === "edit" && params.id) {
    const template = templates?.find((t) => t.id === params.id);
    if (!template) {
      return (
        <div className="space-y-6">
          <Link href="/settings/email-templates">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Templates
            </Button>
          </Link>
          <p className="text-gray-500">Template not found.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <Link href="/settings/email-templates">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Templates
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Edit Template</h2>
          <p className="text-gray-500">{template.name}</p>
        </div>
        <TemplateEditor mode="edit" template={template} />
      </div>
    );
  }

  // List mode (default)
  const grouped: Record<string, typeof templates> = {};
  for (const t of templates ?? []) {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category]!.push(t);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/settings">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Settings
              </Button>
            </Link>
          </div>
          <h2 className="mt-2 text-2xl font-bold text-gray-900">Email Templates</h2>
          <p className="text-gray-500">
            {templates?.length ?? 0} template{(templates?.length ?? 0) !== 1 ? "s" : ""} configured
          </p>
        </div>
        <Link href="/settings/email-templates?action=new">
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Template
          </Button>
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load email templates. Make sure the database migration has been applied.
        </div>
      ) : !templates || templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <p className="text-lg font-medium text-gray-900">No email templates yet</p>
            <p className="mt-1 text-gray-500">
              Create templates for quotes, invoices, shipping notifications, and more.
            </p>
            <Link href="/settings/email-templates?action=new">
              <Button className="mt-4" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Create First Template
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-white dark:border-gray-800 dark:bg-gray-950">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="w-24">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link
                      href={`/settings/email-templates?action=edit&id=${t.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {t.name}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-sm text-gray-500">
                    {t.subject}
                  </TableCell>
                  <TableCell>
                    <Badge variant={CATEGORY_COLORS[t.category] ?? "secondary"}>
                      {t.category.charAt(0).toUpperCase() + t.category.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.is_active ? "default" : "secondary"}>
                      {t.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
