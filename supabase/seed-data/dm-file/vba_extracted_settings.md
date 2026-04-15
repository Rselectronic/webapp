# VBA / XLSM Extracted Pricing Settings

**Purpose:** Ground-truth extraction of every numeric constant and formula that the live RS pricing process uses. Read-only dump from the populated quote example and blank TIME template. No values inferred — only what is literally in the cells.

## Source files

| File                                      | Path                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Populated real quote** (primary source) | `OneDrive/.../RS Master/1. CUSTOMERS/LANKA/1. PROD FILES AND QUOTES/TL265-5001-000-T/TL265-5001-000-T Old V4/zzTIME V11 TL265-5001-000-T.xlsm`   |
| Blank TIME V11 template                   | `/Users/rselectronicpc/Downloads/6. BACKEND/TIME FILE/TIME V11.xlsm`                                                                             |
| DM Common File V11                        | `OneDrive/.../RS Master/2. DM FILE/DM Common File - Reel Pricing V11.xlsm`                                                                       |

Quote context: `TL265-5001-000-T`, BOM = 122 lines, 864 SMT placements, 97 CP feeders, 15 IP feeders, 20 TH parts, 149 TH pins, panel=1, double-sided. Qty 1 tier = 130 boards.

Sheets found in the TIME workbook: `Settings | QTY 1 | QTY 2 | QTY 3 | QTY 4 | final | Quotation Temp | Summary` (plus a per-run `RS Pricing_*` log).

The `Settings` sheet is a **named-range map only** — it holds variable names pointing to cells inside `QTY 1`. Actual pricing constants all live on `QTY 1` rows 155–219.

---

## Section 1 — Labour rates from TIME file settings

These live in `QTY 1` (rows 190–200), NOT in a separate "Settings" sheet. The mapping in `Settings!A28` / `Settings!C28` confirms: `Set_Labour_Rate_Rng → AK29` — but AK29 in this workbook was not populated; the real hardcoded value is on `QTY 1`:

| Item                      | Sheet!Ref     | Literal value    | Nearby label                                           |
| ------------------------- | ------------- | ---------------- | ------------------------------------------------------ |
| **Labour rate ($/hr)**    | `QTY 1!B194`  | **32**           | Label in `A194`: "labour rate "                        |
| **SMT rate ($/hr)**       | `QTY 1!B195`  | **165**          | Label in `A195`: "smt rate"                            |
| "Actual" burdened Labour  | `QTY 1!G157`  | **74**           | "Actual cost" column label — profit/variance check     |
| "Actual" burdened SMT     | `QTY 1!G158`  | **98**           | "Actual cost" column label                             |

**CRITICAL CAVEAT — the Labour Rate value is inconsistent across the workbook.** Three different numbers are all labelled "Labour Rate" on the same file:

1. `QTY 1!B194` = **32** — the one actually consumed by formula `D157 = C157 * B194` (labour cost = total labour hours × rate)
2. `final!C15` = **32** (matches B194 for Qty 1 row)
3. `final!C16` = **95.45**, `C17` = **84.53**, `C18` = **130** — different rates for each quantity tier
4. `Summary!J5` = **170** — the rate saved in the most recent "RS Pricing" snapshot row, dated serial 46084 (Mar 3 2026)

So there are **four different labour rates** stored in this one file and nothing reconciles which is authoritative. Worth flagging to user immediately.

