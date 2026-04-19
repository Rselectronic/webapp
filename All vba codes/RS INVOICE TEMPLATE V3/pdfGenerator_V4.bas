Attribute VB_Name = "pdfGenerator_V4"
Option Explicit

' ==============================
' Dynamic layout config
' ==============================
Private Const FIRST_DATA_ROW As Long = 18
Private Const COL_PO As String = "A"
Private Const COL_PRODUCT As String = "B"
Private Const COL_UNITPRICE As String = "I"
Private Const COL_LABEL As String = "I"    ' Subtotal/GST/QST/Total labels
Private Const COL_AMOUNT As String = "J"   ' Amounts next to labels

' Stores indices of columns to re-hide after job queue updates
Public HiddenColumnIndices() As Long

'==============================
' ENTRY POINT
'==============================
Public Sub GeneratePDF()
    On Error GoTo ErrHandler

    Dim invWS As Worksheet
    Set invWS = ThisWorkbook.Worksheets("Invoice")

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual

    ' --- discover dynamic line region & tax rows ---
    Dim rFirst As Long, rLast As Long
    Dim rSub As Long, rGST As Long, rQST As Long, rTot As Long
    GetInvoiceLineRange invWS, rFirst, rLast, rSub, rGST, rQST, rTot

    ' QST applies only if a QST row exists AND its amount cell isn't blank
    Dim hasQST As Boolean, hasGST As Boolean
    hasQST = (rQST > 0 And LenB(CStr(invWS.Cells(rQST, COL_AMOUNT).Value)) > 0)
    hasGST = (rGST > 0 And LenB(CStr(invWS.Cells(rGST, COL_AMOUNT).Value)) > 0)
    

    ' 1) Capture and switch printer
    Dim prevPrinter As String
    prevPrinter = CaptureDefaultPrinter()
    EnsurePDFPrinterActive "Microsoft Print to PDF"

    ' 2) Key values
    Dim invoiceNo As String: invoiceNo = CStr(invWS.Range("I3").Value)

    ' 3) Resolve centralized quarter folder (once)
    Dim centralQuarterFolder As String
    centralQuarterFolder = EnsureCentralQuarterFolders(invWS)

    ' 4) Export PDF to centralized folder
    ExportInvoicePDF invWS, centralQuarterFolder, invoiceNo

    ' 5) Export PDF to each PO folder found on the invoice (dynamic A rFirst:rLast)
    Dim poList As Collection, p As Variant
    Set poList = GetInvoicePOList(invWS, rFirst, rLast)
    For Each p In poList
        ExportInvoicePDF invWS, ResolvePOInvoiceFolder(invWS, CStr(p)), invoiceNo
    Next p

    ' 6) Update Job Queue (and collect per-PO subtotals for the summary)
    Dim perPO As Object
    Set perPO = UpdateJobQueueFromInvoice(invWS, rFirst, rLast, hasGST, hasQST)  ' Dictionary keyed by PO -> [Sub,GST,QST,Total]

    ' 7) Append one row per PO to Invoice Summary using collected totals
    AppendInvoiceSummary invWS, perPO

CleanExit:
    On Error Resume Next
    RestoreDefaultPrinter prevPrinter
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Exit Sub

ErrHandler:
    MsgBox Err.Description, vbExclamation, "GeneratePDF"
    Resume CleanExit
End Sub

'==============================
' PRINTER HELPERS
'==============================
Private Function CaptureDefaultPrinter() As String
    CaptureDefaultPrinter = Application.ActivePrinter
End Function

Private Sub EnsurePDFPrinterActive(ByVal pdfNameContains As String)
    Dim printers() As String, i As Long
    printers = GetPrinterFullNames()
    For i = LBound(printers) To UBound(printers)
        If InStr(1, printers(i), pdfNameContains, vbTextCompare) > 0 Then
            Application.ActivePrinter = printers(i)
            Exit Sub
        End If
    Next
    Err.Raise vbObjectError + 901, , "PDF printer '" & pdfNameContains & "' not found."
End Sub

