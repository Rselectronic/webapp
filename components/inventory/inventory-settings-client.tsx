"use client";

// ----------------------------------------------------------------------------
// components/inventory/inventory-settings-client.tsx
// Wraps the inventory list on the Settings → Inventory page. Adds the "Add
// part" and "Import" buttons that live above the table, and owns the part
// list state so newly-created rows show up inline (no full-page refetch).
// ----------------------------------------------------------------------------

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Upload } from "lucide-react";
import { InventoryListClient } from "./inventory-list-client";
import { AddInventoryPartDialog } from "./add-inventory-part-dialog";
// Owned by the importer agent. Imports the dialog used for bulk upload of
// BG / Safety parts.
import { ImportInventoryDialog } from "@/components/inventory/import-inventory-dialog";
import type { InventoryPartStock } from "@/lib/inventory/types";

interface Props {
  initialParts: InventoryPartStock[];
}

export function InventorySettingsClient({ initialParts }: Props) {
  const router = useRouter();
  const [parts, setParts] = useState<InventoryPartStock[]>(initialParts);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <InventoryListClient
        initialParts={parts}
        embedded
        setParts={setParts}
        rightSlot={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1 h-4 w-4" />
              Import
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Add part
            </Button>
          </>
        }
      />

      {addOpen && (
        <AddInventoryPartDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onCreated={(p) => setParts((prev) => [p, ...prev])}
        />
      )}

      {importOpen && (
        <ImportInventoryDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          // The importer dialog signals completion with no payload — bulk
          // imports may insert hundreds of rows, so a router refresh is the
          // pragmatic call here. Single-row Add stays purely inline.
          onImported={() => router.refresh()}
        />
      )}
    </>
  );
}
