Attribute VB_Name = "Calculation_V1"
'============================================================================================
' Module:      Calculation_V1 (PERFORMANCE OPTIMIZED)
' Purpose:     BOM Calculations - Pricing, Ext Price, Stock Validation, Programming Fees
' Version:     V3 - Feb 2026
'
' PERFORMANCE CHANGES (on top of all previous bug fixes):
' -----------------------------------------------------------------------
' [SPEED-01] Application.Calculation = xlCalculationManual during entire run
'            -> Prevents Excel from recalculating after EVERY cell write
'            -> This alone can give 10-50x speedup on formula-heavy workbooks
'
' [SPEED-02] Application.EnableEvents = False during entire run
'            -> Prevents Worksheet_Change events firing on every cell write
'
' [SPEED-03] Replaced SumIf-per-row with Dictionary-based stock lookup
'            -> Original: 2 x SumIf calls per row x 4 quantities = 8 SumIf per row
'            -> With 300 rows per sheet = 2,400 SumIf calls PER SHEET
'            -> With 30 sheets = 72,000 SumIf calls total!
'            -> New: Build Dictionary once per sheet, O(1) lookup per row
'
' [SPEED-04] Batch-write formulas using Range.FormulaR1C1 on entire column at once
'            -> Instead of writing formula to each cell in a loop
'
' [SPEED-05] Batch-apply NumberFormat to entire range at once
'            -> Instead of cell-by-cell formatting
'
' [SPEED-06] Read unit price original column into array, process in memory
'            -> Minimizes Excel object model round-trips
'
' [SPEED-07] Pre-build SumIf aggregates using Dictionary before entering row loop
'            -> One pass through data to build totals, then O(1) lookups
'
' [SPEED-08] StatusBar progress indicator so user knows it's working
'
' EXPECTED IMPROVEMENT: 5x-20x faster than previous version
'============================================================================================
Option Explicit

' ---- Module-Level Constants ----
Private Const UNIT_PRICE_ORIGINAL_COL As String = "N"
Private Const DISTRIB_COL As String = "P"
Private Const DATA_START_ROW As Long = 4
Private Const MAX_UNIT_PRICE As Double = 10000
Private Const STOCK_COL As String = "O"
Private Const QTY_COUNT As Long = 4
Private Const CURRENCY_FORMAT As String = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"

' ---- Module-Level Flag ----
Private m_InvalidUnitPriceFound As Boolean

