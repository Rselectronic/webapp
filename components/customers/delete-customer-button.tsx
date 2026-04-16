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
  quotes?: { id: string; quote_number: string }[];
  jobs?: { id: string; job_number: string }[];
  boms?: { id: string; file_name: string }[];
}

interface DeleteCustomerButtonProps {
  customerId: string;
  customerName: string;
}

export function DeleteCustomerButton({
  customerId,
  customerName,
}: DeleteCustomerButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<BlockingRecords | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    setBlocking(null);

    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Delete failed (${res.status})`);
        if (data.blocking) setBlocking(data.blocking);
        return;
      }
      router.push("/customers");
      router.refresh();
    } catch {
      setError("Network error — could not deactivate customer.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 transition-colors"
      >
        <Trash2 className="h-4 w-4" />
        Delete Customer
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate Customer?</AlertDialogTitle>
          <AlertDialogDescription>
              This will deactivate <strong>{customerName}</strong>. Their data will
              be preserved but they won&apos;t appear in active lists.
              {error && (
                <span className="mt-2 block text-sm font-medium text-red-600">
                  {error}
                </span>
              )}
          </AlertDialogDescription>
          {blocking && (
            <div className="mt-2 text-sm">
              {(blocking.quotes?.length ?? 0) > 0 && (
                <p>
                  <strong>Quotes:</strong>{" "}
                  {blocking.quotes!.map((q, i) => (
                    <span key={q.id}>
                      {i > 0 && ", "}
                      <Link href={`/quotes/${q.id}`} className="text-blue-600 underline hover:text-blue-800">
                        {q.quote_number}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
              {(blocking.jobs?.length ?? 0) > 0 && (
                <p>
                  <strong>Jobs:</strong>{" "}
                  {blocking.jobs!.map((j, i) => (
                    <span key={j.id}>
                      {i > 0 && ", "}
                      <Link href={`/jobs/${j.id}`} className="text-blue-600 underline hover:text-blue-800">
                        {j.job_number}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
              {(blocking.boms?.length ?? 0) > 0 && (
                <p>
                  <strong>BOMs:</strong>{" "}
                  {blocking.boms!.map((b, i) => (
                    <span key={b.id}>
                      {i > 0 && ", "}
                      <Link href={`/bom/${b.id}`} className="text-blue-600 underline hover:text-blue-800">
                        {b.file_name}
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
                Deactivating...
              </>
            ) : (
              "Deactivate"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
