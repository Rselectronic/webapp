Attribute VB_Name = "Get_Rdesignation_V2"
Sub getRdesignation()

Dim ws As Worksheet
Dim ms As Worksheet
Dim i As Long
Dim lastRow As Long
Set ms = ThisWorkbook.Sheets("MasterSheet")

Dim atempWS As Worksheet
Set atempWS = ThisWorkbook.Sheets("ATEMPLATE")

initialiseHeaders , , ms, , , , , , , , , , , , , , , atempWS

lastRow = ms.Cells(ms.Rows.count, Master_CPC_Column).End(xlUp).Row
For i = 4 To lastRow
    Dim targetCell As String
    targetCell = ms.Cells(i, Master_Result_Column)
    If InStr(1, targetCell, "+", vbTextCompare) > 0 Then
    Else
    'If WorksheetExists(targetCell) Then
    Set ws = ThisWorkbook.Sheets(targetCell)
    'Debug.Print ws.Name
    
    Dim searchValue As String
    searchValue = ms.Cells(i, Master_CPC_Column)
    
    Dim wsLastRow As Long
    wsLastRow = ws.Cells(ws.Rows.count, ATEMPLATE_CPC_Number_Column).End(xlUp).Row
    
    'loop through each row to find the row number with CPC code
    Dim j As Long
    For j = 4 To wsLastRow
    If ws.Cells(j, ATEMPLATE_CPC_Number_Column) = searchValue Then
    ms.Cells(i, Master_RDesignation_Column) = ws.Cells(j, ATEMPLATE_R_DES_Column)
    Exit For
    End If
    Next j
    
    
    
    

End If
Next i

End Sub
