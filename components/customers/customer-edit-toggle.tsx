"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { CustomerEditForm } from "./customer-edit-form";

interface Contact {
  name: string;
  email: string;
  phone: string;
  role: string;
  is_primary: boolean;
}

interface Address {
  label: string;
  street: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  is_default: boolean;
}

interface CustomerEditToggleProps {
  customerId: string;
  customerData: {
    company_name: string;
    code: string;
    payment_terms: string;
    notes: string | null;
    is_active: boolean;
    contacts: Contact[];
    billing_addresses: Address[];
    shipping_addresses: Address[];
    bom_config: Record<string, unknown> | null;
    folder_name?: string | null;
    default_currency?: "CAD" | "USD" | null;
    tax_region?:
      | "QC"
      | "CA_OTHER"
      | "HST_ON"
      | "HST_15"
      | "INTERNATIONAL"
      | null;
  };
  paymentTermsOptions?: string[];
  children: React.ReactNode;
}

export function CustomerEditToggle({ customerId, customerData, paymentTermsOptions, children }: CustomerEditToggleProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <CustomerEditForm
        customerId={customerId}
        initialData={customerData}
        paymentTermsOptions={paymentTermsOptions}
        onClose={() => setEditing(false)}
      />
    );
  }

  return (
    <>
      <div className="flex justify-end -mt-2 mb-4">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit Customer
        </Button>
      </div>
      {children}
    </>
  );
}
