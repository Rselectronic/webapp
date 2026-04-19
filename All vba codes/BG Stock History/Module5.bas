Attribute VB_Name = "Module5"
Function GetFilteredValues(matchValue As String) As String
    Dim ws As Worksheet
    Dim lastRow As Long
    Dim i As Long
    Dim result As String
    Dim cellValue As Variant
    
    Set ws = ThisWorkbook.Sheets("BG Stock Log")
    
    ' Find last used row in column C
    lastRow = ws.Cells(ws.Rows.count, "C").End(xlUp).Row
    
    ' Loop through rows to check match and value
    For i = 2 To lastRow
        If ws.Cells(i, "C").Value = matchValue Then
            cellValue = ws.Cells(i, "I").Value
            If IsNumeric(cellValue) Then
                If cellValue <> 0 Then
                    result = result & cellValue & ", "
                End If
            ElseIf cellValue <> "" Then
                result = result & cellValue & ", "
            End If
        End If
    Next i
    
    ' Remove trailing comma and space
    If Len(result) > 2 Then
        result = Left(result, Len(result) - 2)
    End If
    
    GetFilteredValues = result
End Function

Function GetLastItem(cellValue As String) As String
    Dim items() As String
    
    If Len(Trim(cellValue)) = 0 Then
        GetLastItem = ""
        Exit Function
    End If
    
    items = Split(cellValue, ",")
    GetLastItem = Trim(items(UBound(items)))
End Function


