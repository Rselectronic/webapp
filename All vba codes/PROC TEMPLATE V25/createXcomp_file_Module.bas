Attribute VB_Name = "createXcomp_file_Module"
Option Explicit
Option Compare Text

Sub createXcomp_file()

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
For i = 5 To procLR
    If Left(ProcWS.Cells(i, "Z").Value, 1) = "X" Then
        status = "Yes"
        Exit For
    End If
Next i

If status = "Yes" Then

Dim xcompWB As Workbook
Dim xcompWS As Worksheet

Set xcompWB = Workbooks("Reception File " & procBatchCode & ".xlsx")
Set xcompWS = xcompWB.Sheets.Add(after:=xcompWB.Sheets(xcompWB.Sheets.count))
xcompWS.Name = "X Comp"

Dim xcompLR As Long
xcompLR = xcompWS.Cells(xcompWS.Rows.count, "A").End(xlUp).Row

xcompWS.Cells(1, 1) = procBatchCode & " X COMP FILE"
xcompWS.Cells(1, 1).Font.size = 48

xcompLR = xcompWS.Cells(xcompWS.Rows.count, "A").End(xlUp).Row + 2

xcompWS.Cells(xcompLR, "A") = "CPC"
xcompWS.Cells(xcompLR, "B") = "Description"
xcompWS.Cells(xcompLR, "C") = "M CODES"
xcompWS.Cells(xcompLR, "D") = "Result"
xcompWS.Cells(xcompLR, "E") = "QTY to order"
xcompWS.Cells(xcompLR, "F") = "Customer Ref"
xcompWS.Cells(xcompLR, "G") = "Number on Bag"
xcompWS.Cells(xcompLR, "H") = "Place to Buy"
xcompWS.Cells(xcompLR, "I") = "PN to USE"

xcompWS.Range(xcompWS.Cells(xcompLR, "A"), xcompWS.Cells(xcompLR, "I")).Interior.Color = RGB(241, 169, 131)
xcompWS.Range(xcompWS.Cells(xcompLR, "A"), xcompWS.Cells(xcompLR, "I")).Font.Bold = True

xcompLR = xcompWS.Cells(xcompWS.Rows.count, "A").End(xlUp).Row + 1

initialiseHeaders , , , ProcWS

For i = 5 To procLR
    If Left(ProcWS.Cells(i, "Z").Value, 1) = "X" Then
        xcompWS.Cells(xcompLR, "A") = ProcWS.Cells(i, Procsheet_CPC_Column)
        xcompWS.Cells(xcompLR, "B") = ProcWS.Cells(i, Procsheet_CustomerDescription_Column)
        xcompWS.Cells(xcompLR, "C") = ProcWS.Cells(i, Procsheet_Mcodes_Column)
        xcompWS.Cells(xcompLR, "D") = ProcWS.Cells(i, Procsheet_BoardName_Column)
        xcompWS.Cells(xcompLR, "E") = ProcWS.Cells(i, Procsheet_ORDERQTY_Column)
        xcompWS.Cells(xcompLR, "F") = ProcWS.Cells(i, Procsheet_CustomerRef_Column)
        xcompWS.Cells(xcompLR, "G") = ProcWS.Cells(i, Procsheet_DistPN_Column)
        xcompWS.Cells(xcompLR, "H") = ProcWS.Cells(i, Procsheet_Placetobuy_Column)
        xcompWS.Cells(xcompLR, "I") = ProcWS.Cells(i, Procsheet_PNTOUSE_Column)
        xcompLR = xcompLR + 1
    End If
Next i

' Set page orientation to landscape
xcompWS.PageSetup.Orientation = xlLandscape

' Set page margins
With xcompWS.PageSetup
    .LeftMargin = Application.InchesToPoints(0.25)
    .RightMargin = Application.InchesToPoints(0.25)
    .TopMargin = Application.InchesToPoints(0.25)
    .BottomMargin = Application.InchesToPoints(0.25)
End With

' Set scaling options
With xcompWS.PageSetup
    .Zoom = False
    .FitToPagesWide = 1
    .FitToPagesTall = False
End With

' Apply border
xcompWS.Range("A3:I" & xcompLR - 1).Borders.LineStyle = xlContinuous
xcompWS.Range("A3:I" & xcompLR - 1).Columns.AutoFit

If xcompWS.Columns("B").ColumnWidth > 58 Then
    xcompWS.Columns("B").ColumnWidth = 58
End If

xcompWB.Save

Else
'MsgBox "No component used in more than one board"
End If

End Sub

