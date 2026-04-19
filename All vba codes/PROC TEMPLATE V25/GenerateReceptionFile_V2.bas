Attribute VB_Name = "GenerateReceptionFile_V2"
Option Compare Text
Option Explicit

Sub createReceptionFile()

Application.ScreenUpdating = False
Application.Calculation = xlCalculationManual

Dim ProcWS As Worksheet, compWS As Worksheet, pcbWS As Worksheet
Dim xBoard As Boolean

xBoard = False

Set ProcWS = ThisWorkbook.Sheets("Proc")
Set compWS = ThisWorkbook.Sheets("Components Orders")
Set pcbWS = ThisWorkbook.Sheets("PCB + Stencils Orders")

Dim fullPath As String
fullPath = GetLocalPath(ThisWorkbook.FullName)

''==== For now just use this local path settings
'fullPath = ThisWorkbook.FullName

'=== remove above line for one drive path====
Dim folders() As String
folders() = Split(fullPath, "\")

Dim masterFolderName As String
Dim masterFolderPath As String
Dim procBatchCode As String
Dim procfolderPath As String

masterFolderName = folders(UBound(folders) - 3)
masterFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName, vbTextCompare) + Len(masterFolderName))
procBatchCode = folders(UBound(folders) - 1)
procfolderPath = Left(fullPath, InStrRev(fullPath, "\"))

Dim receptionwb As Workbook
Dim receptionWS As Worksheet

Set receptionwb = Workbooks.Add
Set receptionWS = receptionwb.Sheets(1)
receptionWS.Name = "Reception File"


' add data to reception file

receptionWS.Cells(1, 1) = procBatchCode & " reception file"
receptionWS.Cells(1, 1).Font.size = 48

receptionWS.Cells(3, "A") = "GMP"
receptionWS.Cells(3, "B") = "Qty"
receptionWS.Cells(3, "C") = "Letter"

receptionWS.Range("A3:C3").Interior.Color = RGB(241, 169, 131)
receptionWS.Range("A3:C3").Font.Bold = True

' get the board names from PCB + Stencils Orders sheet
Dim receptionLR As Long
Dim pcbLR As Long

initialiseHeaders , , , , , , pcbWS

receptionLR = receptionWS.Cells(receptionWS.Rows.count, "A").End(xlUp).Row + 1
pcbLR = pcbWS.Cells(pcbWS.Rows.count, PCB_ProcSheet_GMP__Column).End(xlUp).Row



If pcbLR >= 2 Then
    Dim i As Long
    For i = 2 To pcbLR
        If pcbWS.Cells(i, PCB_ProcSheet_Type__Column) = "PCB" Then
            receptionWS.Cells(receptionLR, "A") = pcbWS.Cells(i, PCB_ProcSheet_GMP__Column)
            receptionWS.Cells(receptionLR, "B") = pcbWS.Cells(i, PCB_ProcSheet_Qty__Column)
            receptionWS.Cells(receptionLR, "C") = pcbWS.Cells(i, PCB_ProcSheet_Letter__Column)
            receptionLR = receptionLR + 1
        End If
    Next i
End If

' Apply border
receptionWS.Range("A3:C" & receptionLR - 1).Borders.LineStyle = xlContinuous

' find last row again
receptionLR = receptionWS.Cells(receptionWS.Rows.count, "A").End(xlUp).Row + 2

' create headers in reception file
receptionWS.Cells(receptionLR, "A") = "CPC"
receptionWS.Cells(receptionLR, "B") = "Description"
receptionWS.Cells(receptionLR, "C") = "M CODES"
receptionWS.Cells(receptionLR, "D") = "Result"
receptionWS.Cells(receptionLR, "E") = "QTY to order"
receptionWS.Cells(receptionLR, "F") = "Customer Ref"
receptionWS.Cells(receptionLR, "G") = "Number on Bag"
receptionWS.Cells(receptionLR, "H") = "Place to Buy"
receptionWS.Cells(receptionLR, "I") = "PN to USE"

receptionWS.Range(receptionWS.Cells(receptionLR, "A"), receptionWS.Cells(receptionLR, "I")).Interior.Color = RGB(241, 169, 131)
receptionWS.Range(receptionWS.Cells(receptionLR, "A"), receptionWS.Cells(receptionLR, "I")).Font.Bold = True

' get proc data start row number for borders
Dim cpcRw As Long
cpcRw = receptionLR

' get the proc data
Dim procLR As Long
procLR = ProcWS.Cells(ProcWS.Rows.count, "B").End(xlUp).Row
receptionLR = receptionWS.Cells(receptionWS.Rows.count, "A").End(xlUp).Row + 1

initialiseHeaders , , , ProcWS

For i = 5 To procLR
    receptionWS.Cells(receptionLR, "A") = ProcWS.Cells(i, Procsheet_CPC_Column)
    receptionWS.Cells(receptionLR, "B") = ProcWS.Cells(i, Procsheet_CustomerDescription_Column)
    receptionWS.Cells(receptionLR, "C") = ProcWS.Cells(i, Procsheet_Mcodes_Column)
    receptionWS.Cells(receptionLR, "D") = ProcWS.Cells(i, Procsheet_BoardName_Column)
    receptionWS.Cells(receptionLR, "E") = ProcWS.Cells(i, Procsheet_ORDERQTY_Column)
    receptionWS.Cells(receptionLR, "F") = ProcWS.Cells(i, Procsheet_CustomerRef_Column)
    receptionWS.Cells(receptionLR, "G") = ProcWS.Cells(i, Procsheet_DistPN_Column)
    receptionWS.Cells(receptionLR, "H") = ProcWS.Cells(i, Procsheet_Placetobuy_Column)
    receptionWS.Cells(receptionLR, "I") = ProcWS.Cells(i, Procsheet_PNTOUSE_Column)
    
    If xBoard = False Then
        If InStr(1, ProcWS.Cells(i, Procsheet_BoardName_Column), "+") > 0 Then
            xBoard = True
        End If
    End If
    
    receptionLR = receptionLR + 1
Next i

' Apply border

receptionWS.Range(receptionWS.Cells(cpcRw, "A"), receptionWS.Cells(receptionLR - 1, "I")).Borders.LineStyle = xlContinuous

' add buying summary

receptionLR = receptionWS.Cells(receptionWS.Rows.count, "A").End(xlUp).Row + 2

receptionWS.Cells(receptionLR, "A") = "Distributor"
receptionWS.Cells(receptionLR, "B") = "Sales Order"
receptionWS.Cells(receptionLR, "C") = "# of Lines"
receptionWS.Cells(receptionLR, "D") = "Notes (if any)"

receptionWS.Range(receptionWS.Cells(receptionLR, "A"), receptionWS.Cells(receptionLR, "D")).Interior.Color = RGB(241, 169, 131)
receptionWS.Range(receptionWS.Cells(receptionLR, "A"), receptionWS.Cells(receptionLR, "D")).Font.Bold = True

' get proc data start row number for borders
Dim distRw As Long
distRw = receptionLR

receptionLR = receptionWS.Cells(receptionWS.Rows.count, "A").End(xlUp).Row + 1

Dim compLR As Long
compLR = compWS.Cells(compWS.Rows.count, "A").End(xlUp).Row

initialiseHeaders , , , , compWS

For i = 2 To compLR
    receptionWS.Cells(receptionLR, "A") = compWS.Cells(i, ComponentsOrders_ProcSheet_DISTRIBUTOR__Column)
    receptionWS.Cells(receptionLR, "B") = compWS.Cells(i, ComponentsOrders_ProcSheet_SALESORDER_Column)
    receptionWS.Cells(receptionLR, "D") = compWS.Cells(i, ComponentsOrders_ProcSheet_Notes_Column)
    receptionWS.Cells(receptionLR, "C").formula = "=COUNTIF(H:H,""" & "*" & compWS.Cells(i, ComponentsOrders_ProcSheet_DISTRIBUTOR__Column) & """)"
    receptionLR = receptionLR + 1
Next i

receptionLR = receptionWS.Cells(receptionWS.Rows.count, "A").End(xlUp).Row + 1
receptionWS.Cells(receptionLR, "A") = "Stock at RS"
receptionWS.Cells(receptionLR, "C").formula = "=COUNTIF(H:H,""" & "*stock" & """)"

receptionLR = receptionWS.Cells(receptionWS.Rows.count, "A").End(xlUp).Row + 1
receptionWS.Cells(receptionLR, "A") = "CX Supplies"
receptionWS.Cells(receptionLR, "C").formula = "=COUNTIF(H:H,""" & "*Supplies" & """)"

''

' Set page orientation to landscape
receptionWS.PageSetup.Orientation = xlLandscape

' Set page margins
With receptionWS.PageSetup
    .LeftMargin = Application.InchesToPoints(0.25)
    .RightMargin = Application.InchesToPoints(0.25)
    .TopMargin = Application.InchesToPoints(0.25)
    .BottomMargin = Application.InchesToPoints(0.25)
End With

'Debug.Print receptionWS.UsedRange.Address

' Set scaling options
With receptionWS.PageSetup
    .Zoom = False
    .FitToPagesWide = 1
    .FitToPagesTall = False
End With

' Apply border
receptionWS.Range(receptionWS.Cells(distRw, "A"), receptionWS.Cells(receptionLR, "D")).Borders.LineStyle = xlContinuous
receptionWS.Range("A3:I" & receptionLR - 1).Columns.AutoFit

If receptionWS.Columns("B").ColumnWidth > 58 Then
    receptionWS.Columns("B").ColumnWidth = 58
End If

receptionwb.SaveAs procfolderPath & "Reception File " & procBatchCode & ".xlsx"

' get packages count for reception file and production sheet
' Example usage in your main code:
Dim packageSummary As String
packageSummary = WritePackagesSummary(receptionWS, ProcWS, procLR)
 'WritePackagesSummary receptionWS, ProcWS, procLR

' Display or use the summary
Debug.Print "Package Summary: " & packageSummary

createXcomp_file
createStockfile
createCxSuppliesFile


'generateLabels ThisWorkbook, ProcWS, procBatchCode, receptionwb, xBoard
receptionwb.Close SaveChanges:=True

Application.ScreenUpdating = True
Application.Calculation = xlCalculationAutomatic


' modify the BOM Print Copies
modifyPrintCopy procfolderPath, GetBOMNames(pcbWS), ProcWS



' update the reception file status in Production Schedule
Dim ProdSchFileName As String, ProdSchFilePath As String
Dim wbProdSch As Workbook, wsProdSch As Worksheet

ProdSchFilePath = masterFolderPath & "\5. PRODUCTION SCHEDULE\"
ProdSchFileName = Dir(ProdSchFilePath & "Production Schedule*")
ProdSchFilePath = ProdSchFilePath & ProdSchFileName

Set wbProdSch = Workbooks.Open(ProdSchFilePath)
Set wsProdSch = wbProdSch.Sheets("Project schedule - Detailed")

' Initialise Production Schedule Headers
initialiseHeaders , , , , , , , , , , , , , , , wsProdSch

Dim j As Long, wsProdSchLR As Long
wsProdSchLR = wsProdSch.Cells(wsProdSch.Rows.count, wsProdSch_Task_Column).End(xlUp).Row

For j = 8 To wsProdSchLR
    If wsProdSch.Cells(j, wsProdSch_OrderType_Column) = "" And InStr(1, wsProdSch.Cells(j, wsProdSch_Task_Column), procBatchCode, vbTextCompare) > 0 Then
        wsProdSch.Cells(j, wsProdSch_ReceptionFileStatus_Column) = "Ready"
    End If
Next j
Dim colNo As Long
colNo = 0
' Search for the file name in variable procBatchCode
    For j = 8 To wsProdSchLR ' Assuming data starts from row 8
        If InStr(1, wsProdSch.Cells(j, wsProdSch_Task_Column).Value, procBatchCode, vbTextCompare) > 0 Then
            colNo = j ' Return the row number
            Exit For
        End If
    Next j
If colNo > 0 Then
   'wsprodSch_PackagingType_Column.Value = packageSummary
   wsProdSch.Cells(j, wsprodSch_PackagingType_Column).Value = packageSummary
ElseIf colNo = 0 Then
    MsgBox "Not found", vbInformation, "No data for: " & packageSummary
End If


Application.ScreenUpdating = True
Application.Calculation = xlCalculationAutomatic

MsgBox "Reception file Updated!"


End Sub


Function modifyPrintCopy(procfolderPath As String, BOMNames As Variant, wsProc As Worksheet)

'    Application.ScreenUpdating = False
'    Application.DisplayAlerts = False
'temporary disabled
Exit Function
    Dim wbPrintCopy As Workbook, wsPrintCopy As Worksheet, wsNewPrintCopy As Worksheet
    Dim b As Long
    Dim printCopyFileName As String, printCopyPath As String
    
    For b = LBound(BOMNames) To UBound(BOMNames)
        If BOMNames(b) <> "" Then
            printCopyFileName = "Print Copy DMF - " & BOMNames(b) & ".xlsx"
            printCopyPath = procfolderPath & printCopyFileName
            
            Set wbPrintCopy = Workbooks.Open(printCopyPath)
            
            Set wsPrintCopy = wbPrintCopy.Sheets("Print Copy")
            wsPrintCopy.Copy after:=wsPrintCopy
            Set wsNewPrintCopy = ActiveSheet
            wsNewPrintCopy.Name = "Print Copy Cust Ref"
            
            wbPrintCopy.Windows(1).Visible = False
            
            With wsNewPrintCopy
                .Rows("1:2").Delete
                .Columns("F").Delete
                .Columns("B").Delete
                .Range("F1").Font.Bold = True
                .Range("G1").Font.Bold = True
                .Range("H1").Font.Bold = True
            End With
            
            wsNewPrintCopy.Range("F1") = "Customer Ref"
            wsNewPrintCopy.Range("G1") = "Place Bought"
            wsNewPrintCopy.Range("H1") = "Sales Order #"
            
            ' loop through all rows and fill the details
            Dim i As Long, lr As Long
            lr = wsNewPrintCopy.Cells(wsNewPrintCopy.Rows.count, "B").End(xlUp).Row
            
            Dim findCPC As String, foundRow As Range
            For i = lr To 2 Step -1
                If wsNewPrintCopy.Cells(i, "A") > 0 Then
                    findCPC = wsNewPrintCopy.Cells(i, "B")
                    On Error Resume Next
                    Set foundRow = wsProc.Columns("B:B").Find(What:=findCPC, LookAt:=xlWhole, MatchCase:=False)
                    On Error GoTo 0
                    
                    If Not foundRow Is Nothing Then
                        wsNewPrintCopy.Cells(i, "F") = wsProc.Cells(foundRow.Row, Procsheet_CustomerRef_Column)
                        wsNewPrintCopy.Cells(i, "G") = wsProc.Cells(foundRow.Row, Procsheet_Placetobuy_Column)
                        wsNewPrintCopy.Cells(i, "H") = wsProc.Cells(foundRow.Row, Procsheet_SalesOrderNo_Column)
                    Else
                        GoTo nextLine
                    End If
                ElseIf wsNewPrintCopy.Cells(i, "A") = 0 Or wsNewPrintCopy.Cells(i, "A") = "" Then
                    wsNewPrintCopy.Rows(i).Delete
                End If
nextLine:
            Next i
            
            Dim lastRow As Long
            lastRow = wsNewPrintCopy.Cells(wsNewPrintCopy.Rows.count, "A").End(xlUp).Row
            With wsNewPrintCopy
                .Range("A2:H" & lastRow).Font.size = 14
                .Range("F2:H" & lastRow).Columns.AutoFit
                .Range("A1:H" & lastRow).Borders.LineStyle = xlContinuous
            End With
            
            wbPrintCopy.Windows(1).Visible = True
            wbPrintCopy.Save
            wbPrintCopy.Close
        End If
    Next b
    

End Function


Function GetBOMNames(wsPCB As Worksheet) As Variant
    
    Dim lastRow As Long
    Dim i As Long
    Dim arr() As Variant
    
    ' initialise headers
    initialiseHeaders , , , , , , wsPCB

    ' Find last row in Column J
    lastRow = wsPCB.Cells(wsPCB.Rows.count, PCB_Procsheet_BOMname_Column).End(xlUp).Row

    ' Create array sized to number of BOM entries (row 2 to lastRow)
    ReDim arr(1 To lastRow - 1)

    ' Fill array
    For i = 2 To lastRow
        If wsPCB.Cells(i, PCB_ProcSheet_Type__Column) = "PCB" Then
            arr(i - 1) = wsPCB.Cells(i, PCB_Procsheet_BOMname_Column).Value
        End If
    Next i

    ' Return array
    GetBOMNames = arr
End Function



' ===================================================================
' SUBROUTINE: Extract and write unique packages with counts
' Returns: String like "CP=3, IP=6, DP=2"
' ===================================================================
Public Function WritePackagesSummary(ByVal receptionWS As Worksheet, _
                                     ByVal ProcWS As Worksheet, _
                                     ByVal procLR As Long) As String
    
    ' Step 1: Find the next available row in reception file (with 2-row gap)
    Dim receptionLR As Long
    receptionLR = receptionWS.Cells(receptionWS.Rows.count, "A").End(xlUp).Row + 2
    
    ' Step 2: Create headers for the packages section
    receptionWS.Cells(receptionLR, "A") = "Item"
    receptionWS.Cells(receptionLR, "B") = "Count"
    
    ' Step 3: Format headers with orange background and bold font
    With receptionWS.Range(receptionWS.Cells(receptionLR, "A"), receptionWS.Cells(receptionLR, "B"))
        .Interior.Color = RGB(241, 169, 131)
        .Font.Bold = True
    End With
    
    ' Step 4: Store the header row number for applying borders later
    Dim itemRw As Long
    itemRw = receptionLR
    
    ' Step 5: Find the "Packages" column in Proc sheet
    Dim packagesCol As Long
    packagesCol = FindPackagesColumn(ProcWS)
    
    ' Initialize return string
    WritePackagesSummary = ""
    
    ' Step 6: Process packages data if "Packages" column was found
    If packagesCol > 0 Then
        ' Step 7: Create dictionary with unique items and counts
        Dim dict As Object
        Set dict = GetPackagesDictionary(ProcWS, packagesCol, procLR)
        
        ' Step 8: Write ALL items to sheet and build filtered summary string
        Dim summaryList As String
        summaryList = WritePackagesToSheetAndGetSummary(receptionWS, dict, receptionLR + 1, receptionLR)
        
        ' Step 9: Apply borders around the entire packages section
        If receptionLR > itemRw + 1 Then
            receptionWS.Range(receptionWS.Cells(itemRw, "A"), _
                            receptionWS.Cells(receptionLR - 1, "B")).Borders.LineStyle = xlContinuous
        End If
        
        ' Return the filtered summary
        WritePackagesSummary = summaryList
    End If
    
End Function

' ===================================================================
' HELPER FUNCTION: Find the "Packages" column in Proc sheet
' ===================================================================
Public Function FindPackagesColumn(ByVal ProcWS As Worksheet) As Long
    Dim headerRow As Long
    Dim lastCol As Long
    Dim i As Long
    
    headerRow = 4 ' Assuming headers are in row 4 of Proc sheet
    lastCol = ProcWS.Cells(headerRow, ProcWS.Columns.count).End(xlToLeft).Column
    
    ' Loop through all columns in header row to find "Packages" column
    For i = 1 To lastCol
        If Trim(ProcWS.Cells(headerRow, i).Value) = "Packaging Type" Then
            FindPackagesColumn = i
            Exit Function
        End If
    Next i
    
    
    FindPackagesColumn = 0 ' Not found
End Function

' ===================================================================
' HELPER FUNCTION: Create dictionary of unique packages and counts
' ===================================================================
Public Function GetPackagesDictionary(ByVal ProcWS As Worksheet, _
                                      ByVal packagesCol As Long, _
                                      ByVal procLR As Long) As Object
    
    Dim dict As Object
    Set dict = CreateObject("Scripting.Dictionary")
    
    Dim i As Long, j As Long
    Dim cellValue As String
    Dim items() As String
    Dim item As String
    
    ' Loop through all data rows in Proc sheet (starting from row 5)
    For i = 5 To procLR
        cellValue = Trim(ProcWS.Cells(i, packagesCol).Value)
        
        ' Process only non-blank cells
        If cellValue <> "" Then
            ' Split cell value by comma to handle multiple items
            items = Split(cellValue, ",")
            
            ' Process each individual item
            For j = LBound(items) To UBound(items)
                item = Trim(items(j)) ' Remove leading/trailing spaces
                
                ' Add item to dictionary or increment its count
                If item <> "" Then
                    If dict.Exists(item) Then
                        dict(item) = dict(item) + 1
                    Else
                        dict.Add item, 1
                    End If
                End If
            Next j
        End If
    Next i
    
    Set GetPackagesDictionary = dict
End Function

' ===================================================================
' HELPER FUNCTION: Write ALL packages to sheet and return filtered summary
' Writes: ALL packages to cells
' Returns: Only packages without "Reel" or "Cut Type" as string like "CP=3, IP=6"
' ===================================================================
Public Function WritePackagesToSheetAndGetSummary(ByVal ws As Worksheet, _
                                                   ByVal dict As Object, _
                                                   ByVal startRow As Long, _
                                                   ByRef currentRow As Long) As String
    
    currentRow = startRow
    Dim key As Variant
    Dim summaryParts() As String
    Dim summaryCount As Long
    summaryCount = 0
    
    ' Initialize dynamic array
    ReDim summaryParts(0)
    
    ' Loop through all items in dictionary
    For Each key In dict.Keys
        ' ALWAYS write to cells (ALL items including Reel and Cut Type)
        ws.Cells(currentRow, "A") = key       ' Item name
        ws.Cells(currentRow, "B") = dict(key) ' Item count
        currentRow = currentRow + 1
        
        ' Only add to summary if it doesn't contain "Reel" or "Cut Type"
        If InStr(1, key, "Reel", vbTextCompare) = 0 And _
           InStr(1, key, "Cut Tape", vbTextCompare) = 0 Then
            
            ' Add to summary array
            ReDim Preserve summaryParts(summaryCount)
            summaryParts(summaryCount) = key & "=" & dict(key)
            summaryCount = summaryCount + 1
        End If
    Next key
    
    ' Build the summary string
    If summaryCount > 0 Then
        WritePackagesToSheetAndGetSummary = Join(summaryParts, ", ")
    Else
        WritePackagesToSheetAndGetSummary = ""
    End If
    
End Function


