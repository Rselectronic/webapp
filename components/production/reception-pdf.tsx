import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";

export interface ReceptionLine {
  lineNumber: number;
  mpn: string | null;
  description: string | null;
  manufacturer: string | null;
  mCode: string | null;
  qtyNeeded: number;
  qtyExtra: number;
  totalExpected: number;
}

export interface ReceptionPDFProps {
  jobNumber: string;
  customerName: string;
  customerCode: string;
  gmpNumber: string;
  boardName?: string | null;
  quantity: number;
  procBatchCode?: string | null;
  lines: ReceptionLine[];
}

const COL = {
  num: "4%",
  mpn: "18%",
  desc: "22%",
  mfr: "12%",
  mCode: "7%",
  expected: "8%",
  received: "8%",
  ok: "7%",
  notes: "14%",
} as const;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 7,
    paddingTop: 36,
    paddingBottom: 50,
    paddingHorizontal: 30,
    color: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: "#0f172a",
    paddingBottom: 8,
  },
  companyName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    marginBottom: 2,
  },
  companyDetail: {
    fontSize: 7,
    color: "#475569",
    lineHeight: 1.4,
  },
  docTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
    color: "#0f172a",
    textAlign: "right",
  },
  docSubtitle: {
    fontSize: 9,
    textAlign: "right",
    marginTop: 2,
  },
  docDate: {
    fontSize: 8,
    textAlign: "right",
    color: "#475569",
    marginTop: 2,
  },
  /* Summary strip */
  summaryRow: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 10,
    borderRadius: 3,
  },
  summaryItem: {
    marginRight: 20,
  },
  summaryLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  summaryValue: {
    fontSize: 8,
    color: "#0f172a",
    marginTop: 1,
  },
  /* Table */
  table: {
    marginTop: 2,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableHeaderCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    color: "#ffffff",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    minHeight: 22,
  },
  tableRowAlt: {
    backgroundColor: "#f8fafc",
  },
  tableCell: {
    fontSize: 7,
    color: "#334155",
  },
  tableCellBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: "#0f172a",
  },
  /* Checkbox */
  checkbox: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 1,
  },
  /* Totals */
  totalRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: "#94a3b8",
    marginTop: 2,
  },
  totalText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#0f172a",
  },
  /* Signature area */
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
  },
  signatureBlock: {
    width: "45%",
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#94a3b8",
    marginTop: 30,
    marginBottom: 4,
  },
  signatureLabel: {
    fontSize: 7,
    color: "#64748b",
  },
  /* Footer */
  footer: {
    position: "absolute",
    bottom: 20,
    left: 30,
    right: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 5,
  },
  footerText: {
    fontSize: 6,
    color: "#94a3b8",
  },
});

export function ReceptionPDF({
  jobNumber,
  customerName,
  customerCode,
  gmpNumber,
  boardName,
  quantity,
  procBatchCode,
  lines,
}: ReceptionPDFProps) {
  const today = new Date().toLocaleDateString("en-CA");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.companyName}>R.S. ÉLECTRONIQUE INC.</Text>
            <Text style={styles.companyDetail}>
              5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9
            </Text>
          </View>
          <View>
            <Text style={styles.docTitle}>RECEPTION FILE</Text>
            <Text style={styles.docSubtitle}>{jobNumber}</Text>
            <Text style={styles.docDate}>Printed: {today}</Text>
          </View>
        </View>

        {/* Summary Strip */}
        <View style={styles.summaryRow} fixed>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Customer</Text>
            <Text style={styles.summaryValue}>
              {customerCode} — {customerName}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>GMP</Text>
            <Text style={styles.summaryValue}>
              {gmpNumber}
              {boardName ? ` (${boardName})` : ""}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Board Qty</Text>
            <Text style={styles.summaryValue}>{quantity}</Text>
          </View>
          {procBatchCode ? (
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>PROC Batch</Text>
              <Text style={styles.summaryValue}>{procBatchCode}</Text>
            </View>
          ) : null}
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Lines</Text>
            <Text style={styles.summaryValue}>{lines.length}</Text>
          </View>
        </View>

        {/* Table Header */}
        <View style={styles.tableHeader} fixed>
          <Text style={[styles.tableHeaderCell, { width: COL.num as unknown as number, textAlign: "center" }]}>
            #
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL.mpn as unknown as number }]}>
            MPN
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL.desc as unknown as number }]}>
            Description
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL.mfr as unknown as number }]}>
            Manufacturer
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL.mCode as unknown as number, textAlign: "center" }]}>
            M-Code
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL.expected as unknown as number, textAlign: "center" }]}>
            Expected
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL.received as unknown as number, textAlign: "center" }]}>
            Received
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL.ok as unknown as number, textAlign: "center" }]}>
            OK
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL.notes as unknown as number }]}>
            Notes
          </Text>
        </View>

        {/* Data Rows */}
        {lines.map((line, i) => (
          <View
            key={line.lineNumber}
            style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
            wrap={false}
          >
            <Text style={[styles.tableCell, { width: COL.num as unknown as number, textAlign: "center" }]}>
              {i + 1}
            </Text>
            <Text style={[styles.tableCellBold, { width: COL.mpn as unknown as number }]}>
              {line.mpn ?? "—"}
            </Text>
            <Text style={[styles.tableCell, { width: COL.desc as unknown as number }]}>
              {line.description ?? ""}
            </Text>
            <Text style={[styles.tableCell, { width: COL.mfr as unknown as number }]}>
              {line.manufacturer ?? ""}
            </Text>
            <Text style={[styles.tableCell, { width: COL.mCode as unknown as number, textAlign: "center" }]}>
              {line.mCode ?? "—"}
            </Text>
            <Text style={[styles.tableCellBold, { width: COL.expected as unknown as number, textAlign: "center" }]}>
              {line.totalExpected}
            </Text>
            {/* Received qty — blank for manual fill */}
            <Text style={[styles.tableCell, { width: COL.received as unknown as number, textAlign: "center" }]}>
              {""}
            </Text>
            {/* OK checkbox */}
            <View
              style={{
                width: COL.ok as unknown as number,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View style={styles.checkbox} />
            </View>
            {/* Notes — blank for manual fill */}
            <Text style={[styles.tableCell, { width: COL.notes as unknown as number }]}>
              {""}
            </Text>
          </View>
        ))}

        {/* Total Row */}
        <View style={styles.totalRow}>
          <Text style={styles.totalText}>
            Total: {lines.length} component lines — {lines.reduce((s, l) => s + l.totalExpected, 0)} parts expected
          </Text>
        </View>

        {/* Signature Area */}
        <View style={styles.signatureRow}>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Received By (Signature / Date)</Text>
          </View>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Verified By (Signature / Date)</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>R.S. Électronique Inc.</Text>
          <Text style={styles.footerText}>{jobNumber} — Reception File</Text>
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
