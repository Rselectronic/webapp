Attribute VB_Name = "invoiceGenerator_V5"
Option Explicit
Public billingAddress As String
Public shippingAddress As String

' === Layout config (adjust if the template changes) ===
Private Const FIRST_DATA_ROW As Long = 18   ' first invoice line row
Private Const COL_PO As String = "A"
Private Const COL_PRODUCT As String = "B"
Private Const COL_SERVICE As String = "F"
Private Const COL_QTY As String = "H"
Private Const COL_UNITPRICE As String = "I"
Private Const COL_LABEL As String = "I"     ' label column for Subtotal/GST/QST/Total
Private Const COL_AMOUNT As String = "J"    ' numeric amounts next to labels


' Set which columns span the invoice lines block
Private Const COL_FIRST As String = "A"
Private Const COL_LAST  As String = "J"

' Apply left/right borders to every data row, and a bottom border on the last row
Private Sub ApplyLineBorders(invWS As Worksheet, ByVal rowSub As Long)
    Dim firstRow As Long, lastDataRow As Long, r As Long
    firstRow = FIRST_DATA_ROW
    lastDataRow = rowSub - 1
    If lastDataRow < firstRow Then Exit Sub

    ' 1) Clear all borders across the data block (keeps things consistent)
    invWS.Range(COL_FIRST & firstRow & ":" & COL_LAST & lastDataRow).Borders.LineStyle = xlNone

    ' 2) Add left/right borders to every data row
    For r = firstRow To lastDataRow
        With invWS.Range(COL_FIRST & r & ":" & COL_LAST & r)
            With .Borders(xlEdgeLeft)
                .LineStyle = xlContinuous
                .Weight = xlThin
                .ColorIndex = xlAutomatic
            End With
            With .Borders(xlEdgeRight)
                .LineStyle = xlContinuous
                .Weight = xlThin
                .ColorIndex = xlAutomatic
            End With
        End With
    Next r

    ' 3) Bottom border on the last data row only
    With invWS.Range(COL_FIRST & lastDataRow & ":" & COL_LAST & lastDataRow).Borders(xlEdgeBottom)
        .LineStyle = xlContinuous
        .Weight = xlThin     ' use xlMedium if you prefer thicker
        .ColorIndex = xlAutomatic
    End With
End Sub

' ---------- Helpers for dynamic layout ----------
' Last used row among multiple columns
Private Function LastUsedRow(ws As Worksheet, ParamArray cols()) As Long
    Dim r As Long, c As Variant, m As Long
    For Each c In cols
        r = ws.Cells(ws.Rows.Count, CStr(c)).End(xlUp).row
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

' Locate summary rows and current line area
Private Sub GetInvoiceLayout(invWS As Worksheet, _
                             ByRef rowSub As Long, ByRef rowGST As Long, _
                             ByRef rowQST As Long, ByRef rowTot As Long, _
                             ByRef lastLineRow As Long)
    Dim endScan As Long
    endScan = LastUsedRow(invWS, COL_LABEL, COL_AMOUNT, COL_PO, COL_PRODUCT, COL_UNITPRICE)
    If endScan < FIRST_DATA_ROW Then endScan = FIRST_DATA_ROW

    rowSub = FindLabelRow(invWS, FIRST_DATA_ROW, endScan, "subtotal", "sub-total")
    rowGST = FindLabelRow(invWS, FIRST_DATA_ROW, endScan, "gst", "tps")
    rowQST = FindLabelRow(invWS, FIRST_DATA_ROW, endScan, "qst", "tvq")
    rowTot = FindLabelRow(invWS, FIRST_DATA_ROW, endScan, "total")

    If rowSub > 0 Then
        lastLineRow = rowSub - 1
    Else
        lastLineRow = LastUsedRow(invWS, COL_PO, COL_PRODUCT, COL_UNITPRICE)
        If lastLineRow < FIRST_DATA_ROW Then lastLineRow = FIRST_DATA_ROW - 1
    End If
End Sub

' Next empty line row (search B between FIRST_DATA_ROW and current subtotal-1)
Private Function NextEmptyLineRow(invWS As Worksheet, ByVal rowSub As Long) As Long
    Dim r As Long
    For r = FIRST_DATA_ROW To rowSub - 1
        If Len(Trim$(CStr(invWS.Cells(r, COL_PRODUCT).Value))) = 0 Then
            NextEmptyLineRow = r
            Exit Function
        End If
    Next r
    NextEmptyLineRow = rowSub   ' means no empty; we will insert above subtotal
