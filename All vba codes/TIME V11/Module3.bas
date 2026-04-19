Attribute VB_Name = "Module3"
Sub SameCustomerNewBoard()

Dim ws As Worksheet

Set ws = ThisWorkbook.Sheets("final")


ws.Range("B15:F18") = ""
ws.Range("B21:B26") = ""
ws.Range("B28:B30") = ""
ws.Range("B32:B36") = ""
ws.Range("B38") = ""
ws.Range("B40:B51") = ""
ws.Range("J1:J3") = ""
ws.Range("I7:O16") = ""

Call MakeAllCellsYellow


End Sub

