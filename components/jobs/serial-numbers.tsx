"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Hash, Loader2 } from "lucide-react";

interface SerialNumber {
  id: string;
  serial_number: string;
  board_number: number;
  status: "produced" | "inspected" | "shipped" | "returned";
  notes: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  produced: "bg-blue-100 text-blue-800",
  inspected: "bg-green-100 text-green-800",
  shipped: "bg-purple-100 text-purple-800",
  returned: "bg-red-100 text-red-800",
};

export function SerialNumbers({
  jobId,
  jobQuantity,
}: {
  jobId: string;
  jobQuantity: number;
}) {
  const [serials, setSerials] = useState<SerialNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSerials = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/serials`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch serials");
      setSerials(data.serials);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchSerials();
  }, [fetchSerials]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/serials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: jobQuantity }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate serials");
      setSerials(data.serials);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Loading serial numbers...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Hash className="h-4 w-4" />
            Serial Numbers
            {serials.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {serials.length}
              </Badge>
            )}
          </CardTitle>
          {serials.length === 0 && (
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Generate {jobQuantity} Serial Numbers
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="mb-4 text-sm text-red-600">{error}</p>
        )}
        {serials.length === 0 ? (
          <p className="text-sm text-gray-500">
            No serial numbers generated yet. Click the button above to generate
            serial numbers for all {jobQuantity} boards in this job.
          </p>
        ) : (
          <div className="max-h-96 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Serial Number</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serials.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs text-gray-500">
                      {s.board_number}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {s.serial_number}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[s.status] ?? "bg-gray-100 text-gray-800"}`}
                      >
                        {s.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {s.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
