"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface BlockingRecords {
  supplier_pos?: { id: string; po_number: string }[];
}

interface DeleteProcurementButtonProps {
  procurementId: string;
  procCode: string;
  /** Where to redirect after delete. Defaults to /procurement */
  redirectTo?: string;
}

export function DeleteProcurementButton({
  procurementId,
  procCode,
  redirectTo = "/procurement",
}: DeleteProcurementButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<BlockingRecords | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    setBlocking(null);

    try {
      const res = await fetch(`/api/procurements/${procurementId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Delete failed (${res.status})`);
        if (data.blocking) setBlocking(data.blocking);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Network error — could not delete procurement.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 transition-colors">
        <Trash2 className="h-4 w-4" />
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Procurement?</AlertDialogTitle>
          <AlertDialogDescription>
              This will permanently delete procurement <strong>{procCode}</strong> and all its lines.
              This cannot be undone.
              {error && (
                <span className="mt-2 block text-sm font-medium text-red-600">{error}</span>
              )}
          </AlertDialogDescription>
          {blocking && (blocking.supplier_pos?.length ?? 0) > 0 && (
            <div className="mt-2 text-sm">
              <p>
                <strong>Supplier POs:</strong>{" "}
                {blocking.supplier_pos!.map((po, i) => (
                  <span key={po.id}>
                    {i > 0 && ", "}
                    <Link href={`/procurement/${procurementId}#po-${po.id}`} className="text-blue-600 underline hover:text-blue-800">
                      {po.po_number}
                    </Link>
                  </span>
                ))}
              </p>
            </div>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>
            ) : (
              "Delete"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
