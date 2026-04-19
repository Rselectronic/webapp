Attribute VB_Name = "sort_data"
Option Explicit
Sub SortData()
Application.ScreenUpdating = False
    Dim ws As Worksheet
    Dim lastRow As Long, lastColumn As Long
    Dim sortRange As Range
    
    ' Set the worksheet
    Set ws = ThisWorkbook.ActiveSheet
    initaliseHeaders ws
    
    ' Find the last row with data in column E
    lastRow = ws.Cells(ws.Rows.Count, prodSch_Task_Column).End(xlUp).Row
    lastColumn = ws.UsedRange.Columns(ws.UsedRange.Columns.Count).Column
    
    ' Check if there is data to sort
    If lastRow >= 8 Then
        ' Define the range to sort (assuming data starts from row 8)
        'Set sortRange = ws.Range("A8:CY" & lastRow)
        Set sortRange = ws.Range(ws.Cells(8, 1), ws.Cells(lastRow, lastColumn))
        
        ' Sort by Column E in ascending order, then by Column D in alphabetical order
        With sortRange
            .Sort key1:=.Columns(prodSch_Rank_Column), order1:=xlAscending, key2:=.Columns(prodSch_DueDate_Column), order2:=xlAscending, Header:=xlNo
        End With
        
        'MsgBox "Data sorted successfully!", vbInformation
    Else
        MsgBox "No data to sort.", vbExclamation
    End If
Application.ScreenUpdating = True
End Sub


Sub SortDataByProductionDate()

    fillProdDateinHeaders

    RankingByProductionDate
    
    SortData
    
    refreshProductionSchedule
    
    
End Sub