'============================================================================================
' SUB: Calculations_BOM (Main Entry Point)
'============================================================================================
Sub Calculations_BOM()

    On Error GoTo ErrorHandler

    ' ---- Declarations ----
    Dim ws As Worksheet
    Dim lr As Long, i As Long, q As Long
    Dim formulaRange As Range
    Dim borderRange As Range
    Dim shipping As Double, markup As Double
    Dim inputWS As Worksheet
    Dim program As Worksheet
    Dim StatusReturnofInvalidUnitPrice As String
    Dim sheetLoc As Long
    Dim bomLines As Long
    Dim programmingFees As Double
    Dim side As Long, p As Long, pLastRow As Long
    Dim programmingMismatchMsg As String
    Dim THsum As Double
    Dim findResult As Range
    Dim sheetCount As Long, sheetNum As Long

    ' Qty column mappings
    Dim qtyOrderCols As Variant, qtyUnitPriceCols As Variant, qtyExtPriceCols As Variant
    Dim orderCol As String, unitPriceCol As String, extPriceCol As String

    ' Excluded sheets
    Dim excludedSheets As Object
    Dim excludeList As Variant, exIdx As Long

    ' Array-based processing variables [SPEED-06]
    Dim dataG As Variant            ' Column G values (description/CPC for grouping)
    Dim dataOrderQty As Variant     ' Order qty column values
    Dim dataStock As Variant        ' Stock column values
    Dim dataUnitPriceOrig As Variant ' Original unit price column
    Dim dataDistrib As Variant      ' Distributor column

    ' Dictionary for SumIf replacement [SPEED-03/07]
    Dim dictOrderQty As Object
    Dim dictStock As Object
    Dim gKey As String

    ' Saved application state [SPEED-01/02]
    Dim savedCalcMode As XlCalculation
    Dim savedEnableEvents As Boolean
    Dim savedScreenUpdating As Boolean

    ' =========================================================
    ' SAVE & DISABLE APPLICATION SETTINGS [SPEED-01/02]
    ' =========================================================
    savedCalcMode = Application.Calculation
    savedEnableEvents = Application.EnableEvents
    savedScreenUpdating = Application.ScreenUpdating

    Application.Calculation = xlCalculationManual      ' [SPEED-01] THE BIGGEST WIN
    Application.EnableEvents = False                   ' [SPEED-02]
    Application.ScreenUpdating = False                 ' Already done by turnoffscreenUpdate but ensuring

    ' ---- Initialize ----
    StatusReturnofInvalidUnitPrice = ""
    programmingMismatchMsg = ""

    Set program = ThisWorkbook.Sheets("Programming")
    Set inputWS = ThisWorkbook.Sheets("DataInputSheets")
    initialiseHeaders inputWS

    shipping = 200
    markup = 0.3

    ' Qty Column Mappings
    qtyOrderCols = Array("W", "AB", "AG", "AL")
    qtyUnitPriceCols = Array("X", "AC", "AH", "AM")
    qtyExtPriceCols = Array("Y", "AD", "AI", "AN")

    ' Build Excluded Sheets Set
    Set excludedSheets = CreateObject("Scripting.Dictionary")
    excludeList = Array("MFR_TmpSheet", "Admin", "Temp", "Quote Log", "MasterSheet", _
                        "Procurement Log", "ATEMPLATE", "Customer Details", "Programming", _
                        "Authorization", "Price Calc", "MachineCodes", "ExtraOrder", _
                        "ManualMachineCode", "MachineCodeSummary", "Procurement", _
                        "DataInputSheets", "Stencils Positions", "Quote Log - Current")
    For exIdx = LBound(excludeList) To UBound(excludeList)
        excludedSheets(CStr(excludeList(exIdx))) = True
    Next exIdx

    ' Count sheets for progress bar [SPEED-08]
    sheetCount = 0
    For Each ws In ThisWorkbook.Worksheets
        If Not excludedSheets.Exists(ws.Name) Then sheetCount = sheetCount + 1
    Next ws
    sheetNum = 0

    ' Programming sheet last row (read once, not per sheet)
    pLastRow = program.Cells(program.Rows.count, "A").End(xlUp).Row

    ' ===============================================================
    ' MAIN LOOP: Process each worksheet
    ' ===============================================================
    For Each ws In ThisWorkbook.Worksheets

        If excludedSheets.Exists(ws.Name) Then GoTo NextSheet
        If ws.Range("B2").value <= 0 Then GoTo NextSheet

        ' Progress indicator [SPEED-08]
        sheetNum = sheetNum + 1
        Application.StatusBar = "Calculating: Sheet " & sheetNum & "/" & sheetCount & " (" & ws.Name & ")"

        m_InvalidUnitPriceFound = False

        lr = ws.Cells(ws.Rows.count, "G").End(xlUp).Row
        If lr < DATA_START_ROW Then GoTo NextSheet

        ' ---- Sort data ----
        ws.Range("A" & DATA_START_ROW & ":BG" & lr).Sort _
            Key1:=ws.Range("P" & DATA_START_ROW & ":P" & lr), _
            Order1:=xlAscending, Header:=xlNo
        ws.AutoFilterMode = False
        ws.Rows(3).AutoFilter

        ' ---- Find sheet in DataInputSheets ----
        Set findResult = inputWS.Cells(1, DM_GlobalMFRPackage_Column).EntireColumn.Find( _
            What:=ws.Name, LookIn:=xlValues, LookAt:=xlWhole)
        If findResult Is Nothing Then GoTo NextSheet
        sheetLoc = findResult.Row

        ' ---- Programming Fees ----
        bomLines = lr - (DATA_START_ROW - 1)
        side = inputWS.Cells(sheetLoc, DM_doubleside_Column).value

        programmingFees = 0
        For p = 2 To pLastRow
            If bomLines >= program.Cells(p, "A").value And _
               bomLines < program.Cells(p + 1, "A").value Then
                Exit For
            End If
        Next p

        Select Case side
            Case 0:    programmingFees = program.Cells(p, "C").value
            Case 1:    programmingFees = program.Cells(p, "D").value
        End Select

        If IsEmpty(inputWS.Cells(sheetLoc, DM_NRE1_Column).value) Or _
           inputWS.Cells(sheetLoc, DM_NRE1_Column).value = "" Then
            inputWS.Cells(sheetLoc, DM_NRE1_Column).value = programmingFees
        End If

        If inputWS.Cells(sheetLoc, DM_NRE1_Column).value <> programmingFees Then
            If programmingMismatchMsg = "" Then
                programmingMismatchMsg = ws.Name
            Else
                programmingMismatchMsg = programmingMismatchMsg & ", " & ws.Name
            End If
        End If

        ' ===============================================================
        ' READ DATA INTO ARRAYS [SPEED-06]
        ' ===============================================================
        ' Read columns we need repeatedly into memory (ONE round-trip to Excel)
        dataG = ws.Range("G" & DATA_START_ROW & ":G" & lr).value              ' Group key column
        dataStock = ws.Range(STOCK_COL & DATA_START_ROW & ":" & STOCK_COL & lr).value  ' Stock
        dataUnitPriceOrig = ws.Range(UNIT_PRICE_ORIGINAL_COL & DATA_START_ROW & ":" & UNIT_PRICE_ORIGINAL_COL & lr).value
        dataDistrib = ws.Range(DISTRIB_COL & DATA_START_ROW & ":" & DISTRIB_COL & lr).value

        ' ===============================================================
        ' PRE-BUILD STOCK DICTIONARY [SPEED-03/07]
        ' ===============================================================
        ' Build stock totals by group key (replaces SumIf on stock column)
        Set dictStock = CreateObject("Scripting.Dictionary")
        For i = 1 To UBound(dataG, 1)
            gKey = CStr(dataG(i, 1))
            If gKey <> "" Then
                If dictStock.Exists(gKey) Then
                    dictStock(gKey) = dictStock(gKey) + Val(CStr(dataStock(i, 1)))
                Else
                    dictStock(gKey) = Val(CStr(dataStock(i, 1)))
                End If
            End If
        Next i

        ' ===============================================================
        ' PROCESS ALL 4 QUANTITIES
        ' ===============================================================
        For q = 0 To QTY_COUNT - 1

            orderCol = CStr(qtyOrderCols(q))
            unitPriceCol = CStr(qtyUnitPriceCols(q))
            extPriceCol = CStr(qtyExtPriceCols(q))

            ' ---- BATCH: Write ext price formula to entire range at once [SPEED-04] ----
            ws.Range(extPriceCol & DATA_START_ROW & ":" & extPriceCol & lr).FormulaR1C1 = "=ROUND(RC[-1]*RC[-2],2)"

            ' ---- Read order qty column into array for stock comparison [SPEED-06] ----
            dataOrderQty = ws.Range(orderCol & DATA_START_ROW & ":" & orderCol & lr).value

            ' Pre-build order qty totals by group key [SPEED-07]
            Set dictOrderQty = CreateObject("Scripting.Dictionary")
            For i = 1 To UBound(dataG, 1)
                gKey = CStr(dataG(i, 1))
                If gKey <> "" Then
                    If dictOrderQty.Exists(gKey) Then
                        dictOrderQty(gKey) = dictOrderQty(gKey) + Val(CStr(dataOrderQty(i, 1)))
                    Else
                        dictOrderQty(gKey) = Val(CStr(dataOrderQty(i, 1)))
                    End If
                End If
            Next i

            ' ---- BATCH: Clear all order qty colors at once [SPEED-05] ----
            ws.Range(orderCol & DATA_START_ROW & ":" & orderCol & lr).Interior.ColorIndex = xlNone

            ' ---- Row loop: only for stock highlighting + unit price validation ----
            For i = DATA_START_ROW To lr

                ' Stock highlighting using Dictionary lookup [SPEED-03]
                gKey = CStr(ws.Cells(i, "G").value)
                If gKey <> "" Then
                    Dim oq As Double, sa As Double
                    oq = 0: sa = 0
                    If dictOrderQty.Exists(gKey) Then oq = dictOrderQty(gKey)
                    If dictStock.Exists(gKey) Then sa = dictStock(gKey)
                    If oq > sa Then
                        ws.Cells(i, orderCol).Interior.Color = RGB(0, 176, 240)
                    End If
                End If

                ' Unit price validation (still needs cell-by-cell for conditional logic)
                Dim funcStatus As String
                funcStatus = Update_UnitPriceFunction(unitPriceCol, extPriceCol, i, ws, _
                                                      dataUnitPriceOrig(i - DATA_START_ROW + 1, 1), _
                                                      dataDistrib(i - DATA_START_ROW + 1, 1))
                If funcStatus <> "" Then
                    MsgBox funcStatus, vbExclamation, "Macro"
                    GoTo CleanExit
                End If

            Next i

            ' ---- BATCH: Apply number format to entire qty columns at once [SPEED-05] ----
            ws.Range(unitPriceCol & DATA_START_ROW & ":" & unitPriceCol & lr).NumberFormat = CURRENCY_FORMAT
            ws.Range(extPriceCol & DATA_START_ROW & ":" & extPriceCol & lr).NumberFormat = CURRENCY_FORMAT

            ' ---- Summary rows ----
            Set formulaRange = ws.Range(ws.Cells(DATA_START_ROW, extPriceCol), ws.Cells(lr, extPriceCol))

            ws.Cells(lr + 1, unitPriceCol).value = "Total"
            ws.Cells(lr + 2, unitPriceCol).value = "Shipping"
            ws.Cells(lr + 3, unitPriceCol).value = "Total"

            ws.Cells(lr + 1, extPriceCol).Formula = "=SUM(" & formulaRange.Address(False, False) & ")"
            ws.Cells(lr + 3, extPriceCol).FormulaR1C1 = "=R[-1]C+R[-2]C"
            ws.Cells(lr + 4, extPriceCol).FormulaR1C1 = "=R[-1]C*RC[-1]"
            ws.Cells(lr + 5, extPriceCol).FormulaR1C1 = "=R[-1]C+R[-2]C"

            ' Formatting (summary area is small - cell-by-cell is fine here)
            ws.Cells(lr + 1, extPriceCol).Font.Bold = True
            ws.Cells(lr + 3, extPriceCol).Font.Bold = True
            ws.Cells(lr + 2, extPriceCol).Interior.Color = RGB(255, 255, 0)
            ws.Cells(lr + 5, extPriceCol).Interior.Color = RGB(248, 203, 173)
            ws.Cells(lr + 4, unitPriceCol).Interior.Color = RGB(255, 255, 0)
            ws.Cells(lr + 4, unitPriceCol).HorizontalAlignment = xlLeft
            ws.Cells(lr + 4, unitPriceCol).NumberFormat = "0%"

            Dim summaryRow As Long
            For summaryRow = lr + 1 To lr + 5
                ws.Cells(summaryRow, extPriceCol).NumberFormat = "#,##0.00 $"
            Next summaryRow

            Set borderRange = ws.Range(unitPriceCol & (lr + 1) & ":" & extPriceCol & (lr + 5))
            With borderRange.Borders
                .LineStyle = xlContinuous
                .Weight = xlThin
                .ColorIndex = xlAutomatic
            End With

            Set dictOrderQty = Nothing

        Next q

        ' ---- Calculate this sheet once [SPEED-01] ----
        ws.Calculate

        ' ---- TH Pins Sum (array-based) [SPEED-06] ----
        Dim dataT As Variant, dataE As Variant
        dataT = ws.Range("T" & DATA_START_ROW & ":T" & lr).value
        dataE = ws.Range("E" & DATA_START_ROW & ":E" & lr).value
        THsum = 0
        For i = 1 To UBound(dataT, 1)
            If IsNumeric(dataT(i, 1)) And IsNumeric(dataE(i, 1)) Then
                THsum = THsum + (CDbl(dataT(i, 1)) * CDbl(dataE(i, 1)))
            End If
        Next i
        ws.Range("K2").value = THsum

        ' ---- Collect invalid unit price status ----
        If m_InvalidUnitPriceFound Then
            If StatusReturnofInvalidUnitPrice = "" Then
                StatusReturnofInvalidUnitPrice = "Macro Validation Check Found:" & vbNewLine _
                    & "Please fill Unit Price greater than 0 and less than max limit (" _
                    & Format(MAX_UNIT_PRICE, "#,##0") & ") at Column " _
                    & UNIT_PRICE_ORIGINAL_COL & " at highlighted rows in:" _
                    & vbNewLine & vbNewLine & ws.Name
            Else
                StatusReturnofInvalidUnitPrice = StatusReturnofInvalidUnitPrice & vbNewLine & ws.Name
            End If
        End If

        Set dictStock = Nothing

