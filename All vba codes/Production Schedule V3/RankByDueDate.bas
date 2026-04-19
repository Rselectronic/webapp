Attribute VB_Name = "RankByDueDate"
Option Explicit

Sub RankingByDueDate()
    
    Dim ws As Worksheet
    Dim lastRow As Long
    Dim dateCollection As Collection
    Dim cell As Range
    Dim i As Integer
    Dim currentDate As Date
    
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.DisplayAlerts = False
    

    ' Set the worksheet
    Set ws = ThisWorkbook.Sheets("Project schedule - Detailed")
    
    initaliseHeaders ws

    ' Find the last row with data in column B
    lastRow = ws.Cells(ws.Rows.Count, prodSch_Task_Column).End(xlUp).Row
    
    ws.Range(ws.Cells(8, prodSch_Rank_Column), ws.Cells(lastRow, prodSch_Rank_Column)).ClearContents
    
    ' Initialize the collection
    Set dateCollection = New Collection
    
    ' Loop through the rows and add dates to the collection based on the condition in Column C
    For i = 8 To lastRow
        If ws.Cells(i, prodSch_OrderType_Column).Value = "" Then
            currentDate = ws.Cells(i, prodSch_DueDate_Column).Value
            dateCollection.Add currentDate
        End If
    Next i
    
    ' Sort the collection in ascending order
    SortCollection dateCollection
    
    ' Assign ranks and fill in Column E
    For i = 1 To dateCollection.Count
        ' Find the row of the date in Column J
        Dim rowNumber As Long
        rowNumber = FindDateRow(ws, dateCollection(i), prodSch_DueDate_Column, i)
        
        ' Check if a valid row number was found
        If rowNumber > 0 Then
            ' Fill the rank in Column E
            ws.Cells(rowNumber, prodSch_Rank_Column).Value = i
        End If
    Next i
    
    'fill ranking in other cells also
    fillRanktoOtherCells
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    Application.DisplayAlerts = True
    

End Sub

Sub RankingByProductionDate()
    
    Dim ws As Worksheet
    Dim lastRow As Long
    Dim dateCollection As Collection
    Dim cell As Range
    Dim i As Integer
    Dim currentDate As Date
    
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.DisplayAlerts = False
    

    ' Set the worksheet
    Set ws = ThisWorkbook.ActiveSheet
    
    initaliseHeaders ws
    
    ' Find the last row with data in column B
    lastRow = ws.Cells(ws.Rows.Count, prodSch_Task_Column).End(xlUp).Row
    
    ws.Range(ws.Cells(8, prodSch_Rank_Column), ws.Cells(lastRow, prodSch_Rank_Column)).ClearContents
    
    ' Initialize the collection
    Set dateCollection = New Collection
    
    ' Loop through the rows and add dates to the collection based on the condition in Column C
    For i = 8 To lastRow
        If ws.Cells(i, prodSch_OrderType_Column).Value = "" Then
            currentDate = ws.Cells(i, prodSch_ProductionDate_Column).Value
            dateCollection.Add currentDate
        End If
    Next i
    
    ' Sort the collection in ascending order
    SortCollection dateCollection
    
    ' Assign ranks and fill in Column E
    For i = 1 To dateCollection.Count
        ' Find the row of the date in Column J
        Dim rowNumber As Long
        rowNumber = FindDateRow(ws, dateCollection(i), prodSch_ProductionDate_Column, i)
        
        ' Check if a valid row number was found
        If rowNumber > 0 Then
            ' Fill the rank in Column E
            ws.Cells(rowNumber, prodSch_Rank_Column).Value = i
        End If
    Next i
    
    'fill ranking in other cells also
    fillRanktoOtherCells
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    Application.DisplayAlerts = True
    

End Sub
    
    Function FindDateRow(ws As Worksheet, searchDate As Date, dateColLetter As Long, rank As Integer) As Long
    Dim rng As Range
    Dim cell As Range
    Dim lastRow As Long
    
    ' Set the range in Column J
    Set rng = Nothing
    
    initaliseHeaders ws
    
    lastRow = ws.Cells(ws.Rows.Count, prodSch_Task_Column).End(xlUp).Row
    
    For Each cell In ws.Range(ws.Cells(8, prodSch_OrderType_Column), ws.Cells(lastRow, prodSch_OrderType_Column))
        If cell.Value = "" Then
            ' If Column C is empty, add the corresponding cell in Column A to lookupRange
            If rng Is Nothing Then
                Set rng = ws.Cells(cell.Row, dateColLetter)
            Else
                Set rng = Union(rng, ws.Cells(cell.Row, dateColLetter))
            End If
        End If
    Next cell
    
    ' Loop through the range to find the row number
    For Each cell In rng
        If cell.Value = searchDate Then
            If ws.Cells(cell.Row, prodSch_OrderType_Column).Value = "" And ws.Cells(cell.Row, prodSch_Rank_Column) = "" Then
                FindDateRow = cell.Row
            Exit Function
            End If
        End If
    Next cell
    
    ' Return 0 if the date is not found
    FindDateRow = 0
End Function
    
    
    Sub SortCollection(coll As Collection)
    Dim arr() As Variant
    Dim i As Integer
    
    ' Convert collection to array
    ReDim arr(1 To coll.Count)
    For i = 1 To coll.Count
        arr(i) = coll(i)
    Next i
    
    ' Sort the array
    Call QuickSort(arr, LBound(arr), UBound(arr))
    
    ' Clear the collection
    Set coll = New Collection
    
    ' Add sorted array back to the collection
    For i = 1 To UBound(arr)
        coll.Add arr(i)
    Next i
End Sub

Sub QuickSort(arr() As Variant, low As Long, high As Long)
    Dim pivot As Variant
    Dim tempSwap As Variant
    Dim i As Long
    Dim j As Long
    
    i = low
    j = high
    pivot = arr((low + high) \ 2)
    
    Do While i <= j
        Do While arr(i) < pivot
            i = i + 1
        Loop
        
        Do While arr(j) > pivot
            j = j - 1
        Loop
        
        If i <= j Then
            tempSwap = arr(i)
            arr(i) = arr(j)
            arr(j) = tempSwap
            i = i + 1
            j = j - 1
        End If
    Loop
    
    If low < j Then QuickSort arr, low, j
    If i < high Then QuickSort arr, i, high
End Sub


