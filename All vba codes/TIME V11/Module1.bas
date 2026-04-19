Attribute VB_Name = "Module1"
Sub BrandNewCustomerReset()

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
ws.Range("O28:O33") = ""

Call MakeAllCellsYellow

End Sub
