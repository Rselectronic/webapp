Attribute VB_Name = "createStockfile_Module"
Option Explicit
Option Compare Text
Sub createStockfile()

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
    If ProcWS.Cells(i, "U").Value Like "*stock" Then
        status = "Yes"
        Exit For
    End If
Next i

If status = "Yes" Then

Dim stockWB As Workbook
Dim stockWS As Worksheet

Set stockWB = Workbooks("Reception File " & procBatchCode & ".xlsx")
Set stockWS = stockWB.Sheets.Add(after:=stockWB.Sheets(stockWB.Sheets.count))
stockWS.Name = "Stock at RS"


Dim stockLR As Long
stockLR = stockWS.Cells(stockWS.Rows.count, "A").End(xlUp).Row

stockWS.Cells(1, 1) = procBatchCode & " Stock at RS"
stockWS.Cells(1, 1).Font.size = 48

stockLR = stockWS.Cells(stockWS.Rows.count, "A").End(xlUp).Row + 2

stockWS.Cells(stockLR, "A") = "CPC"
stockWS.Cells(stockLR, "B") = "Description"
stockWS.Cells(stockLR, "C") = "M CODES"
stockWS.Cells(stockLR, "D") = "Result"
stockWS.Cells(stockLR, "E") = "QTY to order"
stockWS.Cells(stockLR, "F") = "Customer Ref"
stockWS.Cells(stockLR, "G") = "Number on Bag"
stockWS.Cells(stockLR, "H") = "Place to Buy"
stockWS.Cells(stockLR, "I") = "PN to USE"

stockWS.Range(stockWS.Cells(stockLR, "A"), stockWS.Cells(stockLR, "I")).Interior.Color = RGB(241, 169, 131)
stockWS.Range(stockWS.Cells(stockLR, "A"), stockWS.Cells(stockLR, "I")).Font.Bold = True

stockLR = stockWS.Cells(stockWS.Rows.count, "A").End(xlUp).Row + 1

initialiseHeaders , , , ProcWS

For i = 5 To procLR
    If ProcWS.Cells(i, "U").Value Like "*stock" Then
        stockWS.Cells(stockLR, "A") = ProcWS.Cells(i, Procsheet_CPC_Column)
        stockWS.Cells(stockLR, "B") = ProcWS.Cells(i, Procsheet_CustomerDescription_Column)
        stockWS.Cells(stockLR, "C") = ProcWS.Cells(i, Procsheet_Mcodes_Column)
        stockWS.Cells(stockLR, "D") = ProcWS.Cells(i, Procsheet_BoardName_Column)
        stockWS.Cells(stockLR, "E") = ProcWS.Cells(i, Procsheet_ORDERQTY_Column)
        stockWS.Cells(stockLR, "F") = ProcWS.Cells(i, Procsheet_CustomerRef_Column)
        stockWS.Cells(stockLR, "G") = ProcWS.Cells(i, Procsheet_DistPN_Column)
        stockWS.Cells(stockLR, "H") = ProcWS.Cells(i, Procsheet_Placetobuy_Column)
        stockWS.Cells(stockLR, "I") = ProcWS.Cells(i, Procsheet_PNTOUSE_Column)
        stockLR = stockLR + 1
    End If
Next i

' Set page orientation to landscape
stockWS.PageSetup.Orientation = xlLandscape

' Set page margins
With stockWS.PageSetup
    .LeftMargin = Application.InchesToPoints(0.25)
    .RightMargin = Application.InchesToPoints(0.25)
    .TopMargin = Application.InchesToPoints(0.25)
    .BottomMargin = Application.InchesToPoints(0.25)
End With

' Set scaling options
With stockWS.PageSetup
    .Zoom = False
    .FitToPagesWide = 1
    .FitToPagesTall = False
End With

' Apply border
stockWS.Range("A3:I" & stockLR - 1).Borders.LineStyle = xlContinuous
stockWS.Range("A3:I" & stockLR - 1).Columns.AutoFit

If stockWS.Columns("B").ColumnWidth > 58 Then
    stockWS.Columns("B").ColumnWidth = 58
End If

' Save the workbook
stockWB.Save

Else
'MsgBox "No stock at RS"
End If

End Sub

