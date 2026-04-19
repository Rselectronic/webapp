Attribute VB_Name = "Certificate_V2"
Option Explicit


Sub GetCertificate()

turnOffUpdates_Calculation

ThisWorkbook.Sheets("Compliance Certificate Template").Visible = xlSheetVisible
ThisWorkbook.Sheets("Lead Free Certificate Template").Visible = xlSheetVisible


Call KeepSpecificSheets

Dim i As Integer
i = 1



ThisWorkbook.Sheets("PackingSlip").Activate
Range("A18").Select


Do While ActiveCell.Value <> ""


If ActiveCell.Offset(0, 9).Value > 0 Then
Call CopySheetWithinWorkbook
CopyData i
i = i + 1
End If
Sheets("PackingSlip").Activate
ActiveCell.Offset(1, 0).Select


Loop
ThisWorkbook.Sheets("Compliance Certificate Template").Visible = xlSheetHidden
ThisWorkbook.Sheets("Lead Free Certificate Template").Visible = xlSheetHidden

turnOnUpdates_Calculation

End Sub


