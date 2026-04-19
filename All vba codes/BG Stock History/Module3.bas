Attribute VB_Name = "Module3"
Sub rearrangeData()

    Dim wsOriginal As Worksheet
    Dim wsNew As Worksheet
    
    Set wsOriginal = ThisWorkbook.Sheets("Sheet1")
    Set wsNew = ThisWorkbook.Sheets("Sheet3")

    Dim lastCol As Long, lastRow As Long
    Dim r As Long, k As Long, c As Long
    
    lastCol = wsOriginal.Cells(3, wsOriginal.Columns.count).End(xlToLeft).Column
    lastRow = wsOriginal.Cells(wsOriginal.Rows.count, "A").End(xlUp).Row
    
    k = 2
    
    For c = 8 To lastCol
        For r = 4 To lastRow
            If wsOriginal.Cells(r, c) <> "" Then
                wsNew.Cells(k, "A") = wsOriginal.Cells(2, c)
                wsNew.Cells(k, "B") = wsOriginal.Cells(1, c)
                wsNew.Cells(k, "C") = wsOriginal.Cells(r, "A")
                wsNew.Cells(k, "D") = wsOriginal.Cells(r, "F")
                If Left(wsOriginal.Cells(3, c), 1) = "S" Then wsNew.Cells(k, "E") = "SUB"
                If Left(wsOriginal.Cells(3, c), 1) = "A" Then wsNew.Cells(k, "E") = "ADD"
                wsNew.Cells(k, "F") = wsOriginal.Cells(r, c)
                k = k + 1
            End If
        Next r
    Next c

End Sub
