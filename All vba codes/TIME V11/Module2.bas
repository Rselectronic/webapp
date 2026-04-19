Attribute VB_Name = "Module2"
Sub SameBoardSameCustomerNewQuantity()

Dim ws As Worksheet

Set ws = ThisWorkbook.Sheets("final")


ws.Range("B15:B18") = ""
ws.Range("E15:E18") = ""
ws.Range("F15:F18") = ""

Call MakeAllCellsYellow

End Sub

