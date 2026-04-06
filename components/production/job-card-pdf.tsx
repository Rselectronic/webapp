"use client";

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";

function fmtDate(iso?: string | null): string {
  if (!iso) return "Not set";
  return new Date(iso).toLocaleDateString("en-CA");
}

export interface JobCardPDFProps {
  jobNumber: string;
  customerName: string;
  customerCode: string;
  gmpNumber: string;
  boardName?: string | null;
  quantity: number;
  assemblyType: string;
  procBatchCode?: string | null;
  scheduledStart?: string | null;
  scheduledCompletion?: string | null;
  componentCount: number;
  poNumber?: string | null;
  quoteNumber?: string | null;
  notes?: string | null;
}

const ASSEMBLY_TYPE_LABELS: Record<string, string> = {
  TB: "Top + Bottom",
  TS: "Top-Side Only",
  CS: "Consignment",
  CB: "Customer Board",
  AS: "Assembly Only",
};

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
  /* Detail grid */
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
  },
  detailCell: {
    width: "50%",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  detailLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  detailValue: {
    fontSize: 12,
    color: "#0f172a",
  },
  detailValueLarge: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    color: "#0f172a",
  },
  /* Notes */
  notesBlock: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    padding: 14,
  },
  sectionLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#0f172a",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  notesText: {
    fontSize: 9,
    color: "#475569",
    lineHeight: 1.5,
  },
  /* Signature area */
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 40,
  },
  signatureBlock: {
    width: "45%",
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#94a3b8",
    marginTop: 40,
    marginBottom: 4,
  },
  signatureLabel: {
    fontSize: 8,
    color: "#64748b",
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

export function JobCardPDF({
  jobNumber,
  customerName,
  customerCode,
  gmpNumber,
  boardName,
  quantity,
  assemblyType,
  procBatchCode,
  scheduledStart,
  scheduledCompletion,
  componentCount,
  poNumber,
  quoteNumber,
  notes,
}: JobCardPDFProps) {
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
            <Text style={styles.companyDetail}>
              +1 (438) 833-8477 · info@rspcbassembly.com
            </Text>
          </View>
          <View>
            <Text style={styles.docTitle}>JOB CARD</Text>
            <Text style={styles.docSubtitle}>{jobNumber}</Text>
            <Text style={styles.docDate}>Printed: {today}</Text>
          </View>
        </View>

        {/* Detail Grid */}
        <View style={styles.detailGrid}>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>Customer</Text>
            <Text style={styles.detailValue}>
              {customerCode} — {customerName}
            </Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>Quantity</Text>
            <Text style={styles.detailValueLarge}>{quantity}</Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>GMP / Board</Text>
            <Text style={styles.detailValue}>
              {gmpNumber}
              {boardName ? ` (${boardName})` : ""}
            </Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>Assembly Type</Text>
            <Text style={styles.detailValue}>
              {assemblyType} — {ASSEMBLY_TYPE_LABELS[assemblyType] ?? assemblyType}
            </Text>
          </View>
          {procBatchCode ? (
            <View style={styles.detailCell}>
              <Text style={styles.detailLabel}>PROC Batch Code</Text>
              <Text style={styles.detailValue}>{procBatchCode}</Text>
            </View>
          ) : null}
          {poNumber ? (
            <View style={styles.detailCell}>
              <Text style={styles.detailLabel}>Customer PO</Text>
              <Text style={styles.detailValue}>{poNumber}</Text>
            </View>
          ) : null}
          {quoteNumber ? (
            <View style={styles.detailCell}>
              <Text style={styles.detailLabel}>Quote Reference</Text>
              <Text style={styles.detailValue}>{quoteNumber}</Text>
            </View>
          ) : null}
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>Component Count</Text>
            <Text style={styles.detailValueLarge}>{componentCount}</Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>Scheduled Start</Text>
            <Text style={styles.detailValue}>{fmtDate(scheduledStart)}</Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>Scheduled Completion</Text>
            <Text style={styles.detailValue}>{fmtDate(scheduledCompletion)}</Text>
          </View>
        </View>

        {/* Notes */}
        {notes ? (
          <View style={styles.notesBlock}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        ) : null}

        {/* Signature Area */}
        <View style={styles.signatureRow}>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Released By (Signature / Date)</Text>
          </View>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Received By (Operator / Date)</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>R.S. Électronique Inc.</Text>
          <Text style={styles.footerText}>{jobNumber} — Job Card</Text>
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
