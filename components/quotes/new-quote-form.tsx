"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Customer {
  id: string;
  code: string;
  company_name: string;
}

interface Bom {
  id: string;
  file_name: string;
  revision: string;
  gmp_id: string;
  gmps: { gmp_number: string } | null;
}

interface NewQuoteFormProps {
  customers: Customer[];
  initialCustomerId?: string;
  initialBomId?: string;
}

export function NewQuoteForm({
  customers,
  initialCustomerId,
  initialBomId,
}: NewQuoteFormProps) {
  const router = useRouter();

  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [customerInput, setCustomerInput] = useState(
    initialCustomerId
      ? (() => {
          const c = customers.find((c) => c.id === initialCustomerId);
          return c ? `${c.code} — ${c.company_name}` : "";
        })()
      : ""
  );
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerWrapperRef = useRef<HTMLDivElement>(null);

  const [boms, setBoms] = useState<Bom[]>([]);
  const [bomId, setBomId] = useState("");
  const [bomInput, setBomInput] = useState("");
  const [bomDropdownOpen, setBomDropdownOpen] = useState(false);
  const bomWrapperRef = useRef<HTMLDivElement>(null);

  const [loadingBoms, setLoadingBoms] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bomLabel = (b: Bom) =>
    `${b.gmps?.gmp_number ?? "Unknown GMP"} — ${b.file_name} (rev ${b.revision})`;

  const loadBoms = useCallback(async (id: string) => {
    setLoadingBoms(true);
    try {
      const res = await fetch(`/api/boms?customer_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        const list: Bom[] = Array.isArray(data) ? data : data.boms ?? [];
        setBoms(list);
        return list;
      }
    } catch {
      setError("Failed to load BOMs for this customer.");
    } finally {
      setLoadingBoms(false);
    }
    return [];
  }, []);

  // Prefill from ?bom_id=xxx
  const prefillRan = useRef(false);
  useEffect(() => {
    if (prefillRan.current) return;
    if (!initialCustomerId || !initialBomId) return;
    prefillRan.current = true;
    (async () => {
      const list = await loadBoms(initialCustomerId);
      const target = list.find((b) => b.id === initialBomId);
      if (target) {
        setBomId(target.id);
        setBomInput(bomLabel(target));
      }
    })();
  }, [initialCustomerId, initialBomId, loadBoms]);

  // Outside-click to close dropdowns
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (customerWrapperRef.current && !customerWrapperRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false);
      }
      if (bomWrapperRef.current && !bomWrapperRef.current.contains(e.target as Node)) {
        setBomDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredCustomers = customers.filter((c) => {
    const q = customerInput.trim().toLowerCase();
    if (!q) return true;
    return (
      c.code.toLowerCase().includes(q) ||
      c.company_name.toLowerCase().includes(q)
    );
  });

  const handleCustomerSelect = async (customer: Customer) => {
    setCustomerInput(`${customer.code} — ${customer.company_name}`);
    setCustomerDropdownOpen(false);
    setCustomerId(customer.id);
    setBomId("");
    setBomInput("");
    setBoms([]);
    setError(null);
    await loadBoms(customer.id);
  };

  const handleCustomerInputChange = (value: string) => {
    setCustomerInput(value);
    setCustomerDropdownOpen(true);
    if (customerId) {
      const current = customers.find((c) => c.id === customerId);
      if (current && value !== `${current.code} — ${current.company_name}`) {
        setCustomerId("");
        setBomId("");
        setBomInput("");
        setBoms([]);
      }
    }
  };

  const clearCustomer = () => {
    setCustomerInput("");
    setCustomerId("");
    setCustomerDropdownOpen(false);
    setBomId("");
    setBomInput("");
    setBoms([]);
  };

  const filteredBoms = boms.filter((b) => {
    const q = bomInput.trim().toLowerCase();
    if (!q) return true;
    return bomLabel(b).toLowerCase().includes(q);
  });

  const handleBomSelect = (b: Bom) => {
    setBomInput(bomLabel(b));
    setBomDropdownOpen(false);
    setBomId(b.id);
  };

  const handleBomInputChange = (value: string) => {
    setBomInput(value);
    setBomDropdownOpen(true);
    if (bomId) {
      const current = boms.find((b) => b.id === bomId);
      if (current && value !== bomLabel(current)) {
        setBomId("");
      }
    }
  };

  const clearBom = () => {
    setBomInput("");
    setBomId("");
    setBomDropdownOpen(false);
  };

  const handleStartQuote = async () => {
    if (!bomId) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/quotes/wizard/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bom_id: bomId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(`Started ${data.quote_number}`);
      router.push(`/quotes/wizard/${data.quote_id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("Failed to start quote", { description: msg });
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Customer */}
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="text-base">1. Select Customer</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative" ref={customerWrapperRef}>
            <Input
              placeholder="Type customer code or company name..."
              value={customerInput}
              onChange={(e) => handleCustomerInputChange(e.target.value)}
              onFocus={() => setCustomerDropdownOpen(true)}
              autoComplete="off"
              className={customerId ? "pr-8" : undefined}
            />
            {customerInput && (
              <button
                type="button"
                onClick={clearCustomer}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                aria-label="Clear customer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {customerDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                <div className="max-h-60 overflow-y-auto p-1">
                  {filteredCustomers.length > 0 ? (
                    filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors",
                          customerId === c.id && "bg-muted"
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleCustomerSelect(c);
                        }}
                      >
                        <Check className={cn("h-3.5 w-3.5 shrink-0", customerId === c.id ? "opacity-100" : "opacity-0")} />
                        <span className="font-mono font-medium">{c.code}</span>
                        <span className="text-muted-foreground truncate">— {c.company_name}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                      No customers match <span className="font-medium">&quot;{customerInput.trim()}&quot;</span>.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: BOM */}
      {customerId && (
        <Card className="overflow-visible">
          <CardHeader>
            <CardTitle className="text-base">2. Select Parsed BOM</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingBoms ? (
              <p className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading BOMs...
              </p>
            ) : boms.length === 0 ? (
              <p className="text-sm text-gray-500">
                No parsed BOMs found for this customer. Upload and parse a BOM first.
              </p>
            ) : (
              <div className="relative" ref={bomWrapperRef}>
                <Input
                  placeholder="Type GMP or filename to search..."
                  value={bomInput}
                  onChange={(e) => handleBomInputChange(e.target.value)}
                  onFocus={() => setBomDropdownOpen(true)}
                  autoComplete="off"
                  className={bomId ? "pr-8" : undefined}
                />
                {bomInput && (
                  <button
                    type="button"
                    onClick={clearBom}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    aria-label="Clear BOM"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {bomDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                    <div className="max-h-60 overflow-y-auto p-1">
                      {filteredBoms.length > 0 ? (
                        filteredBoms.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left hover:bg-muted transition-colors",
                              bomId === b.id && "bg-muted"
                            )}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleBomSelect(b);
                            }}
                          >
                            <Check className={cn("h-3.5 w-3.5 shrink-0", bomId === b.id ? "opacity-100" : "opacity-0")} />
                            <span className="font-mono font-medium">{b.gmps?.gmp_number ?? "Unknown GMP"}</span>
                            <span className="text-muted-foreground truncate">— {b.file_name} (rev {b.revision})</span>
                          </button>
                        ))
                      ) : (
                        <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                          No BOMs match <span className="font-medium">&quot;{bomInput.trim()}&quot;</span>.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Start Quote */}
      {bomId && (
        <Button
          onClick={handleStartQuote}
          disabled={starting}
          className="w-full gap-1.5"
          size="lg"
        >
          {starting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Start Quote
            </>
          )}
        </Button>
      )}
    </div>
  );
}
