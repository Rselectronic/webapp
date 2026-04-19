Attribute VB_Name = "Module8"
Sub SortbyPartNo()

    Dim ws As Worksheet
    Dim dataRange As Range
    
    ' Set the worksheet where your data is located
    Set ws = ThisWorkbook.Sheets("Folders List") ' Change "Sheet1" to your sheet name
    
    ' Set the data range to be sorted (adjust the range as needed)
    Set dataRange = ws.Range("A:C") ' Change "A:C" to your data range
    
    ' Sort the data range based on column C in ascending order
    With dataRange
        .Sort Key1:=.Columns(3), Order1:=xlAscending, Header:=xlYes
    End With



End Sub

Sub SortbyQTENo()

    Dim ws As Worksheet
    Dim dataRange As Range
    
    ' Set the worksheet where your data is located
    Set ws = ThisWorkbook.Sheets("Folders List") ' Change "Sheet1" to your sheet name
    
    ' Set the data range to be sorted (adjust the range as needed)
    Set dataRange = ws.Range("A:C") ' Change "A:C" to your data range
    
    ' Sort the data range based on column C in ascending order
    With dataRange
        .Sort Key1:=.Columns(2), Order1:=xlAscending, Header:=xlYes
    End With



End Sub

