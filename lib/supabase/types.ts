export type UserRole = "admin" | "production";

export type JobStatus =
  | "created"
  | "procurement"
  | "parts_ordered"
  | "parts_received"
  | "production"
  | "inspection"
  | "shipping"
  | "delivered"
  | "invoiced"
  | "archived";

export type QuoteStatus =
  | "draft"
  | "review"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired";

export type BomStatus = "uploaded" | "parsing" | "parsed" | "error";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "cancelled";

export interface Customer {
  id: string;
  code: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  billing_address: Record<string, string>;
  shipping_address: Record<string, string>;
  payment_terms: string;
  bom_config: Record<string, unknown>;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Database type for Supabase client generic
export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserProfile;
        Insert: Omit<UserProfile, "created_at" | "updated_at">;
        Update: Partial<Omit<UserProfile, "id" | "created_at">>;
      };
      customers: {
        Row: Customer;
        Insert: Omit<Customer, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Customer, "id" | "created_at">>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