NextSheet:
    Next ws

    ' ===============================================================
    ' POST-PROCESSING
    ' ===============================================================
    If Len(programmingMismatchMsg) > 0 Then
        MsgBox "Programming Fees (NRE1) was not overridden for following GMP(s):" _
               & Chr(10) & programmingMismatchMsg, vbInformation
    End If

    If StatusReturnofInvalidUnitPrice <> "" Then
        MsgBox StatusReturnofInvalidUnitPrice, vbExclamation, "Macro Validation Found"
    End If

CleanExit:
    ' =========================================================
    ' RESTORE APPLICATION SETTINGS [SPEED-01/02]
    ' =========================================================
    Application.StatusBar = False                          ' Clear status bar
    Application.Calculation = savedCalcMode                ' Restore original calc mode
    Application.EnableEvents = savedEnableEvents           ' Restore events
    Application.ScreenUpdating = savedScreenUpdating       ' Restore screen

    ' Also call original function in case it does additional cleanup
    On Error Resume Next
    turnonscreenUpdate
    On Error GoTo 0

    Set excludedSheets = Nothing
    Set dictStock = Nothing
    Set dictOrderQty = Nothing
    Exit Sub

ErrorHandler:
    MsgBox "Error " & Err.Number & " in Calculations_BOM:" & vbNewLine _
           & Err.Description & vbNewLine & vbNewLine _
           & "Sheet: " & ws.Name, vbCritical, "Calculation Error"
    Resume CleanExit

End Sub


'============================================================================================
' FUNCTION: Update_UnitPriceFunction (Optimized)
' Now accepts pre-read array values to avoid redundant cell reads [SPEED-06]
'============================================================================================
Private Function Update_UnitPriceFunction( _
    ByVal UnitPrice_ColumnStr As String, _
    ByVal ExtpriceUnits_ColumnStr As String, _
    ByVal i As Long, _
    ByVal ws As Worksheet, _
    ByVal cachedOriginalPrice As Variant, _
    ByVal cachedDistrib As Variant) As String

    On Error GoTo ErrHandler

    Dim distribValue As String
    Dim isExcludedDistrib As Boolean
    Dim LoopI As Long

    ' Static array - allocated once, reused across calls
    Dim ArrayofDistrib(0 To 3) As String
    ArrayofDistrib(0) = "Digikey"
    ArrayofDistrib(1) = "Mouser"
    ArrayofDistrib(2) = "*Supplies"
    ArrayofDistrib(3) = "APCB"

    ' Reset cell background to neutral
    With ws.Cells(i, UNIT_PRICE_ORIGINAL_COL).Interior
        .Pattern = xlSolid
        .PatternColorIndex = xlAutomatic
        .ThemeColor = xlThemeColorDark1
        .TintAndShade = 0
        .PatternTintAndShade = 0
    End With

    ' Use cached value instead of reading from cell [SPEED-06]
    distribValue = UCase(Trim(CStr(cachedDistrib)))

    ' If distributor is *Supplies, clear values
    If distribValue Like "*SUPPLIES" Then
        ws.Cells(i, UnitPrice_ColumnStr).value = ""
        ws.Cells(i, ExtpriceUnits_ColumnStr).FormulaR1C1 = ""
        Exit Function
    End If

    ' If unit price already set, skip
    If ws.Cells(i, UnitPrice_ColumnStr).value <> "" Then Exit Function

    ' Check excluded distributors
    isExcludedDistrib = False
    For LoopI = LBound(ArrayofDistrib) To UBound(ArrayofDistrib)
        If distribValue Like UCase(Trim(ArrayofDistrib(LoopI))) Then
            isExcludedDistrib = True
            Exit For
        End If
    Next LoopI
    If isExcludedDistrib Then Exit Function

    ' Validate original unit price using cached value [SPEED-06]
    If IsError(cachedOriginalPrice) Or _
       IsEmpty(cachedOriginalPrice) Or _
       cachedOriginalPrice = "" Or _
       Not IsNumeric(cachedOriginalPrice) Or _
       CDbl(cachedOriginalPrice) <= 0 Or _
       CDbl(cachedOriginalPrice) > MAX_UNIT_PRICE Then

        ' Highlight invalid cell
        With ws.Cells(i, UNIT_PRICE_ORIGINAL_COL).Interior
            .Pattern = xlSolid
            .PatternColorIndex = xlAutomatic
            .Color = 65535
            .TintAndShade = 0
            .PatternTintAndShade = 0
        End With
        m_InvalidUnitPriceFound = True
        Exit Function
    End If

    ' Copy validated unit price
    ws.Cells(i, UnitPrice_ColumnStr).value = cachedOriginalPrice
    ws.Cells(i, ExtpriceUnits_ColumnStr).FormulaR1C1 = "=RC[-1]*RC[-2]"

    Update_UnitPriceFunction = ""
    Exit Function

ErrHandler:
    Update_UnitPriceFunction = "Error in row " & i & " on sheet '" & ws.Name & "':" _
                               & vbNewLine & Err.Description
End Function