| Item                         | Sheet!Ref                              | Literal value | Notes                                                                                      |
| ---------------------------- | -------------------------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| Component markup             | `final!H15`                            | **0.20** (20%)| Pulled by `QTY 1!D208 = final!$H$15`                                                       |
| PCB markup                   | `final!F15`                            | **0.20** (20%)| Pulled by `QTY 1!D202 = final!F15`                                                         |
| PCB price (manual entry)     | `QTY 1!D201`                           | **800**       | Free-form entry, not computed                                                              |
| Component cost (manual)      | `QTY 1!D206`                           | **9226.16**   | From DigiKey API elsewhere, pasted in                                                      |
| Shipping (freight)           | `QTY 1!D207`                           | **200**       | Hardcoded constant, labelled "Shipping"                                                    |
| Programming NRE rate         | `QTY 1!B196`                           | **300**       | Hardcoded, used as D173 unit price                                                         |
| Stencil NRE                  | `QTY 1!B198` (blank) via `D172`         | **0**         | Manually entered per quote; zero on this one                                               |
| PCB FAB NRE                  | `QTY 1!B205` (blank)                    | **0**         | Manually entered                                                                           |
| Misc. NRE on whole order     | `QTY 1!B212`                           | **0**         | Manually entered                                                                           |
| Discount                     | `QTY 1!B213`                           | NOT FOUND     | Referenced by `final!E188 = B213` — blank on this quote                                    |

"Burdened rate vs direct rate" — The F157/G157/H157 block is a separate "actual cost" comparison (columns F-H, rows 157-168) where `G157=74` (burdened Labour) and `G158=98` (burdened SMT). It produces `H160` (profit $) and `H163` (profit %) — for this quote, profit = **-$3,027 and -28%** (i.e., the file flags this quote as losing money at the burdened rate). Essentially an internal sanity-check, not used in customer-facing pricing.

NO separate TH / Manual SMT / Inspection rates — the TIME file rolls all labour-type work (setup, TH, inspection, washing, packing, reflow, depannelize) into `B157` as one number that is then multiplied by the single labour rate `B194`. Only SMT time is priced separately using `B195`.

---

## Section 2 — Procurement charges

**There is no fixed $234 constant anywhere in the file.** The $234 in an earlier reference quote was a *computed* value from this formula:

| Item                                    | Sheet!Ref         | Formula / Value                                         |
| --------------------------------------- | ----------------- | ------------------------------------------------------- |
| **Component Procurement Charge**        | `QTY 1!B208`      | `=(150 + (3.5 * E8)) * B207`                            |
|                                         |                   | where `E8` = Total Number of Lines in BOM               |
|                                         |                   | and `B207` = 1 if component cost > 0 else 0             |
|                                         |                   | On this 122-line BOM → **$577**. A 24-line BOM = $234.  |
| **PCB Procurement Charge**              | `QTY 1!B203`      | `=B202 * 100` — i.e., **$100 flat**, gated by `B202`     |
|                                         |                   | where `B202 = IF(B204>0, 1, 0)` (PCB price entered)     |
| PCB Procurement fed into price breakdown| `QTY 1!H202`      | literal **100**                                         |
| Components Procurement fed into breakdown| `QTY 1!H208`     | `=B208` (the computed formula above)                    |

**So the live VBA rule is:**
- `comp_proc_charge = 150 + 3.5 × bom_line_count` (set to 0 if no component cost)
- `pcb_proc_charge = 100` (set to 0 if no PCB cost)

No tiered / variable-by-qty procurement charge exists in this workbook. Same formula applies to all 4 qty tiers.

---

## Section 3 — Placement cost formula (raw formulas from `QTY 1` sheet)

Section 3 of the request asks for B45, B47, B48, B50, etc. Note the "Qty 1" sheet in this workbook uses a different layout than the request suggests — the rows below are what is actually in the file. Formula chains are followed to constants.

### Top-of-sheet inputs (PCB info block, column D/E)

| Ref  | Meaning                                  | Value | Formula                |
| ---- | ---------------------------------------- | ----- | ---------------------- |
| E3   | Boards in panel                          | 1     | (manual)               |
| E4   | Qty of boards to assemble (= tier qty)   | 130   | (manual, per tier)     |
| E5   | Actual qty of panels                     | 130   | `=E4/E3`               |
| E6   | Actual SMT placements per panel          | 864   | `=E9*E3`               |
| E7   | Double-side flag (1=yes)                 | 1     | (manual)               |
| E8   | Total lines in BOM                       | 122   | (manual)               |
| E9   | SMT placements per PCB                   | 864   | (manual)               |
| E10  | # of CP feeders                          | 97    | (manual)               |
| E11  | Total CP parts per PCB                   | 801   | (manual)               |
| E12  | # of IP feeders                          | 15    | (manual)               |
| E13  | Total IP parts per PCB                   | 63    | (manual)               |
| E14  | Manual SMT parts per PCB (top+bot)       | 0     | (manual)               |
| E15  | TH parts per board                       | 20    | (manual)               |
| E16  | TH pins per PCB                          | 149   | (manual)               |

