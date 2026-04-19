Attribute VB_Name = "Header_Due_Date"
Option Explicit
Sub fillDueDateinHeaders()

Application.ScreenUpdating = False

Dim ws As Worksheet
Dim lastRow As Long
Dim nextBlankRow As Integer

' Set the worksheet
Set ws = ThisWorkbook.Sheets("Project schedule - Detailed")

initaliseHeaders ws

lastRow = ws.Cells(ws.Rows.Count, prodSch_Task_Column).End(xlUp).Row

Dim i As Integer
Dim j As Integer

For i = 8 To lastRow
    If ws.Cells(i, prodSch_OrderType_Column) = "" Then
        For j = i + 1 To lastRow
            If ws.Cells(j, prodSch_OrderType_Column) = "" Then
                nextBlankRow = j
                Exit For
            End If
        Next j
        
    If nextBlankRow = 0 Then
        nextBlankRow = lastRow + 1
    End If
    
    'Debug.Print nextBlankRow
    ws.Cells(i, prodSch_DueDate_Column) = Application.WorksheetFunction.Min(ws.Range(ws.Cells(i + 1, prodSch_DueDate_Column), ws.Cells(nextBlankRow - 1, prodSch_DueDate_Column)))
    If ws.Cells(i, prodSch_DueDate_Column) = 0 Then ws.Cells(i, prodSch_DueDate_Column) = ""
    ws.Cells(i, prodSch_DueDate_Column).NumberFormat = "mm/dd/yyyy"
    
    nextBlankRow = 0
    End If
    Next i
    
Application.ScreenUpdating = True
End Sub

Sub fillProdDateinHeaders()

Application.ScreenUpdating = False

Dim ws As Worksheet
Dim lastRow As Long
Dim nextBlankRow As Integer

' Set the worksheet
Set ws = ThisWorkbook.ActiveSheet

initaliseHeaders ws

lastRow = ws.Cells(ws.Rows.Count, prodSch_Task_Column).End(xlUp).Row

Dim i As Integer
Dim j As Integer

For i = 8 To lastRow
    If ws.Cells(i, prodSch_OrderType_Column) = "" Then
        For j = i + 1 To lastRow
        If ws.Cells(j, prodSch_OrderType_Column) = "" Then
        nextBlankRow = j
        Exit For
        End If
        Next j
        
    If nextBlankRow = 0 Then
        nextBlankRow = lastRow + 1
    End If
    
    'Debug.Print nextBlankRow
    ws.Cells(i, prodSch_ProductionDate_Column) = Application.WorksheetFunction.Min(ws.Range(ws.Cells(i + 1, prodSch_ProductionDate_Column), ws.Cells(nextBlankRow - 1, prodSch_ProductionDate_Column)))
    If ws.Cells(i, prodSch_ProductionDate_Column).Value = 0 Then
        ws.Cells(i, prodSch_ProductionDate_Column).Value = ""
    End If
    ws.Cells(i, prodSch_ProductionDate_Column).NumberFormat = "mm/dd/yyyy"
    
    nextBlankRow = 0
    End If
    Next i
    
Application.ScreenUpdating = True
End Sub


