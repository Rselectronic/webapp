import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";

function fmtDate(iso?: string | null): string {
  if (!iso) return new Date().toLocaleDateString("en-CA");
  return new Date(iso).toLocaleDateString("en-CA");
}

export interface PackingSlipItem {
  gmpNumber: string;
  boardName?: string | null;
  quantity: number;
  description?: string | null;
}

export interface PackingSlipPDFProps {
  jobNumber: string;
  procBatchCode?: string | null;
  customerName: string;
  contactName?: string | null;
  shipToAddress?: string | null;
  courierName?: string | null;
  trackingId?: string | null;
  shipDate?: string | null;
  items: PackingSlipItem[];
  notes?: string | null;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    color: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
    borderBottomWidth: 2,
    borderBottomColor: "#0f172a",
    paddingBottom: 12,
  },
  companyName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
    marginBottom: 2,
  },
  companyDetail: {
    fontSize: 8,
    color: "#475569",
    lineHeight: 1.5,
  },
  docTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    color: "#0f172a",
    textAlign: "right",
  },
  docNumber: {
    fontSize: 10,
    textAlign: "right",
    marginTop: 2,
  },
  docDate: {
    fontSize: 9,
    textAlign: "right",
    color: "#475569",
    marginTop: 2,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  infoBlock: {
    width: "48%",
  },
  sectionLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#0f172a",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoText: {
    fontSize: 9,
    lineHeight: 1.6,
    color: "#334155",
  },
  table: {
    marginTop: 12,
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableHeaderCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#ffffff",
    textAlign: "right",
  },
  tableHeaderLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#ffffff",
    textAlign: "left",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  tableRowAlt: {
    backgroundColor: "#f8fafc",
  },
  tableCell: {
    fontSize: 9,
    textAlign: "right",
    color: "#334155",
  },
  tableCellLabel: {
    fontSize: 9,
    textAlign: "left",
    color: "#334155",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1.5,
    borderTopColor: "#0f172a",
    marginTop: 4,
  },
  totalLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: "#0f172a",
    width: 140,
    textAlign: "right",
    paddingRight: 12,
  },
  totalValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: "#0f172a",
    width: 100,
    textAlign: "right",
  },
  notesBlock: {
    marginTop: 16,
    marginBottom: 12,
  },
  notesText: {
    fontSize: 9,
    color: "#475569",
    lineHeight: 1.5,
  },
  signatureBlock: {
    marginTop: 30,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureLine: {
    width: "40%",
    borderTopWidth: 1,
    borderTopColor: "#94a3b8",
    paddingTop: 4,
  },
  signatureLabel: {
    fontSize: 8,
    color: "#64748b",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: "#94a3b8",
  },
});

const COL_ITEM = "8%";
const COL_GMP = "30%";
const COL_DESC = "40%";
const COL_QTY = "22%";

export function PackingSlipPDF({
  jobNumber,
  procBatchCode,
  customerName,
  contactName,
  shipToAddress,
  courierName,
  trackingId,
  shipDate,
  items,
  notes,
}: PackingSlipPDFProps) {
  const dateStr = fmtDate(shipDate);
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>R.S. ELECTRONIQUE INC.</Text>
            <Text style={styles.companyDetail}>
              5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9
            </Text>
            <Text style={styles.companyDetail}>
              +1 (438) 833-8477 · info@rspcbassembly.com
            </Text>
            <Text style={styles.companyDetail}>www.rspcbassembly.com</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>PACKING SLIP</Text>
            <Text style={styles.docNumber}>{jobNumber}</Text>
            <Text style={styles.docDate}>{dateStr}</Text>
          </View>
        </View>

        {/* Ship To + Shipment Details */}
        <View style={styles.infoRow}>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionLabel}>Ship To</Text>
            <Text style={styles.infoText}>{customerName}</Text>
            {contactName ? (
              <Text style={styles.infoText}>Attn: {contactName}</Text>
            ) : null}
            {shipToAddress ? (
              <Text style={styles.infoText}>{shipToAddress}</Text>
            ) : null}
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionLabel}>Shipment Details</Text>
            <Text style={styles.infoText}>Job: {jobNumber}</Text>
            {procBatchCode ? (
              <Text style={styles.infoText}>Batch: {procBatchCode}</Text>
            ) : null}
            <Text style={styles.infoText}>Ship Date: {dateStr}</Text>
            {courierName ? (
              <Text style={styles.infoText}>Courier: {courierName}</Text>
            ) : null}
            {trackingId ? (
              <Text style={styles.infoText}>Tracking: {trackingId}</Text>
            ) : null}
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text
              style={[
                styles.tableHeaderCell,
                { width: COL_ITEM as unknown as number, textAlign: "center" },
              ]}
            >
              #
            </Text>
            <Text
              style={[
                styles.tableHeaderLabel,
                { width: COL_GMP as unknown as number },
              ]}
            >
              GMP / Board
            </Text>
            <Text
              style={[
                styles.tableHeaderLabel,
                { width: COL_DESC as unknown as number },
              ]}
            >
              Description
            </Text>
            <Text
              style={[
                styles.tableHeaderCell,
                { width: COL_QTY as unknown as number },
              ]}
            >
              Quantity
            </Text>
          </View>

          {items.map((item, idx) => (
            <View
              key={idx}
              style={[
                styles.tableRow,
                idx % 2 === 1 ? styles.tableRowAlt : {},
              ]}
            >
              <Text
                style={[
                  styles.tableCell,
                  {
                    width: COL_ITEM as unknown as number,
                    textAlign: "center",
                  },
                ]}
              >
                {idx + 1}
              </Text>
              <Text
                style={[
                  styles.tableCellLabel,
                  { width: COL_GMP as unknown as number },
                ]}
              >
                {item.gmpNumber}
                {item.boardName ? ` (${item.boardName})` : ""}
              </Text>
              <Text
                style={[
                  styles.tableCellLabel,
                  { width: COL_DESC as unknown as number },
                ]}
              >
                {item.description ?? "PCB Assembly"}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  { width: COL_QTY as unknown as number },
                ]}
              >
                {item.quantity}
              </Text>
            </View>
          ))}
        </View>

        {/* Total */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Boards</Text>
          <Text style={styles.totalValue}>{totalQty}</Text>
        </View>

        {/* Notes */}
        {notes ? (
          <View style={styles.notesBlock}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        ) : null}

        {/* Signature Lines */}
        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine}>
            <Text style={styles.signatureLabel}>Packed By / Date</Text>
          </View>
          <View style={styles.signatureLine}>
            <Text style={styles.signatureLabel}>Received By / Date</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>R.S. Electronique Inc.</Text>
          <Text style={styles.footerText}>Packing Slip — {jobNumber}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