End Function
Private Sub EnsureSpaceForLine(invWS As Worksheet, _
                               ByRef rowSub As Long, ByRef rowGST As Long, _
                               ByRef rowQST As Long, ByRef rowTot As Long, _
                               ByVal targetRow As Long)

    If targetRow < rowSub Then Exit Sub

    ' Insert blank row above Subtotal
    invWS.Rows(rowSub).Insert Shift:=xlDown

    ' Copy formats from a clean data row
    invWS.Rows(FIRST_DATA_ROW).Copy
    invWS.Rows(rowSub).PasteSpecial xlPasteFormats
    Application.CutCopyMode = False

    ' Clear borders so ApplyLineBorders can handle them later
    invWS.Range("A" & rowSub & ":J" & rowSub).Borders.LineStyle = xlNone

    ' ? Set a dynamic formula for this row (I * H)
    invWS.Cells(rowSub, "J").FormulaR1C1 = "=RC[-1]*RC[-2]"

    ' Shift summary rows down by one
    If rowTot > 0 Then rowTot = rowTot + 1
    If rowQST > 0 Then rowQST = rowQST + 1
    If rowGST > 0 Then rowGST = rowGST + 1
    rowSub = rowSub + 1
End Sub

' Find an existing line by PO + Product between FIRST_DATA_ROW and (rowSub - 1)
Private Function FindExistingLine(invWS As Worksheet, ByVal rowSub As Long, _
                                  ByVal po As String, ByVal product As String) As Long
    Dim r As Long
    For r = FIRST_DATA_ROW To rowSub - 1
        If Len(Trim$(CStr(invWS.Cells(r, COL_PRODUCT).Value))) > 0 Then
            If StrComp(Trim$(CStr(invWS.Cells(r, COL_PO).Value)), po, vbTextCompare) = 0 _
            And StrComp(Trim$(CStr(invWS.Cells(r, COL_PRODUCT).Value)), product, vbTextCompare) = 0 Then
                FindExistingLine = r
                Exit Function
            End If
        End If
    Next r
    FindExistingLine = 0
End Function

