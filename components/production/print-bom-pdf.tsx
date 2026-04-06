import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";

export interface BomLine {
  lineNumber: number;
  quantity: number;
  referenceDesignator: string | null;
  cpc: string | null;
  description: string | null;
  mpn: string | null;
  manufacturer: string | null;
  mCode: string | null;
}

export interface PrintBomPDFProps {
  jobNumber: string;
  customerName: string;
  customerCode: string;
  gmpNumber: string;
  boardName?: string | null;
  quantity: number;
  bomFileName: string;
  bomRevision: string;
  lines: BomLine[];
}

const COL = {
  num: "4%",
  qty: "5%",
  refDes: "14%",
  cpc: "13%",
  desc: "22%",
  mpn: "16%",
  mfr: "14%",
  mCode: "8%",
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
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
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

export function PrintBomPDF({
  jobNumber,
  customerName,
  customerCode,
  gmpNumber,
  boardName,
  quantity,
  bomFileName,
  bomRevision,
  lines,
}: PrintBomPDFProps) {
  const today = new Date().toLocaleDateString("en-CA");

  // Sort by quantity DESC (PCB rows stay where they are in original sort)
  const sorted = [...lines].sort((a, b) => b.quantity - a.quantity);

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
            <Text style={styles.docTitle}>PRINT COPY BOM</Text>
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
            <Text style={styles.summaryLabel}>Qty</Text>
            <Text style={styles.summaryValue}>{quantity}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>BOM</Text>
            <Text style={styles.summaryValue}>
              {bomFileName} Rev {bomRevision}
            </Text>
          </View>
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
          <Text style={[styles.tableHeaderCell, { width: COL.qty as unknown as number, textAlign: "center" }]}>
            Qty
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL.refDes as unknown as number }]}>
            Ref Des
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL.cpc as unknown as number }]}>
            CPC
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL.desc as unknown as number }]}>
            Description
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL.mpn as unknown as number }]}>
            MPN
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL.mfr as unknown as number }]}>
            Manufacturer
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL.mCode as unknown as number, textAlign: "center" }]}>
            M-Code
          </Text>
        </View>

        {/* Data Rows */}
        {sorted.map((line, i) => (
          <View
            key={line.lineNumber}
            style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
            wrap={false}
          >
            <Text style={[styles.tableCell, { width: COL.num as unknown as number, textAlign: "center" }]}>
              {i + 1}
            </Text>
            <Text style={[styles.tableCellBold, { width: COL.qty as unknown as number, textAlign: "center" }]}>
              {line.quantity}
            </Text>
            <Text style={[styles.tableCell, { width: COL.refDes as unknown as number }]}>
              {line.referenceDesignator ?? ""}
            </Text>
            <Text style={[styles.tableCell, { width: COL.cpc as unknown as number }]}>
              {line.cpc ?? ""}
            </Text>
            <Text style={[styles.tableCell, { width: COL.desc as unknown as number }]}>
              {line.description ?? ""}
            </Text>
            <Text style={[styles.tableCell, { width: COL.mpn as unknown as number }]}>
              {line.mpn ?? ""}
            </Text>
            <Text style={[styles.tableCell, { width: COL.mfr as unknown as number }]}>
              {line.manufacturer ?? ""}
            </Text>
            <Text style={[styles.tableCellBold, { width: COL.mCode as unknown as number, textAlign: "center" }]}>
              {line.mCode ?? "—"}
            </Text>
          </View>
        ))}

        {/* Total Row */}
        <View style={styles.totalRow}>
          <Text style={styles.totalText}>
            Total: {lines.length} component lines
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>R.S. Électronique Inc.</Text>
          <Text style={styles.footerText}>{jobNumber} — Print Copy BOM</Text>
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
