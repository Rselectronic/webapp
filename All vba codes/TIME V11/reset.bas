Attribute VB_Name = "reset"
Sub ResetTemplate()

Application.ScreenUpdating = False
Application.DisplayAlerts = False


Dim QT, Qty1, Qty2, Qty3, Qty4, FinalQty As Worksheet

Set QT = ThisWorkbook.Sheets("Quotation Temp")
Set Qty1 = ThisWorkbook.Sheets("QTY 1")
Set Qty2 = ThisWorkbook.Sheets("QTY 2")
Set Qty3 = ThisWorkbook.Sheets("QTY 3")
Set Qty4 = ThisWorkbook.Sheets("QTY 4")

Set FinalQty = ThisWorkbook.Sheets("final")

QT.Range("Q10").Value = ""          'reset date field
QT.Range("C22:AG33").Value = ""     'reset all item details
QT.Range("C36:AG39").Value = ""     'reset all non recurring charges
QT.Range("AG40").Value = ""         'reset total of non recurring charges
QT.Range("G19").Value = ""          'reset Quote Number
QT.Range("N19").Value = ""          'reset Order type
QT.Range("O14").Value = ""          'reset lead time Line 1
QT.Range("O15").Value = ""          'reset lead time Line 2
QT.Range("O16").Value = ""          'reset lead time Line 3
QT.Range("Y11").Value = ""          'reset Global Manufacturing Package
QT.Range("AC12").Value = ""         'reset Bom Name
QT.Range("AA13").Value = ""         'reset BOM Rev
QT.Range("AC14").Value = ""         'reset PCB Name
QT.Range("AA15").Value = ""         'reset PCB Rev


QT.Rows("22:33").Hidden = True
QT.Rows("36:39").Hidden = True

QT.Range("G42:G44") = ""        'erase data from note 1, note 2 and note 3
QT.Rows("42:44").Hidden = True  'hide notes row

' extra row to hide
QT.Rows("45:46").Hidden = True

QT.Range("D50:AK59") = ""       'erase data from notes table
QT.Rows("48:59").Hidden = True

'---------------hide Price Breakdown Rows---------------------------'
    
    Dim cell As Range
    Dim searchTerm As String
    Dim PB1, PB2, PB3, PB4 As Integer
    
    
    ' Loop through each cell in Column A
    For Each cell In QT.Range("A1:A255")
        searchTerm = cell.Value
        If searchTerm = "A1" Then
        PB1 = cell.Row
        Exit For
        End If
    Next cell
    QT.Rows(PB1 & ":" & PB1 + 48).EntireRow.Hidden = True
    
    
    ' Loop through each cell in Column A
    For Each cell In QT.Range("A1:A255")
        searchTerm = cell.Value
        If searchTerm = "B1" Then
        PB2 = cell.Row
        Exit For
        End If
    Next cell
    QT.Rows(PB2 & ":" & PB2 + 48).EntireRow.Hidden = True
    
    
    ' Loop through each cell in Column A
    For Each cell In QT.Range("A1:A255")
        searchTerm = cell.Value
        If searchTerm = "C1" Then
        PB3 = cell.Row
        Exit For
        End If
    Next cell
    QT.Rows(PB3 & ":" & PB3 + 48).EntireRow.Hidden = True
    
    
    ' Loop through each cell in Column A
    For Each cell In QT.Range("A1:A255")
        searchTerm = cell.Value
        If searchTerm = "D1" Then
        PB4 = cell.Row
        Exit For
        End If
    Next cell
    QT.Rows(PB4 & ":" & PB4 + 48).EntireRow.Hidden = True
    
    
   

'----------------------------------------------------------------------'



Application.ScreenUpdating = True
Application.DisplayAlerts = True



End Sub