### Programming block (rows 2–10)

```
B2  = H21                           = 0.01041… (one-sided programming, 15 min)
B3  = (B2*E7)/2                     (second side: half of one-sided × double flag — note: /2 even when E7=1)
B4  = H20                           = 0.01041… (pick & place)
B5  = INDEX(R4:R203, MATCH(E8, Q4:Q203, 0))   (BOM and PD's — lookup table keyed by BOM lines)
B6  = 0                             (special — manually entered)
B7  = H24                           = 0.02777… (printer program one side)
B8  = B7*E7                         (second side)
B9  = SUM(B2:B8)                    (total programming time)
B10 = IF(E9>0, B9, 0)               (programming time — set to 0 if no SMT placements)
```

### Printer setup (rows 14–17)

```
B14 = H29                           = 0.01388… (printer setup one side)
B15 = (B14*E7)*2                    (second side — ×2 then ×flag; note this is OPPOSITE scale to B3)
B16 = SUM(B14:B15)
B17 = IF(E9>0, B16, 0)
```

### CP / IP setup (rows 19–26)

```
B19 = INDEX(X4:X154, MATCH(E10, W4:W154, 0))      (lookup: time to load all CP feeders vs # feeders)
B20 = INDEX(AD4:AD64, MATCH(E12, AC4:AC64, 0))    (lookup: time to load all IP feeders vs # IP)
B21 = H33*E10                       = 0.001388… × 97  (loading CP machine)
B22 = B21/2                         (UNloading CP — half of loading)
B23 = H33*E12                       = 0.001388… × 15  (loading IP)
B24 = B23                           (UNloading IP — full, not half — asymmetric)
B25 = H26 + (H27*E8)                = 0.03125 + 0.001041×122  (managing + sorting components)
B26 = SUM(B17:B25)                  (total setup time)
```

### Printing block (rows 29–42)

```
B29 = H28                           = 0.001041… (time for one print, with handling)
B30 = B29*E5                        (total print time one side)
B31 = H30                           = 0.01388… (load/unload stencil)
B32 = H43                           = 0.000347… (handling time per panel)
B33 = B32*E5                        (total handling time)
B34 = B30 + B31 + B33               (total print time one side)
B35 = E7                            (double-side multiplier)
B36 = IF(B35>0, B34+0, "0")         (second-side time)   -- returns B34, NOT B34×B35
B37 = IF(B35>0, B31*2, "0")         (second-side stencil setup — TWO stencil loads)
B38 = B36 + B37                     (total second-side print time)
B39 = (B38 + B34) / E4              (per unit)
B40 = (B38 + B34) / E5              (per panel)
B41 = B34 + B38                     (ttl printer time)
B42 = IF(E9>0, B41, 0)              (total printing time complete assembly)
```

### CP SMT block (rows 44–57)  ← "possibly double-counting" area

```
B44 = H32                           = 0.00001157… (SMT cph — seconds per part)
B45 = ((B44 / final!E30) * H34)
      where final!E30 = 5 (CPCPH divisor) and H34 = total CP parts per panel (801)
      → yields per-panel CP machine time, top side
B46 = H43*E5                        (handling time for all panels — REUSES H43 handling rate)
B47 = B45*E5                        (machine time total, = per-panel × panel count)
B48 = (B45*E5) + B46                (total time top side = machine + handling)
B49 = $H$57                         = 0.01388… (inspection time to get one side going)
B50 = B49 + B48                     (total time for top side)
B51 = E7                            (double-side flag)
B52 = IF(B51>0, B48+0, "0")         (second-side SMT time — JUST B48 verbatim, not ×flag)
B53 = B51 * B49                     (second-side inspection)
B54 = B52 + B53                     (second-side total)
B55 = (B50 + B54) / E5              (per unit)
B56 = B50 + B54                     (total SMT time CP)
B57 = IF(E11>0, B56, 0)             (total SMT run time — gated on # CP parts)
```