Private Sub RestoreDefaultPrinter(ByVal prevPrinter As String)
    If Len(prevPrinter) > 0 Then Application.ActivePrinter = prevPrinter
End Sub

'==============================
' PATH HELPERS (unchanged)
'==============================
Private Function GetWorkbookLocalPath() As String
    Dim p As String
    p = GetLocalPath(ThisWorkbook.FullName)
    If InStr(1, p, "^N", vbTextCompare) > 0 Then p = Replace$(p, "^N", "#")
    GetWorkbookLocalPath = p
End Function

Private Sub ResolveMasterAndCustomer(ByRef masterFolderName As String, _
                                     ByRef customerName As String, _
                                     Optional ByRef customerRoot As String)
    Dim parts() As String, basePath As String
    basePath = GetWorkbookLocalPath()
    parts = Split(basePath, "\")
    customerName = parts(UBound(parts) - 3)
    masterFolderName = parts(UBound(parts) - 5)

    If Not IsMissing(customerRoot) Then
        Dim i As Long, cut As Long
        cut = 0
        For i = LBound(parts) To UBound(parts)
            If parts(i) = customerName Then
                cut = i
                Exit For
            End If
        Next i
        If cut > 0 Then
            Dim tempArr() As String, k As Long
            ReDim tempArr(LBound(parts) To cut)
            For k = LBound(parts) To cut: tempArr(k) = parts(k): Next k
            customerRoot = Join(tempArr, "\") & "\"
        Else
            customerRoot = ""
        End If
    End If
End Sub

Private Function ResolvePOInvoiceFolder(invWS As Worksheet, ByVal poNumber As String) As String
    Dim basePath As String, cutPos As Long, customerRoot As String
    basePath = GetWorkbookLocalPath()

    cutPos = InStr(1, basePath, "\3. OTHER FILES\", vbTextCompare)
    If cutPos > 0 Then
        customerRoot = Left$(basePath, cutPos - 1) & "\"
    Else
        Dim masterFolder As String, customer As String
        ResolveMasterAndCustomer masterFolder, customer, customerRoot
        If LenB(customerRoot) = 0 Then
            Err.Raise vbObjectError + 910, , "Could not resolve customer root from: " & basePath
        End If
    End If

    Dim poRoot As String
    poRoot = customerRoot & "2. PO's RECEIVED AND COMPLETED\" & poNumber & "\"

    MkDirSafe customerRoot & "2. PO's RECEIVED AND COMPLETED\"
    MkDirSafe poRoot

    Dim preferred As String
    preferred = poRoot & "2. INVOICES - " & poNumber & "\"

    If LenB(Dir$(preferred, vbDirectory)) = 0 Then
        Dim d As String
        d = Dir$(poRoot & "2. INVOICES*", vbDirectory)
        If LenB(d) = 0 Then
            MkDirSafe preferred
            ResolvePOInvoiceFolder = preferred
        Else
            ResolvePOInvoiceFolder = poRoot & d & "\"
        End If
    Else
        ResolvePOInvoiceFolder = preferred
    End If
End Function

Private Function EnsureCentralQuarterFolders(invWS As Worksheet) As String
    Dim masterFolder As String, customer As String
    ResolveMasterAndCustomer masterFolder, customer

    Dim basePath As String, root As String
    basePath = GetWorkbookLocalPath()
    root = Left$(basePath, InStr(1, basePath, masterFolder, vbTextCompare) + Len(masterFolder))

    Dim invoiceYear As Long, quarterSent As String, quarterCollected As String
    GetFiscalYearAndQuarterNames invoiceYear, quarterSent, quarterCollected

    Dim yearPath As String, sentPath As String, collectedPath As String
    yearPath = root & "6. BACKEND\INVOICE\" & CStr(invoiceYear) & "\"
    sentPath = yearPath & quarterSent & "\"
    collectedPath = yearPath & quarterCollected & "\"

    MkDirSafe yearPath
    MkDirSafe sentPath
    MkDirSafe collectedPath

    EnsureCentralQuarterFolders = sentPath
End Function

Private Sub GetFiscalYearAndQuarterNames(ByRef yearFolder As Long, _
                                         ByRef quarterSent As String, _
                                         ByRef quarterCollected As String)
    Dim dt As Date, monthName As String
    dt = FillDateTimeInCanada()
    monthName = Format$(dt, "mmmm")
    yearFolder = CLng(Format$(dt, "yyyy"))

    If monthName = "November" Or monthName = "December" Then
        yearFolder = yearFolder + 1
    End If

    Dim qName As String
    Select Case monthName
        Case "November", "December", "January": qName = "Q1-" & yearFolder
        Case "February", "March", "April":      qName = "Q2-" & yearFolder
        Case "May", "June", "July":             qName = "Q3-" & yearFolder
        Case "August", "September", "October":  qName = "Q4-" & yearFolder
        Case Else: Err.Raise vbObjectError + 902, , "Unexpected month: " & monthName
    End Select

    quarterSent = qName & " INVOICES SENT"
    quarterCollected = qName & " INVOICES COLLECTED"
End Sub

Private Sub MkDirSafe(ByVal p As String)
    If LenB(Dir$(p, vbDirectory)) = 0 Then MkDir p
End Sub

'==============================
' INVOICE ? PO LIST (dynamic)
'==============================
Private Function GetInvoicePOList(invWS As Worksheet, _
                                  ByVal firstRow As Long, ByVal lastRow As Long) As Collection
    Dim c As New Collection
    Dim dict As Object: Set dict = CreateObject("Scripting.Dictionary")
    Dim r As Long, v As String
    For r = firstRow To lastRow
        v = Trim$(CStr(invWS.Cells(r, COL_PO).Value))
        If Len(v) > 0 Then
            If Not dict.Exists(v) Then dict.Add v, True: c.Add v
        End If
    Next r
    Set GetInvoicePOList = c
End Function

'==============================
' EXPORT
'==============================
Private Sub ExportInvoicePDF(invWS As Worksheet, ByVal targetFolder As String, ByVal invoiceNo As String)
    Dim pdfName As String
    pdfName = invoiceNo & ".pdf"
    invWS.ExportAsFixedFormat _
        Type:=xlTypePDF, _
        fileName:=targetFolder & pdfName, _
        Quality:=xlQualityStandard, _
        IncludeDocProperties:=True, _
        IgnorePrintAreas:=False
End Sub

'==============================
' JOB QUEUE UPDATE (dynamic range; returns per-PO aggregation)
'==============================
Private Function UpdateJobQueueFromInvoice(invWS As Worksheet, _
                                          ByVal rFirst As Long, ByVal rLast As Long, _
                                          ByVal hasGST As Boolean, ByVal hasQST As Boolean) As Object
    On Error GoTo ErrHandler

    ' Open Job Queue
    Dim masterFolder As String, customer As String
    ResolveMasterAndCustomer masterFolder, customer

    Dim basePath As String, jqFolder As String, jqFile As String, jqFull As String
    basePath = GetWorkbookLocalPath()
    jqFolder = Left$(basePath, InStr(1, basePath, masterFolder, vbTextCompare) + Len(masterFolder)) & "3. JOB QUEUE\"
    jqFile = Dir$(jqFolder & "Job*.xlsm")
    If LenB(jqFile) = 0 Then Err.Raise vbObjectError + 903, , "Job Queue workbook not found in: " & jqFolder
    jqFull = jqFolder & jqFile

    Dim jobWB As Workbook, jobWS As Worksheet
    Set jobWB = Workbooks.Open(jqFull)
    Set jobWS = jobWB.Worksheets("Job Queue")

    UnHideColumns_Jobqueue jobWS
    initialiseHeaders jobWS
    initialiseHeadersInvoices invWS

    Dim lastRow As Long: lastRow = jobWS.Cells(jobWS.rows.Count, jobQueueWs_customer).End(xlUp).Row

    ' === Build index: key -> Collection of row numbers (handle duplicates) ===
    Dim idx As Object: Set idx = CreateObject("Scripting.Dictionary")
    Dim r As Long, key As String
    For r = 4 To lastRow
        key = CStr(jobWS.Cells(r, jobQueueWs_PO_Number).Value) & "||" & _
              CStr(jobWS.Cells(r, jobQueueWs_ProductName_Column).Value)
        If Not idx.Exists(key) Then
            Dim rows As Object
            Set rows = New Collection
            idx.Add key, rows
        End If
        idx(key).Add r
    Next r

    ' === Aggregate per-PO subtotal; taxes added after loop ===
    Dim perPO As Object: Set perPO = CreateObject("Scripting.Dictionary")

    Dim invRow As Long
    For invRow = rFirst To rLast
        Dim poNum As String, productName As String
        poNum = Trim$(CStr(invWS.Cells(invRow, COL_PO).Value))
        productName = Trim$(CStr(invWS.Cells(invRow, COL_PRODUCT).Value))
        If Len(poNum) = 0 Or Len(productName) = 0 Then GoTo NextInv

        key = poNum & "||" & productName
        If idx.Exists(key) Then
            Dim rowsCol As Collection
            Set rowsCol = idx(key)

            Dim rr As Variant, i As Long
            For Each rr In rowsCol
                i = CLng(rr)

                If IsRowInvoiceable(jobWS, i) Then
                    ' Stamp invoice info
                    jobWS.Cells(i, jobQueueWs_Invoice_Date).NumberFormat = "m/d/yyyy"
                    jobWS.Cells(i, jobQueueWs_Invoice_Date).Value = invWS.Range("I2").Value
                    jobWS.Cells(i, jobQueueWs_Invoice).Value = invWS.Range("I3").Value
                    jobWS.Cells(i, jobQueueWs_Order_Status).Value = "2. Invoice Sent to Customer"

                    ' Compute/write amounts for THIS row's quantity
                    Dim subTot As Double, gst As Double, qst As Double, totalAmt As Double
                    WriteAmountsFromInvoice invWS, jobWS, i, invRow, hasGST, hasQST, subTot, gst, qst, totalAmt

                    ' Accumulate per-PO subtotal
                    If Not perPO.Exists(poNum) Then perPO.Add poNum, 0#
                    perPO(poNum) = CDbl(perPO(poNum)) + subTot
                End If
            Next rr
        End If
NextInv:
    Next invRow

    ' === Convert per-PO subtotals to [Sub,GST,QST,Total] ===
    Dim k As Variant
    For Each k In perPO.Keys
        Dim st As Double: st = CDbl(perPO(k))
        Dim g As Double: g = IIf(hasGST, st * 0.05, 0#)
        Dim q As Double: q = IIf(hasQST, st * 0.09975, 0#)
        perPO(k) = Array(st, g, q, st + g + q)
    Next k

    Set UpdateJobQueueFromInvoice = perPO

CleanExit:
    ReHideColumns_Jobqueue jobWS
    'If Not jobWB Is Nothing Then jobWB.Close SaveChanges:=True
    Exit Function

ErrHandler:
    Set UpdateJobQueueFromInvoice = Nothing
    MsgBox Err.Description, vbExclamation, "UpdateJobQueueFromInvoice"
    Resume CleanExit
End Function


Private Function IsRowInvoiceable(ByVal jobWS As Worksheet, ByVal r As Long) As Boolean
    Dim statusVal As String, orderTypeVal As String
    statusVal = CStr(jobWS.Cells(r, jobQueueWs_Order_Status).Value)
    orderTypeVal = CStr(jobWS.Cells(r, jobQueueWs_Order_Type).Value)
    IsRowInvoiceable = (statusVal = "4. Order Shipped") _
                    Or (statusVal = "5. Partially Shipped") _
                    Or (orderTypeVal = "NREs")
End Function

Private Sub WriteAmountsFromInvoice(invWS As Worksheet, jobWS As Worksheet, _
                                    ByVal r As Long, ByVal invRow As Long, ByVal hasGST As Boolean, ByVal hasQST As Boolean, _
                                    ByRef subTot As Double, ByRef gst As Double, _
                                    ByRef qst As Double, ByRef totalAmt As Double)
    invWS.Calculate

    Dim qty As Double
    qty = Val(jobWS.Cells(r, jobQueueWs_POQty_Column).Value)

    Dim unitPrice As Double
    unitPrice = CDbl(invWS.Cells(invRow, COL_UNITPRICE).Value)

    subTot = unitPrice * qty
    gst = IIf(hasGST, subTot * 0.05, 0#)
    qst = IIf(hasQST, subTot * 0.09975, 0#)
    totalAmt = subTot + gst + qst

    With jobWS
        .Cells(r, jobQueueWs_Subtotal_Column).Value = subTot
        .Cells(r, jobQueueWs_Subtotal_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
        .Cells(r, jobQueueWs_GST_Column).Value = gst
        .Cells(r, jobQueueWs_GST_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
        .Cells(r, jobQueueWs_QST_Column).Value = qst
        .Cells(r, jobQueueWs_QST_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
        .Cells(r, jobQueueWs_InvoiceAmount_Column).Value = totalAmt
        .Cells(r, jobQueueWs_InvoiceAmount_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
    End With
End Sub

'==============================
' INVOICE SUMMARY (one row per PO)
'==============================
Private Sub AppendInvoiceSummary(invWS As Worksheet, ByVal perPO As Object)
    On Error GoTo ErrHandler

    If perPO Is Nothing Then Exit Sub
    If perPO.Count = 0 Then Exit Sub

    Dim masterFolder As String, customer As String
    ResolveMasterAndCustomer masterFolder, customer

    Dim basePath As String, jqFolder As String, jqFile As String, jqFull As String
    basePath = GetWorkbookLocalPath()
    jqFolder = Left$(basePath, InStr(1, basePath, masterFolder, vbTextCompare) + Len(masterFolder)) & "3. JOB QUEUE\"
    jqFile = Dir$(jqFolder & "Job*.xlsm")
    If LenB(jqFile) = 0 Then Err.Raise vbObjectError + 904, , "Job Queue workbook not found in: " & jqFolder
    jqFull = jqFolder & jqFile

    Dim jobWB As Workbook, summaryWS As Worksheet
    Set jobWB = Workbooks.Open(jqFull)
    Set summaryWS = jobWB.Worksheets("Invoice Summary")

    initialiseHeadersInvoiceSummary summaryWS

    Dim k As Variant, lr As Long, arr As Variant
    For Each k In perPO.Keys
        arr = perPO(k) ' [Subtotal, GST, QST, Total]

        lr = summaryWS.Cells(summaryWS.rows.Count, "A").End(xlUp).Row + 1
        summaryWS.Cells(lr, invSummary_InvoiceDate_Column).Value = FillDateTimeInCanada()
        summaryWS.Cells(lr, invSummary_CustomerName_Column).Value = invWS.Range("A11").Value
        summaryWS.Cells(lr, invSummary_POnumber_Column).Value = CStr(k)
        summaryWS.Cells(lr, invSummary_InvoiceNo_Column).Value = invWS.Range("I3").Value
        summaryWS.Cells(lr, invSummary_SubTotal_Column).Value = CDbl(arr(0))
        summaryWS.Cells(lr, invSummary_GST_Column).Value = CDbl(arr(1))
        summaryWS.Cells(lr, invSummary_QST_Column).Value = CDbl(arr(2))
        summaryWS.Cells(lr, invSummary_Total_Column).Value = CDbl(arr(3))

        summaryWS.Cells(lr, invSummary_InvoiceDate_Column).NumberFormat = "mm/dd/yyyy"
        summaryWS.Cells(lr, invSummary_InvoiceNo_Column).NumberFormat = "@"
        summaryWS.Range(summaryWS.Cells(lr, invSummary_SubTotal_Column), _
                        summaryWS.Cells(lr, invSummary_Total_Column)).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* ""-""??_);_(@_)"
    Next k

CleanExit:
    'jobWB.Close SaveChanges:=True
    Exit Sub

ErrHandler:
    MsgBox Err.Description, vbExclamation, "AppendInvoiceSummary"
    Resume CleanExit
End Sub

'==============================
' COLUMN VISIBILITY HELPERS (unchanged)
'==============================
Public Function UnHideColumns_Jobqueue(ByVal JOB_QUEUE As Worksheet) As String
    On Error GoTo Errhh

    Dim lastCol As Long, c As Long, n As Long
    lastCol = JOB_QUEUE.Cells(1, JOB_QUEUE.Columns.Count).End(xlToLeft).Column

    ReDim HiddenColumnIndices(0)
    For c = 1 To lastCol
        If JOB_QUEUE.Columns(c).Hidden Then
            n = UBound(HiddenColumnIndices) + 1
            ReDim Preserve HiddenColumnIndices(n)
            HiddenColumnIndices(n) = c
            JOB_QUEUE.Columns(c).Hidden = False
        End If
    Next c
    Exit Function

Errhh:
    UnHideColumns_Jobqueue = Err.Description
End Function

Public Function ReHideColumns_Jobqueue(ByVal JOB_QUEUE As Worksheet) As String
    On Error GoTo Errhh

    Dim i As Long
    If (Not Not HiddenColumnIndices) <> 0 Then
        For i = LBound(HiddenColumnIndices) To UBound(HiddenColumnIndices)
            If HiddenColumnIndices(i) > 0 Then JOB_QUEUE.Columns(HiddenColumnIndices(i)).Hidden = True
        Next i
    End If
    Exit Function

Errhh:
    ReHideColumns_Jobqueue = Err.Description
End Function

'==============================
' DYNAMIC RANGE HELPERS
'==============================
' Return the max last-used row across given columns
Private Function LastUsedRow(ws As Worksheet, ParamArray cols()) As Long
    Dim r As Long, c As Variant, m As Long
    For Each c In cols
        r = ws.Cells(ws.rows.Count, CStr(c)).End(xlUp).Row
        If r > m Then m = r
    Next c
    LastUsedRow = m
End Function

' Find the first row where COL_LABEL contains any of the tokens (case-insensitive)
Private Function FindLabelRow(ws As Worksheet, startRow As Long, endRow As Long, ParamArray tokens()) As Long
    Dim r As Long, t As Variant, txt As String
    For r = startRow To endRow
        txt = LCase$(Trim$(CStr(ws.Cells(r, COL_LABEL).Value)))
        If Len(txt) > 0 Then
            For Each t In tokens
                If InStr(1, txt, LCase$(CStr(t)), vbTextCompare) > 0 Then
                    FindLabelRow = r
                    Exit Function
                End If
            Next t
        End If
    Next r
    FindLabelRow = 0
End Function

' Discover dynamic invoice section:
' - first & last line rows
' - Subtotal / GST / QST / Total label rows
Private Sub GetInvoiceLineRange(invWS As Worksheet, _
                                ByRef firstRow As Long, ByRef lastRow As Long, _
                                ByRef rowSubtotal As Long, ByRef rowGST As Long, _
                                ByRef rowQST As Long, ByRef rowTotal As Long)
    Dim endScan As Long
    endScan = LastUsedRow(invWS, COL_PO, COL_PRODUCT, COL_UNITPRICE, COL_LABEL, COL_AMOUNT)
    If endScan < FIRST_DATA_ROW Then endScan = FIRST_DATA_ROW

    rowSubtotal = FindLabelRow(invWS, FIRST_DATA_ROW, endScan, "subtotal", "sub-total")
    rowGST = FindLabelRow(invWS, FIRST_DATA_ROW, endScan, "gst", "tps")
    rowQST = FindLabelRow(invWS, FIRST_DATA_ROW, endScan, "qst", "tvq")
    rowTotal = FindLabelRow(invWS, FIRST_DATA_ROW, endScan, "total")

    firstRow = FIRST_DATA_ROW
    If rowSubtotal > 0 Then
        lastRow = rowSubtotal - 1
    Else
        lastRow = LastUsedRow(invWS, COL_PO, COL_PRODUCT, COL_UNITPRICE)
    End If
    If lastRow < firstRow Then lastRow = firstRow
End Sub


