import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface BgStockItem {
  id: string;
  mpn: string;
  manufacturer: string | null;
  description: string | null;
  m_code: string | null;
  current_qty: number;
  min_qty: number;
  feeder_slot: string | null;
  last_counted_at: string | null;
  updated_at: string;
}

export default async function InventoryPage() {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("bg_stock")
    .select("*")
    .order("mpn", { ascending: true });

  const stock: BgStockItem[] = items ?? [];
  const lowStock = stock.filter((i) => i.current_qty > 0 && i.current_qty <= i.min_qty);
  const outOfStock = stock.filter((i) => i.current_qty <= 0);
  const healthy = stock.filter((i) => i.current_qty > i.min_qty);

  return (
    <main className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Inventory</h2>
          <p className="text-sm text-gray-500">
            BG (Background) feeder stock — common passives on SMT feeders.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Total Items</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stock.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Healthy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{healthy.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Low Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{lowStock.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Out of Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{outOfStock.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Stock Table */}
      <Card>
        <CardContent className="p-0">
          {error || stock.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              {error
                ? "Failed to load BG stock. Make sure the bg_stock table exists (run migration 010)."
                : "No BG stock items yet. Add items via the API or import from your existing BG Stock History."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-3 font-medium">MPN</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">M-Code</th>
                    <th className="px-4 py-3 font-medium">Feeder</th>
                    <th className="px-4 py-3 font-medium text-right">Qty</th>
                    <th className="px-4 py-3 font-medium text-right">Min</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((item) => {
                    const status =
                      item.current_qty <= 0
                        ? "out"
                        : item.current_qty <= item.min_qty
                          ? "low"
                          : "ok";
                    return (
                      <tr
                        key={item.id}
                        className={`border-b ${status === "out" ? "bg-red-50" : status === "low" ? "bg-yellow-50" : ""}`}
                      >
                        <td className="px-4 py-3 font-mono text-xs font-medium">
                          {item.mpn}
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-gray-600">
                          {item.description ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {item.m_code ? (
                            <Badge variant="outline">{item.m_code}</Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {item.feeder_slot ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {item.current_qty}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {item.min_qty}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              status === "out"
                                ? "destructive"
                                : status === "low"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {status === "out"
                              ? "Out"
                              : status === "low"
                                ? "Low"
                                : "OK"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