**Observation for the audit:** `B52 = IF(B51>0, B48+0, "0")` returns the literal value of `B48` when the double-side flag is 1 (which it is here). This means when a board is double-sided, the machine + handling cost for the second side is **identical** to the first side, then `B53` adds another inspection on top. There's no "second side is faster because feeders already loaded" discount. Whether that's correct business logic or a bug is for Anas to call.

Same pattern repeats in the IP block:

```
B59 = H35 = final!E31 = 0.0000231…  (IP cph)
B60 = B59 * H37                     (time per unit top side)
B61 = H43 * E5                      (handling — same rate as CP, reused)
B62 = B60 * E5                      (machine time)
B63 = (B60*E5) + B61                (total top side)
B64 = $H$57                         = 0.01388… (same inspection time)
B65 = B64 + B63
B66 = E7
B67 = IF(B66>0, B63+0, "0")         (same pattern — second side ≡ first side)
B68 = B66 * B64
B69 = B67 + B68
B70 = (B65 + B69) / E5
B71 = B65 + B69                     (Total SMT time IP)
B72 = IF(E13>0, B71, 0)
```

### Manual SMT block (rows 74–79)

```
B74 = H39 = 0.000520833…            (time for each manual SMT part)
B75 = E14 * E4                      (number of manual SMT parts × panel qty)
B76 = H58 = 0.01388…                (time to get process going)
B77 = (B74*B75) / E4                (per unit)
B78 = (B74*B75) + B76
B79 = IF(E14>0, B78, 0)
```

### Reflow (rows 81–88)

```
B81 = INDEX(L3:L415, MATCH(E5, K3:K415, 1))   (lookup reflow time by panel qty)
B82 = B81                           (one side)
B83 = E7
B84 = B82 * B83                     (second side reflow)
B85 = B84
B86 = (B85 + B82) / E5
B87 = B82 + B85
B88 = IF(E9>0, B87, 0)
```

### Total SMT (row 90–91)

```
B90 = B91 / E5                      (per unit)
B91 = B42 + B57 + B72 + B78 + B88   (= printing + CP SMT + IP SMT + manSMT + reflow)
```

### Cross-sheet reference `final` sheet (rows 30–31)

```
final!D30 = "CPCPH"
final!E30 = 5            final!F30 = 5             final!G30 = 4.5           final!H30 = 4.5
final!D31 = "IPCPH"
final!E31 = 0.0000231…   (same value for F31, G31, H31)
```

Used by `QTY 1!B45 = ((B44/final!E30)*H34)` and `QTY 1!B35 = final!E31`. So the `final` sheet **does exist** in this workbook and the references resolve — the ChatGPT review was wrong about the broken references, at least for this version. Named the rate tiers E/F/G/H → qty1/qty2/qty3/qty4 respectively (values 5, 5, 4.5, 4.5 CP cph). Qty tier 3/4 use a different CP cph (4.5 vs 5) which changes SMT time proportionally.

### Assembly Calculator → final price (rows 157–168)

```
B157 = B26 + B104 + B112 + B130 + B148 + B107 + B143 + H56 + B139
       = setup + TH + washing + depannelize + packing + misc + TH-insp + misc-order + SMT-inspection
       (all rolled into one "Labour" bucket)
C157 = B157 * 24                    (days → hours, * 24)
D157 = C157 * B194                  (labour $ = hours × labour_rate[32])
E157 = D157 / E4                    (per unit)

B158 = B91                          (SMT time, days)
C158 = B158 * 24                    (hours)
D158 = B195 * C158                  (SMT $ = smt_rate[165] × hours)
E158 = D158 / E4

D165 = B204 + B203                  (PCB price + PCB proc charge = 960 + 100 = 1060)
D166 = B208 + B209                  (comp proc charge + component cost = 577 + 11311.39 = 11888.39)

D167 = D157 + D158 + D165 + D166    (Total without NRE)
D168 = D167 / E4                    (unit price)
```

