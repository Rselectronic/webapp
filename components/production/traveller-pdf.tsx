import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";

export interface TravellerPDFProps {
  jobNumber: string;
  customerName: string;
  customerCode: string;
  gmpNumber: string;
  boardName?: string | null;
  quantity: number;
  assemblyType: string;
}

/**
 * Production process steps matching the production_events.event_type enum,
 * in the order they occur on the production floor.
 */
const PROCESS_STEPS: { key: string; label: string }[] = [
  { key: "materials_received", label: "Materials Received" },
  { key: "setup_started", label: "Setup Started" },
  { key: "smt_top_start", label: "SMT Top — Start" },
  { key: "smt_top_end", label: "SMT Top — End" },
  { key: "smt_bottom_start", label: "SMT Bottom — Start" },
  { key: "smt_bottom_end", label: "SMT Bottom — End" },
  { key: "reflow_start", label: "Reflow — Start" },
  { key: "reflow_end", label: "Reflow — End" },
  { key: "aoi_start", label: "AOI — Start" },
  { key: "aoi_passed", label: "AOI — Passed" },
  { key: "aoi_failed", label: "AOI — Failed" },
  { key: "through_hole_start", label: "Through-Hole — Start" },
  { key: "through_hole_end", label: "Through-Hole — End" },
  { key: "touchup", label: "Touchup" },
  { key: "washing", label: "Washing" },
  { key: "packing", label: "Packing" },
  { key: "ready_to_ship", label: "Ready to Ship" },
];

const COL_WIDTHS = {
  step: "30%",
  operator: "18%",
  dateTime: "20%",
  notes: "20%",
  signoff: "12%",
} as const;

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
    marginBottom: 20,
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
  docSubtitle: {
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
  /* Job summary strip */
  summaryRow: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 16,
    borderRadius: 4,
  },
  summaryItem: {
    marginRight: 24,
  },
  summaryLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 10,
    color: "#0f172a",
    marginTop: 1,
  },
  /* Table */
  table: {
    marginTop: 4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tableHeaderCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#ffffff",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    minHeight: 32,
  },
  tableRowAlt: {
    backgroundColor: "#f8fafc",
  },
  tableCell: {
    fontSize: 9,
    color: "#334155",
  },
  tableCellBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#0f172a",
  },
  /* Checkbox square */
  checkbox: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 1,
    marginLeft: 8,
  },
  /* Footer */
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

export function TravellerPDF({
  jobNumber,
  customerName,
  customerCode,
  gmpNumber,
  boardName,
  quantity,
  assemblyType,
}: TravellerPDFProps) {
  const today = new Date().toLocaleDateString("en-CA");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>R.S. ÉLECTRONIQUE INC.</Text>
            <Text style={styles.companyDetail}>
              5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9
            </Text>
          </View>
          <View>
            <Text style={styles.docTitle}>PRODUCTION TRAVELLER</Text>
            <Text style={styles.docSubtitle}>{jobNumber}</Text>
            <Text style={styles.docDate}>Printed: {today}</Text>
          </View>
        </View>

        {/* Job Summary Strip */}
        <View style={styles.summaryRow}>
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
            <Text style={styles.summaryLabel}>Type</Text>
            <Text style={styles.summaryValue}>{assemblyType}</Text>
          </View>
        </View>

        {/* Process Steps Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text
              style={[
                styles.tableHeaderCell,
                { width: COL_WIDTHS.step as unknown as number },
              ]}
            >
              Process Step
            </Text>
            <Text
              style={[
                styles.tableHeaderCell,
                { width: COL_WIDTHS.operator as unknown as number },
              ]}
            >
              Operator
            </Text>
            <Text
              style={[
                styles.tableHeaderCell,
                { width: COL_WIDTHS.dateTime as unknown as number },
              ]}
            >
              Date / Time
            </Text>
            <Text
              style={[
                styles.tableHeaderCell,
                { width: COL_WIDTHS.notes as unknown as number },
              ]}
            >
              Notes
            </Text>
            <Text
              style={[
                styles.tableHeaderCell,
                {
                  width: COL_WIDTHS.signoff as unknown as number,
                  textAlign: "center",
                },
              ]}
            >
              Sign-off
            </Text>
          </View>

          {PROCESS_STEPS.map((step, i) => (
            <View
              key={step.key}
              style={[
                styles.tableRow,
                i % 2 === 1 ? styles.tableRowAlt : {},
              ]}
            >
              <Text
                style={[
                  styles.tableCellBold,
                  { width: COL_WIDTHS.step as unknown as number },
                ]}
              >
                {step.label}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  { width: COL_WIDTHS.operator as unknown as number },
                ]}
              >
                {""}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  { width: COL_WIDTHS.dateTime as unknown as number },
                ]}
              >
                {""}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  { width: COL_WIDTHS.notes as unknown as number },
                ]}
              >
                {""}
              </Text>
              <View
                style={{
                  width: COL_WIDTHS.signoff as unknown as number,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View style={styles.checkbox} />
              </View>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>R.S. Électronique Inc.</Text>
          <Text style={styles.footerText}>{jobNumber} — Production Traveller</Text>
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
