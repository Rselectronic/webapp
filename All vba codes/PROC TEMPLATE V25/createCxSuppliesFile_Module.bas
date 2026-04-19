Attribute VB_Name = "createCxSuppliesFile_Module"
Option Explicit
Option Compare Text
Sub createCxSuppliesFile()

Dim ProcWS As Worksheet
Set ProcWS = ThisWorkbook.Sheets("Proc")

Dim fullPath As String
fullPath = GetLocalPath(ThisWorkbook.FullName)

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

Dim procLR As Long
procLR = ProcWS.Cells(ProcWS.Rows.count, "B").End(xlUp).Row

' check of X Comp file is required or not...

Dim status As String
Dim i As Long

status = ""
For i = 5 To procLR
    If ProcWS.Cells(i, "U").Value Like "*supplies" Then
        status = "Yes"
        Exit For
    End If
Next i

If status = "Yes" Then

Dim cxSuppliesWB As Workbook
Dim cxSuppliesWS As Worksheet

Set cxSuppliesWB = Workbooks("Reception File " & procBatchCode & ".xlsx")
Set cxSuppliesWS = cxSuppliesWB.Sheets.Add(after:=cxSuppliesWB.Sheets(cxSuppliesWB.Sheets.count))
cxSuppliesWS.Name = "CX Supplies"

Dim cxSuppliesLR As Long
cxSuppliesLR = cxSuppliesWS.Cells(cxSuppliesWS.Rows.count, "A").End(xlUp).Row

cxSuppliesWS.Cells(1, 1) = procBatchCode & " CX SUPPLIES"
cxSuppliesWS.Cells(1, 1).Font.size = 48

cxSuppliesLR = cxSuppliesWS.Cells(cxSuppliesWS.Rows.count, "A").End(xlUp).Row + 2

cxSuppliesWS.Cells(cxSuppliesLR, "A") = "CPC"
cxSuppliesWS.Cells(cxSuppliesLR, "B") = "Description"
cxSuppliesWS.Cells(cxSuppliesLR, "C") = "M CODES"
cxSuppliesWS.Cells(cxSuppliesLR, "D") = "Result"
cxSuppliesWS.Cells(cxSuppliesLR, "E") = "QTY to order"
cxSuppliesWS.Cells(cxSuppliesLR, "F") = "Customer Ref"
cxSuppliesWS.Cells(cxSuppliesLR, "G") = "Number on Bag"
cxSuppliesWS.Cells(cxSuppliesLR, "H") = "Place to Buy"
cxSuppliesWS.Cells(cxSuppliesLR, "I") = "PN to USE"

cxSuppliesWS.Range(cxSuppliesWS.Cells(cxSuppliesLR, "A"), cxSuppliesWS.Cells(cxSuppliesLR, "I")).Interior.Color = RGB(241, 169, 131)
cxSuppliesWS.Range(cxSuppliesWS.Cells(cxSuppliesLR, "A"), cxSuppliesWS.Cells(cxSuppliesLR, "I")).Font.Bold = True

cxSuppliesLR = cxSuppliesWS.Cells(cxSuppliesWS.Rows.count, "A").End(xlUp).Row + 1

initialiseHeaders , , , ProcWS

For i = 5 To procLR
    If ProcWS.Cells(i, "U").Value Like "*supplies" Then
        cxSuppliesWS.Cells(cxSuppliesLR, "A") = ProcWS.Cells(i, Procsheet_CPC_Column)
        cxSuppliesWS.Cells(cxSuppliesLR, "B") = ProcWS.Cells(i, Procsheet_CustomerDescription_Column)
        cxSuppliesWS.Cells(cxSuppliesLR, "C") = ProcWS.Cells(i, Procsheet_Mcodes_Column)
        cxSuppliesWS.Cells(cxSuppliesLR, "D") = ProcWS.Cells(i, Procsheet_BoardName_Column)
        cxSuppliesWS.Cells(cxSuppliesLR, "E") = ProcWS.Cells(i, Procsheet_ORDERQTY_Column)
        cxSuppliesWS.Cells(cxSuppliesLR, "F") = ProcWS.Cells(i, Procsheet_CustomerRef_Column)
        cxSuppliesWS.Cells(cxSuppliesLR, "G") = ProcWS.Cells(i, Procsheet_DistPN_Column)
        cxSuppliesWS.Cells(cxSuppliesLR, "H") = ProcWS.Cells(i, Procsheet_Placetobuy_Column)
        cxSuppliesWS.Cells(cxSuppliesLR, "I") = ProcWS.Cells(i, Procsheet_PNTOUSE_Column)
        cxSuppliesLR = cxSuppliesLR + 1
    End If
Next i

' Set page orientation to landscape
cxSuppliesWS.PageSetup.Orientation = xlLandscape

' Set page margins
With cxSuppliesWS.PageSetup
    .LeftMargin = Application.InchesToPoints(0.25)
    .RightMargin = Application.InchesToPoints(0.25)
    .TopMargin = Application.InchesToPoints(0.25)
    .BottomMargin = Application.InchesToPoints(0.25)
End With

' Set scaling options
With cxSuppliesWS.PageSetup
    .Zoom = False
    .FitToPagesWide = 1
    .FitToPagesTall = False
End With

' Apply border
cxSuppliesWS.Range("A3:I" & cxSuppliesLR - 1).Borders.LineStyle = xlContinuous
cxSuppliesWS.Range("A3:I" & cxSuppliesLR - 1).Columns.AutoFit

If cxSuppliesWS.Columns("B").ColumnWidth > 58 Then
    cxSuppliesWS.Columns("B").ColumnWidth = 58
End If

' Save the workbook
cxSuppliesWB.Save

Else
'MsgBox "No CX Supplies"
End If

End Sub


