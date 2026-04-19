Attribute VB_Name = "ShipDoc_V3"
Option Explicit

Public Const SHIPDOCFileName As String = "6. BACKEND\SHIP DOC\SHIPDOC V8.xlsm"
Public Hiddencolumnnamesarray() As Double

Sub sendtoSHIPdoc()

On Error GoTo Errhandler

Dim jobQueue As Worksheet
Dim admin As Worksheet
Dim poCell As Range
Dim poNumber As String
Dim poRange As Range
Dim selectedRange As Range
Dim cell As Range
Dim rowNumbers As String

ThisWorkbook.Activate
Set jobQueue = ThisWorkbook.Sheets("Job Queue")
''Update
UnHideColumns_Jobqueue jobQueue

Set admin = ThisWorkbook.Sheets("Admin")

''Updated
initialiseHeaders jobQueue

'' Use Input Box to select the PO number cell
Set poCell = Application.InputBox("Please select the cell containing the PO Number:", Type:=8)

If poCell Is Nothing Then
    turnOnUpdates_Calculation
    MsgBox "No cell selected. Exiting the program.", vbExclamation
    Exit Sub
End If

poNumber = poCell.Value

'' Find the range of rows in column C containing the PO number
Dim firstAddress As String
Dim foundCell As Range

Set foundCell = jobQueue.Columns("C").Find(what:=poNumber, LookIn:=xlValues, LookAt:=xlWhole)
If Not foundCell Is Nothing Then
    firstAddress = foundCell.Address
    Do
        If selectedRange Is Nothing Then
            Set selectedRange = foundCell
        Else
            Set selectedRange = Union(selectedRange, foundCell)
        End If
        Set foundCell = jobQueue.Columns("C").FindNext(foundCell)
    Loop While Not foundCell Is Nothing And foundCell.Address <> firstAddress
End If

If selectedRange Is Nothing Then
    turnOnUpdates_Calculation
    MsgBox "PO Number not found in column C. Exiting the program.", vbExclamation
    Exit Sub
End If


turnOffUpdates_Calculation

Dim missingLines As String

'' Check for missing lines in selected rows
For Each cell In selectedRange
    If jobQueue.Cells(cell.row, wsJobQueue_LineNumber_Column) = "" Then
        missingLines = missingLines & ", " & Replace(jobQueue.Cells(cell.row, wsJobQueue_LineNumber_Column).Address, "$", "")
    End If
Next cell

missingLines = Mid(missingLines, 3)

If missingLines <> "" Then
    turnOnUpdates_Calculation
    MsgBox "Please add line # in below mentioned cells to generate the SHIP DOC:" & Chr(10) & missingLines, vbExclamation
    Exit Sub
End If

'' Rest of the code to generate ship doc
Dim customerName As String
Dim customerFullNams As String
Dim customerRow As Integer

