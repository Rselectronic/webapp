Attribute VB_Name = "sortJobQueue"
Option Explicit
Sub sort_JobQueue()
    Application.ScreenUpdating = False
    
    Dim ws As Worksheet
    Dim lastRow As Long, lastColumn As Long
    Dim sortRange As Range

    ' Set the worksheet
    Set ws = ThisWorkbook.Sheets("Job Queue")
    
    initialiseHeaders ws

    ' Find the last row based on Column D
    lastRow = ws.Cells(ws.Rows.Count, wsJobQueue_ProductName_Column).End(xlUp).row
    lastColumn = ws.Cells(3, ws.Columns.Count).End(xlToLeft).Column

    ' Set the range to sort (columns A to AT)
    Set sortRange = ws.Range(ws.Cells(4, 1), ws.Cells(lastRow, lastColumn))

    ' Apply the sort
    ' Apply the sort
    With ws.Sort
        .SortFields.Clear
        .SortFields.Add key:=ws.Range(ws.Cells(4, wsJobQueue_OrderStatus_Column), _
                                      ws.Cells(lastRow, wsJobQueue_OrderStatus_Column)), _
                                      Order:=xlAscending
        .SortFields.Add key:=ws.Range(ws.Cells(4, wsJobQueue_ProcBatchCode_Column), _
                                      ws.Cells(lastRow, wsJobQueue_ProcBatchCode_Column)), _
                                      Order:=xlAscending
        .SortFields.Add key:=ws.Range(ws.Cells(4, wsJobQueue_POdate_Column), _
                                      ws.Cells(lastRow, wsJobQueue_POdate_Column)), _
                                      Order:=xlAscending
        .SortFields.Add key:=ws.Range(ws.Cells(4, wsJobQueue_customerName_Column), _
                                      ws.Cells(lastRow, wsJobQueue_customerName_Column)), _
                                      Order:=xlAscending
        .SortFields.Add key:=ws.Range(ws.Cells(4, wsJobQueue_POnumber_Column), _
                                      ws.Cells(lastRow, wsJobQueue_POnumber_Column)), _
                                      Order:=xlAscending
        .SortFields.Add key:=ws.Range(ws.Cells(4, wsJobQueue_LineNumber_Column), _
                                      ws.Cells(lastRow, wsJobQueue_LineNumber_Column)), _
                                      Order:=xlAscending
        
        
        
        .SetRange sortRange
        .Header = xlNo
        .MatchCase = False
        .Orientation = xlTopToBottom
        .Apply
    End With
Application.ScreenUpdating = True

End Sub