For the 130-qty tier this produced:
- Labour $ = 4339.90
- SMT $ = 6573.11
- PCB+proc = 1060
- Components+proc = 11888.39
- Total = 23861.40
- Unit price = $183.55

### NRE block (rows 172–175, final bottom section)

```
D172 = B198                (Stencil NRE — blank)
D173 = B196                (Programming NRE = 300)
D174 = B205                (PCB FAB NRE — blank)
D175 = B212                (Misc NRE — blank)
```

---

## Section 4 — NRE / setup / programming / stencil defaults

From the TIME file — all NRE line items are **manually entered per quote**, not computed, with one exception:

| Item               | Source                             | Default in this file |
| ------------------ | ---------------------------------- | -------------------- |
| Programming NRE    | `QTY 1!B196` (manual)              | **300** (flat)       |
| Stencil NRE        | `QTY 1!B198` (manual)              | blank / 0            |
| PCB FAB NRE        | `QTY 1!B205` (manual)              | blank / 0            |
| Misc NRE           | `QTY 1!B212` (manual)              | 0                    |
| Setup TIME (hours) | computed in `B26` (= setup block)  | 0.868 days = 20.8 hr |

Setup time is computed from BOM characteristics (feeder loading lookups + sorting time × BOM lines), then costed at the labour rate (via B157→D157). There is no single "setup cost" constant.

The `final!B21-B24` block also has NRE defaults pulled in:
- `final!B21` = 300 (Programming default)
- `final!B22` = NOT FOUND (Stencil default — blank)
- `final!B24` = 0 (Misc NRE default)

---

## Section 5 — Markup percentages

| Markup             | Cell         | Value                                          |
| ------------------ | ------------ | ---------------------------------------------- |
| **Component %**    | `final!H15`  | **0.20** (20%) for Qty 1 tier                  |
|                    | `final!H16`  | **0.25** (25%) for Qty 2                        |
|                    | `final!H17`  | **0.25** (25%) for Qty 3                        |
|                    | `final!H18`  | **0.25** (25%) for Qty 4                        |
| **PCB %**          | `final!F15`  | **0.20** (20%) for Qty 1                       |
|                    | `final!F16`  | **0.25** (25%) for Qty 2                        |
|                    | `final!F17`  | **0.25** (25%) for Qty 3                        |
|                    | `final!F18`  | **0.25** (25%) for Qty 4                        |

So markup IS tiered — 20% on the smallest qty (because the proc charge absorbs it) and 25% on larger qty tiers. **This was not documented in CLAUDE.md, which assumed a flat 20%.**

No per-customer markup override mechanism found in the TIME file. Any per-customer override would be manual (Piyush types a different value into the `final` sheet).

---

## Section 6 — Miscellaneous additive charges

| Item                                   | Source                                      | Value                             |
| -------------------------------------- | ------------------------------------------- | --------------------------------- |
| Conformal coating per PCB              | `QTY 1!B211`                                | 0 (manual entry per quote)        |
| X-ray / other misc per unit            | `QTY 1!D164 = B211 * E4`                    | 0 (same source as coating)        |
| Freight / shipping                     | `QTY 1!D207`                                | **200** (flat, bundled into comp) |

Conformal coating and X-ray share one cell (`B211`) — user manually types the total per-unit additional charge. There is no separate per-part time calculation for coating pricing in this file (although the TIME computations for coating labour exist in rows 114–126 and feed `B121`, which feeds B157 total labour — so coating LABOUR is computed but the additive MATERIAL cost for masking compound etc. is manual).

