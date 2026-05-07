// ----------------------------------------------------------------------------
// lib/suppliers/types.ts — shared types for the Approved Suppliers feature.
// ----------------------------------------------------------------------------

export type SupplierCategory =
  | "distributor"
  | "pcb_fab"
  | "stencil"
  | "mechanical"
  | "assembly"
  | "other";

export type SupplierCurrency = "CAD" | "USD" | "EUR" | "CNY";

export const SUPPLIER_CATEGORIES: SupplierCategory[] = [
  "distributor",
  "pcb_fab",
  "stencil",
  "mechanical",
  "assembly",
  "other",
];

export const SUPPLIER_CURRENCIES: SupplierCurrency[] = ["CAD", "USD", "EUR", "CNY"];

export const SUPPLIER_CODE_REGEX = /^[A-Z0-9]{2,15}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SupplierAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
}

export interface Supplier {
  id: string;
  code: string;
  legal_name: string;
  category: SupplierCategory | null;
  default_currency: SupplierCurrency;
  /**
   * Multiple terms allowed — a supplier may accept several payment methods
   * (e.g. ["Credit Card", "Net 30"]). Stored as TEXT[] in Postgres after
   * migration 078.
   */
  payment_terms: string[] | null;
  billing_address: SupplierAddress;
  is_approved: boolean;
  /**
   * True for distributors RS buys directly from on the website
   * (DigiKey, Mouser, LCSC). Excluded from the supplier-quote / PO flow.
   */
  online_only: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierContact {
  id: string;
  supplier_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// Supplier Quote types
// ----------------------------------------------------------------------------

export type SupplierQuoteStatus =
  | "draft"
  | "requested"
  | "received"
  | "accepted"
  | "rejected"
  | "expired";

export const SUPPLIER_QUOTE_STATUSES: SupplierQuoteStatus[] = [
  "draft",
  "requested",
  "received",
  "accepted",
  "rejected",
  "expired",
];

export interface SupplierQuoteLineInput {
  procurement_line_id: string;
  qty: number;
  unit_price: number;
  notes?: string | null;
}

export interface SupplierQuoteLine {
  id: string;
  supplier_quote_id: string;
  procurement_line_id: string;
  qty: number;
  unit_price: number;
  line_total: number;
  notes: string | null;
  created_at: string;
}

export interface SupplierQuote {
  id: string;
  procurement_id: string;
  supplier_id: string;
  supplier_contact_id: string | null;
  currency: SupplierCurrency;
  status: SupplierQuoteStatus;
  subtotal: number | null;
  shipping: number | null;
  tax: number | null;
  total: number | null;
  valid_until: string | null;
  notes: string | null;
  requested_at: string | null;
  received_at: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
  resulting_po_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/** Pretty label for a category enum value. */
export function categoryLabel(c: SupplierCategory | null | undefined): string {
  if (!c) return "—";
  switch (c) {
    case "distributor":
      return "Distributor";
    case "pcb_fab":
      return "PCB Fab";
    case "stencil":
      return "Stencil";
    case "mechanical":
      return "Mechanical";
    case "assembly":
      return "Assembly";
    case "other":
      return "Other";
  }
}