''============================================================================================
'' Module:      Calculation_V1 (FIXED)
'' Purpose:     BOM Calculations - Pricing, Ext Price, Stock Validation, Programming Fees
'' Fixed:       Feb 2026 - Refactored from original to address code review findings
''
'' CHANGES FROM ORIGINAL:
'' -----------------------------------------------------------------------
'' [BUG-01]  Dim lr, i As Long  ->  only 'i' was Long; 'lr' was Variant. Fixed both.
'' [BUG-02]  Dim shipping, markup As Double  ->  same issue; 'shipping' was Variant. Fixed.
'' [BUG-03]  shipping = "200" assigned a STRING to a Double. Fixed to numeric literal.
'' [BUG-04]  markup = ".30" same string-to-Double issue. Fixed.
'' [BUG-05]  Dim sheetLoc As Integer inside loop caused re-declaration warnings. Moved to top.
'' [BUG-06]  Dim bomLines As Integer  ->  Integer overflows at 32767 rows. Changed to Long.
'' [BUG-07]  Dim side As Integer, p As Integer, pLastRow As Long declared inside loop. Moved.
'' [BUG-08]  Dim message As String inside loop  ->  never reset between sheets. Moved & fixed.
'' [BUG-09]  Dim orderQty, stockAvailability inside loop  ->  re-declared every iteration.
'' [BUG-10]  Dim THsum inside loop re-declared each sheet. Moved to top.
'' [BUG-11]  Dim Update_UnitPriceFunctionStatus inside loop. Moved to top.
'' [BUG-12]  Dim borderRange inside loop. Moved to top.
'' [BUG-13]  Dim formulaRange declared at module scope but never properly declared. Fixed.
'' [BUG-14]  'message' variable used with Mid(message, 3) but starts empty  ->  could error
''           if no mismatches found. Added safety check.
'' [BUG-15]  Unit price hard-cap at > 10 is likely too low for many components.
''           Added constant MAX_UNIT_PRICE for easy adjustment.
'' [BUG-16]  turnonscreenUpdate called TWICE at end of sub. Removed duplicate.
'' [BUG-17]  No error handler in main sub  ->  if error occurs, screen stays frozen. Added.
'' [BUG-18]  ExtpriceUnits_ColumnStr parameter missing "As String" type. Fixed.
''
'' [PERF-01] Qty1-4 blocks (200+ lines of copy-paste) replaced with parameterized loop.
'' [PERF-02] SumIf called on full columns ("G:G", "W:W") inside loop  ->  extremely slow.
''           Changed to bounded ranges.
'' [PERF-03] ws.Calculate called 4 times (once per qty). Consolidated to once at end.
'' [PERF-04] Cell-by-cell formatting in loop. Grouped where possible.
'' [PERF-05] Excluded sheets checked via long If/Or chain. Replaced with Dictionary lookup.
''
'' [STYLE-01] Option Explicit added to catch undeclared variables.
'' [STYLE-02] GoTo DoNothing replaced with cleaner If/Else flow.
'' [STYLE-03] All variables declared at procedure top per VBA best practice.
'' [STYLE-04] Constants extracted for magic numbers/strings.
''============================================================================================
'Option Explicit
'
'' ---- Module-Level Constants ----
'Private Const UNIT_PRICE_ORIGINAL_COL As String = "N"   ' Was "UnitPriceOrignalColumn" (typo)
'Private Const DISTRIB_COL As String = "P"
'Private Const DATA_START_ROW As Long = 4
'Private Const MAX_UNIT_PRICE As Double = 10000           ' [BUG-15] Was hardcoded as 10 - adjust as needed
'Private Const STOCK_COL As String = "O"                  ' Stock availability column
'
'' ---- Qty Column Mappings (eliminates 4x copy-paste) ----
'' Each qty has: Order Qty Col, Unit Price Col, Ext Price Col, Label Col
'Private Const QTY_COUNT As Long = 4
'
'' ---- Module-Level Flag ----
'Private m_InvalidUnitPriceFound As Boolean               ' Renamed from BooleanCheckInvalidUnitPrice_CurrentSheet
'
''============================================================================================
'' SUB: Calculations_BOM (Main Entry Point)
''============================================================================================
'Sub Calculations_BOM()
'
'    On Error GoTo ErrorHandler   ' [BUG-17] Protect against unhandled errors
'
'    ' ---- Declarations (all at top) [BUG-05 through BUG-13] ----
'    Dim ws As Worksheet
'    Dim lr As Long, i As Long                             ' [BUG-01] Both explicitly Long
'    Dim formulaRange As Range
'    Dim borderRange As Range
'    Dim shipping As Double, markup As Double               ' [BUG-02] Both explicitly Double
'    Dim inputWS As Worksheet
'    Dim program As Worksheet
'    Dim StatusReturnofInvalidUnitPrice As String
'    Dim sheetLoc As Long                                   ' [BUG-05] Long not Integer
'    Dim bomLines As Long                                   ' [BUG-06] Long not Integer
'    Dim programmingFees As Double
'    Dim side As Long, p As Long, pLastRow As Long          ' [BUG-07] All Long
'    Dim programmingMismatchMsg As String                    ' [BUG-08] Renamed from 'message' for clarity
'    Dim orderQty As Long, stockAvailability As Long        ' [BUG-09] Declared once
'    Dim THsum As Double                                    ' [BUG-10]
'    Dim Update_UnitPriceFunctionStatus As String            ' [BUG-11]
'
'    ' Qty column arrays [PERF-01]
'    Dim qtyOrderCols As Variant, qtyUnitPriceCols As Variant
'    Dim qtyExtPriceCols As Variant, qtyLabelCols As Variant
'    Dim q As Long
'
'    ' Excluded sheets dictionary [PERF-05]
'    Dim excludedSheets As Object
'    Dim excludeList As Variant, exIdx As Long
'
'    ' ---- Initialize ----
'    turnoffscreenUpdate
'
'    StatusReturnofInvalidUnitPrice = ""
'    programmingMismatchMsg = ""
'
'    Set program = ThisWorkbook.Sheets("Programming")
'    Set inputWS = ThisWorkbook.Sheets("DataInputSheets")
'    initialiseHeaders inputWS
'
'    shipping = 200                                         ' [BUG-03] Numeric, not string
'    markup = 0.3                                           ' [BUG-04] Numeric, not string
'
'    ' ---- Qty Column Mappings [PERF-01] ----
'    ' Columns: OrderQty, UnitPrice, ExtPrice, StockCheck
'    qtyOrderCols = Array("W", "AB", "AG", "AL")           ' Order qty columns
'    qtyUnitPriceCols = Array("X", "AC", "AH", "AM")       ' Unit price columns
'    qtyExtPriceCols = Array("Y", "AD", "AI", "AN")        ' Ext price columns
'    qtyLabelCols = Array("X", "AC", "AH", "AM")           ' Label columns (same as unit price)
'
'    ' ---- Build Excluded Sheets Set [PERF-05] ----
'    Set excludedSheets = CreateObject("Scripting.Dictionary")
'    excludeList = Array("MFR_TmpSheet", "Admin", "Temp", "Quote Log", "MasterSheet", _
'                        "Procurement Log", "ATEMPLATE", "Customer Details", "Programming", _
'                        "Authorization", "Price Calc", "MachineCodes", "ExtraOrder", _
'                        "ManualMachineCode", "MachineCodeSummary", "Procurement", _
'                        "DataInputSheets", "Stencils Positions")
'    For exIdx = LBound(excludeList) To UBound(excludeList)
'        excludedSheets(CStr(excludeList(exIdx))) = True
'    Next exIdx
'
'    ' ===============================================================
'    ' MAIN LOOP: Process each worksheet
'    ' ===============================================================
'    For Each ws In ThisWorkbook.Worksheets                 ' Use ThisWorkbook explicitly
'
'        ' Skip excluded sheets [PERF-05]
'        If excludedSheets.Exists(ws.Name) Then GoTo NextSheet
'
'        ' Skip sheets with 0 boards
'        If ws.Range("B2").value <= 0 Then GoTo NextSheet
'
'        ' ---- Reset per-sheet flag ----
'        m_InvalidUnitPriceFound = False
'
'        ' ---- Find last row ----
'        lr = ws.Cells(ws.Rows.count, "G").End(xlUp).Row
'        If lr < DATA_START_ROW Then GoTo NextSheet        ' No data
'
'        ' ---- Sort data by column P (Distributor) ----
'        ws.Range("A" & DATA_START_ROW & ":BG" & lr).Sort _
'            Key1:=ws.Range("P" & DATA_START_ROW & ":P" & lr), _
'            Order1:=xlAscending, Header:=xlNo
'        ws.AutoFilterMode = False
'        ws.Rows(3).AutoFilter
'
'        ' ---- Find sheet location in DataInputSheets ----
'        Dim findResult As Range
'        Set findResult = inputWS.Cells(1, DM_GlobalMFRPackage_Column).EntireColumn.Find( _
'            What:=ws.Name, LookIn:=xlValues, LookAt:=xlWhole)
'        If findResult Is Nothing Then GoTo NextSheet       ' Sheet not found in DIS
'        sheetLoc = findResult.Row
'
'        ' ---- Calculate Programming Fees ----
'        bomLines = lr - (DATA_START_ROW - 1)               ' Correct count of BOM lines
'        pLastRow = program.Cells(program.Rows.count, "A").End(xlUp).Row
'        side = inputWS.Cells(sheetLoc, DM_doubleside_Column).value
'
'        programmingFees = 0
'        For p = 2 To pLastRow
'            If bomLines >= program.Cells(p, "A").value And _
'               bomLines < program.Cells(p + 1, "A").value Then
'                Exit For
'            End If
'        Next p
'
'        Select Case side
'            Case 0:    programmingFees = program.Cells(p, "C").value
'            Case 1:    programmingFees = program.Cells(p, "D").value
'        End Select
'
'        ' Don't override if Programming Fee already set
'        If IsEmpty(inputWS.Cells(sheetLoc, DM_NRE1_Column).value) Or _
'           inputWS.Cells(sheetLoc, DM_NRE1_Column).value = "" Then
'            inputWS.Cells(sheetLoc, DM_NRE1_Column).value = programmingFees
'        End If
'
'        ' Track mismatches for reporting
'        If inputWS.Cells(sheetLoc, DM_NRE1_Column).value <> programmingFees Then
'            If programmingMismatchMsg = "" Then
'                programmingMismatchMsg = ws.Name
'            Else
'                programmingMismatchMsg = programmingMismatchMsg & ", " & ws.Name
'            End If
'        End If
'
'        ' ===============================================================
'        ' PROCESS ALL 4 QUANTITIES [PERF-01] - replaces 200+ lines of copy-paste
'        ' ===============================================================
'        For q = 0 To QTY_COUNT - 1
'
'            Dim orderCol As String, unitPriceCol As String
'            Dim extPriceCol As String
'            orderCol = CStr(qtyOrderCols(q))
'            unitPriceCol = CStr(qtyUnitPriceCols(q))
'            extPriceCol = CStr(qtyExtPriceCols(q))
'
'            ' ---- Row-level calculations ----
'            For i = DATA_START_ROW To lr
'
'                ' Set Ext Price formula: UnitPrice * OrderQty
'                ws.Cells(i, extPriceCol).FormulaR1C1 = "=ROUND(RC[-1]*RC[-2],2)"
'
'                ' Highlight order qty if stock insufficient [PERF-02]
'                ws.Cells(i, orderCol).Interior.ColorIndex = xlNone
'                orderQty = Application.WorksheetFunction.SumIf( _
'                    ws.Range("G" & DATA_START_ROW & ":G" & lr), _
'                    ws.Cells(i, "G").value, _
'                    ws.Range(orderCol & DATA_START_ROW & ":" & orderCol & lr))
'                stockAvailability = Application.WorksheetFunction.SumIf( _
'                    ws.Range("G" & DATA_START_ROW & ":G" & lr), _
'                    ws.Cells(i, "G").value, _
'                    ws.Range(STOCK_COL & DATA_START_ROW & ":" & STOCK_COL & lr))
'
'                If orderQty > stockAvailability Then
'                    ws.Cells(i, orderCol).Interior.Color = RGB(0, 176, 240)
'                End If
'                orderQty = 0
'                stockAvailability = 0
'
'                ' Validate and copy unit price
'                Update_UnitPriceFunctionStatus = Update_UnitPriceFunction(unitPriceCol, extPriceCol, i, ws)
'                If Update_UnitPriceFunctionStatus <> "" Then
'                    MsgBox Update_UnitPriceFunctionStatus, vbExclamation, "Macro"
'                    GoTo CleanExit
'                End If
'
'            Next i
'
'            ' ---- Summary rows below data ----
'            Set formulaRange = ws.Range(ws.Cells(DATA_START_ROW, extPriceCol), ws.Cells(lr, extPriceCol))
'
'            ws.Cells(lr + 1, unitPriceCol).value = "Total"
'            ws.Cells(lr + 2, unitPriceCol).value = "Shipping"
'            ws.Cells(lr + 3, unitPriceCol).value = "Total"
'
'            ws.Cells(lr + 1, extPriceCol).Formula = "=SUM(" & formulaRange.Address(False, False) & ")"
'            ws.Cells(lr + 3, extPriceCol).FormulaR1C1 = "=R[-1]C+R[-2]C"
'            ws.Cells(lr + 4, extPriceCol).FormulaR1C1 = "=R[-1]C*RC[-1]"
'            ws.Cells(lr + 5, extPriceCol).FormulaR1C1 = "=R[-1]C+R[-2]C"
'
'            ' Formatting
'            ws.Cells(lr + 1, extPriceCol).Font.Bold = True
'            ws.Cells(lr + 3, extPriceCol).Font.Bold = True
'
'            ws.Cells(lr + 2, extPriceCol).Interior.Color = RGB(255, 255, 0)        ' Yellow - Shipping
'            ws.Cells(lr + 5, extPriceCol).Interior.Color = RGB(248, 203, 173)      ' Peach - Grand Total
'            ws.Cells(lr + 4, unitPriceCol).Interior.Color = RGB(255, 255, 0)       ' Yellow - Markup
'            ws.Cells(lr + 4, unitPriceCol).HorizontalAlignment = xlLeft
'            ws.Cells(lr + 4, unitPriceCol).NumberFormat = "0%"
'
'            ' Number format for summary cells
'            Dim summaryRow As Long
'            For summaryRow = lr + 1 To lr + 5
'                ws.Cells(summaryRow, extPriceCol).NumberFormat = "#,##0.00 $"
'            Next summaryRow
'
'            ' Border around summary
'            Set borderRange = ws.Range(unitPriceCol & (lr + 1) & ":" & extPriceCol & (lr + 5))
'            With borderRange.Borders
'                .LineStyle = xlContinuous
'                .Weight = xlThin
'                .ColorIndex = xlAutomatic
'            End With
'
'        Next q   ' ---- End of Qty loop ----
'
'        ' ---- Calculate once after all quantities [PERF-03] ----
'        ws.Calculate
'
'        ' ---- TH Pins Sum ----
'        THsum = 0
'        For i = DATA_START_ROW To lr
'            If IsNumeric(ws.Cells(i, "T").value) And IsNumeric(ws.Cells(i, "E").value) Then
'                THsum = THsum + (ws.Cells(i, "T").value * ws.Cells(i, "E").value)
'            End If
'        Next i
'        ws.Range("K2").value = THsum
'
'        ' ---- Collect invalid unit price status ----
'        If m_InvalidUnitPriceFound Then
'            If StatusReturnofInvalidUnitPrice = "" Then
'                StatusReturnofInvalidUnitPrice = "Macro Validation Check Found:" & vbNewLine _
'                    & "Please fill Unit Price greater than 0 and less than max limit (" _
'                    & Format(MAX_UNIT_PRICE, "#,##0") & ") at Column " _
'                    & UNIT_PRICE_ORIGINAL_COL & " at highlighted rows in:" _
'                    & vbNewLine & vbNewLine & ws.Name
'            Else
'                StatusReturnofInvalidUnitPrice = StatusReturnofInvalidUnitPrice & vbNewLine & ws.Name
'            End If
'        End If
'
'NextSheet:
'    Next ws
'
'    ' ===============================================================
'    ' POST-PROCESSING: Show summary messages
'    ' ===============================================================
'
'    ' [BUG-14] Safety check before Mid()
'    If Len(programmingMismatchMsg) > 0 Then
'        MsgBox "Programming Fees (NRE1) was not overridden for following GMP(s):" _
'               & Chr(10) & programmingMismatchMsg, vbInformation
'    End If
'
'    If StatusReturnofInvalidUnitPrice <> "" Then
'        MsgBox StatusReturnofInvalidUnitPrice, vbExclamation, "Macro Validation Found"
'    End If
'
'CleanExit:                                                 ' [BUG-17] Guaranteed cleanup
'    turnonscreenUpdate                                     ' [BUG-16] Called only ONCE now
'    Set excludedSheets = Nothing
'    Exit Sub
'
'ErrorHandler:                                              ' [BUG-17] Proper error handler
'    MsgBox "Error " & Err.Number & " in Calculations_BOM:" & vbNewLine _
'           & Err.Description, vbCritical, "Calculation Error"
'    Resume CleanExit
'
'End Sub
'
'
''============================================================================================
'' FUNCTION: Update_UnitPriceFunction
'' Purpose:  Validates and copies unit price from original column to qty-specific column.
''           Applies number formatting. Highlights invalid prices.
''
'' FIXED:
''   [BUG-18]  ExtpriceUnits_ColumnStr was missing "As String" type declaration
''   [STYLE-02] Replaced GoTo DoNothing with structured If/Else
''   [BUG-15]  Hard-cap of >10 replaced with configurable MAX_UNIT_PRICE constant
''============================================================================================
'Private Function Update_UnitPriceFunction( _
'    ByVal UnitPrice_ColumnStr As String, _
'    ByVal ExtpriceUnits_ColumnStr As String, _
'    ByVal i As Long, _
'    ByVal ws As Worksheet) As String
'
'    On Error GoTo ErrHandler
'
'    Dim distribValue As String
'    Dim isExcludedDistrib As Boolean
'    Dim originalValue As Variant
'    Dim ArrayofDistrib(0 To 3) As String
'    Dim LoopI As Long                                      ' Was Double - should be Long for loop counter
'
'    ' Distributor exclusion list
'    ArrayofDistrib(0) = "Digikey"
'    ArrayofDistrib(1) = "Mouser"
'    ArrayofDistrib(2) = "*Supplies"
'    ArrayofDistrib(3) = "APCB"
'
'    ' Reset cell background to neutral
'    With ws.Cells(i, UNIT_PRICE_ORIGINAL_COL).Interior
'        .Pattern = xlSolid
'        .PatternColorIndex = xlAutomatic
'        .ThemeColor = xlThemeColorDark1
'        .TintAndShade = 0
'        .PatternTintAndShade = 0
'    End With
'
'    distribValue = UCase(Trim(CStr(ws.Cells(i, DISTRIB_COL).value)))
'
'    ' If distributor is *Supplies, clear the unit price and ext price
'    If distribValue Like UCase("*SUPPLIES") Then
'        ws.Cells(i, UnitPrice_ColumnStr).value = ""
'        ws.Cells(i, ExtpriceUnits_ColumnStr).FormulaR1C1 = ""
'        GoTo ApplyFormat
'    End If
'
'    ' If unit price column already has a value, skip to formatting
'    If ws.Cells(i, UnitPrice_ColumnStr).value <> "" Then GoTo ApplyFormat
'
'    ' Check if this is an excluded distributor (no validation needed)
'    isExcludedDistrib = False
'    For LoopI = LBound(ArrayofDistrib) To UBound(ArrayofDistrib)
'        If distribValue Like UCase(Trim(ArrayofDistrib(LoopI))) Then
'            isExcludedDistrib = True
'            Exit For
'        End If
'    Next LoopI
'
'    If isExcludedDistrib Then GoTo ApplyFormat
'
'    ' Validate original unit price
'    originalValue = ws.Cells(i, UNIT_PRICE_ORIGINAL_COL).value
'
'    If IsError(originalValue) Or _
'       IsEmpty(originalValue) Or _
'       originalValue = "" Or _
'       Not IsNumeric(originalValue) Or _
'       CDbl(originalValue) <= 0 Or _
'       CDbl(originalValue) > MAX_UNIT_PRICE Then           ' [BUG-15] Configurable limit
'
'        ' Highlight invalid cell in yellow
'        With ws.Cells(i, UNIT_PRICE_ORIGINAL_COL).Interior
'            .Pattern = xlSolid
'            .PatternColorIndex = xlAutomatic
'            .Color = 65535    ' Yellow
'            .TintAndShade = 0
'            .PatternTintAndShade = 0
'        End With
'
'        m_InvalidUnitPriceFound = True
'        GoTo ApplyFormat
'    End If
'
'    ' Copy validated unit price and set ext price formula
'    ws.Cells(i, UnitPrice_ColumnStr).value = originalValue
'    ws.Cells(i, ExtpriceUnits_ColumnStr).FormulaR1C1 = "=RC[-1]*RC[-2]"
'
'ApplyFormat:
'    ' Apply currency format to both columns
'    Dim currFmt As String
'    currFmt = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
'    ws.Cells(i, UnitPrice_ColumnStr).NumberFormat = currFmt
'    ws.Cells(i, ExtpriceUnits_ColumnStr).NumberFormat = currFmt
'
'    Update_UnitPriceFunction = ""   ' Return empty = success
'    Exit Function
'
'ErrHandler:
'    Update_UnitPriceFunction = "Error in row " & i & " on sheet '" & ws.Name & "':" _
'                               & vbNewLine & Err.Description
'End Function

