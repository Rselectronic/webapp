Attribute VB_Name = "fill"
Sub UpdateQuantities()

Application.ScreenUpdating = False
Application.DisplayAlerts = False


Dim QT, Qty1, Qty2, Qty3, Qty4, FinalQty As Worksheet


Set QT = ThisWorkbook.Sheets("Quotation Temp")
Set Qty1 = ThisWorkbook.Sheets("QTY 1")
Set Qty2 = ThisWorkbook.Sheets("QTY 2")
Set Qty3 = ThisWorkbook.Sheets("QTY 3")
Set Qty4 = ThisWorkbook.Sheets("QTY 4")
Set FinalQty = ThisWorkbook.Sheets("final")

'set date on template
QT.Range("Q10").Value = Date
QT.Range("AB22:AG33").NumberFormat = " #,##0.00 $"
QT.Range("AB36:AG40").NumberFormat = " #,##0.00 $"

'Fill order Type
Dim orderType As String
If Qty1.Range("B215") = "Assembly only" Then
orderType = "Assembly only"
ElseIf Qty1.Range("B215") = "PCB Assy, Comp Proc, PCB Fab" Then
orderType = "Turnkey"
ElseIf Qty1.Range("B215") = "Consignment" Then
orderType = "Consignment"
End If

QT.Range("N19") = orderType


'fill quote number
QT.Range("G19") = FinalQty.Range("B28")

'fill lead time
QT.Range("O14") = FinalQty.Range("B29")
QT.Range("O15") = FinalQty.Range("B30")

'fill Global Manufacturing Package
QT.Range("Y11") = FinalQty.Range("B32")
QT.Range("AC12") = FinalQty.Range("B33")    'Bom Name
QT.Range("AA13") = FinalQty.Range("B34")    'Rev
QT.Range("AC14") = FinalQty.Range("B35")    'PCB Name
QT.Range("AA15") = FinalQty.Range("B36")    'Rev


''fill customer details
'QT.Range("C11") = FinalQty.Range("P28")
'QT.Range("C12") = FinalQty.Range("P29")
'QT.Range("C13") = FinalQty.Range("P30")
'QT.Range("C14") = FinalQty.Range("P31")
'QT.Range("C15") = FinalQty.Range("P32")
'QT.Range("C16") = FinalQty.Range("P33")


'fill quantities data on template from 'final' Sheet
Dim k As Long
Dim i As Long

'k = 22
'    For i = 2 To 5
'        If FinalQty.Cells(i, "D") <> "" Then
'            QT.Cells(k, "C") = FinalQty.Cells(i, "A")
'            QT.Cells(k, "O") = FinalQty.Cells(i, "B")
'            QT.Cells(k, "Y") = FinalQty.Cells(i, "C")
'            QT.Cells(k, "AB") = FinalQty.Cells(i, "D")
'            QT.Cells(k, "AG") = FinalQty.Cells(i, "E")
'            QT.Rows(k).Hidden = False
'            k = k + 1
'        End If
'    Next i
    
''Conformal Coating
Dim Conformal_AdditionalValue As Double

Conformal_AdditionalValue = 0

    k = 22
    For i = 2 To 5
        If FinalQty.Cells(i, "D") <> "" Then
            QT.Cells(k, "C") = FinalQty.Cells(i, "A")
            QT.Cells(k, "O") = FinalQty.Cells(i, "B")
            QT.Cells(k, "Y") = FinalQty.Cells(i, "C")
            QT.Cells(k, "AB") = FinalQty.Cells(i, "D")
            QT.Cells(k, "AG") = FinalQty.Cells(i, "E")
            QT.Rows(k).Hidden = False
            Conformal_AdditionalValue = FinalQty.Cells(i, "F")
            
            If Conformal_AdditionalValue > 0 Then
                QT.Cells(k + 1, "O") = FinalQty.Cells(1, "F")
                QT.Cells(k + 1, "Y") = FinalQty.Cells(i, "C")
                QT.Cells(k + 1, "AB") = Conformal_AdditionalValue / FinalQty.Cells(i, "C")
                QT.Cells(k + 1, "AG") = FinalQty.Cells(i, "F")
                QT.Rows(k + 1).Hidden = False
                QT.Cells(k + 2, "C") = "Sub Total"
                QT.Cells(k + 2, "AG") = QT.Cells(k, "AG") + QT.Cells(k + 1, "AG")
                QT.Rows(k + 2).Hidden = False
            End If
            
            k = k + 3
        End If
    Next i
                 
