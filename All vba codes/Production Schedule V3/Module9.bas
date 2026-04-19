Attribute VB_Name = "Module9"
Option Explicit
Function CalcEffort(BVal As Variant, IVal As Variant, DVal As Double, _
                    KVal As Double, LVal As Double, MVal As Double, NVal As Double, OVal As Double, PVal As Double, QVal As Double) As Double
    Dim ws As Worksheet
    Dim lastRow As Long, i As Long
    Dim key As String
    Dim baseEffort As Double
    Dim Fval As Double, Gval As Double, Hval As Double
    Dim Ieff As Double, Jeff As Double, Keff As Double, Leff As Double

    key = BVal & IVal
    Set ws = ThisWorkbook.Sheets("Time Sheet")
    lastRow = ws.Cells(ws.Rows.Count, "A").End(xlUp).Row

    ' Search for matching key
    For i = 2 To lastRow
        If ws.Cells(i, "A").Value & ws.Cells(i, "C").Value = key Then
            baseEffort = ws.Cells(i, "E").Value
            If baseEffort = 0 Then Exit Function ' Prevent divide-by-zero
            
            Fval = ws.Cells(i, "F").Value
            Gval = ws.Cells(i, "G").Value
            Hval = ws.Cells(i, "H").Value
            Ieff = ws.Cells(i, "I").Value
            Jeff = ws.Cells(i, "J").Value
            Keff = ws.Cells(i, "K").Value
            Leff = ws.Cells(i, "L").Value

            CalcEffort = (DVal - KVal) * (Fval / baseEffort) + _
                         (DVal - LVal) * (Gval / baseEffort) + _
                         (DVal - MVal) * (Hval / baseEffort) + _
                         (DVal - NVal) * (Ieff / baseEffort) + _
                         (DVal - OVal) * (Jeff / baseEffort) + _
                         (DVal - PVal) * (Keff / baseEffort) + _
                         (DVal - QVal) * (Leff / baseEffort)
            Exit Function
        End If
    Next i

    ' If no match found
    CalcEffort = 0
End Function


