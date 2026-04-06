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
  if (!iso) return new Date().toLocaleDateString("en-CA");
  return new Date(iso).toLocaleDateString("en-CA");
}

export interface InvoiceLineItem {
  job_number: string;
  gmp_number: string;
  board_name?: string | null;
  quantity: number;
  per_unit: number;
  subtotal: number;
}

export interface InvoicePDFProps {
  invoiceNumber: string;
  customerName: string;
  contactName?: string | null;
  jobNumber: string;
  gmpNumber: string;
  issuedDate: string;
  dueDate: string;
  subtotal: number;
  tpsGst: number;
  tvqQst: number;
  freight: number;
  discount: number;
  total: number;
  paymentTerms: string;
  notes?: string | null;
  /** For consolidated multi-job invoices */
  lineItems?: InvoiceLineItem[];
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
  /* -- Header -- */
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
  invoiceTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    color: "#0f172a",
    textAlign: "right",
  },
  invoiceNumber: {
    fontSize: 10,
    textAlign: "right",
    marginTop: 2,
  },
  invoiceDate: {
    fontSize: 9,
    textAlign: "right",
    color: "#475569",
    marginTop: 2,
  },
  /* -- Bill To + Details -- */
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
  /* -- Table -- */
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
  /* -- Summary rows -- */
  summaryRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  summaryLabel: {
    fontSize: 9,
    color: "#334155",
    width: 140,
    textAlign: "right",
    paddingRight: 12,
  },
  summaryValue: {
    fontSize: 9,
    color: "#334155",
    width: 100,
    textAlign: "right",
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
  /* -- Notes -- */
  notesBlock: {
    marginTop: 16,
    marginBottom: 12,
  },
  notesText: {
    fontSize: 9,
    color: "#475569",
    lineHeight: 1.5,
  },
  /* -- Payment terms -- */
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
  /* -- Footer -- */
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

export function InvoicePDF({
  invoiceNumber,
  customerName,
  contactName,
  jobNumber,
  gmpNumber,
  issuedDate,
  dueDate,
  subtotal,
  tpsGst,
  tvqQst,
  freight,
  discount,
  total,
  paymentTerms,
  notes,
  lineItems,
}: InvoicePDFProps) {
  const dateStr = fmtDate(issuedDate);
  const dueDateStr = fmtDate(dueDate);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* -- Header -- */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>R.S. ÉLECTRONIQUE INC.</Text>
            <Text style={styles.companyDetail}>
              5580 Vanden Abeele, Saint-Laurent, QC H4S 1P9
            </Text>
            <Text style={styles.companyDetail}>
              +1 (438) 833-8477 · info@rspcbassembly.com
            </Text>
            <Text style={styles.companyDetail}>
              GST: 840134829 · QST: 1214617001
            </Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{invoiceNumber}</Text>
            <Text style={styles.invoiceDate}>{dateStr}</Text>
          </View>
        </View>

        {/* -- Bill To + Invoice Details -- */}
        <View style={styles.infoRow}>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionLabel}>Bill To</Text>
            <Text style={styles.infoText}>{customerName}</Text>
            {contactName ? (
              <Text style={styles.infoText}>Attn: {contactName}</Text>
            ) : null}
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionLabel}>Invoice Details</Text>
            {lineItems && lineItems.length > 1 ? (
              <Text style={styles.infoText}>
                Jobs: {lineItems.map((li) => li.job_number).join(", ")}
              </Text>
            ) : (
              <>
                <Text style={styles.infoText}>Job: {jobNumber}</Text>
                <Text style={styles.infoText}>GMP: {gmpNumber}</Text>
              </>
            )}
            <Text style={styles.infoText}>Due Date: {dueDateStr}</Text>
            <Text style={styles.infoText}>Terms: {paymentTerms}</Text>
          </View>
        </View>

        {/* -- Line Items Table -- */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderLabel, { width: "45%" as unknown as number }]}>
              Description
            </Text>
            <Text style={[styles.tableHeaderCell, { width: "15%" as unknown as number }]}>
              Qty
            </Text>
            <Text style={[styles.tableHeaderCell, { width: "20%" as unknown as number }]}>
              Unit Price
            </Text>
            <Text style={[styles.tableHeaderCell, { width: "20%" as unknown as number }]}>
              Amount
            </Text>
          </View>
          {lineItems && lineItems.length > 1 ? (
            lineItems.map((item, idx) => (
              <View key={idx} style={styles.tableRow}>
                <Text style={[styles.tableCellLabel, { width: "45%" as unknown as number }]}>
                  PCB Assembly — Job {item.job_number} (GMP: {item.gmp_number})
                  {item.board_name ? ` — ${item.board_name}` : ""}
                </Text>
                <Text style={[styles.tableCell, { width: "15%" as unknown as number }]}>
                  {item.quantity}
                </Text>
                <Text style={[styles.tableCell, { width: "20%" as unknown as number }]}>
                  {fmt(item.per_unit)}
                </Text>
                <Text style={[styles.tableCell, { width: "20%" as unknown as number }]}>
                  {fmt(item.subtotal)}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.tableRow}>
              <Text style={[styles.tableCellLabel, { width: "45%" as unknown as number }]}>
                PCB Assembly — Job {jobNumber} (GMP: {gmpNumber})
              </Text>
              <Text style={[styles.tableCell, { width: "15%" as unknown as number }]}>
                {" "}
              </Text>
              <Text style={[styles.tableCell, { width: "20%" as unknown as number }]}>
                {" "}
              </Text>
              <Text style={[styles.tableCell, { width: "20%" as unknown as number }]}>
                {fmt(subtotal)}
              </Text>
            </View>
          )}
        </View>

        {/* -- Summary -- */}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{fmt(subtotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>TPS/GST (5%)</Text>
          <Text style={styles.summaryValue}>{fmt(tpsGst)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>TVQ/QST (9.975%)</Text>
          <Text style={styles.summaryValue}>{fmt(tvqQst)}</Text>
        </View>
        {freight > 0 ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Freight</Text>
            <Text style={styles.summaryValue}>{fmt(freight)}</Text>
          </View>
        ) : null}
        {discount > 0 ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Discount</Text>
            <Text style={styles.summaryValue}>-{fmt(discount)}</Text>
          </View>
        ) : null}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Due (CAD)</Text>
          <Text style={styles.totalValue}>{fmt(total)}</Text>
        </View>

        {/* -- Notes -- */}
        {notes ? (
          <View style={styles.notesBlock}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        ) : null}

        {/* -- Payment Terms Notice -- */}
        <View style={styles.termsBlock}>
          <Text style={styles.termsText}>
            Payment is due within the terms stated above ({paymentTerms}).
            Please make cheques payable to R.S. Électronique Inc. or remit
            payment via wire transfer. All amounts are in Canadian Dollars (CAD).
            A 2% monthly interest charge will be applied to overdue balances.
          </Text>
        </View>

        {/* -- Footer -- */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>R.S. Électronique Inc.</Text>
          <Text style={styles.footerText}>{invoiceNumber}</Text>
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
