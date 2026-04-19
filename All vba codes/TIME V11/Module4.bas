Attribute VB_Name = "Module4"
Sub SameCustomerNewRevision()

Dim ws As Worksheet

Set ws = ThisWorkbook.Sheets("final")




ws.Range("B32:B36") = ""
ws.Range("B38") = ""

Call MakeAllCellsYellow


End Sub

