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

export interface ComplianceCertificatePDFProps {
  jobNumber: string;
  customerName: string;
  contactName?: string | null;
  gmpNumber: string;
  boardName?: string | null;
  quantity: number;
  shipDate?: string | null;
  procBatchCode?: string | null;
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
    fontSize: 16,
    color: "#0f172a",
    textAlign: "right",
  },
  docSubtitle: {
    fontSize: 9,
    textAlign: "right",
    color: "#475569",
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
    marginBottom: 24,
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
  certSection: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  certTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: "#0f172a",
    marginBottom: 8,
  },
  certBody: {
    fontSize: 9,
    lineHeight: 1.7,
    color: "#334155",
    marginBottom: 6,
  },
  certBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    lineHeight: 1.7,
    color: "#0f172a",
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 3,
    paddingLeft: 8,
  },
  bullet: {
    fontSize: 9,
    color: "#334155",
    width: 12,
  },
  bulletText: {
    fontSize: 9,
    color: "#334155",
    lineHeight: 1.5,
    flex: 1,
  },
  signatureBlock: {
    marginTop: 40,
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

export function ComplianceCertificatePDF({
  jobNumber,
  customerName,
  contactName,
  gmpNumber,
  boardName,
  quantity,
  shipDate,
  procBatchCode,
}: ComplianceCertificatePDFProps) {
  const dateStr = fmtDate(shipDate);

  return (
    <Document>
      {/* Page 1: Lead-Free / RoHS Compliance Certificate */}
      <Page size="A4" style={styles.page}>
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
            <Text style={styles.docTitle}>CERTIFICATE OF</Text>
            <Text style={styles.docTitle}>COMPLIANCE</Text>
            <Text style={styles.docSubtitle}>Lead-Free / RoHS</Text>
            <Text style={styles.docDate}>{dateStr}</Text>
          </View>
        </View>

        {/* Job Details */}
        <View style={styles.infoRow}>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionLabel}>Customer</Text>
            <Text style={styles.infoText}>{customerName}</Text>
            {contactName ? (
              <Text style={styles.infoText}>Attn: {contactName}</Text>
            ) : null}
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionLabel}>Product Details</Text>
            <Text style={styles.infoText}>Job: {jobNumber}</Text>
            <Text style={styles.infoText}>GMP: {gmpNumber}</Text>
            {boardName ? (
              <Text style={styles.infoText}>Board: {boardName}</Text>
            ) : null}
            <Text style={styles.infoText}>Quantity: {quantity} units</Text>
            {procBatchCode ? (
              <Text style={styles.infoText}>Batch: {procBatchCode}</Text>
            ) : null}
          </View>
        </View>

        {/* Lead-Free Certificate Section */}
        <View style={styles.certSection}>
          <Text style={styles.certTitle}>
            Lead-Free / RoHS Compliance Declaration
          </Text>
          <Text style={styles.certBody}>
            R.S. Electronique Inc. hereby certifies that the above-referenced
            assembled printed circuit boards have been manufactured in compliance
            with the European Union Directive 2011/65/EU (RoHS 2) and its
            amendment Directive (EU) 2015/863 (RoHS 3) restricting the use of
            certain hazardous substances in electrical and electronic equipment.
          </Text>
          <Text style={styles.certBody}>
            This certificate confirms the following:
          </Text>
          <View style={styles.bulletItem}>
            <Text style={styles.bullet}>1.</Text>
            <Text style={styles.bulletText}>
              All solder paste and solder materials used in the assembly process
              are lead-free, conforming to SAC305 (Sn96.5/Ag3.0/Cu0.5) or
              equivalent lead-free alloy.
            </Text>
          </View>
          <View style={styles.bulletItem}>
            <Text style={styles.bullet}>2.</Text>
            <Text style={styles.bulletText}>
              All electronic components procured for this assembly are declared
              RoHS-compliant by their respective manufacturers.
            </Text>
          </View>
          <View style={styles.bulletItem}>
            <Text style={styles.bullet}>3.</Text>
            <Text style={styles.bulletText}>
              The assembled PCBs do not contain any of the following restricted
              substances above the maximum concentration values: Lead (Pb),
              Mercury (Hg), Cadmium (Cd), Hexavalent Chromium (Cr6+),
              Polybrominated Biphenyls (PBB), Polybrominated Diphenyl Ethers
              (PBDE), Bis(2-Ethylhexyl) phthalate (DEHP), Butyl benzyl
              phthalate (BBP), Dibutyl phthalate (DBP), Diisobutyl phthalate
              (DIBP).
            </Text>
          </View>
          <View style={styles.bulletItem}>
            <Text style={styles.bullet}>4.</Text>
            <Text style={styles.bulletText}>
              The reflow soldering profile used meets the requirements for
              lead-free processing with peak temperatures appropriate for
              SAC305 alloy.
            </Text>
          </View>
        </View>

        {/* Signature */}
        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine}>
            <Text style={styles.signatureLabel}>
              Authorized Signature / Date
            </Text>
          </View>
          <View style={styles.signatureLine}>
            <Text style={styles.signatureLabel}>Title</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>R.S. Electronique Inc.</Text>
          <Text style={styles.footerText}>
            RoHS Certificate — {jobNumber}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>

      {/* Page 2: IPC Quality Compliance Certificate */}
      <Page size="A4" style={styles.page}>
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
            <Text style={styles.docTitle}>CERTIFICATE OF</Text>
            <Text style={styles.docTitle}>COMPLIANCE</Text>
            <Text style={styles.docSubtitle}>IPC Quality Standards</Text>
            <Text style={styles.docDate}>{dateStr}</Text>
          </View>
        </View>

        {/* Job Details */}
        <View style={styles.infoRow}>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionLabel}>Customer</Text>
            <Text style={styles.infoText}>{customerName}</Text>
            {contactName ? (
              <Text style={styles.infoText}>Attn: {contactName}</Text>
            ) : null}
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.sectionLabel}>Product Details</Text>
            <Text style={styles.infoText}>Job: {jobNumber}</Text>
            <Text style={styles.infoText}>GMP: {gmpNumber}</Text>
            {boardName ? (
              <Text style={styles.infoText}>Board: {boardName}</Text>
            ) : null}
            <Text style={styles.infoText}>Quantity: {quantity} units</Text>
            {procBatchCode ? (
              <Text style={styles.infoText}>Batch: {procBatchCode}</Text>
            ) : null}
          </View>
        </View>

        {/* IPC Certificate Section */}
        <View style={styles.certSection}>
          <Text style={styles.certTitle}>
            IPC Quality Compliance Declaration
          </Text>
          <Text style={styles.certBody}>
            R.S. Electronique Inc. hereby certifies that the above-referenced
            assembled printed circuit boards have been manufactured and inspected
            in accordance with the following IPC standards:
          </Text>

          <View style={styles.bulletItem}>
            <Text style={styles.bullet}>1.</Text>
            <Text style={styles.bulletText}>
              <Text style={styles.certBold}>IPC-A-610 Rev. H </Text>
              — Acceptability of Electronic Assemblies, Class 2 (Dedicated
              Service Electronic Products). All solder joints, component
              placements, and workmanship meet or exceed Class 2 requirements
              unless otherwise specified by the customer.
            </Text>
          </View>
          <View style={styles.bulletItem}>
            <Text style={styles.bullet}>2.</Text>
            <Text style={styles.bulletText}>
              <Text style={styles.certBold}>IPC J-STD-001 Rev. H </Text>
              — Requirements for Soldered Electrical and Electronic Assemblies.
              All soldering processes, materials, and methods conform to this
              standard.
            </Text>
          </View>
          <View style={styles.bulletItem}>
            <Text style={styles.bullet}>3.</Text>
            <Text style={styles.bulletText}>
              <Text style={styles.certBold}>IPC-7711/7721 Rev. C </Text>
              — Rework, Modification and Repair of Electronic Assemblies. Any
              rework or repair performed follows the procedures defined in this
              standard.
            </Text>
          </View>
          <View style={styles.bulletItem}>
            <Text style={styles.bullet}>4.</Text>
            <Text style={styles.bulletText}>
              Visual inspection and/or Automated Optical Inspection (AOI) has
              been performed on 100% of assemblies in this shipment. All boards
              have passed inspection criteria prior to shipment.
            </Text>
          </View>
        </View>

        <View style={{ marginBottom: 8 }}>
          <Text style={styles.certBody}>
            This certificate applies to the specific job and quantity referenced
            above. R.S. Electronique Inc. maintains quality records for
            traceability purposes. Supporting documentation is available upon
            request.
          </Text>
        </View>

        {/* Signature */}
        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine}>
            <Text style={styles.signatureLabel}>
              Quality Assurance / Date
            </Text>
          </View>
          <View style={styles.signatureLine}>
            <Text style={styles.signatureLabel}>Title</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>R.S. Electronique Inc.</Text>
          <Text style={styles.footerText}>
            IPC Certificate — {jobNumber}
          </Text>
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
