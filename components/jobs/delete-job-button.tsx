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
  invoices?: { id: string; invoice_number: string }[];
  procurements?: { id: string; proc_code: string }[];
}

interface DeleteJobButtonProps {
  jobId: string;
  jobNumber: string;
}

export function DeleteJobButton({ jobId, jobNumber }: DeleteJobButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<BlockingRecords | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    setBlocking(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Delete failed (${res.status})`);
        if (data.blocking) setBlocking(data.blocking);
        return;
      }
      router.push("/jobs");
      router.refresh();
    } catch {
      setError("Network error — could not delete job.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 transition-colors">
        <Trash2 className="h-4 w-4" />
        Delete Job
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Job?</AlertDialogTitle>
          <AlertDialogDescription>
              This will permanently delete job <strong>{jobNumber}</strong> and all
              its status history, production events, and serial numbers. This
              cannot be undone.
              {error && (
                <span className="mt-2 block text-sm font-medium text-red-600">
                  {error}
                </span>
              )}
          </AlertDialogDescription>
          {blocking && (
            <div className="mt-2 text-sm">
              {(blocking.invoices?.length ?? 0) > 0 && (
                <p>
                  <strong>Invoices:</strong>{" "}
                  {blocking.invoices!.map((inv, i) => (
                    <span key={inv.id}>
                      {i > 0 && ", "}
                      <Link href={`/invoices/${inv.id}`} className="text-blue-600 underline hover:text-blue-800">
                        {inv.invoice_number}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
              {(blocking.procurements?.length ?? 0) > 0 && (
                <p>
                  <strong>Procurements:</strong>{" "}
                  {blocking.procurements!.map((proc, i) => (
                    <span key={proc.id}>
                      {i > 0 && ", "}
                      <Link href={`/procurement/${proc.id}`} className="text-blue-600 underline hover:text-blue-800">
                        {proc.proc_code}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
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
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
