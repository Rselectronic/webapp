/**
 * Canadian sales tax by region.
 *
 * Each region maps to a deterministic tax breakdown applied to the taxable
 * subtotal (subtotal - discount). HST is stored on its own column in the
 * invoices table; GST and QST stay on tps_gst and tvq_qst respectively.
 * Exactly one of (gst+qst pair, gst alone, hst alone, all zero) is non-zero
 * depending on the region.
 *
 * Rates as of 2026:
 *   QC               5% GST + 9.975% QST
 *   CA_OTHER         5% GST only            (AB, BC, MB, SK, NT, NU, YT)
 *   HST_ON           13% HST                (Ontario)
 *   HST_15           15% HST                (NB, NL, NS, PE)
 *   INTERNATIONAL    no tax                 (US + ROW)
 */

export const TAX_REGIONS = [
  "QC",
  "CA_OTHER",
  "HST_ON",
  "HST_15",
  "INTERNATIONAL",
] as const;

export type TaxRegion = (typeof TAX_REGIONS)[number];

export interface TaxBreakdown {
  /** Federal Goods and Services Tax (5%). 0 when region is HST or international. */
  gst: number;
  /** Quebec Sales Tax (9.975%). 0 outside QC. */
  qst: number;
  /** Harmonized Sales Tax (13% in ON, 15% in NB/NL/NS/PE). 0 outside HST regions. */
  hst: number;
  /** Sum of the three columns, rounded to cents. */
  total_tax: number;
  /** Human-readable label suitable for an invoice line ("GST 5% + QST 9.975%"). */
  label: string;
  /** Effective combined rate as a fraction (0.14975 for QC, 0.13 for ON, etc.). */
  effective_rate: number;
}

const EMPTY: Omit<TaxBreakdown, "label" | "effective_rate"> = {
  gst: 0,
  qst: 0,
  hst: 0,
  total_tax: 0,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Compute taxes on a taxable base for a given region. The base should
 * already be `subtotal - discount` — caller is responsible for picking
 * what's taxable.
 *
 * Returns rounded-to-cents amounts ready to write to the DB.
 */
export function computeTaxes(
  taxableBase: number,
  region: TaxRegion
): TaxBreakdown {
  const base = Math.max(0, taxableBase);

  switch (region) {
    case "QC": {
      const gst = round2(base * 0.05);
      const qst = round2(base * 0.09975);
      return {
        gst,
        qst,
        hst: 0,
        total_tax: round2(gst + qst),
        label: "GST 5% + QST 9.975%",
        effective_rate: 0.14975,
      };
    }
    case "CA_OTHER": {
      const gst = round2(base * 0.05);
      return {
        gst,
        qst: 0,
        hst: 0,
        total_tax: gst,
        label: "GST 5%",
        effective_rate: 0.05,
      };
    }
    case "HST_ON": {
      const hst = round2(base * 0.13);
      return {
        gst: 0,
        qst: 0,
        hst,
        total_tax: hst,
        label: "HST 13%",
        effective_rate: 0.13,
      };
    }
    case "HST_15": {
      const hst = round2(base * 0.15);
      return {
        gst: 0,
        qst: 0,
        hst,
        total_tax: hst,
        label: "HST 15%",
        effective_rate: 0.15,
      };
    }
    case "INTERNATIONAL":
      return {
        ...EMPTY,
        label: "No tax (export)",
        effective_rate: 0,
      };
  }
}

/**
 * Derive a tax_region from a customer's billing address. Best-effort —
 * operations should review and correct on customer creation. Anything we
 * can't classify falls back to QC (the safe-default for an over-collection
 * scenario; better to over-charge than under-charge for a domestic sale).
 *
 * Province codes accepted: 2-letter standard (QC, ON, BC, ...).
 * Country codes accepted: 'CA' or full names ('Canada' / 'United States' / etc.)
 */
export function deriveTaxRegion(addr: {
  country?: string | null;
  province?: string | null;
  state?: string | null;
}): TaxRegion {
  const country = (addr.country ?? "").trim().toUpperCase();
  const province = (addr.province ?? addr.state ?? "").trim().toUpperCase();

  const isCanada =
    country === "CA" ||
    country === "CAN" ||
    country === "CANADA" ||
    // No country specified but a Canadian province → assume Canada.
    (country === "" &&
      ["QC", "ON", "BC", "AB", "MB", "SK", "NS", "NB", "NL", "PE", "YT", "NT", "NU"].includes(
        province
      ));

  if (!isCanada && country !== "") {
    return "INTERNATIONAL";
  }

  // Canadian — map by province.
  if (province === "QC" || province === "QUEBEC" || province === "QUÉBEC") return "QC";
  if (province === "ON" || province === "ONTARIO") return "HST_ON";
  if (
    province === "NB" ||
    province === "NL" ||
    province === "NS" ||
    province === "PE" ||
    province === "NEW BRUNSWICK" ||
    province === "NEWFOUNDLAND AND LABRADOR" ||
    province === "NEWFOUNDLAND" ||
    province === "NOVA SCOTIA" ||
    province === "PRINCE EDWARD ISLAND"
  ) {
    return "HST_15";
  }
  if (
    province === "AB" ||
    province === "BC" ||
    province === "MB" ||
    province === "SK" ||
    province === "YT" ||
    province === "NT" ||
    province === "NU" ||
    province === "ALBERTA" ||
    province === "BRITISH COLUMBIA" ||
    province === "MANITOBA" ||
    province === "SASKATCHEWAN" ||
    province === "YUKON" ||
    province === "NORTHWEST TERRITORIES" ||
    province === "NUNAVUT"
  ) {
    return "CA_OTHER";
  }

  // Fallback: QC (safest default for an unclassified Canadian address).
  return "QC";
}

export const TAX_REGION_LABELS: Record<TaxRegion, string> = {
  QC: "Quebec (GST + QST)",
  CA_OTHER: "Canada non-HST (GST only)",
  HST_ON: "Ontario (HST 13%)",
  HST_15: "NB / NL / NS / PE (HST 15%)",
  INTERNATIONAL: "International (no tax)",
};
