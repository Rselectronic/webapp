Attribute VB_Name = "Module11"
Sub copyParameters()

    Dim sheetName As String
    Dim summaryWS As Worksheet, ws As Worksheet, finalWS As Worksheet
    Dim foundRow As Long
    
    ' Prompt the user to input the sheet name
    sheetName = InputBox("Enter the sheet name to copy parameters from:", "Sheet Name")

    ' Check if the user clicked Cancel or left the input blank
    If sheetName = "" Then
        MsgBox "No sheet name was entered. Operation canceled.", vbExclamation, "Cancelled"
        Exit Sub
    End If

    ' Check if the sheet exists
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(sheetName)
    Set summaryWS = ThisWorkbook.Sheets("Summary")
    Set finalWS = ThisWorkbook.Sheets("final")
    
    initialiseHeaders , , , , , , , , summaryWS
    foundRow = summaryWS.Columns("A").Find(What:=sheetName, LookIn:=xlValues, LookAt:=xlWhole).Row
    On Error GoTo 0
    
    If Not ws Is Nothing Then
        
        ' copy the parameters from the sheet
        
        finalWS.Range("C15").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_qty1_labour_column)          ' labour1
        finalWS.Range("C16").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_qty2_labour_column)          ' labour2
        finalWS.Range("C17").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_qty3_labour_column)          ' labour3
        finalWS.Range("C18").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_qty4_labour_column)          ' labour4
        finalWS.Range("D15").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_qty1_smt_column)             ' smt1
        finalWS.Range("D16").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_qty2_smt_column)             ' smt2
        finalWS.Range("D17").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_qty3_smt_column)             ' smt3
        finalWS.Range("D18").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_qty4_smt_column)             ' smt4
        finalWS.Range("F15").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_qty1_pcbMarkup_column)       ' pcbMarkup1
        finalWS.Range("F16").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_qty2_pcbMarkup_column)       ' pcbMarkup2
        finalWS.Range("F17").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_qty3_pcbMarkup_column)       ' pcbMarkup3
        finalWS.Range("F18").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_qty4_pcbMarkup_column)       ' pcbMarkup4
        finalWS.Range("H15").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_qty1_componentMarkup_column) ' compMarkup1
        finalWS.Range("H16").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_qty2_componentMarkup_column) ' compMarkup2
        finalWS.Range("H17").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_qty3_componentMarkup_column) ' compMarkup3
        finalWS.Range("H18").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_qty4_componentMarkup_column) ' compMarkup4
        finalWS.Range("K1").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_note1_column)                 ' note1
        finalWS.Range("K2").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_note2_column)                 ' note2
        finalWS.Range("K3").Value = summaryWS.Cells(foundRow, timeWBsummaryWS_note3_column)                 ' note3
        
    Else
        MsgBox "The sheet '" & sheetName & "' does not exist in the workbook.", vbCritical, "Sheet Not Found"
    End If
    
End Sub