'fill non recurring data on template from 'final' Sheet
Dim j As Long
j = 36
Dim p As Long
    For p = 8 To 11
    If FinalQty.Cells(p, "E") > 0 Then
        QT.Cells(j, "C") = FinalQty.Cells(p, "A")
        QT.Cells(j, "O") = FinalQty.Cells(p, "B")
        QT.Cells(j, "Y") = FinalQty.Cells(p, "C")
        QT.Cells(j, "AB") = FinalQty.Cells(p, "D")
        QT.Cells(j, "AG") = FinalQty.Cells(p, "E")
        QT.Rows(j).Hidden = False
        j = j + 1
        End If
        
        Next p

    'Total the non recurring charges
    QT.Range("AG40").Value = QT.Range("AG36").Value + QT.Range("AG37").Value + QT.Range("AG38").Value + QT.Range("AG39").Value


'--------------------------------------Notes to put before price breakdown------------------------------------------------------------------

'NOTE 1
If FinalQty.Range("K1") <> "" Then
QT.Rows(42).Hidden = False
QT.Range("G42") = FinalQty.Range("K1")
End If

'NOTE 2
If FinalQty.Range("K2") <> "" Then
QT.Rows(43).Hidden = False
QT.Range("G43") = FinalQty.Range("K2")
End If

'NOTE 3
If FinalQty.Range("K3") <> "" Then
QT.Rows(44).Hidden = False
QT.Range("G44") = FinalQty.Range("K3")
End If


    '----------------table notes--------------------'
If FinalQty.Range("J7") <> "" And FinalQty.Range("J5") <> "" Then
QT.Rows(48).Hidden = False
QT.Range("D48") = FinalQty.Range("J5")
End If

If FinalQty.Range("J7") <> "" Then
QT.Rows(49).Hidden = False
End If
    

For i = 50 To 59

QT.Cells(i, "D") = FinalQty.Cells(i - 43, "J")
QT.Cells(i, "F") = FinalQty.Cells(i - 43, "K")
QT.Cells(i, "K") = FinalQty.Cells(i - 43, "L")
QT.Cells(i, "X") = FinalQty.Cells(i - 43, "M")
QT.Cells(i, "AD") = FinalQty.Cells(i - 43, "N")
QT.Cells(i, "AG") = FinalQty.Cells(i - 43, "O")
QT.Cells(i, "AK") = FinalQty.Cells(i - 43, "P")
If QT.Cells(i, "D") <> "" Then
QT.Rows(i).Hidden = False
Else
QT.Rows(i).Hidden = True
End If
Next i

'----------------------------------------Price Breakdown for Qty 1-------------------------------------------------------------------------------'