No freight/shipping surcharge tier logic — flat $200 is added into the `D210` total. Whether this is bundled into "component cost" or broken out on the PDF depends on the Quotation Temp sheet (not inspected in this pass).

---

## Section 7 — Anything else surprising

1. **Four different "labour rates" stored in the same file.** `QTY 1!B194=32`, `final!C15=32`, `final!C16=95.45`, `final!C17=84.53`, `final!C18=130`, `Summary!J5=170`. Only B194 is actually consumed by the Qty 1 pricing formula `D157`; the others are either for the other tiers (`final!C16-18` → per-tier rate) or historical snapshot (`Summary!J5`). **The web app needs ONE authoritative place for this.**
2. **Profit check says this quote is LOSING money** at the burdened rate. `QTY 1!H160 = -3027`, `H163 = -28%`. The burdened labour = 74 vs direct 32 (≈2.3×) and burdened SMT = 98 vs direct 165 (0.6×, which is weird — SMT burdened < SMT direct, probably a data entry error). Worth asking Anas whether those burdened rates are correct or stale.
3. **Second-side SMT formula has no discount.** `B52 = IF(B51>0, B48+0, "0")` returns B48 unchanged. So double-sided boards cost 2× single-sided SMT time + 2× inspection + printing ×2, not 1.5× as typical. Anas should confirm if this is intentional.
4. **Loading CP is ×97 but unloading is ÷2. Loading IP is ×15, unloading is ×1 (no div).** `B22 = B21/2` for CP unload, `B24 = B23` for IP unload. Asymmetric and undocumented. Probably correct because CP machine unload is faster per-feeder, but worth confirming.
5. **`final!E30 = 5` is labelled "CPCPH"** but the value doesn't match the `B44 = H32` CP cph of `0.00001157 days` (= 0.0417 seconds per part = 86,400 cph). The `final!E30 = 5` appears to be a **divisor** of the native cph rate to apply a CP-qty-tier adjustment. So the formula `B45 = (B44/final!E30)*H34` means CP time = (raw_cph / 5) * parts. For qty 3/4 the divisor drops to 4.5, giving ~11% more time. Feels like a hack — CP CPH should be qty-agnostic (the machine doesn't run slower on larger orders). This may be a rough capacity-derating fudge factor.
6. **`QTY 1!B151 = "fix"`** — a literal string where a formula should be. Label says "Days for assembly". Someone wrote a TODO in a cell. Minor.
7. **Component procurement formula `150 + 3.5 × BOM_lines` is a sliding fee**, not a flat $234. The $234 seen in the reference quote had exactly 24 lines. For the 122-line quote audited here the charge was $577.
8. **Blank TIME V11 template** has most formulas identical to the real quote, but starting inputs are blank/dummy (E3 not set in blank → E5 = #DIV/0). Confirms the 9 formulas are the canonical ones; no "hidden" variant in the blank template.
9. **DM Common File V11** — the `Price Calc` sheet only has two cells: `A1 = 100` and `B1 = 0.0758`. No labels. Possibly a USD-to-CAD rate (0.7580 inverted?) + 100 unit multiplier, or an unrelated scratch value. **Worth asking user what these mean.**
10. **No `PROC Charge Variable Table`** found anywhere in DM or TIME. Any tier-based procurement charge logic mentioned in HANDOFF or Piyush feedback must be in a different file — maybe in `PROC Template V25` which was not accessible in this pass.
11. Sheet `QTY 1` is 415 rows × 32 columns. The pricing formulas occupy rows 150–220. Rows 230+ hold a `Piyush` time-accounting block (`C231 = 1.5 hrs`, `F231 = $40/hr`, labelled "Administration") — likely a separate admin-overhead worksheet not used in quote pricing.
12. No `_MachineRates` hidden sheet found. The TIME file has exactly the 9 listed sheets.
13. The zzTIME file modification serial for the saved RS Pricing snapshot (`Summary!C5 = 46084.38`) decodes to **Mar 3 2026 09:23 AM** — 6 weeks old. The populated quote is current enough to trust.
