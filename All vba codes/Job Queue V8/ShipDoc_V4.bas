Attribute VB_Name = "ShipDoc_V4"
'Option Explicit
'
'Public Const SHIPDOCFileName As String = "6. BACKEND\SHIP DOC\SHIPDOC V8.xlsm"
'Public Hiddencolumnnamesarray() As Double
'Sub sendtoSHIPdoc()
'
'On Error GoTo Errhandler
'
'Dim jobQueue As Worksheet
'Dim admin As Worksheet
'Dim poCell As Range
'Dim poNumber As String
'Dim poRange As Range
'Dim selectedRange As Range
'Dim cell As Range
'Dim rowNumbers As String
'
'ThisWorkbook.Activate
'Set jobQueue = ThisWorkbook.Sheets("Job Queue")
'UnHideColumns_Jobqueue jobQueue
'
'Set admin = ThisWorkbook.Sheets("Admin")
'initialiseHeaders jobQueue
'
'' Use Input Box to select the PO number cell
'Set poCell = Application.InputBox("Please select the cell containing the PO Number:", Type:=8)
'
'If poCell Is Nothing Then
'    turnOnUpdates_Calculation
'    MsgBox "No cell selected. Exiting the program.", vbExclamation
'    Exit Sub
'End If
'
'poNumber = poCell.Value
'
'' Find all rows matching the PO number in column C
'Dim firstAddress As String
'Dim foundCell As Range
'
'Set foundCell = jobQueue.Columns("C").Find(what:=poNumber, LookIn:=xlValues, LookAt:=xlWhole)
'If Not foundCell Is Nothing Then
'    firstAddress = foundCell.Address
'    Do
'        If selectedRange Is Nothing Then
'            Set selectedRange = foundCell
'        Else
'            Set selectedRange = Union(selectedRange, foundCell)
'        End If
'        Set foundCell = jobQueue.Columns("C").FindNext(foundCell)
'    Loop While Not foundCell Is Nothing And foundCell.Address <> firstAddress
'End If
'
'If selectedRange Is Nothing Then
'    turnOnUpdates_Calculation
'    MsgBox "PO Number not found in column C. Exiting the program.", vbExclamation
'    Exit Sub
'End If
'
'' ============================================================
'' UPFRONT VALIDATION - Check all required fields before proceeding
'' ============================================================
'Dim validationErrors As String
'validationErrors = ""
'
'For Each cell In selectedRange
'    Dim rowRef As String
'    rowRef = "Row " & cell.row & ": "
'
'    ' Line Number
'    If Trim(CStr(jobQueue.Cells(cell.row, wsJobQueue_LineNumber_Column).Value)) = "" Then
'        validationErrors = validationErrors & rowRef & "Line Number is missing." & Chr(10)
'    End If
'
'    ' Customer Name
'    If Trim(CStr(jobQueue.Cells(cell.row, wsJobQueue_customerName_Column).Value)) = "" Then
'        validationErrors = validationErrors & rowRef & "Customer Name is missing." & Chr(10)
'    End If
'
'    ' Product Name
'    If Trim(CStr(jobQueue.Cells(cell.row, wsJobQueue_ProductName_Column).Value)) = "" Then
'        validationErrors = validationErrors & rowRef & "Product Name is missing." & Chr(10)
'    End If
'
'    ' BOM Name
'    If Trim(CStr(jobQueue.Cells(cell.row, wsJobQueue_BOMName_Column).Value)) = "" Then
'        validationErrors = validationErrors & rowRef & "BOM Name is missing." & Chr(10)
'    End If
'
'    ' Gerber Name
'    If Trim(CStr(jobQueue.Cells(cell.row, wsJobQueue_GerberName_Column).Value)) = "" Then
'        validationErrors = validationErrors & rowRef & "Gerber Name is missing." & Chr(10)
'    End If
'
'    ' Solder Type
'    If Trim(CStr(jobQueue.Cells(cell.row, wsJobQueue_SolderType_Column).Value)) = "" Then
'        validationErrors = validationErrors & rowRef & "Solder Type is missing." & Chr(10)
'    End If
'
'    ' IPC Class
'    If Trim(CStr(jobQueue.Cells(cell.row, wsJobQueue_IPCclass_Column).Value)) = "" Then
'        validationErrors = validationErrors & rowRef & "IPC Class is missing." & Chr(10)
'    End If
'
'    ' Board Letter
'    If Trim(CStr(jobQueue.Cells(cell.row, wsJobQueue_BoardLetter_Column).Value)) = "" Then
'        validationErrors = validationErrors & rowRef & "Board Letter is missing." & Chr(10)
'    End If
'
'    ' Proc Batch Code - must exist AND contain a space (since code does Split(...)(1))
'    Dim procCode As String
'    procCode = Trim(CStr(jobQueue.Cells(cell.row, wsJobQueue_ProcBatchCode_Column).Value))
'    If procCode = "" Then
'        validationErrors = validationErrors & rowRef & "Proc Batch Code is missing." & Chr(10)
'    ElseIf InStr(procCode, " ") = 0 Then
'        validationErrors = validationErrors & rowRef & "Proc Batch Code must contain a date prefix and code separated by a space (e.g. '20240101 ABC')." & Chr(10)
'    End If
'
'    ' Order Type
'    If Trim(CStr(jobQueue.Cells(cell.row, wsJobQueue_OrderType_Column).Value)) = "" Then
'        validationErrors = validationErrors & rowRef & "Order Type is missing." & Chr(10)
'    End If
'
'    ' PO Qty - only required for non-NRE lines
'    Dim orderType As String
'    orderType = Trim(CStr(jobQueue.Cells(cell.row, wsJobQueue_OrderType_Column).Value))
'    If orderType <> "NREs" Then
'        If Trim(CStr(jobQueue.Cells(cell.row, wsJobQueue_POQty_Column).Value)) = "" Then
'            validationErrors = validationErrors & rowRef & "PO Qty is missing (required for non-NRE lines)." & Chr(10)
'        End If
'    End If
'
'    ' Billing Address
'    If Trim(CStr(jobQueue.Cells(cell.row, wsJobQueue_billingAddress_Column).Value)) = "" Then
'        validationErrors = validationErrors & rowRef & "Billing Address is missing." & Chr(10)
'    End If
'
'    ' Shipping Address
'    If Trim(CStr(jobQueue.Cells(cell.row, wsJobQueue_shippingAddress_Column).Value)) = "" Then
'        validationErrors = validationErrors & rowRef & "Shipping Address is missing." & Chr(10)
'    End If
'
'Next cell
'
'' Also validate that the Customer Name exists in the Admin sheet
'Dim custName As String
'custName = Trim(CStr(jobQueue.Cells(poCell.row, wsJobQueue_customerName_Column).Value))
'If custName <> "" Then
'    If admin.Columns("B").Find(what:=custName, LookIn:=xlValues, LookAt:=xlWhole) Is Nothing Then
'        validationErrors = validationErrors & "Customer '" & custName & "' was not found in the Admin sheet (column B). Please add the customer first." & Chr(10)
'    End If
'End If
'
'' Also validate Billing and Shipping Address labels exist in Admin sheet
'Dim billingLabel As String
'Dim shippingLabel As String
'billingLabel = Trim(CStr(jobQueue.Cells(selectedRange.row, wsJobQueue_billingAddress_Column).Value))
'shippingLabel = Trim(CStr(jobQueue.Cells(selectedRange.row, wsJobQueue_shippingAddress_Column).Value))
'
'If billingLabel <> "" Then
'    If admin.Columns("M").Find(what:=billingLabel, LookIn:=xlValues, LookAt:=xlWhole) Is Nothing Then
'        validationErrors = validationErrors & "Billing Address label '" & billingLabel & "' was not found in Admin sheet (column M)." & Chr(10)
'    End If
'End If
'
'If shippingLabel <> "" Then
'    If admin.Columns("E").Find(what:=shippingLabel, LookIn:=xlValues, LookAt:=xlWhole) Is Nothing Then
'        validationErrors = validationErrors & "Shipping Address label '" & shippingLabel & "' was not found in Admin sheet (column E)." & Chr(10)
'    End If
'End If
'
'' If any validation errors found, show them all and stop
'If validationErrors <> "" Then
'    ReHideColumns_Jobqueue jobQueue
'    turnOnUpdates_Calculation
'    MsgBox "Please fix the following issues before generating the Ship Doc:" & Chr(10) & Chr(10) & validationErrors, vbExclamation, "Validation Failed"
'    Exit Sub
'End If
'
'' ============================================================
'' END VALIDATION - All checks passed, proceed
'' ============================================================
'
'turnOffUpdates_Calculation
'
'' Rest of the code to generate ship doc
'Dim customerName As String
'Dim customerFullNams As String
'Dim customerRow As Integer
'
'customerName = jobQueue.Cells(poCell.row, wsJobQueue_customerName_Column)
'customerRow = admin.Columns("B").Find(what:=customerName, LookIn:=xlValues, LookAt:=xlWhole).row
'customerFullNams = admin.Cells(customerRow, "A")
'
'    Dim fullPath As String
'    Dim masterfolderName As String
'    Dim masterfolderPath As String
'    Dim shipDocFileAddress As String
'    Dim shipDocFolder As String
'    Dim folders() As String
'    Dim po_Folder As String
'    Dim versionNo As String
'
'    versionNo = Mid(SHIPDOCFileName, InStrRev(SHIPDOCFileName, ".") - 2, 2)
'    fullPath = GetLocalPath(ThisWorkbook.FullName)
'
'    folders = Split(fullPath, "\")
'    masterfolderName = folders(UBound(folders) - 2)
'    masterfolderPath = Left(fullPath, InStr(1, fullPath, masterfolderName, vbTextCompare) + Len(masterfolderName))
'    shipDocFolder = masterfolderPath & "1. CUSTOMERS\" & customerName & "\" & "2. PO's RECEIVED AND COMPLETED\" & poNumber & "\" & "3. SHIPPING DOCS" & " - " & poNumber & "\"
'    shipDocFileAddress = shipDocFolder & "SHIPMENT1 SHIPDOC" & versionNo & " " & customerName & " " & poNumber & ".xlsm"
'
'    po_Folder = masterfolderPath & "1. CUSTOMERS\" & customerName & "\" & "2. PO's RECEIVED AND COMPLETED\" & poNumber
'
'    If Dir(shipDocFolder, vbDirectory) = "" Then
'        MkDir po_Folder
'        MkDir po_Folder & "\" & "1. PURCHASE ORDER RECIEVED" & " - " & poNumber
'        MkDir po_Folder & "\" & "2. INVOICES" & " - " & poNumber
'        MkDir po_Folder & "\" & "3. SHIPPING DOCS" & " - " & poNumber
'        FileCopy masterfolderPath & SHIPDOCFileName, shipDocFileAddress
'    Else
'        FileCopy masterfolderPath & SHIPDOCFileName, shipDocFileAddress
'    End If
'
'        Dim shipDoc As Workbook
'        Dim packingSlip As Worksheet
'        Dim shipDocAdmin As Worksheet
'        Dim k As Long
'
'        Set shipDoc = Workbooks.Open(shipDocFileAddress)
'        Set packingSlip = shipDoc.Sheets("PackingSlip")
'        Set shipDocAdmin = shipDoc.Sheets("admin")
'
'        k = 2
'        For Each cell In selectedRange
'            shipDocAdmin.Cells(k, "A") = jobQueue.Cells(cell.row, wsJobQueue_ProductName_Column)
'            shipDocAdmin.Cells(k, "B") = jobQueue.Cells(cell.row, wsJobQueue_BOMName_Column)
'            shipDocAdmin.Cells(k, "C") = jobQueue.Cells(cell.row, wsJobQueue_GerberName_Column)
'            shipDocAdmin.Cells(k, "D") = jobQueue.Cells(cell.row, wsJobQueue_SolderType_Column)
'            shipDocAdmin.Cells(k, "E") = jobQueue.Cells(cell.row, wsJobQueue_IPCclass_Column)
'            shipDocAdmin.Cells(k, "F") = jobQueue.Cells(cell.row, wsJobQueue_BoardLetter_Column)
'            shipDocAdmin.Cells(k, "G") = jobQueue.Cells(cell.row, wsJobQueue_SerialNoRequired_Column)
'            k = k + 1
'        Next cell
'
'        shipDocAdmin.Range("I2").Value = customerFullNams
'        shipDocAdmin.Range("J2").Value = customerName
'        shipDocAdmin.Range("K2").Value = Split(jobQueue.Cells(selectedRange.row, wsJobQueue_ProcBatchCode_Column), " ")(1)
'
'        packingSlip.Range("I4") = poNumber
'        k = 18
'
'        For Each cell In selectedRange
'            If jobQueue.Cells(cell.row, wsJobQueue_OrderType_Column) <> "NREs" Then
'                packingSlip.Cells(k, "B") = jobQueue.Cells(cell.row, wsJobQueue_LineNumber_Column)
'                packingSlip.Cells(k, "C") = jobQueue.Cells(cell.row, wsJobQueue_ProductName_Column)
'                packingSlip.Cells(k, "H") = jobQueue.Cells(cell.row, wsJobQueue_POQty_Column)
'                k = k + 1
'            End If
'        Next cell
'
'        Dim billingAddressRow As Integer
'        Dim shippingAddressRow As Integer
'
'        billingAddressRow = admin.Columns("M").Find(what:=billingLabel, LookIn:=xlValues, LookAt:=xlWhole).row
'        shippingAddressRow = admin.Columns("E").Find(what:=shippingLabel, LookIn:=xlValues, LookAt:=xlWhole).row
'
'        packingSlip.Range("A10") = admin.Cells(billingAddressRow, "D")
'        packingSlip.Range("A11") = admin.Cells(billingAddressRow, "A")
'        packingSlip.Range("A12") = admin.Cells(billingAddressRow, "N")
'        packingSlip.Range("A13") = admin.Cells(billingAddressRow, "O") & ", " & admin.Cells(billingAddressRow, "P") & ", " & admin.Cells(billingAddressRow, "Q") & ", " & admin.Cells(billingAddressRow, "R")
'        packingSlip.Range("A14") = admin.Cells(billingAddressRow, "S")
'        packingSlip.Range("A15") = admin.Cells(billingAddressRow, "T")
'        packingSlip.Range("G10") = admin.Cells(shippingAddressRow, "D")
'        packingSlip.Range("G11") = admin.Cells(shippingAddressRow, "A")
'        packingSlip.Range("G12") = admin.Cells(shippingAddressRow, "F")
'        packingSlip.Range("G13") = admin.Cells(shippingAddressRow, "G") & ", " & admin.Cells(shippingAddressRow, "H") & ", " & admin.Cells(shippingAddressRow, "I") & ", " & admin.Cells(shippingAddressRow, "J")
'        packingSlip.Range("G14") = admin.Cells(shippingAddressRow, "K")
'        packingSlip.Range("G15") = admin.Cells(shippingAddressRow, "L")
'
'ReHideColumns_Jobqueue jobQueue
'
'turnOnUpdates_Calculation
'Exit Sub
'
'Errhandler:
'ReHideColumns_Jobqueue jobQueue
'turnOnUpdates_Calculation
'MsgBox Err.Description, vbExclamation, "Macro"
'End Sub
