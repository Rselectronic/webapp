Attribute VB_Name = "Calculate_CustomerRef_V2"
Option Explicit

Sub getCustomerRef()

Application.ScreenUpdating = False

Dim inputSheet As Worksheet
Dim PCB As Worksheet

Set inputSheet = ThisWorkbook.Sheets("Proc")
Set PCB = ThisWorkbook.Sheets("PCB + Stencils Orders")

initialiseHeaders , , , inputSheet, , , PCB

Dim lankaPN As Long
Dim lastColumn As Long
Dim lastRow As Long

lastRow = inputSheet.Cells(inputSheet.Rows.count, Procsheet_CPC_Column).End(xlUp).Row

Dim i As Integer

'=== First get all the BG===
For i = 5 To lastRow
    Dim pn As String
    pn = inputSheet.Cells(i, Procsheet_CPC_Column)
    If inputSheet.Cells(i, Procsheet_BGorSS_Column) = "BG" Then inputSheet.Cells(i, Procsheet_CustomerRef_Column) = "BG"
Next i


'=== assign PCB letters===
For i = 5 To lastRow
    If inputSheet.Cells(i, Procsheet_CustomerRef_Column) = "" And InStr(1, inputSheet.Cells(i, Procsheet_BoardName_Column), "+") > 0 Then
        Dim resultText As String
        Dim boards() As String
        Dim letterList As String
        Dim j As Integer
        Dim foundCell As Range
        
        resultText = inputSheet.Cells(i, Procsheet_BoardName_Column)
        boards = Split(resultText, "+")
        letterList = ""
        
        For j = LBound(boards) To UBound(boards)
            Set foundCell = PCB.Columns(PCB_ProcSheet_GMP__Column).Find(What:=Trim(boards(j)), LookIn:=xlValues, LookAt:=xlWhole)
            If Not foundCell Is Nothing Then
                letterList = letterList & PCB.Cells(foundCell.Row, PCB_ProcSheet_Letter__Column).Value
            End If
        Next j
        
        inputSheet.Cells(i, Procsheet_CustomerRef_Column) = letterList
        '------new code for letter alphabets
    
    ElseIf inputSheet.Cells(i, Procsheet_CustomerRef_Column) = "" Then
        Dim board As String
        board = inputSheet.Cells(i, Procsheet_BoardName_Column)
        inputSheet.Cells(i, Procsheet_CustomerRef_Column) = PCB.Cells(PCB.Cells(1, PCB_ProcSheet_GMP__Column).EntireColumn.Find(What:=board, LookIn:=xlValues, LookAt:=xlWhole).Row, PCB_ProcSheet_Letter__Column)
    End If
Next i

' form the complete customer reference

For i = 5 To lastRow
    If InStr(1, inputSheet.Cells(i, Procsheet_RDesignation_Column), ",") > 0 Then
    inputSheet.Cells(i, Procsheet_CustomerRef_Column) = Trim(inputSheet.Cells(i, Procsheet_CustomerRef_Column) & " " & inputSheet.Cells(i, Procsheet_Mcodes_Column) & " " & inputSheet.Cells(i, Procsheet_ShortenCPC_Column))
    Else
    inputSheet.Cells(i, Procsheet_CustomerRef_Column) = Trim(inputSheet.Cells(i, Procsheet_CustomerRef_Column) & " " & inputSheet.Cells(i, Procsheet_RDesignation_Column) & " " & inputSheet.Cells(i, Procsheet_Mcodes_Column) & " " & inputSheet.Cells(i, Procsheet_ShortenCPC_Column))
    End If
    
Next i

get_pcbName_StencilName
Application.ScreenUpdating = True
End Sub

