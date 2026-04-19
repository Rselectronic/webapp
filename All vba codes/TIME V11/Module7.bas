Attribute VB_Name = "Module7"
Sub SeparateData()

    Dim ws As Worksheet
    Dim lr As Long
    


    ' Set the worksheet where you want to list the folder names
    Set ws = ThisWorkbook.Sheets("Folders List") ' Change "Sheet1" to your desired sheet name
    lr = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    
    Dim SecondSpace As Integer
    
    
    Dim i As Long
    For i = 2 To lr
        Dim QTE As String
        SecondSpace = InStr(1, ws.Cells(i, 1), " ")
        If SecondSpace = 0 Then
        Else
        Dim PartNo As String
        PartNo = Mid(ws.Cells(i, 1), 1, SecondSpace - 1)
        QTE = Trim(Mid(ws.Cells(i, 1), SecondSpace))
        
        ws.Cells(i, 2) = QTE
        ws.Cells(i, 3) = PartNo
        End If
    Next i
    
    
End Sub


