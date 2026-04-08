"use client";

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { PricingTier } from "@/lib/pricing/types";

function fmt(n: number | null | undefined): string {
  return "$" + (n ?? 0).toFixed(2);
}

function fmtDate(iso?: string | null): string {
  if (!iso) return new Date().toLocaleDateString("en-CA");
  return new Date(iso).toLocaleDateString("en-CA");
}

export interface QuotePDFProps {
  quoteNumber: string;
  customerName: string;
  contactName?: string | null;
  gmpNumber: string;
  boardName?: string | null;
  bomFile: string;
  tiers: PricingTier[];
  warnings: string[];
  nreCharge: number;
  validityDays: number;
  issuedAt?: string | null;
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
  /* ── Header ── */
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
  quoteTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    color: "#0f172a",
    textAlign: "right",
  },
  quoteNumber: {
    fontSize: 10,
    textAlign: "right",
    marginTop: 2,
  },
  quoteDate: {
    fontSize: 9,
    textAlign: "right",
    color: "#475569",
    marginTop: 2,
  },
  /* ── Bill To + Details ── */
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
  /* ── Pricing table ── */
  table: {
    marginTop: 12,
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    paddingVertical: 6,
    paddingHorizontal: 4,
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
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  tableRowAlt: {
    backgroundColor: "#f8fafc",
  },
  tableRowTotal: {
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#94a3b8",
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
  tableCellBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    textAlign: "right",
    color: "#0f172a",
  },
  tableCellLabelBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    textAlign: "left",
    color: "#0f172a",
  },
  /* ── Warnings ── */
  warningBlock: {
    backgroundColor: "#fef9c3",
    borderWidth: 1,
    borderColor: "#facc15",
    borderRadius: 4,
    padding: 8,
    marginBottom: 12,
  },
  warningText: {
    fontSize: 8,
    color: "#854d0e",
    lineHeight: 1.4,
  },
  /* ── Notes ── */
  notesBlock: {
    marginBottom: 12,
  },
  notesText: {
    fontSize: 9,
    color: "#475569",
    lineHeight: 1.5,
  },
  /* ── Terms & Conditions ── */
  termsBlock: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
  },
  termsTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#0f172a",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  termsText: {
    fontSize: 7.5,
    color: "#64748b",
    lineHeight: 1.6,
    marginBottom: 2,
  },
  /* ── Footer ── */
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

// Column widths: label 35%, then equal for each tier
function colWidths(tierCount: number) {
  const labelPct = 35;
  const tierPct = (100 - labelPct) / Math.max(tierCount, 1);
  return { label: `${labelPct}%`, tier: `${tierPct}%` };
}