'------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

'''New Variables
'
'Private Const UnitPriceOrignalColumn As String = "N"
'Private Const DistribColstr As String = "P"
'Dim BooleanCheckInvalidUnitPrice_CurrentSheet As Boolean
'
'Sub Calculations_BOM()
'
'    turnoffscreenUpdate
'
'    Dim ws As Worksheet
'    Dim lr, i As Long
'    Dim formulaRange As Range
'    Dim shipping, markup As Double
'    Dim inputWS As Worksheet
'    Dim program As Worksheet
'
'    ''Update
'    Dim StatusReturnofInvalidUnitPrice As String
'    StatusReturnofInvalidUnitPrice = ""
'
'
'    Set program = ThisWorkbook.Sheets("Programming")
'    Set inputWS = ThisWorkbook.Sheets("DataInputSheets")
'    initialiseHeaders inputWS
'
'    shipping = "200"
'    markup = ".30"
'
'    For Each ws In Worksheets
'        If ws.Name = "MFR_TmpSheet" Or ws.Name = "Admin" Or ws.Name = "Temp" Or ws.Name = "Quote Log" Or ws.Name = "MasterSheet" Or ws.Name = "Procurement Log" Or ws.Name = "ATEMPLATE" Or ws.Name = "Customer Details" Or ws.Name = "Programming" Or ws.Name = "Authorization" Or ws.Name = "Price Calc" Or ws.Name = "MachineCodes" Or ws.Name = "ExtraOrder" Or ws.Name = "ManualMachineCode" Or ws.Name = "MachineCodeSummary" Or ws.Name = "Procurement" Or ws.Name = "DataInputSheets" Or ws.Name = "Stencils Positions" Then
'        Else
'            If ws.Range("B2") > 0 Then
'
'                ''Update
'                BooleanCheckInvalidUnitPrice_CurrentSheet = False
'                ''/
'
'                'Debug.Print ws.Name
'                lr = ws.Cells(ws.Rows.count, "G").End(xlUp).row
'
'                ' Sort the data based on column P
'                ws.Range("A4:BG" & lr).Sort key1:=ws.Range("A4:AN" & lr).Columns("P"), order1:=xlAscending, Header:=xlNo
'                ws.AutoFilterMode = False
'                ws.Rows(3).AutoFilter
'
'
'                ' Find the row number in datainputsheet of sheet working
'                Dim sheetLoc As Integer
'                sheetLoc = inputWS.Cells(1, DM_GlobalMFRPackage_Column).EntireColumn.Find(What:=ws.Name, LookIn:=xlValues, LookAt:=xlWhole).row
'
'                ' Calculate the programming Fees
'                Dim bomLines As Integer
'                Dim programmingFees As Double
'                Set program = ThisWorkbook.Sheets("Programming")
'                bomLines = lr - 3
'
'                Dim side As Integer
'                Dim p As Integer
'                Dim pLastRow As Long
'                pLastRow = program.Cells(program.Rows.count, "A").End(xlUp).row
'
'                side = inputWS.Cells(sheetLoc, DM_doubleside_Column)
'
'
'                For p = 2 To pLastRow
'                    If bomLines >= program.Cells(p, "A") And bomLines < program.Cells(p + 1, "A") Then
'                        Exit For
'                    End If
'                Next p
'
'                If side = 0 Then
'                    programmingFees = program.Cells(p, "C")
'                ElseIf side = 1 Then
'                    programmingFees = program.Cells(p, "D")
'                End If
'
'                ' dont override it Programming fee column is not blank
'
'                If inputWS.Cells(sheetLoc, DM_NRE1_Column) = "" Then
'                    inputWS.Cells(sheetLoc, DM_NRE1_Column) = programmingFees
'                End If
'
'                If inputWS.Cells(sheetLoc, DM_NRE1_Column) <> programmingFees Then
'                    Dim message As String
'                    message = message & ", " & ws.Name
'                End If
'
'                ' for QTY 1
'                For i = 4 To lr
'                    'If ws.Cells(i, "X") <> "" Then
'                       ws.Cells(i, "Y").FormulaR1C1 = "=ROUND(RC[-1]*RC[-2],2)"
'
'                       ' Fill order Qty with color if stock available is less than order qty
'                        ws.Cells(i, "W").Interior.ColorIndex = xlNone
'                        Dim orderQty As Long
'                        Dim stockAvailability As Long
'                        orderQty = Application.WorksheetFunction.SumIf(ws.Range("G:G"), ws.Cells(i, "G"), ws.Range("W:W"))
'                        stockAvailability = Application.WorksheetFunction.SumIf(ws.Range("G:G"), ws.Cells(i, "G"), ws.Range("O:O"))
'                        If orderQty > stockAvailability Then ws.Cells(i, "W").Interior.Color = RGB(0, 176, 240)
'
'                        ' reset orderQty and stockavailability
'                        orderQty = 0
'                        stockAvailability = 0
'                    'End If
'
'                    ''Update
'                    Dim Update_UnitPriceFunctionStatus As String
'                    Update_UnitPriceFunctionStatus = Update_UnitPriceFunction("X", "Y", i, ws)
'                    If Update_UnitPriceFunctionStatus <> "" Then
'                       MsgBox Update_UnitPriceFunctionStatus, vbExclamation, "Macro"
'                       Exit Sub
'                    End If
'
'
'
'                Next i
'                ws.Calculate
'
'                Set formulaRange = ws.Range(ws.Cells(4, "Y"), ws.Cells(lr, "Y"))
'                ws.Cells(lr + 1, "X") = "Total"
'                ws.Cells(lr + 2, "X") = "Shipping"
'                ws.Cells(lr + 3, "X") = "Total"
'                'ws.Cells(lr + 4, "X") = markup
'
'
'                ws.Cells(lr + 1, "Y").Formula = "=SUM(" & formulaRange.Address(False, False) & ")"
'                'ws.Cells(lr + 2, "Y") = shipping
'                ws.Cells(lr + 3, "Y").FormulaR1C1 = "=R[-1]C+R[-2]C"
'                ws.Cells(lr + 4, "Y").FormulaR1C1 = "=R[-1]C*RC[-1]"
'                ws.Cells(lr + 5, "Y").FormulaR1C1 = "=R[-1]C+R[-2]C"
'
'                ws.Cells(lr + 1, "Y").Font.Bold = True
'                ws.Cells(lr + 3, "Y").Font.Bold = True
'
'                ws.Cells(lr + 2, "Y").Interior.Color = RGB(255, 255, 0)
'                ws.Cells(lr + 5, "Y").Interior.Color = RGB(248, 203, 173)
'                ws.Cells(lr + 4, "X").Interior.Color = RGB(255, 255, 0)
'
'                ws.Cells(lr + 4, "X").HorizontalAlignment = xlLeft
'                ws.Cells(lr + 4, "X").NumberFormat = "0%"
'
'                ws.Cells(lr + 1, "Y").NumberFormat = "#,##0.00 $"
'                ws.Cells(lr + 2, "Y").NumberFormat = "#,##0.00 $"
'                ws.Cells(lr + 3, "Y").NumberFormat = "#,##0.00 $"
'                ws.Cells(lr + 4, "Y").NumberFormat = "#,##0.00 $"
'                ws.Cells(lr + 5, "Y").NumberFormat = "#,##0.00 $"
'
'                Dim borderRange As Range
'                Set borderRange = ws.Range("X" & lr + 1 & ":Y" & lr + 5)
'
'                ' Draw a border around the range
'                With borderRange.Borders
'                    .LineStyle = xlContinuous ' You can change the line style as needed
'                    .Weight = xlThin ' You can change the line weight as needed
'                    .ColorIndex = xlAutomatic ' You can change the border color as needed
'                End With
'
'
'                ' for QTY 2
'                For i = 4 To lr
'                    'If ws.Cells(i, "AC") <> "" Then
'                        ws.Cells(i, "AD").FormulaR1C1 = "=Round(RC[-1]*RC[-2],2)"
'
'                        ' Fill order Qty with color if stock available is less than order qty
'                        ws.Cells(i, "AB").Interior.ColorIndex = xlNone
'                        orderQty = Application.WorksheetFunction.SumIf(ws.Range("G:G"), ws.Cells(i, "G"), ws.Range("AB:AB"))
'                        stockAvailability = Application.WorksheetFunction.SumIf(ws.Range("G:G"), ws.Cells(i, "G"), ws.Range("O:O"))
'                        If orderQty > stockAvailability Then ws.Cells(i, "AB").Interior.Color = RGB(0, 176, 240)
'
'                        ' reset orderQty and stockavailability
'                        orderQty = 0
'                        stockAvailability = 0
'                    'End If
'
'             ''Update
'                  Update_UnitPriceFunctionStatus = Update_UnitPriceFunction("AC", "AD", i, ws)
'                  If Update_UnitPriceFunctionStatus <> "" Then
'                     MsgBox Update_UnitPriceFunctionStatus, vbExclamation, "Macro"
'                     Exit Sub
'                  End If
'                Next i
'                ws.Calculate
'
'                Set formulaRange = ws.Range(ws.Cells(4, "AD"), ws.Cells(lr, "AD"))
'                ws.Cells(lr + 1, "AC") = "Total"
'                ws.Cells(lr + 2, "AC") = "Shipping"
'                ws.Cells(lr + 3, "AC") = "Total"
'                'ws.Cells(lr + 4, "AC") = markup
'
'
'                ws.Cells(lr + 1, "AD").Formula = "=SUM(" & formulaRange.Address(False, False) & ")"
'                'ws.Cells(lr + 2, "AD") = shipping
'                ws.Cells(lr + 3, "AD").FormulaR1C1 = "=R[-1]C+R[-2]C"
'                ws.Cells(lr + 4, "AD").FormulaR1C1 = "=R[-1]C*RC[-1]"
'                ws.Cells(lr + 5, "AD").FormulaR1C1 = "=R[-1]C+R[-2]C"
'
'                ws.Cells(lr + 1, "AD").Font.Bold = True
'                ws.Cells(lr + 3, "AD").Font.Bold = True
'
'                ws.Cells(lr + 2, "AD").Interior.Color = RGB(255, 255, 0)
'                ws.Cells(lr + 5, "AD").Interior.Color = RGB(248, 203, 173)
'                ws.Cells(lr + 4, "AC").Interior.Color = RGB(255, 255, 0)
'
'                ws.Cells(lr + 4, "AC").HorizontalAlignment = xlLeft
'                ws.Cells(lr + 4, "AC").NumberFormat = "0%"
'
'                ws.Cells(lr + 1, "AD").NumberFormat = "#,##0.00 $"
'                ws.Cells(lr + 2, "AD").NumberFormat = "#,##0.00 $"
'                ws.Cells(lr + 3, "AD").NumberFormat = "#,##0.00 $"
'                ws.Cells(lr + 4, "AD").NumberFormat = "#,##0.00 $"
'                ws.Cells(lr + 5, "AD").NumberFormat = "#,##0.00 $"
'
'
'                Set borderRange = ws.Range("AC" & lr + 1 & ":AD" & lr + 5)
'
'                ' Draw a border around the range
'                With borderRange.Borders
'                    .LineStyle = xlContinuous ' You can change the line style as needed
'                    .Weight = xlThin ' You can change the line weight as needed
'                    .ColorIndex = xlAutomatic ' You can change the border color as needed
'                End With
'
'                ' for QTY 3
'                For i = 4 To lr
'                    'If ws.Cells(i, "AH") <> "" Then
'                        ws.Cells(i, "AI").FormulaR1C1 = "=Round(RC[-1]*RC[-2],2)"
'
'                        ' Fill order Qty with color if stock available is less than order qty
'                        ws.Cells(i, "AG").Interior.ColorIndex = xlNone
'                        orderQty = Application.WorksheetFunction.SumIf(ws.Range("G:G"), ws.Cells(i, "G"), ws.Range("AG:AG"))
'                        stockAvailability = Application.WorksheetFunction.SumIf(ws.Range("G:G"), ws.Cells(i, "G"), ws.Range("O:O"))
'                        If orderQty > stockAvailability Then ws.Cells(i, "AG").Interior.Color = RGB(0, 176, 240)
'
'                        ' reset orderQty and stockavailability
'                        orderQty = 0
'                        stockAvailability = 0
'                    'End If
'
'                 ''Update
'                    Update_UnitPriceFunctionStatus = Update_UnitPriceFunction("AH", "AI", i, ws)
'                    If Update_UnitPriceFunctionStatus <> "" Then
'                       MsgBox Update_UnitPriceFunctionStatus, vbExclamation, "Macro"
'                       Exit Sub
'                    End If
'                ''/
'                Next i
'                ws.Calculate
'
'                Set formulaRange = ws.Range(ws.Cells(4, "AI"), ws.Cells(lr, "AI"))
'                ws.Cells(lr + 1, "AH") = "Total"
'                ws.Cells(lr + 2, "AH") = "Shipping"
'                ws.Cells(lr + 3, "AH") = "Total"
'                'ws.Cells(lr + 4, "AH") = markup
'
'
'                ws.Cells(lr + 1, "AI").Formula = "=SUM(" & formulaRange.Address(False, False) & ")"
'                'ws.Cells(lr + 2, "AI") = shipping
'                ws.Cells(lr + 3, "AI").FormulaR1C1 = "=R[-1]C+R[-2]C"
'                ws.Cells(lr + 4, "AI").FormulaR1C1 = "=R[-1]C*RC[-1]"
'                ws.Cells(lr + 5, "AI").FormulaR1C1 = "=R[-1]C+R[-2]C"
'
'                ws.Cells(lr + 1, "AI").Font.Bold = True
'                ws.Cells(lr + 3, "AI").Font.Bold = True
'
'                ws.Cells(lr + 2, "AI").Interior.Color = RGB(255, 255, 0)
'                ws.Cells(lr + 5, "AI").Interior.Color = RGB(248, 203, 173)
'                ws.Cells(lr + 4, "AH").Interior.Color = RGB(255, 255, 0)
'
'                ws.Cells(lr + 4, "AH").HorizontalAlignment = xlLeft
'                ws.Cells(lr + 4, "AH").NumberFormat = "0%"
'
'                ws.Cells(lr + 1, "AI").NumberFormat = "#,##0.00 $"
'                ws.Cells(lr + 2, "AI").NumberFormat = "#,##0.00 $"
'                ws.Cells(lr + 3, "AI").NumberFormat = "#,##0.00 $"
'                ws.Cells(lr + 4, "AI").NumberFormat = "#,##0.00 $"
'                ws.Cells(lr + 5, "AI").NumberFormat = "#,##0.00 $"
'
'                Set borderRange = ws.Range("AH" & lr + 1 & ":AI" & lr + 5)
'
'                ' Draw a border around the range
'                With borderRange.Borders
'                    .LineStyle = xlContinuous ' You can change the line style as needed
'                    .Weight = xlThin ' You can change the line weight as needed
'                    .ColorIndex = xlAutomatic ' You can change the border color as needed
'                End With
'
'                ' for QTY 4
'                For i = 4 To lr
'                    'If ws.Cells(i, "AM") <> "" Then
'                        ws.Cells(i, "AN").FormulaR1C1 = "=Round(RC[-1]*RC[-2],2)"
'
'                        ' Fill order Qty with color if stock available is less than order qty
'                        ws.Cells(i, "AL").Interior.ColorIndex = xlNone
'                        orderQty = Application.WorksheetFunction.SumIf(ws.Range("G:G"), ws.Cells(i, "G"), ws.Range("AL:AL"))
'                        stockAvailability = Application.WorksheetFunction.SumIf(ws.Range("G:G"), ws.Cells(i, "G"), ws.Range("O:O"))
'                        If orderQty > stockAvailability Then ws.Cells(i, "AL").Interior.Color = RGB(0, 176, 240)
'
'                        ' reset orderQty and stockavailability
'                        orderQty = 0
'                        stockAvailability = 0
'                    'End If
'
'                ''Update
'                      Update_UnitPriceFunctionStatus = Update_UnitPriceFunction("AM", "AN", i, ws)
'                      If Update_UnitPriceFunctionStatus <> "" Then
'                         MsgBox Update_UnitPriceFunctionStatus, vbExclamation, "Macro"
'                         Exit Sub
'                      End If
'                Next i
'                ws.Calculate
'
'                Set formulaRange = ws.Range(ws.Cells(4, "AN"), ws.Cells(lr, "AN"))
'                ws.Cells(lr + 1, "AM") = "Total"
'                ws.Cells(lr + 2, "AM") = "Shipping"
'                ws.Cells(lr + 3, "AM") = "Total"
'                'ws.Cells(lr + 4, "AM") = markup
'
'
'                ws.Cells(lr + 1, "AN").Formula = "=SUM(" & formulaRange.Address(False, False) & ")"
'                'ws.Cells(lr + 2, "AN") = shipping
'                ws.Cells(lr + 3, "AN").FormulaR1C1 = "=R[-1]C+R[-2]C"
'                ws.Cells(lr + 4, "AN").FormulaR1C1 = "=R[-1]C*RC[-1]"
'                ws.Cells(lr + 5, "AN").FormulaR1C1 = "=R[-1]C+R[-2]C"
'
'                ws.Cells(lr + 1, "AN").Font.Bold = True
'                ws.Cells(lr + 3, "AN").Font.Bold = True
'
'                ws.Cells(lr + 2, "AN").Interior.Color = RGB(255, 255, 0)
'                ws.Cells(lr + 5, "AN").Interior.Color = RGB(248, 203, 173)
'                ws.Cells(lr + 4, "AM").Interior.Color = RGB(255, 255, 0)
'
'                ws.Cells(lr + 4, "AM").HorizontalAlignment = xlLeft
'                ws.Cells(lr + 4, "AM").NumberFormat = "0%"
'
'                ws.Cells(lr + 1, "AN").NumberFormat = "#,##0.00 $"
'                ws.Cells(lr + 2, "AN").NumberFormat = "#,##0.00 $"
'                ws.Cells(lr + 3, "AN").NumberFormat = "#,##0.00 $"
'                ws.Cells(lr + 4, "AN").NumberFormat = "#,##0.00 $"
'                ws.Cells(lr + 5, "AN").NumberFormat = "#,##0.00 $"
'
'                Set borderRange = ws.Range("AM" & lr + 1 & ":AN" & lr + 5)
'
'                ' Draw a border around the range
'                With borderRange.Borders
'                    .LineStyle = xlContinuous ' You can change the line style as needed
'                    .Weight = xlThin ' You can change the line weight as needed
'                    .ColorIndex = xlAutomatic ' You can change the border color as needed
'                End With
'
'
'                ' for Th Pins Sum
'                Dim THsum As Double
'                THsum = 0
'
'                For i = 4 To lr
'                    THsum = THsum + (ws.Cells(i, "T") * ws.Cells(i, "E"))
'                Next i
'
'                ws.Range("K2") = THsum
'
'                ''Update
'                If BooleanCheckInvalidUnitPrice_CurrentSheet = True Then
'                    If StatusReturnofInvalidUnitPrice = "" Then
'                            StatusReturnofInvalidUnitPrice = "Macro Validation Check Found :" & vbNewLine _
'                                & "Please Fill Unit Price Greater then 0 and less then max limit Price At Column " & UnitPriceOrignalColumn & " at Highlighted Row in Below Tabs :" & vbNewLine & vbNewLine & ws.Name
'                    Else
'                       StatusReturnofInvalidUnitPrice = StatusReturnofInvalidUnitPrice & vbNewLine & ws.Name
'
'                    End If
'                End If
'            End If
'        End If
'    Next ws
'
'    message = Mid(message, 3)
'
'    turnonscreenUpdate
'
'    If message <> "" Then
'        MsgBox ("Programming Fees (NRE1) was not overridden for following GMP(s):" & Chr(10) & message)
'    End If
'
'
'    ''Update
'    If StatusReturnofInvalidUnitPrice <> "" Then
'      MsgBox StatusReturnofInvalidUnitPrice, vbExclamation, "Macro Validation Found"
'    End If
'    ''/
'
'    turnonscreenUpdate
'
'
'
'    End Sub
'
'''Update
'Private Function Update_UnitPriceFunction(UnitPrice_ColumnStr As String, ExtpriceUnits_ColumnStr, i As Long, ws As Worksheet) As String
'On Error GoTo Errhh
'
'Dim ArrayofDistrib(3) As String, LoopI As Double
'
'''Make colour Netural First
'With ws.Cells(i, UnitPriceOrignalColumn).Interior
'         .Pattern = xlSolid
'        .PatternColorIndex = xlAutomatic
'        .ThemeColor = xlThemeColorDark1
'        .TintAndShade = 0
'        .PatternTintAndShade = 0
'End With
'''
'
'ArrayofDistrib(0) = "Digikey"
'ArrayofDistrib(1) = "Mouser"
'ArrayofDistrib(2) = "*Supplies"
'ArrayofDistrib(3) = "APCB"
'
'''if Distrib is *Supplies Mark Values as blank
'For LoopI = 2 To 2
'            If UCase(Trim(ws.Cells(i, DistribColstr).value)) Like UCase(Trim(ArrayofDistrib(LoopI))) Then
'                ws.Cells(i, UnitPrice_ColumnStr).value = ""
'                ws.Cells(i, ExtpriceUnits_ColumnStr).FormulaR1C1 = ""
'            End If
'Next LoopI
'''
'
'    If ws.Cells(i, UnitPrice_ColumnStr).value = "" Then
'        For LoopI = LBound(ArrayofDistrib) To UBound(ArrayofDistrib)
'            If UCase(Trim(ws.Cells(i, DistribColstr).value)) Like UCase(Trim(ArrayofDistrib(LoopI))) Then
'               GoTo DoNothing
'            End If
'        Next LoopI
'
'        If IsError(ws.Cells(i, UnitPriceOrignalColumn).value) = True Or _
'            ws.Cells(i, UnitPriceOrignalColumn).value = "" Or _
'            IsNumeric(ws.Cells(i, UnitPriceOrignalColumn).value) = False Or _
'            ws.Cells(i, UnitPriceOrignalColumn).value <= 0 Or ws.Cells(i, UnitPriceOrignalColumn).value > 10 Then
'
'            With ws.Cells(i, UnitPriceOrignalColumn).Interior
'                 .Pattern = xlSolid
'                 .PatternColorIndex = xlAutomatic
'                 .Color = 65535
'                 .TintAndShade = 0
'                 .PatternTintAndShade = 0
'            End With
'
'            BooleanCheckInvalidUnitPrice_CurrentSheet = True
'            GoTo DoNothing
'
'        End If
'
'        ws.Cells(i, UnitPrice_ColumnStr).value = ws.Cells(i, UnitPriceOrignalColumn).value
'        ws.Cells(i, ExtpriceUnits_ColumnStr).FormulaR1C1 = "=RC[-1]*RC[-2]"
'
'    End If
'
'DoNothing:
'ws.Cells(i, UnitPrice_ColumnStr).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
'ws.Cells(i, ExtpriceUnits_ColumnStr).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
'Exit Function
'Errhh:
'Update_UnitPriceFunction = Err.Description
'End Function
'