' ---------- Main macro ----------
Sub generateInvoice()
On Error GoTo Errhandler

    Dim jobWS As Worksheet, adminWS As Worksheet
    Dim selectedRange As Range, cell As Range
    Dim poNumber As String, po As Variant

    Set jobWS = ThisWorkbook.Sheets("Job Queue")
    initialiseHeaders jobWS
    UnHideColumns_Jobqueue jobWS

    Set adminWS = ThisWorkbook.Sheets("Admin")
    jobWS.Activate

    ' Ask user to select PO cells (column C in your flow)
    CallInputPONumberFromUser selectedRange
    If selectedRange Is Nothing Then
        MsgBox "No cell selected. Exiting the Program.", vbExclamation
        GoTo CleanExit
    End If

    ' Build unique PO list & ensure one customer in selection
    Dim uniquePOs As Collection
    Dim customerName As String, currentCustomer As String
    Dim rowNum As Long

    Set uniquePOs = New Collection
    On Error Resume Next

    For Each cell In selectedRange.Cells
        If cell.Column = 3 Then ' Column C = PO
            rowNum = cell.row
            currentCustomer = Trim$(CStr(jobWS.Cells(rowNum, 1).Value)) ' Column A = Customer

            If customerName = "" Then
                customerName = currentCustomer
            ElseIf StrComp(customerName, currentCustomer, vbTextCompare) <> 0 Then
                MsgBox "Different customer found in the selection. Please select rows for only one customer.", vbExclamation
                GoTo CleanExit
            End If

            poNumber = Trim$(CStr(cell.Value))
            If poNumber <> "" Then uniquePOs.Add poNumber, poNumber
        End If
    Next cell
    On Error GoTo Errhandler

    If uniquePOs.Count = 0 Then
        MsgBox "No PO numbers found in the selection.", vbExclamation
        GoTo CleanExit
    End If

    ' Create invoice file in Customer\3. OTHER FILES\INVOICE FILES
    Dim invoiceNumber As String
    invoiceNumber = "RSINV_" & Format(FillDateTimeInCanada, "yymmddhhmmss")

    Dim fullPath As String
    fullPath = GetLocalPath(ThisWorkbook.FullName)

    Dim folders() As String
    folders = Split(fullPath, "\")

    Dim masterfolderName As String, masterfolderPath As String
    masterfolderName = folders(UBound(folders) - 2)
    masterfolderPath = Left$(fullPath, InStr(1, fullPath, masterfolderName, vbTextCompare) + Len(masterfolderName))

    Dim invoiceFolderPath As String
    invoiceFolderPath = masterfolderPath & "1. CUSTOMERS\" & customerName & "\3. OTHER FILES\INVOICE FILES\"
    If Dir(invoiceFolderPath, vbDirectory) = "" Then MkDir invoiceFolderPath

    Dim invoiceFilePath As String
    invoiceFilePath = invoiceFolderPath & invoiceNumber & ".xlsm"

    Dim invoiceTemplateFileName As String
    invoiceTemplateFileName = Dir(masterfolderPath & "6. BACKEND\INVOICE\" & "RS INVOICE TEMPLATE*")

    If Len(invoiceTemplateFileName) = 0 Then
        MsgBox "Invoice template not found in: " & masterfolderPath & "6. BACKEND\INVOICE\", vbCritical
        GoTo CleanExit
    End If

    FileCopy masterfolderPath & "6. BACKEND\INVOICE\" & invoiceTemplateFileName, invoiceFilePath

    Dim invWB As Workbook, invWS As Worksheet
    Set invWB = Workbooks.Open(invoiceFilePath)
    Set invWS = invWB.Sheets("Invoice")

    ' Header fields
    invWS.Range("I2").Value = FillDateTimeInCanada
    invWS.Range("I2").NumberFormat = "m/d/yyyy"
    invWS.Range("I3").Value = invoiceNumber

    ' Billing / Shipping from Admin sheet (using your labels in Job Queue)
    Dim billingAddressRow As Long, shippingAddressRow As Long
    Dim billingLabel As String, shippingLabel As String

    billingLabel = CStr(jobWS.Cells(selectedRange.row, wsJobQueue_billingAddress_Column).Value)
    shippingLabel = CStr(jobWS.Cells(selectedRange.row, wsJobQueue_shippingAddress_Column).Value)

    Dim f As Range
    Set f = adminWS.Columns("M").Find(what:=billingLabel, LookIn:=xlValues, LookAt:=xlWhole)
    If f Is Nothing Then
        MsgBox "Billing label not found in Admin!M:M: " & billingLabel, vbCritical
        GoTo CleanExit
    End If
    billingAddressRow = f.row

    Set f = adminWS.Columns("E").Find(what:=shippingLabel, LookIn:=xlValues, LookAt:=xlWhole)
    If f Is Nothing Then
        MsgBox "Shipping label not found in Admin!E:E: " & shippingLabel, vbCritical
        GoTo CleanExit
    End If
    shippingAddressRow = f.row

    invWS.Range("I4").Value = adminWS.Cells(billingAddressRow, "C").Value           ' Billing Terms
    invWS.Range("A11").Value = adminWS.Cells(billingAddressRow, "A").Value          ' Bill-To Company
    invWS.Range("A12").Value = adminWS.Cells(billingAddressRow, "N").Value          ' Bill-To Street
    invWS.Range("A13").Value = adminWS.Cells(billingAddressRow, "O").Value & ", " & _
                               adminWS.Cells(billingAddressRow, "P").Value & ", " & _
                               adminWS.Cells(billingAddressRow, "Q").Value & ", " & _
                               adminWS.Cells(billingAddressRow, "R").Value
    invWS.Range("A14").Value = adminWS.Cells(billingAddressRow, "S").Value          ' Bill-To Email
    invWS.Range("A15").Value = adminWS.Cells(billingAddressRow, "T").Value          ' Bill-To Phone

    invWS.Range("G11").Value = adminWS.Cells(shippingAddressRow, "A").Value         ' Ship-To Company
    invWS.Range("G12").Value = adminWS.Cells(shippingAddressRow, "F").Value         ' Ship-To Street
    invWS.Range("G13").Value = adminWS.Cells(shippingAddressRow, "G").Value & ", " & _
                               adminWS.Cells(shippingAddressRow, "H").Value & ", " & _
                               adminWS.Cells(shippingAddressRow, "I").Value & ", " & _
                               adminWS.Cells(shippingAddressRow, "J").Value
    invWS.Range("G14").Value = adminWS.Cells(shippingAddressRow, "K").Value         ' Ship-To Email
    invWS.Range("G15").Value = adminWS.Cells(shippingAddressRow, "L").Value         ' Ship-To Phone

    ' --------- Dynamic invoice lines ----------
    Dim jobLR As Long
    jobLR = jobWS.Cells(jobWS.Rows.Count, wsJobQueue_customerName_Column).End(xlUp).row

    Dim rowSub As Long, rowGST As Long, rowQST As Long, rowTot As Long, lastLineRow As Long
    GetInvoiceLayout invWS, rowSub, rowGST, rowQST, rowTot, lastLineRow

    Dim nextRow As Long
    nextRow = NextEmptyLineRow(invWS, rowSub)

    Dim i As Long, prod As String, rFound As Long

    For Each po In uniquePOs
        poNumber = CStr(po)

        For i = 4 To jobLR
            If CStr(jobWS.Cells(i, wsJobQueue_POnumber_Column).Value) = poNumber Then
                If jobWS.Cells(i, wsJobQueue_OrderStatus_Column).Value = "4. Order Shipped" _
                Or jobWS.Cells(i, wsJobQueue_OrderStatus_Column).Value = "5. Partially Shipped" _
                Or (jobWS.Cells(i, wsJobQueue_OrderType_Column).Value = "NREs" _
                    And jobWS.Cells(i, wsJobQueue_OrderStatus_Column).Value <> "2. Invoice Sent to Customer") Then

                    prod = CStr(jobWS.Cells(i, wsJobQueue_ProductName_Column).Value)

                    ' A) Already on invoice? (PO + Product)
                    rFound = FindExistingLine(invWS, rowSub, poNumber, prod)

                    If rFound > 0 And jobWS.Cells(i, wsJobQueue_OrderType_Column).Value <> "NREs" Then
                        ' Merge qty
                        invWS.Cells(rFound, COL_QTY).Value = Val(invWS.Cells(rFound, COL_QTY).Value) + _
                                                             Val(jobWS.Cells(i, wsJobQueue_POQty_Column).Value)
                    Else
                        ' B) Ensure space; insert above subtotal if needed
                        EnsureSpaceForLine invWS, rowSub, rowGST, rowQST, rowTot, nextRow
                        If nextRow >= rowSub Then nextRow = rowSub - 1

                        ' Write new line
                        invWS.Cells(nextRow, COL_PO).Value = poNumber
                        invWS.Cells(nextRow, COL_PRODUCT).Value = prod
                        If jobWS.Cells(i, wsJobQueue_OrderType_Column).Value <> "NREs" Then
                            invWS.Cells(nextRow, COL_SERVICE).Value = "PCB Assembly"
                        Else
                            invWS.Cells(nextRow, COL_SERVICE).Value = "NRC"
                        End If
                        invWS.Cells(nextRow, COL_QTY).Value = jobWS.Cells(i, wsJobQueue_POQty_Column).Value
                        invWS.Cells(nextRow, COL_UNITPRICE).Value = jobWS.Cells(i, wsJobQueue_UnitPriceInPO_Column).Value

                        ' Prepare next position
                        nextRow = NextEmptyLineRow(invWS, rowSub)
                    End If
                End If
            End If
        Next i
    Next po

    ' --------- GST toggle (dynamic) ----------
    If adminWS.Cells(billingAddressRow, "R").Value <> "CA" Then
        GetInvoiceLayout invWS, rowSub, rowGST, rowQST, rowTot, lastLineRow ' re-evaluate if rows shifted
        If rowQST > 0 Then invWS.Cells(rowGST, COL_AMOUNT).ClearContents
    End If
    
    ' --------- QST toggle (dynamic) ----------
    If adminWS.Cells(billingAddressRow, "V").Value = "No" Then
        GetInvoiceLayout invWS, rowSub, rowGST, rowQST, rowTot, lastLineRow ' re-evaluate if rows shifted
        If rowQST > 0 Then invWS.Cells(rowQST, COL_AMOUNT).ClearContents
    End If
    
    ' Re-evaluate where Subtotal/GST/QST/Total ended up
    GetInvoiceLayout invWS, rowSub, rowGST, rowQST, rowTot, lastLineRow
    ApplyLineBorders invWS, rowSub
    UpdateSubtotalFormula invWS, rowSub

CleanExit:
    ReHideColumns_Jobqueue jobWS
    Exit Sub

Errhandler:
    MsgBox Err.Description, vbExclamation, "generateInvoice"
    Resume CleanExit
End Sub

Private Function CallInputPONumberFromUser(ByRef selectedRange As Range) As String
On Error GoTo leaveit
    Set selectedRange = Application.InputBox("Select the cell with PO Number to generate the Invoice", Type:=8)
leaveit:
End Function


Private Sub UpdateSubtotalFormula(invWS As Worksheet, ByVal rowSub As Long)
    Dim firstRow As Long, lastDataRow As Long
    firstRow = FIRST_DATA_ROW
    lastDataRow = rowSub - 1
    If lastDataRow < firstRow Then Exit Sub

    ' Assuming subtotal is always in column J of the Subtotal row
    invWS.Cells(rowSub, "J").Formula = "=SUM(J" & firstRow & ":J" & lastDataRow & ")"
End Sub


