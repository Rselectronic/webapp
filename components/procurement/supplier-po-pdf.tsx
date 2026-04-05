"use client";

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";

function fmt(n: number): string {
  return "$" + n.toFixed(2);
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-CA");
}

export interface POLine {
  mpn: string;
  description: string | null;
  qty: number;
  unit_price: number;
  line_total: number;
}

export interface SupplierPOPDFProps {
  poNumber: string;
  supplierName: string;
  supplierEmail?: string | null;
  procCode?: string | null;
  jobNumber?: string | null;
  customerName?: string | null;
  lines: POLine[];
  totalAmount: number;
  createdAt?: string | null;
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
  poTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    color: "#0f172a",
    textAlign: "right",
  },
  poNumber: {
    fontSize: 10,
    textAlign: "right",
    marginTop: 2,
  },
  poDate: {
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
    paddingVertical: 5,
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
    fontSize: 11,
    color: "#0f172a",
    width: 140,
    textAlign: "right",
    paddingRight: 12,
  },
  totalValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
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
  termsBlock: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
  },
  termsText: {
    fontSize: 8,
    color: "#64748b",
    lineHeight: 1.5,
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

const COL_MPN = "25%";
const COL_DESC = "33%";
const COL_QTY = "12%";
const COL_PRICE = "15%";
const COL_TOTAL = "15%";

export function SupplierPOPDF({
  poNumber,
  supplierName,
  supplierEmail,
  procCode,
  jobNumber,
  customerName,
  lines,
  totalAmount,
  createdAt,
  notes,
}: SupplierPOPDFProps) {
  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString("en-CA")
    : new Date().toLocaleDateString("en-CA");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>R.S. \u00c9LECTRONIQUE INC.</Text>
            <Text style={styles.companyDetail}>
              5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9
            </Text>
            <Text style={styles.companyDetail}>
              +1 (438) 833-8477 \u00b7 info@rspcbassembly.com
            </Text>
          </View>
          <View>
            <Text style={styles.poTitle}>PURCHASE ORDER</Text>
            <Text style={styles.poNumber}>{poNumber}</Text>
            <Text style={styles.poDate}>{dateStr}</Text>
          </View>
        </View>

        {/* Supplier + Order Details */}
        <View style={styles.infoRow}>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionLabel}>Supplier</Text>
            <Text style={styles.infoText}>{supplierName}</Text>
            {supplierEmail ? (
              <Text style={styles.infoText}>{supplierEmail}</Text>
            ) : null}
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionLabel}>Order Details</Text>
            {procCode ? (
              <Text style={styles.infoText}>PROC: {procCode}</Text>
            ) : null}
            {jobNumber ? (
              <Text style={styles.infoText}>Job: {jobNumber}</Text>
            ) : null}
            {customerName ? (
              <Text style={styles.infoText}>Customer: {customerName}</Text>
            ) : null}
            <Text style={styles.infoText}>
              Lines: {lines.length}
            </Text>
          </View>
        </View>

        {/* Lines Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text
              style={[
                styles.tableHeaderLabel,
                { width: COL_MPN as unknown as number },
              ]}
            >
              MPN
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
              Qty
            </Text>
            <Text
              style={[
                styles.tableHeaderCell,
                { width: COL_PRICE as unknown as number },
              ]}
            >
              Unit Price
            </Text>
            <Text
              style={[
                styles.tableHeaderCell,
                { width: COL_TOTAL as unknown as number },
              ]}
            >
              Total
            </Text>
          </View>

          {lines.map((line, idx) => (
            <View
              key={idx}
              style={[
                styles.tableRow,
                idx % 2 === 1 ? styles.tableRowAlt : {},
              ]}
            >
              <Text
                style={[
                  styles.tableCellLabel,
                  { width: COL_MPN as unknown as number },
                ]}
              >
                {line.mpn || "\u2014"}
              </Text>
              <Text
                style={[
                  styles.tableCellLabel,
                  { width: COL_DESC as unknown as number },
                ]}
              >
                {line.description ?? "\u2014"}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  { width: COL_QTY as unknown as number },
                ]}
              >
                {line.qty}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  { width: COL_PRICE as unknown as number },
                ]}
              >
                {fmt(line.unit_price)}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  { width: COL_TOTAL as unknown as number },
                ]}
              >
                {fmt(line.line_total)}
              </Text>
            </View>
          ))}
        </View>

        {/* Grand Total */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Grand Total (CAD)</Text>
          <Text style={styles.totalValue}>{fmt(totalAmount)}</Text>
        </View>

        {/* Notes */}
        {notes ? (
          <View style={styles.notesBlock}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        ) : null}

        {/* Terms */}
        <View style={styles.termsBlock}>
          <Text style={styles.termsText}>
            Please confirm receipt of this purchase order and provide expected
            ship date. All shipments should reference PO number {poNumber}.
            Ship to: R.S. \u00c9lectronique Inc., 5580 Vanden Abeele,
            Saint-Laurent, QC H4S 1P9, Canada. All amounts are in Canadian
            Dollars (CAD).
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>R.S. \u00c9lectronique Inc.</Text>
          <Text style={styles.footerText}>{poNumber}</Text>
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
