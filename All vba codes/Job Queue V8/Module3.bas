Attribute VB_Name = "Module3"
Option Explicit
Sub GetSelectionRowNumbers()
    Dim ws As Worksheet
    Dim selectedRange As Range
    Dim cell As Range
    Dim rowNumbers As String
    
    ' Set the worksheet
    Set ws = ThisWorkbook.Sheets("Job Queue")
    
    ' Check if anything is selected
    If selection.Rows.Count > 1 Then
        ' Set the selected range
        Set selectedRange = selection
        
        ' Loop through each selected cell and get the row number
        For Each cell In selectedRange
            rowNumbers = rowNumbers & cell.row & ", "
        Next cell
        
        ' Remove the trailing comma and space
        rowNumbers = Left(rowNumbers, Len(rowNumbers) - 2)
        
        ' Display the row numbers in a message box
        MsgBox "Selected row numbers: " & rowNumbers
    Else
        MsgBox "No rows selected in the Job Queue sheet."
    End If
End Sub

