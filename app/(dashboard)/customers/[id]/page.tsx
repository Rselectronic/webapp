import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { formatPhone } from "@/lib/utils/format";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();

  if (!customer) {
    notFound();
  }

  const bomConfig = customer.bom_config as Record<string, unknown> | null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/customers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Customers
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">
              {customer.company_name}
            </h2>
            <Badge variant={customer.is_active ? "default" : "secondary"}>
              {customer.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="font-mono text-gray-500">{customer.code}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
            <CardDescription>Primary contact details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Contact Name</p>
              <p className="text-sm">{customer.contact_name ?? "Not specified"}</p>
            </div>
            {customer.contact_email && (
              <div>
                <p className="text-sm font-medium text-gray-500">Email</p>
                <p className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <a
                    href={`mailto:${customer.contact_email}`}
                    className="text-blue-600 hover:underline"
                  >
                    {customer.contact_email}
                  </a>
                </p>
              </div>
            )}
            {customer.contact_phone && (
              <div>
                <p className="text-sm font-medium text-gray-500">Phone</p>
                <p className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-gray-400" />
                  {formatPhone(customer.contact_phone)}
                </p>
              </div>
            )}
            <Separator />
            <div>
              <p className="text-sm font-medium text-gray-500">Payment Terms</p>
              <p className="text-sm">{customer.payment_terms}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>BOM Configuration</CardTitle>
            <CardDescription>
              How this customer&apos;s Bill of Materials files are parsed
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bomConfig && Object.keys(bomConfig).length > 0 ? (
              <pre className="overflow-x-auto rounded-md bg-gray-50 p-4 text-xs font-mono text-gray-700">
                {JSON.stringify(bomConfig, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-gray-500">
                No BOM configuration set. Auto-detection will be used.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {customer.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {customer.notes}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Order History</CardTitle>
          <CardDescription>
            Recent quotes, jobs, and invoices for this customer
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-gray-500">
            Order history will appear here once quotes and jobs are created (Sprint 2+).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