If FinalQty.Range("E2") <> "" Then

    Dim cell As Range
    Dim searchTerm As String
    Dim PB1 As Integer

    ' Loop through each cell in Column A
    For Each cell In QT.Range("A1:A255")
        searchTerm = cell.Value
        If searchTerm = "A1" Then
        PB1 = cell.Row
        Exit For
        End If
    Next cell

    
    QT.Rows(PB1 & ":" & PB1 + 48).EntireRow.Hidden = False
    

    QT.Range("A" & PB1).Offset(1, 25).Value = FinalQty.Range("B38")            'Board Name
    
    '---------PCB Assembly Quantities----------------------------'
    QT.Range("A" & PB1).Offset(3, 20).Value = Qty1.Range("G193")            'Assembly Qty
    QT.Range("A" & PB1).Offset(4, 20).Value = Qty1.Range("G194")            'Programming Qty
    QT.Range("A" & PB1).Offset(5, 20).Value = Qty1.Range("G195")            'Stancil for Assembly Qty
    QT.Range("A" & PB1).Offset(6, 20).Value = Qty1.Range("G196")            'With recurring charges Qty
    QT.Range("A" & PB1).Offset(7, 20).Value = Qty1.Range("G197")            'Without recurring charges Qty
    
    '---------PCB Assembly Unit Price---------------------------'
    QT.Range("A" & PB1).Offset(3, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(4, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(5, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(6, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(7, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(3, 25).Value = Qty1.Range("H193")
    QT.Range("A" & PB1).Offset(4, 25).Value = Qty1.Range("H194")
    QT.Range("A" & PB1).Offset(5, 25).Value = Qty1.Range("H195")
    QT.Range("A" & PB1).Offset(6, 25).Value = Qty1.Range("H196")
    QT.Range("A" & PB1).Offset(7, 25).Value = Qty1.Range("H197")
    
    '---------PCB Assembly Total---------------------------------'
    QT.Range("A" & PB1).Offset(3, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(4, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(5, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(6, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(7, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(3, 32).Value = Qty1.Range("I193")
    QT.Range("A" & PB1).Offset(4, 32).Value = Qty1.Range("I194")
    QT.Range("A" & PB1).Offset(5, 32).Value = Qty1.Range("I195")
    QT.Range("A" & PB1).Offset(6, 32).Value = Qty1.Range("I196")
    QT.Range("A" & PB1).Offset(7, 32).Value = Qty1.Range("I197")
    
    '---------PCB Fabrication Quantities----------------------------'
    QT.Range("A" & PB1).Offset(10, 20).Value = Qty1.Range("G200")
    QT.Range("A" & PB1).Offset(11, 20).Value = Qty1.Range("G201")
    QT.Range("A" & PB1).Offset(12, 20).Value = Qty1.Range("G202")
    QT.Range("A" & PB1).Offset(13, 20).Value = Qty1.Range("G203")
    QT.Range("A" & PB1).Offset(14, 20).Value = Qty1.Range("G204")
    
    '---------PCB Fabrication Unit Price---------------------------'
    QT.Range("A" & PB1).Offset(10, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(11, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(12, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(13, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(14, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(10, 25).Value = Qty1.Range("H200")
    QT.Range("A" & PB1).Offset(11, 25).Value = Qty1.Range("H201")
    QT.Range("A" & PB1).Offset(12, 25).Value = Qty1.Range("H202")
    QT.Range("A" & PB1).Offset(13, 25).Value = Qty1.Range("H203")
    QT.Range("A" & PB1).Offset(14, 25).Value = Qty1.Range("H204")
    
    '---------PCB Fabrication Total---------------------------------'
    QT.Range("A" & PB1).Offset(10, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(11, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(12, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(13, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(14, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(10, 32).Value = Qty1.Range("I200")
    QT.Range("A" & PB1).Offset(11, 32).Value = Qty1.Range("I201")
    QT.Range("A" & PB1).Offset(12, 32).Value = Qty1.Range("I202")
    QT.Range("A" & PB1).Offset(13, 32).Value = Qty1.Range("I203")
    QT.Range("A" & PB1).Offset(14, 32).Value = Qty1.Range("I204")
    
    
    '---------PCB Componenets Quantities----------------------------'
    QT.Range("A" & PB1).Offset(17, 20).Value = Qty1.Range("G207")
    QT.Range("A" & PB1).Offset(18, 20).Value = Qty1.Range("G208")
    QT.Range("A" & PB1).Offset(19, 20).Value = Qty1.Range("G209")
    
    '---------PCB Componenets Unit Price---------------------------'
    QT.Range("A" & PB1).Offset(17, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(18, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(19, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(17, 25).Value = Qty1.Range("H207")
    QT.Range("A" & PB1).Offset(18, 25).Value = Qty1.Range("H208")
    QT.Range("A" & PB1).Offset(19, 25).Value = Qty1.Range("H209")
    
    '---------PCB Componenets Total---------------------------------'
    QT.Range("A" & PB1).Offset(17, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(18, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(19, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(17, 32).Value = Qty1.Range("I207")
    QT.Range("A" & PB1).Offset(18, 32).Value = Qty1.Range("I208")
    QT.Range("A" & PB1).Offset(19, 32).Value = Qty1.Range("I209")

    '---------Miscellaneous Quantities----------------------------'
    QT.Range("A" & PB1).Offset(22, 20).Value = Qty1.Range("G212")
    QT.Range("A" & PB1).Offset(23, 20).Value = Qty1.Range("G213")

    '---------Miscellaneous Unit Price---------------------------'
    QT.Range("A" & PB1).Offset(22, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(23, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(22, 25).Value = Qty1.Range("H212")
    QT.Range("A" & PB1).Offset(23, 25).Value = Qty1.Range("H213")
    
     '---------Miscellaneous Total---------------------------------'
    QT.Range("A" & PB1).Offset(22, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(23, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(24, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(22, 32).Value = Qty1.Range("I212")
    QT.Range("A" & PB1).Offset(23, 32).Value = Qty1.Range("I213")
    QT.Range("A" & PB1).Offset(24, 32).Value = Qty1.Range("I214")
    
    
    '---------last 3 rows---------------------'
    QT.Range("A" & PB1).Offset(25, 20).Value = Qty1.Range("G215")
    QT.Range("A" & PB1).Offset(26, 20).Value = Qty1.Range("G216")
    QT.Range("A" & PB1).Offset(27, 20).Value = Qty1.Range("G217")

    QT.Range("A" & PB1).Offset(25, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(26, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(27, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(25, 25).Value = Qty1.Range("H215")
    QT.Range("A" & PB1).Offset(26, 25).Value = Qty1.Range("H216")
    QT.Range("A" & PB1).Offset(27, 25).Value = Qty1.Range("H217")
    
    QT.Range("A" & PB1).Offset(25, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(26, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(27, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(25, 32).Value = Qty1.Range("I215")
    QT.Range("A" & PB1).Offset(26, 32).Value = Qty1.Range("I216")
    QT.Range("A" & PB1).Offset(27, 32).Value = Qty1.Range("I217")
    
    '-----------Material Only Value-----------------------------'
    QT.Range("A" & PB1).Offset(29, 20).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB1).Offset(29, 20).Value = Qty1.Range("G219")
    
Set cell = Nothing
searchTerm = ""
End If
    
'---------------------------------------------Price Breakdonw for Qty 1 done-----------------------------------------------------------'






'----------------------------------------Price Breakdown for Qty 2-------------------------------------------------------------------------------'

If FinalQty.Range("E3") <> "" Then
    
    'Dim cell As Range
    'Dim searchTerm As String
    Dim PB2 As Integer

    
    
    ' Loop through each cell in Column A
    For Each cell In QT.Range("A1:A255")
        searchTerm = cell.Value
        If searchTerm = "B1" Then
        PB2 = cell.Row
        Exit For
        End If
        
    Next cell

    QT.Rows(PB2 & ":" & PB2 + 48).EntireRow.Hidden = False
    
    QT.Range("A" & PB2).Offset(1, 25).Value = FinalQty.Range("B38")            'Board Name
    
    '---------PCB Assembly Quantities----------------------------'
    QT.Range("A" & PB2).Offset(3, 20).Value = Qty2.Range("G193")            'Assembly Qty
    QT.Range("A" & PB2).Offset(4, 20).Value = Qty2.Range("G194")            'Programming Qty
    QT.Range("A" & PB2).Offset(5, 20).Value = Qty2.Range("G195")            'Stancil for Assembly Qty
    QT.Range("A" & PB2).Offset(6, 20).Value = Qty2.Range("G196")            'With recurring charges Qty
    QT.Range("A" & PB2).Offset(7, 20).Value = Qty2.Range("G197")            'Without recurring charges Qty
    
    '---------PCB Assembly Unit Price---------------------------'
    QT.Range("A" & PB2).Offset(3, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(4, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(5, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(6, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(7, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(3, 25).Value = Qty2.Range("H193")
    QT.Range("A" & PB2).Offset(4, 25).Value = Qty2.Range("H194")
    QT.Range("A" & PB2).Offset(5, 25).Value = Qty2.Range("H195")
    QT.Range("A" & PB2).Offset(6, 25).Value = Qty2.Range("H196")
    QT.Range("A" & PB2).Offset(7, 25).Value = Qty2.Range("H197")
    
    '---------PCB Assembly Total---------------------------------'
    QT.Range("A" & PB2).Offset(3, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(4, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(5, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(6, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(7, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(3, 32).Value = Qty2.Range("I193")
    QT.Range("A" & PB2).Offset(4, 32).Value = Qty2.Range("I194")
    QT.Range("A" & PB2).Offset(5, 32).Value = Qty2.Range("I195")
    QT.Range("A" & PB2).Offset(6, 32).Value = Qty2.Range("I196")
    QT.Range("A" & PB2).Offset(7, 32).Value = Qty2.Range("I197")
    
    '---------PCB Fabrication Quantities----------------------------'
    QT.Range("A" & PB2).Offset(10, 20).Value = Qty2.Range("G200")
    QT.Range("A" & PB2).Offset(11, 20).Value = Qty2.Range("G201")
    QT.Range("A" & PB2).Offset(12, 20).Value = Qty2.Range("G202")
    QT.Range("A" & PB2).Offset(13, 20).Value = Qty2.Range("G203")
    QT.Range("A" & PB2).Offset(14, 20).Value = Qty2.Range("G204")
    
    '---------PCB Fabrication Unit Price---------------------------'
    QT.Range("A" & PB2).Offset(10, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(11, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(12, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(13, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(14, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(10, 25).Value = Qty2.Range("H200")
    QT.Range("A" & PB2).Offset(11, 25).Value = Qty2.Range("H201")
    QT.Range("A" & PB2).Offset(12, 25).Value = Qty2.Range("H202")
    QT.Range("A" & PB2).Offset(13, 25).Value = Qty2.Range("H203")
    QT.Range("A" & PB2).Offset(14, 25).Value = Qty2.Range("H204")
    
    '---------PCB Fabrication Total---------------------------------'
    QT.Range("A" & PB2).Offset(10, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(11, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(12, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(13, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(14, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(10, 32).Value = Qty2.Range("I200")
    QT.Range("A" & PB2).Offset(11, 32).Value = Qty2.Range("I201")
    QT.Range("A" & PB2).Offset(12, 32).Value = Qty2.Range("I202")
    QT.Range("A" & PB2).Offset(13, 32).Value = Qty2.Range("I203")
    QT.Range("A" & PB2).Offset(14, 32).Value = Qty2.Range("I204")
    
    
    '---------PCB Componenets Quantities----------------------------'
    QT.Range("A" & PB2).Offset(17, 20).Value = Qty2.Range("G207")
    QT.Range("A" & PB2).Offset(18, 20).Value = Qty2.Range("G208")
    QT.Range("A" & PB2).Offset(19, 20).Value = Qty2.Range("G209")
    
    '---------PCB Componenets Unit Price---------------------------'
    QT.Range("A" & PB2).Offset(17, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(18, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(19, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(17, 25).Value = Qty2.Range("H207")
    QT.Range("A" & PB2).Offset(18, 25).Value = Qty2.Range("H208")
    QT.Range("A" & PB2).Offset(19, 25).Value = Qty2.Range("H209")
    
    '---------PCB Componenets Total---------------------------------'
    QT.Range("A" & PB2).Offset(17, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(18, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(19, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(17, 32).Value = Qty2.Range("I207")
    QT.Range("A" & PB2).Offset(18, 32).Value = Qty2.Range("I208")
    QT.Range("A" & PB2).Offset(19, 32).Value = Qty2.Range("I209")

    '---------Miscellaneous Quantities----------------------------'
    QT.Range("A" & PB2).Offset(22, 20).Value = Qty2.Range("G212")
    QT.Range("A" & PB2).Offset(23, 20).Value = Qty2.Range("G213")

    '---------Miscellaneous Unit Price---------------------------'
    QT.Range("A" & PB2).Offset(22, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(23, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(22, 25).Value = Qty2.Range("H212")
    QT.Range("A" & PB2).Offset(23, 25).Value = Qty2.Range("H213")
    
     '---------Miscellaneous Total---------------------------------'
    QT.Range("A" & PB2).Offset(22, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(23, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(24, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(22, 32).Value = Qty2.Range("I212")
    QT.Range("A" & PB2).Offset(23, 32).Value = Qty2.Range("I213")
    QT.Range("A" & PB2).Offset(24, 32).Value = Qty2.Range("I214")
    
    
    '---------last 3 rows---------------------'
    QT.Range("A" & PB2).Offset(25, 20).Value = Qty2.Range("G215")
    QT.Range("A" & PB2).Offset(26, 20).Value = Qty2.Range("G216")
    QT.Range("A" & PB2).Offset(27, 20).Value = Qty2.Range("G217")

    QT.Range("A" & PB2).Offset(25, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(26, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(27, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(25, 25).Value = Qty2.Range("H215")
    QT.Range("A" & PB2).Offset(26, 25).Value = Qty2.Range("H216")
    QT.Range("A" & PB2).Offset(27, 25).Value = Qty2.Range("H217")
    
    QT.Range("A" & PB2).Offset(25, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(26, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(27, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(25, 32).Value = Qty2.Range("I215")
    QT.Range("A" & PB2).Offset(26, 32).Value = Qty2.Range("I216")
    QT.Range("A" & PB2).Offset(27, 32).Value = Qty2.Range("I217")
    
    '-----------Material Only Value-----------------------------'
    QT.Range("A" & PB2).Offset(29, 20).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB2).Offset(29, 20).Value = Qty2.Range("G219")
    
Set cell = Nothing
searchTerm = ""
End If
    
'---------------------------------------------Price Breakdonw for Qty 2 done-----------------------------------------------------------'




'----------------------------------------Price Breakdown for Qty 3-------------------------------------------------------------------------------'

If FinalQty.Range("E4") <> "" Then
    
    'Dim cell As Range
    'Dim searchTerm As String
    Dim PB3 As Integer
    
    
    
    ' Loop through each cell in Column A
    For Each cell In QT.Range("A1:A255")
        searchTerm = cell.Value
        If searchTerm = "C1" Then
        PB3 = cell.Row
        Exit For
        End If
        
    Next cell

    QT.Rows(PB3 & ":" & PB3 + 48).EntireRow.Hidden = False
    
    
    QT.Range("A" & PB3).Offset(1, 25).Value = FinalQty.Range("B38")            'part number
    
    '---------PCB Assembly Quantities----------------------------'
    QT.Range("A" & PB3).Offset(3, 20).Value = Qty3.Range("G193")            'Assembly Qty
    QT.Range("A" & PB3).Offset(4, 20).Value = Qty3.Range("G194")            'Programming Qty
    QT.Range("A" & PB3).Offset(5, 20).Value = Qty3.Range("G195")            'Stancil for Assembly Qty
    QT.Range("A" & PB3).Offset(6, 20).Value = Qty3.Range("G196")            'With recurring charges Qty
    QT.Range("A" & PB3).Offset(7, 20).Value = Qty3.Range("G197")            'Without recurring charges Qty
    
    '---------PCB Assembly Unit Price---------------------------'
    QT.Range("A" & PB3).Offset(3, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(4, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(5, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(6, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(7, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(3, 25).Value = Qty3.Range("H193")
    QT.Range("A" & PB3).Offset(4, 25).Value = Qty3.Range("H194")
    QT.Range("A" & PB3).Offset(5, 25).Value = Qty3.Range("H195")
    QT.Range("A" & PB3).Offset(6, 25).Value = Qty3.Range("H196")
    QT.Range("A" & PB3).Offset(7, 25).Value = Qty3.Range("H197")
    
    '---------PCB Assembly Total---------------------------------'
    QT.Range("A" & PB3).Offset(3, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(4, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(5, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(6, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(7, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(3, 32).Value = Qty3.Range("I193")
    QT.Range("A" & PB3).Offset(4, 32).Value = Qty3.Range("I194")
    QT.Range("A" & PB3).Offset(5, 32).Value = Qty3.Range("I195")
    QT.Range("A" & PB3).Offset(6, 32).Value = Qty3.Range("I196")
    QT.Range("A" & PB3).Offset(7, 32).Value = Qty3.Range("I197")
    
    '---------PCB Fabrication Quantities----------------------------'
    QT.Range("A" & PB3).Offset(10, 20).Value = Qty3.Range("G200")
    QT.Range("A" & PB3).Offset(11, 20).Value = Qty3.Range("G201")
    QT.Range("A" & PB3).Offset(12, 20).Value = Qty3.Range("G202")
    QT.Range("A" & PB3).Offset(13, 20).Value = Qty3.Range("G203")
    QT.Range("A" & PB3).Offset(14, 20).Value = Qty3.Range("G204")
    
    '---------PCB Fabrication Unit Price---------------------------'
    QT.Range("A" & PB3).Offset(10, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(11, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(12, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(13, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(14, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(10, 25).Value = Qty3.Range("H200")
    QT.Range("A" & PB3).Offset(11, 25).Value = Qty3.Range("H201")
    QT.Range("A" & PB3).Offset(12, 25).Value = Qty3.Range("H202")
    QT.Range("A" & PB3).Offset(13, 25).Value = Qty3.Range("H203")
    QT.Range("A" & PB3).Offset(14, 25).Value = Qty3.Range("H204")
    
    '---------PCB Fabrication Total---------------------------------'
    QT.Range("A" & PB3).Offset(10, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(11, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(12, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(13, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(14, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(10, 32).Value = Qty3.Range("I200")
    QT.Range("A" & PB3).Offset(11, 32).Value = Qty3.Range("I201")
    QT.Range("A" & PB3).Offset(12, 32).Value = Qty3.Range("I202")
    QT.Range("A" & PB3).Offset(13, 32).Value = Qty3.Range("I203")
    QT.Range("A" & PB3).Offset(14, 32).Value = Qty3.Range("I204")
    
    
    '---------PCB Componenets Quantities----------------------------'
    QT.Range("A" & PB3).Offset(17, 20).Value = Qty3.Range("G207")
    QT.Range("A" & PB3).Offset(18, 20).Value = Qty3.Range("G208")
    QT.Range("A" & PB3).Offset(19, 20).Value = Qty3.Range("G209")
    
    '---------PCB Componenets Unit Price---------------------------'
    QT.Range("A" & PB3).Offset(17, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(18, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(19, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(17, 25).Value = Qty3.Range("H207")
    QT.Range("A" & PB3).Offset(18, 25).Value = Qty3.Range("H208")
    QT.Range("A" & PB3).Offset(19, 25).Value = Qty3.Range("H209")
    
    '---------PCB Componenets Total---------------------------------'
    QT.Range("A" & PB3).Offset(17, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(18, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(19, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(17, 32).Value = Qty3.Range("I207")
    QT.Range("A" & PB3).Offset(18, 32).Value = Qty3.Range("I208")
    QT.Range("A" & PB3).Offset(19, 32).Value = Qty3.Range("I209")

    '---------Miscellaneous Quantities----------------------------'
    QT.Range("A" & PB3).Offset(22, 20).Value = Qty3.Range("G212")
    QT.Range("A" & PB3).Offset(23, 20).Value = Qty3.Range("G213")

    '---------Miscellaneous Unit Price---------------------------'
    QT.Range("A" & PB3).Offset(22, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(23, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(22, 25).Value = Qty3.Range("H212")
    QT.Range("A" & PB3).Offset(23, 25).Value = Qty3.Range("H213")
    
     '---------Miscellaneous Total---------------------------------'
    QT.Range("A" & PB3).Offset(22, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(23, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(24, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(22, 32).Value = Qty3.Range("I212")
    QT.Range("A" & PB3).Offset(23, 32).Value = Qty3.Range("I213")
    QT.Range("A" & PB3).Offset(24, 32).Value = Qty3.Range("I214")
    
    
    '---------last 3 rows---------------------'
    QT.Range("A" & PB3).Offset(25, 20).Value = Qty3.Range("G215")
    QT.Range("A" & PB3).Offset(26, 20).Value = Qty3.Range("G216")
    QT.Range("A" & PB3).Offset(27, 20).Value = Qty3.Range("G217")

    QT.Range("A" & PB3).Offset(25, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(26, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(27, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(25, 25).Value = Qty3.Range("H215")
    QT.Range("A" & PB3).Offset(26, 25).Value = Qty3.Range("H216")
    QT.Range("A" & PB3).Offset(27, 25).Value = Qty3.Range("H217")
    
    QT.Range("A" & PB3).Offset(25, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(26, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(27, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(25, 32).Value = Qty3.Range("I215")
    QT.Range("A" & PB3).Offset(26, 32).Value = Qty3.Range("I216")
    QT.Range("A" & PB3).Offset(27, 32).Value = Qty3.Range("I217")
    
    '-----------Material Only Value-----------------------------'
    QT.Range("A" & PB3).Offset(29, 20).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB3).Offset(29, 20).Value = Qty3.Range("G219")
    
Set cell = Nothing
searchTerm = ""
End If
    
'---------------------------------------------Price Breakdonw for Qty 3 done-----------------------------------------------------------'




'----------------------------------------Price Breakdown for Qty 4-------------------------------------------------------------------------------'

If FinalQty.Range("E5") <> "" Then
    
    'Dim cell As Range
    'Dim searchTerm As String
    Dim PB4 As Integer

    
    ' Loop through each cell in Column A
    For Each cell In QT.Range("A1:A255")
        searchTerm = cell.Value
        If searchTerm = "D1" Then
        PB4 = cell.Row
        Exit For
        End If
        
    Next cell

    QT.Rows(PB4 & ":" & PB4 + 48).EntireRow.Hidden = False
    
    QT.Range("A" & PB4).Offset(1, 25).Value = FinalQty.Range("B38")            'part number
    
    '---------PCB Assembly Quantities----------------------------'
    QT.Range("A" & PB4).Offset(3, 20).Value = Qty4.Range("G193")            'Assembly Qty
    QT.Range("A" & PB4).Offset(4, 20).Value = Qty4.Range("G194")            'Programming Qty
    QT.Range("A" & PB4).Offset(5, 20).Value = Qty4.Range("G195")            'Stancil for Assembly Qty
    QT.Range("A" & PB4).Offset(6, 20).Value = Qty4.Range("G196")            'With recurring charges Qty
    QT.Range("A" & PB4).Offset(7, 20).Value = Qty4.Range("G197")            'Without recurring charges Qty
    
    '---------PCB Assembly Unit Price---------------------------'
    QT.Range("A" & PB4).Offset(3, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(4, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(5, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(6, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(7, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(3, 25).Value = Qty4.Range("H193")
    QT.Range("A" & PB4).Offset(4, 25).Value = Qty4.Range("H194")
    QT.Range("A" & PB4).Offset(5, 25).Value = Qty4.Range("H195")
    QT.Range("A" & PB4).Offset(6, 25).Value = Qty4.Range("H196")
    QT.Range("A" & PB4).Offset(7, 25).Value = Qty4.Range("H197")
    
    '---------PCB Assembly Total---------------------------------'
    QT.Range("A" & PB4).Offset(3, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(4, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(5, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(6, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(7, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(3, 32).Value = Qty4.Range("I193")
    QT.Range("A" & PB4).Offset(4, 32).Value = Qty4.Range("I194")
    QT.Range("A" & PB4).Offset(5, 32).Value = Qty4.Range("I195")
    QT.Range("A" & PB4).Offset(6, 32).Value = Qty4.Range("I196")
    QT.Range("A" & PB4).Offset(7, 32).Value = Qty4.Range("I197")
    
    '---------PCB Fabrication Quantities----------------------------'
    QT.Range("A" & PB4).Offset(10, 20).Value = Qty4.Range("G200")
    QT.Range("A" & PB4).Offset(11, 20).Value = Qty4.Range("G201")
    QT.Range("A" & PB4).Offset(12, 20).Value = Qty4.Range("G202")
    QT.Range("A" & PB4).Offset(13, 20).Value = Qty4.Range("G203")
    QT.Range("A" & PB4).Offset(14, 20).Value = Qty4.Range("G204")
    
    '---------PCB Fabrication Unit Price---------------------------'
    QT.Range("A" & PB4).Offset(10, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(11, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(12, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(13, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(14, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(10, 25).Value = Qty4.Range("H200")
    QT.Range("A" & PB4).Offset(11, 25).Value = Qty4.Range("H201")
    QT.Range("A" & PB4).Offset(12, 25).Value = Qty4.Range("H202")
    QT.Range("A" & PB4).Offset(13, 25).Value = Qty4.Range("H203")
    QT.Range("A" & PB4).Offset(14, 25).Value = Qty4.Range("H204")
    
    '---------PCB Fabrication Total---------------------------------'
    QT.Range("A" & PB4).Offset(10, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(11, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(12, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(13, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(14, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(10, 32).Value = Qty4.Range("I200")
    QT.Range("A" & PB4).Offset(11, 32).Value = Qty4.Range("I201")
    QT.Range("A" & PB4).Offset(12, 32).Value = Qty4.Range("I202")
    QT.Range("A" & PB4).Offset(13, 32).Value = Qty4.Range("I203")
    QT.Range("A" & PB4).Offset(14, 32).Value = Qty4.Range("I204")
    
    
    '---------PCB Componenets Quantities----------------------------'
    QT.Range("A" & PB4).Offset(17, 20).Value = Qty4.Range("G207")
    QT.Range("A" & PB4).Offset(18, 20).Value = Qty4.Range("G208")
    QT.Range("A" & PB4).Offset(19, 20).Value = Qty4.Range("G209")
    
    '---------PCB Componenets Unit Price---------------------------'
    QT.Range("A" & PB4).Offset(17, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(18, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(19, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(17, 25).Value = Qty4.Range("H207")
    QT.Range("A" & PB4).Offset(18, 25).Value = Qty4.Range("H208")
    QT.Range("A" & PB4).Offset(19, 25).Value = Qty4.Range("H209")
    
    '---------PCB Componenets Total---------------------------------'
    QT.Range("A" & PB4).Offset(17, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(18, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(19, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(17, 32).Value = Qty4.Range("I207")
    QT.Range("A" & PB4).Offset(18, 32).Value = Qty4.Range("I208")
    QT.Range("A" & PB4).Offset(19, 32).Value = Qty4.Range("I209")

    '---------Miscellaneous Quantities----------------------------'
    QT.Range("A" & PB4).Offset(22, 20).Value = Qty4.Range("G212")
    QT.Range("A" & PB4).Offset(23, 20).Value = Qty4.Range("G213")

    '---------Miscellaneous Unit Price---------------------------'
    QT.Range("A" & PB4).Offset(22, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(23, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(22, 25).Value = Qty4.Range("H212")
    QT.Range("A" & PB4).Offset(23, 25).Value = Qty4.Range("H213")
    
     '---------Miscellaneous Total---------------------------------'
    QT.Range("A" & PB4).Offset(22, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(23, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(24, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(22, 32).Value = Qty4.Range("I212")
    QT.Range("A" & PB4).Offset(23, 32).Value = Qty4.Range("I213")
    QT.Range("A" & PB4).Offset(24, 32).Value = Qty4.Range("I214")
    
    
    '---------last 3 rows---------------------'
    QT.Range("A" & PB4).Offset(25, 20).Value = Qty4.Range("G215")
    QT.Range("A" & PB4).Offset(26, 20).Value = Qty4.Range("G216")
    QT.Range("A" & PB4).Offset(27, 20).Value = Qty4.Range("G217")

    QT.Range("A" & PB4).Offset(25, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(26, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(27, 25).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(25, 25).Value = Qty4.Range("H215")
    QT.Range("A" & PB4).Offset(26, 25).Value = Qty4.Range("H216")
    QT.Range("A" & PB4).Offset(27, 25).Value = Qty4.Range("H217")
    
    QT.Range("A" & PB4).Offset(25, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(26, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(27, 32).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(25, 32).Value = Qty4.Range("I215")
    QT.Range("A" & PB4).Offset(26, 32).Value = Qty4.Range("I216")
    QT.Range("A" & PB4).Offset(27, 32).Value = Qty4.Range("I217")
    
    '-----------Material Only Value-----------------------------'
    QT.Range("A" & PB4).Offset(29, 20).NumberFormat = " #,##0.00 $"
    QT.Range("A" & PB4).Offset(29, 20).Value = Qty4.Range("G219")
    
    
    
Set cell = Nothing
searchTerm = ""
End If
    
'---------------------------------------------Price Breakdonw for Qty 4 done-----------------------------------------------------------'


Application.ScreenUpdating = True
Application.DisplayAlerts = True




End Sub
