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

interface BlockingJob {
  id: string;
  job_number: string;
}

interface BlockingInfo {
  jobs?: BlockingJob[];
}

interface DeleteQuoteButtonProps {
  quoteId: string;
  quoteName: string;
  /** Where to redirect after delete. Defaults to /quotes */
  redirectTo?: string;
}

export function DeleteQuoteButton({ quoteId, quoteName, redirectTo = "/quotes" }: DeleteQuoteButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<BlockingInfo | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    setBlocking(null);

    try {
      const res = await fetch(`/api/quotes/${quoteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data.blocking) {
          setBlocking(data.blocking);
        }
        setError(data.error ?? `Delete failed (${res.status})`);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Network error — could not delete quote.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 transition-colors">
        <Trash2 className="h-4 w-4" />
        Delete Quote
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Quote?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete <strong>{quoteName}</strong> and its generated PDF.
            This cannot be undone.
            {error && !blocking && (
              <span className="mt-2 block text-sm font-medium text-red-600">{error}</span>
            )}
          </AlertDialogDescription>
          {blocking && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-medium">Cannot delete — this quote is referenced by:</p>
              <ul className="mt-1.5 list-disc pl-5 space-y-0.5">
                {blocking.jobs?.map((j) => (
                  <li key={j.id}>
                    <Link
                      href={`/jobs/${j.id}`}
                      className="font-medium text-blue-600 underline hover:text-blue-800"
                    >
                      {j.job_number}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs">Delete these first, then try again.</p>
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
