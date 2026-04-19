Attribute VB_Name = "Module2"
Option Explicit
Sub fillRanktoOtherCells()

Dim ws As Worksheet
Dim lastRow As Long

Set ws = ThisWorkbook.ActiveSheet
lastRow = ws.Cells(ws.Rows.Count, prodSch_Task_Column).End(xlUp).Row

Dim i As Integer

For i = 8 To lastRow
    If ws.Cells(i, prodSch_Rank_Column) <> "" Then
    Else
    ws.Cells(i, prodSch_Rank_Column) = ws.Cells(i - 1, prodSch_Rank_Column)
    End If
Next i

End Sub
