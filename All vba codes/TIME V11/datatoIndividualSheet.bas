Attribute VB_Name = "datatoIndividualSheet"
Sub SendQtytoIndividualSheets()

Application.ScreenUpdating = False
Application.DisplayAlerts = False


Dim ws As Worksheet
Dim Q1, Q2, Q3, Q4 As Worksheet
Dim FinalSheet As Worksheet

Set Q1 = ThisWorkbook.Sheets("QTY 1")
Set Q2 = ThisWorkbook.Sheets("QTY 2")
Set Q3 = ThisWorkbook.Sheets("QTY 3")
Set Q4 = ThisWorkbook.Sheets("QTY 4")
Set FinalSheet = ThisWorkbook.Sheets("final")


' send quantities to individial sheet
Q1.Range("E4") = FinalSheet.Range("B15")
Q2.Range("E4") = FinalSheet.Range("B16")
Q3.Range("E4") = FinalSheet.Range("B17")
Q4.Range("E4") = FinalSheet.Range("B18")


' send Labour Rate to individual sheets
Q1.Range("B194") = FinalSheet.Range("C15")
Q2.Range("B194") = FinalSheet.Range("C16")
Q3.Range("B194") = FinalSheet.Range("C17")
Q4.Range("B194") = FinalSheet.Range("C18")



' send SMT Rate to individual sheets
Q1.Range("B195") = FinalSheet.Range("D15")
Q2.Range("B195") = FinalSheet.Range("D16")
Q3.Range("B195") = FinalSheet.Range("D17")
Q4.Range("B195") = FinalSheet.Range("D18")



' send PCB Price to individual sheets
Q1.Range("D201") = FinalSheet.Range("E15")
Q2.Range("D201") = FinalSheet.Range("E16")
Q3.Range("D201") = FinalSheet.Range("E17")
Q4.Range("D201") = FinalSheet.Range("E18")


' send Component cost to individual sheets
Q1.Range("D206") = FinalSheet.Range("G15")
Q2.Range("D206") = FinalSheet.Range("G16")
Q3.Range("D206") = FinalSheet.Range("G17")
Q4.Range("D206") = FinalSheet.Range("G18")




' send pricing parameters to all sheets

For Each ws In Worksheets
If ws.Name = "QTY 1" Or ws.Name = "QTY 2" Or ws.Name = "QTY 3" Or ws.Name = "QTY 4" Then

' send programming, Stencil, PCB FAB, Misc. NRE on Whole Order to individual sheets
ws.Range("B196") = FinalSheet.Range("B21")  'Programming Rate
ws.Range("B198") = FinalSheet.Range("B22")  'Stencil Rate
ws.Range("B205") = FinalSheet.Range("B23")  'PCB FAB Price
ws.Range("B212") = FinalSheet.Range("B24")  'Misc. NRE on Whole Order
ws.Range("B211") = FinalSheet.Range("B25")  'Additional Feature Charged per PCB
ws.Range("B213") = FinalSheet.Range("B26")  'Discount


' send pricing parameters to all sheets
ws.Range("E7") = FinalSheet.Range("B41")        'double side (insert 1 if yes)
ws.Range("E8") = FinalSheet.Range("B43")        'Total Number of lines in BOM
ws.Range("E9") = FinalSheet.Range("B44")        'total number of smt placement per pcb
ws.Range("E10") = FinalSheet.Range("B45")       '# of CP feeders
ws.Range("E11") = FinalSheet.Range("B46")       'total # cp parts per pcb
ws.Range("E12") = FinalSheet.Range("B47")       '# IP feeders
ws.Range("E13") = FinalSheet.Range("B48")       'total # ip parts per pcb
ws.Range("E14") = FinalSheet.Range("B49")       'man smt parts per pcb(top and bottom
ws.Range("E15") = FinalSheet.Range("B50")       'th parts per board
ws.Range("E16") = FinalSheet.Range("B51")       'number of th pins per pcb
ws.Range("B200") = FinalSheet.Range("B38")      'BOARD NAME

If ws.Range("E4") < FinalSheet.Range("B40") Then
ws.Range("E3") = ws.Range("E4")
Else
ws.Range("E3") = FinalSheet.Range("B40")        'Number of boards in pannel(put 1 if just one)
End If


End If
Next ws

' Lead Time Data

If FinalSheet.Range("B29") = "" Then
If FinalSheet.Range("B15").Value > 0 And FinalSheet.Range("B16").Value > 0 Then
FinalSheet.Range("B29") = FinalSheet.Range("B15") & "-" & FinalSheet.Range("B16") & ": 4-7 Weeks"
ElseIf FinalSheet.Range("B15").Value > 0 Then
FinalSheet.Range("B29") = FinalSheet.Range("B15") & ": 4-7 Weeks"
Else
FinalSheet.Range("B29") = ""
End If
End If

If FinalSheet.Range("B30") = "" Then
If FinalSheet.Range("B17").Value > 0 And FinalSheet.Range("B18").Value > 0 Then
FinalSheet.Range("B30") = FinalSheet.Range("B17") & "-" & FinalSheet.Range("B18") & ": 5-8 Weeks"
ElseIf FinalSheet.Range("B17").Value > 0 Then
FinalSheet.Range("B30") = FinalSheet.Range("B17") & ": 5-8 Weeks"
Else
FinalSheet.Range("B30") = ""
End If
End If


' send conformal coating unit price in individual sheet
FinalSheet.Range("F2:F5").NumberFormat = "#,##0.00 $"
Q1.Range("B211") = FinalSheet.Range("D21")
Q2.Range("B211") = FinalSheet.Range("D22")
Q3.Range("B211") = FinalSheet.Range("D23")
Q4.Range("B211") = FinalSheet.Range("D24")


ThisWorkbook.Activate
FinalSheet.Activate
FinalSheet.Range("F1").Select
skipConformalLogic:
''

Application.ScreenUpdating = True
Application.DisplayAlerts = True


End Sub