export function QuotePDF({
  quoteNumber,
  customerName,
  contactName,
  gmpNumber,
  boardName,
  bomFile,
  tiers,
  warnings,
  nreCharge,
  validityDays,
  issuedAt,
  notes,
}: QuotePDFProps) {
  const widths = colWidths(tiers.length);
  const dateStr = fmtDate(issuedAt);

  const rows: {
    label: string;
    values: string[];
    bold?: boolean;
  }[] = [
    {
      label: "Components",
      values: tiers.map((t) => fmt(t.component_cost)),
    },
    {
      label: "PCB",
      values: tiers.map((t) => fmt(t.pcb_cost)),
    },
    {
      label: "Assembly",
      values: tiers.map((t) => fmt(t.assembly_cost)),
    },
    {
      label: "NRE",
      values: tiers.map((t) => fmt(t.nre_charge)),
    },
    {
      label: "Shipping",
      values: tiers.map((t) => fmt(t.shipping)),
    },
    {
      label: "Total",
      values: tiers.map((t) => fmt(t.subtotal)),
      bold: true,
    },
    {
      label: "Per Unit",
      values: tiers.map((t) => fmt(t.per_unit)),
      bold: true,
    },
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Header ── */}
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
              www.rspcbassembly.com
            </Text>
            <Text style={styles.companyDetail}>
              GST/TPS: 840134829 · QST/TVQ: 1214617001
            </Text>
          </View>
          <View>
            <Text style={styles.quoteTitle}>QUOTATION</Text>
            <Text style={styles.quoteNumber}>{quoteNumber}</Text>
            <Text style={styles.quoteDate}>{dateStr}</Text>
          </View>
        </View>

        {/* ── Bill To + Quote Details ── */}
        <View style={styles.infoRow}>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionLabel}>Bill To</Text>
            <Text style={styles.infoText}>{customerName}</Text>
            {contactName ? (
              <Text style={styles.infoText}>Attn: {contactName}</Text>
            ) : null}
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionLabel}>Quote Details</Text>
            <Text style={styles.infoText}>GMP: {gmpNumber}</Text>
            {boardName ? (
              <Text style={styles.infoText}>Board: {boardName}</Text>
            ) : null}
            <Text style={styles.infoText}>BOM: {bomFile}</Text>
            <Text style={styles.infoText}>
              Validity: {validityDays} days
            </Text>
            {nreCharge > 0 ? (
              <Text style={styles.infoText}>NRE: {fmt(nreCharge)}</Text>
            ) : null}
          </View>
        </View>

        {/* ── Warnings ── */}
        {warnings.length > 0 ? (
          <View style={styles.warningBlock}>
            {warnings.map((w, i) => (
              <Text key={i} style={styles.warningText}>
                • {w}
              </Text>
            ))}
          </View>
        ) : null}

        {/* ── Pricing Table ── */}
        <View style={styles.table}>
          {/* Header row */}
          <View style={styles.tableHeader}>
            <Text
              style={[
                styles.tableHeaderLabel,
                { width: widths.label as unknown as number },
              ]}
            >
              {""}
            </Text>
            {tiers.map((t, i) => (
              <Text
                key={i}
                style={[
                  styles.tableHeaderCell,
                  { width: widths.tier as unknown as number },
                ]}
              >
                {t.board_qty} Units
              </Text>
            ))}
          </View>

          {/* Data rows */}
          {rows.map((row, ri) => (
            <View
              key={ri}
              style={[
                styles.tableRow,
                ri % 2 === 1 ? styles.tableRowAlt : {},
                row.bold ? styles.tableRowTotal : {},
              ]}
            >
              <Text
                style={[
                  row.bold ? styles.tableCellLabelBold : styles.tableCellLabel,
                  { width: widths.label as unknown as number },
                ]}
              >
                {row.label}
              </Text>
              {row.values.map((v, vi) => (
                <Text
                  key={vi}
                  style={[
                    row.bold ? styles.tableCellBold : styles.tableCell,
                    { width: widths.tier as unknown as number },
                  ]}
                >
                  {v}
                </Text>
              ))}
            </View>
          ))}
        </View>

        {/* ── Notes ── */}
        {notes ? (
          <View style={styles.notesBlock}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        ) : null}

        {/* ── Terms & Conditions ── */}
        <View style={styles.termsBlock}>
          <Text style={styles.termsTitle}>Terms &amp; Conditions</Text>
          <Text style={styles.termsText}>
            1. This quotation is valid for {validityDays} days from the date of issue.
          </Text>
          <Text style={styles.termsText}>
            2. All prices are in CAD and exclude TPS/GST (5%) and TVQ/QST (9.975%).
          </Text>
          <Text style={styles.termsText}>
            3. Lead times are subject to component availability at the time of order confirmation.
          </Text>
          <Text style={styles.termsText}>
            4. Payment terms: Net 30 from date of invoice unless otherwise agreed.
          </Text>
          <Text style={styles.termsText}>
            5. NRE charges apply to first-time boards only and cover stencil, programming, and setup.
          </Text>
          <Text style={styles.termsText}>
            6. Customer-supplied components are subject to incoming inspection. Defective parts may result in additional charges.
          </Text>
          <Text style={styles.termsText}>
            7. Quantities delivered may vary by +/-5% per IPC standards unless exact quantity is specified.
          </Text>
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>R.S. Électronique Inc.</Text>
          <Text style={styles.footerText}>{quoteNumber}</Text>
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
