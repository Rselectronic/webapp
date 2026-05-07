"use client";

// ----------------------------------------------------------------------------
// BulkPaymentButton
//
// Small client wrapper that holds the open-state for the bulk payment dialog
// so the server `Invoices` page can mount it without becoming a client
// component itself.
// ----------------------------------------------------------------------------

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BulkRecordPaymentDialog,
  type BulkOutstandingInvoice,
} from "@/components/payments/bulk-record-payment-dialog";

export function BulkPaymentButton({
  invoices,
}: {
  invoices: BulkOutstandingInvoice[];
}) {
  const [open, setOpen] = useState(false);
  const disabled = invoices.length === 0;

  return (
    <>
      <Button
        variant="default"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={
          disabled ? "No outstanding invoices to apply a payment to" : undefined
        }
      >
        <CreditCard className="mr-2 h-4 w-4" />
        Record Payment
      </Button>
      <BulkRecordPaymentDialog
        open={open}
        onOpenChange={setOpen}
        invoices={invoices}
      />
    </>
  );
}
