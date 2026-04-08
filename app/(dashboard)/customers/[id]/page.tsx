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
import { ArrowLeft, Mail, Phone, User, MapPin, CircuitBoard, Plus, FileText } from "lucide-react";
import { formatPhone, formatDate, formatCurrency } from "@/lib/utils/format";

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

  interface ContactItem { name: string; email: string; phone: string; role: string; is_primary: boolean }
  interface AddressItem { label: string; street: string; city: string; province: string; postal_code: string; country: string; is_default: boolean }

  const contacts = (customer.contacts as ContactItem[] | null) ?? [];
  const billingAddresses = (customer.billing_addresses as AddressItem[] | null) ?? [];
  const shippingAddresses = (customer.shipping_addresses as AddressItem[] | null) ?? [];

  const [quotesResult, jobsResult, invoicesResult, gmpsResult, bomsResult] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, quote_number, status, created_at, gmps(gmp_number)")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("jobs")
      .select("id, job_number, status, quantity, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, total, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("gmps")
      .select("id, gmp_number, board_name, revision, is_active, created_at")
      .eq("customer_id", id)
      .order("gmp_number", { ascending: true }),
    supabase
      .from("boms")
      .select("id, gmp_id, file_name, revision, status, component_count, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
  ]);

  type QuoteRow = {
    id: string;
    quote_number: string;
    status: string;
    created_at: string;
    gmps: { gmp_number: string } | null;
  };
  type JobRow = {
    id: string;
    job_number: string;
    status: string;
    quantity: number;
    created_at: string;
  };
  type InvoiceRow = {
    id: string;
    invoice_number: string;
    status: string;
    total: number;
    created_at: string;
  };

  type GmpRow = {
    id: string;
    gmp_number: string;
    board_name: string | null;
    revision: string | null;
    is_active: boolean;
    created_at: string;
  };
  type BomRow = {
    id: string;
    gmp_id: string;
    file_name: string;
    revision: string | null;
    status: string;
    component_count: number;
    created_at: string;
  };

  const quotes = (quotesResult.data ?? []) as unknown as QuoteRow[];
  const jobs = (jobsResult.data ?? []) as unknown as JobRow[];
  const invoices = (invoicesResult.data ?? []) as unknown as InvoiceRow[];
  const gmps = (gmpsResult.data ?? []) as unknown as GmpRow[];
  const allBoms = (bomsResult.data ?? []) as unknown as BomRow[];

  // Group BOMs by GMP
  const bomsByGmp = new Map<string, BomRow[]>();
  for (const bom of allBoms) {
    const existing = bomsByGmp.get(bom.gmp_id) ?? [];
    existing.push(bom);
    bomsByGmp.set(bom.gmp_id, existing);
  }

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

      {/* Contacts */}
      <Card>
        <CardHeader>
          <CardTitle>Contacts / Sales Reps ({contacts.length || 1})</CardTitle>
          <CardDescription>People who contact RS for quotations and orders</CardDescription>
        </CardHeader>
        <CardContent>
          {contacts.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {contacts.map((c, i) => (
                <div key={i} className="rounded-lg border p-4 space-y-2 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium">{c.name || "Unnamed"}</span>
                    {c.is_primary && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900 dark:text-green-300">Primary</span>
                    )}
                  </div>
                  {c.role && <p className="text-xs text-gray-500">{c.role}</p>}
                  {c.email && (
                    <p className="flex items-center gap-1.5 text-sm">
                      <Mail className="h-3.5 w-3.5 text-gray-400" />
                      <a href={`mailto:${c.email}`} className="text-blue-600 hover:underline">{c.email}</a>
                    </p>
                  )}
                  {c.phone && (
                    <p className="flex items-center gap-1.5 text-sm">
                      <Phone className="h-3.5 w-3.5 text-gray-400" />
                      {formatPhone(c.phone)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">{customer.contact_name ?? "Not specified"}</p>
              {customer.contact_email && (
                <p className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <a href={`mailto:${customer.contact_email}`} className="text-blue-600 hover:underline">{customer.contact_email}</a>
                </p>
              )}
              {customer.contact_phone && (
                <p className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-gray-400" />
                  {formatPhone(customer.contact_phone)}
                </p>
              )}
            </div>
          )}
          <Separator className="my-4" />
          <div>
            <p className="text-sm font-medium text-gray-500">Payment Terms</p>
            <p className="text-sm">{customer.payment_terms}</p>
          </div>
        </CardContent>
      </Card>

      {/* Addresses */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Billing Addresses ({billingAddresses.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {billingAddresses.length > 0 ? (
              <div className="space-y-3">
                {billingAddresses.map((a, i) => (
                  <div key={i} className="rounded-lg border p-3 dark:border-gray-800">
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-xs font-medium text-gray-500">{a.label || `Address ${i + 1}`}</span>
                      {a.is_default && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">Default</span>
                      )}
                    </div>
                    <p className="text-sm">{a.street}</p>
                    <p className="text-sm text-gray-500">{[a.city, a.province, a.postal_code].filter(Boolean).join(", ")}</p>
                    {a.country && a.country !== "Canada" && <p className="text-xs text-gray-400">{a.country}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No billing addresses on file.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shipping Addresses ({shippingAddresses.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {shippingAddresses.length > 0 ? (
              <div className="space-y-3">
                {shippingAddresses.map((a, i) => (
                  <div key={i} className="rounded-lg border p-3 dark:border-gray-800">
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-xs font-medium text-gray-500">{a.label || `Address ${i + 1}`}</span>
                      {a.is_default && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">Default</span>
                      )}
                    </div>
                    <p className="text-sm">{a.street}</p>
                    <p className="text-sm text-gray-500">{[a.city, a.province, a.postal_code].filter(Boolean).join(", ")}</p>
                    {a.country && a.country !== "Canada" && <p className="text-xs text-gray-400">{a.country}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No shipping addresses on file.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* BOM Config */}
      <Card>
        <CardHeader>
          <CardTitle>BOM Configuration</CardTitle>
          <CardDescription>
            How this customer&apos;s Bill of Materials files are parsed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bomConfig && Object.keys(bomConfig).length > 0 ? (
            <pre className="overflow-x-auto rounded-md bg-gray-50 p-4 text-xs font-mono text-gray-700 dark:bg-gray-900 dark:text-gray-300">
              {JSON.stringify(bomConfig, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-gray-500">
              No BOM configuration set. Auto-detection will be used.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Boards / GMPs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CircuitBoard className="h-5 w-5" />
                Boards / GMPs ({gmps.length})
              </CardTitle>
              <CardDescription>
                All board designs for this customer, with their BOM files
              </CardDescription>
            </div>
            <Link href={`/bom/upload?customer=${id}`}>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Board
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {gmps.length === 0 ? (
            <p className="text-sm text-gray-500">
              No boards yet. Upload a BOM to create the first board.
            </p>
          ) : (
            <div className="space-y-4">
              {gmps.map((gmp) => {
                const gmpBoms = bomsByGmp.get(gmp.id) ?? [];
                return (
                  <div key={gmp.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-bold text-blue-600">
                          {gmp.gmp_number}
                        </span>
                        {gmp.board_name && (
                          <span className="text-sm text-gray-600">{gmp.board_name}</span>
                        )}
                        {gmp.revision && (
                          <span className="text-xs text-gray-400">Rev {gmp.revision}</span>
                        )}
                        <Badge variant={gmp.is_active ? "default" : "secondary"} className="text-xs">
                          {gmp.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <Link href={`/bom/upload?customer=${id}&gmp=${gmp.id}`}>
                        <Button variant="outline" size="sm">
                          <Plus className="mr-1 h-3 w-3" />
                          Upload BOM
                        </Button>
                      </Link>
                    </div>

                    {gmpBoms.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {gmpBoms.map((bom) => (
                          <Link
                            key={bom.id}
                            href={`/bom/${bom.id}`}
                            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-gray-50"
                          >
                            <FileText className="h-4 w-4 text-gray-400" />
                            <span className="flex-1 font-mono text-xs">{bom.file_name}</span>
                            {bom.revision && (
                              <span className="text-xs text-gray-400">Rev {bom.revision}</span>
                            )}
                            <Badge
                              variant="secondary"
                              className={`text-xs ${
                                bom.status === "parsed"
                                  ? "bg-green-100 text-green-700"
                                  : bom.status === "error"
                                    ? "bg-red-100 text-red-700"
                                    : ""
                              }`}
                            >
                              {bom.status}
                            </Badge>
                            <span className="font-mono text-xs text-gray-400">
                              {bom.component_count} parts
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}

                    {gmpBoms.length === 0 && (
                      <p className="mt-2 text-xs text-gray-400">No BOMs uploaded yet</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
        <CardContent className="space-y-8">
          {/* Recent Quotes */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Recent Quotes</h3>
            {quotes.length === 0 ? (
              <p className="text-sm text-gray-500">No quotes yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 pr-4 font-medium">Quote #</th>
                      <th className="pb-2 pr-4 font-medium">GMP</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q) => (
                      <tr key={q.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <Link href={`/quotes/${q.id}`} className="text-blue-600 hover:underline">
                            {q.quote_number}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs">{q.gmps?.gmp_number ?? "-"}</td>
                        <td className="py-2 pr-4">
                          <Badge variant="secondary" className="text-xs">{q.status}</Badge>
                        </td>
                        <td className="py-2 text-gray-500">{formatDate(q.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Separator />

          {/* Recent Jobs */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Recent Jobs</h3>
            {jobs.length === 0 ? (
              <p className="text-sm text-gray-500">No jobs yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 pr-4 font-medium">Job #</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 pr-4 font-medium">Qty</th>
                      <th className="pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <Link href={`/jobs/${j.id}`} className="text-blue-600 hover:underline">
                            {j.job_number}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="secondary" className="text-xs">{j.status}</Badge>
                        </td>
                        <td className="py-2 pr-4">{j.quantity}</td>
                        <td className="py-2 text-gray-500">{formatDate(j.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Separator />

          {/* Recent Invoices */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Recent Invoices</h3>
            {invoices.length === 0 ? (
              <p className="text-sm text-gray-500">No invoices yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 pr-4 font-medium">Invoice #</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 pr-4 font-medium">Total</th>
                      <th className="pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <Link href={`/invoices/${inv.id}`} className="text-blue-600 hover:underline">
                            {inv.invoice_number}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="secondary" className="text-xs">{inv.status}</Badge>
                        </td>
                        <td className="py-2 pr-4">{formatCurrency(inv.total)}</td>
                        <td className="py-2 text-gray-500">{formatDate(inv.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