customerName = jobQueue.Cells(poCell.row, wsJobQueue_customerName_Column)
customerRow = admin.Columns("B").Find(what:=customerName, LookIn:=xlValues, LookAt:=xlWhole).row
customerFullNams = admin.Cells(customerRow, "A")

    ' define paths
    Dim fullPath As String
    Dim masterfolderName As String
    Dim masterfolderPath As String
    Dim shipDocFileAddress As String
    Dim shipDocFolder As String
    Dim folders() As String
    Dim po_Folder As String
    Dim versionNo As String

    versionNo = Mid(SHIPDOCFileName, InStrRev(SHIPDOCFileName, ".") - 2, 2)
    fullPath = GetLocalPath(ThisWorkbook.FullName)

    ' Split the path string using backslash as delimiter
    folders = Split(fullPath, "\")
    masterfolderName = folders(UBound(folders) - 2)
    masterfolderPath = Left(fullPath, InStr(1, fullPath, masterfolderName, vbTextCompare) + Len(masterfolderName))
    shipDocFolder = masterfolderPath & "1. CUSTOMERS\" & customerName & "\" & "2. PO's RECEIVED AND COMPLETED\" & poNumber & "\" & "3. SHIPPING DOCS" & " - " & poNumber & "\"
    shipDocFileAddress = shipDocFolder & "SHIPMENT1 SHIPDOC" & versionNo & " " & customerName & " " & poNumber & ".xlsm"
    'Debug.Print shipDocFileAddress

    po_Folder = masterfolderPath & "1. CUSTOMERS\" & customerName & "\" & "2. PO's RECEIVED AND COMPLETED\" & poNumber

    ' Check if the PO Folder exists
    If Dir(shipDocFolder, vbDirectory) = "" Then

        ' create a PO Folder and sub folders
        MkDir po_Folder
        MkDir po_Folder & "\" & "1. PURCHASE ORDER RECIEVED" & " - " & poNumber
        MkDir po_Folder & "\" & "2. INVOICES" & " - " & poNumber
        MkDir po_Folder & "\" & "3. SHIPPING DOCS" & " - " & poNumber

        ''Updated
        ' add Shipdoc template in shipping doc folder and rename it "SHIPMENT1 SHIPDOCV7 CustomerName PONumber.xlsm"
        'FileCopy masterfolderPath & "SHIP DOC\SHIPDOC V7.xlsm", shipDocFileAddress
        FileCopy masterfolderPath & SHIPDOCFileName, shipDocFileAddress
    Else
        FileCopy masterfolderPath & SHIPDOCFileName, shipDocFileAddress
    End If

' generate ship doc
        Dim shipDoc As Workbook
        Dim packingSlip As Worksheet
        Dim shipDocAdmin As Worksheet
        Dim k As Long

        Set shipDoc = Workbooks.Open(shipDocFileAddress)
        Set packingSlip = shipDoc.Sheets("PackingSlip")
        Set shipDocAdmin = shipDoc.Sheets("admin")

        k = 2
        For Each cell In selectedRange

        ''Updated
            shipDocAdmin.Cells(k, "A") = jobQueue.Cells(cell.row, wsJobQueue_ProductName_Column)
            shipDocAdmin.Cells(k, "B") = jobQueue.Cells(cell.row, wsJobQueue_BOMName_Column)
            shipDocAdmin.Cells(k, "C") = jobQueue.Cells(cell.row, wsJobQueue_GerberName_Column)
            shipDocAdmin.Cells(k, "D") = jobQueue.Cells(cell.row, wsJobQueue_SolderType_Column)
            shipDocAdmin.Cells(k, "E") = jobQueue.Cells(cell.row, wsJobQueue_IPCclass_Column)
            shipDocAdmin.Cells(k, "F") = jobQueue.Cells(cell.row, wsJobQueue_BoardLetter_Column)
            shipDocAdmin.Cells(k, "G") = jobQueue.Cells(cell.row, wsJobQueue_SerialNoRequired_Column)       'Serial Number Required?
            k = k + 1

        Next cell

        shipDocAdmin.Range("I2").Value = customerFullNams
        shipDocAdmin.Range("J2").Value = customerName
        'shipDocAdmin.Range("K2").Value = jobQueue.Cells(selectedRange.row, wsJobQueue_ProcBatchCode_Column)                  'Proc Batch Code
        shipDocAdmin.Range("K2").Value = Split(jobQueue.Cells(selectedRange.row, wsJobQueue_ProcBatchCode_Column), " ")(1)    'Proc Batch Code without the date prefix

        packingSlip.Range("I4") = poNumber
        k = 18

        ''Update
        For Each cell In selectedRange
            If jobQueue.Cells(cell.row, wsJobQueue_OrderType_Column) <> "NREs" Then
                packingSlip.Cells(k, "B") = jobQueue.Cells(cell.row, wsJobQueue_LineNumber_Column)
                packingSlip.Cells(k, "C") = jobQueue.Cells(cell.row, wsJobQueue_ProductName_Column)
                packingSlip.Cells(k, "H") = jobQueue.Cells(cell.row, wsJobQueue_POQty_Column)
                k = k + 1
            End If
        Next cell

        'Add the address of customer in ShipDoc from Job Queue

        Dim billingAddressRow As Integer
        Dim shippingAddressRow As Integer
        Dim billingLabel As String
        Dim shippingLabel As String

        billingLabel = jobQueue.Cells(selectedRange.row, wsJobQueue_billingAddress_Column)
        shippingLabel = jobQueue.Cells(selectedRange.row, wsJobQueue_shippingAddress_Column)

        billingAddressRow = admin.Columns("M").Find(what:=billingLabel, LookIn:=xlValues, LookAt:=xlWhole).row
        shippingAddressRow = admin.Columns("E").Find(what:=shippingLabel, LookIn:=xlValues, LookAt:=xlWhole).row

        packingSlip.Range("A10") = admin.Cells(billingAddressRow, "D")
        packingSlip.Range("A11") = admin.Cells(billingAddressRow, "A")
        packingSlip.Range("A12") = admin.Cells(billingAddressRow, "N")
        packingSlip.Range("A13") = admin.Cells(billingAddressRow, "O") & ", " & admin.Cells(billingAddressRow, "P") & ", " & admin.Cells(billingAddressRow, "Q") & ", " & admin.Cells(billingAddressRow, "R")
        packingSlip.Range("A14") = admin.Cells(billingAddressRow, "S")
        packingSlip.Range("A15") = admin.Cells(billingAddressRow, "T")
        packingSlip.Range("G10") = admin.Cells(shippingAddressRow, "D")
        packingSlip.Range("G11") = admin.Cells(shippingAddressRow, "A")
        packingSlip.Range("G12") = admin.Cells(shippingAddressRow, "F")
        packingSlip.Range("G13") = admin.Cells(shippingAddressRow, "G") & ", " & admin.Cells(shippingAddressRow, "H") & ", " & admin.Cells(shippingAddressRow, "I") & ", " & admin.Cells(shippingAddressRow, "J")
        packingSlip.Range("G14") = admin.Cells(shippingAddressRow, "K")
        packingSlip.Range("G15") = admin.Cells(shippingAddressRow, "L")
        ReHideColumns_Jobqueue jobQueue

ReHideColumns_Jobqueue jobQueue

turnOnUpdates_Calculation
Exit Sub

Errhandler:
turnOnUpdates_Calculation
MsgBox Err.Description, vbExclamation, "Macro"
End Sub


