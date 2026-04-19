Attribute VB_Name = "Module2_V2"
Sub Button13_Click()
AddingManualMachineCodes
End Sub



Sub AddingManualMachineCodes()
Dim ms As Worksheet, mws As Worksheet
Dim lastRow, masterLR, mLastRow, i As Integer
Dim rng, r As Range
Dim Descrip, mPN, DPN, MC As String

turnoffscreenUpdate

Set ms = ThisWorkbook.Worksheets("MasterSheet")
Set mws = ThisWorkbook.Worksheets("ManualMachineCode")
'masterLR = ms.Range("F100000").End(xlUp).Row
'initializing headers
initialiseHeaders , , ms

masterLR = ms.Cells(ms.Rows.count, Master_Description_Column).End(xlUp).Row
mLastRow = mws.Range("A100000").End(xlUp).Row
'mws.Range("A2:D" & mLastRow).ClearContents



For i = 4 To masterLR
    If ms.Cells(i, Master_AddManualMCode_Column).value <> "" Then   ' Column H = 8
        
        'find existing code in ManualMachineCode sheet and delete the data
        Dim FindCPC As String
        FindCPC = ms.Cells(i, Master_CPC_Column).value 'ms.Range("I" & i).Value
        
        Dim j As Long
        For j = mLastRow To 2 Step -1
            If mws.Range("A" & j).value = FindCPC Then
                mws.Rows(j).Delete
            End If
        Next j
        mLastRow = mws.Range("A100000").End(xlUp).Row
        'add new data for mcode
        mws.Range("A" & mLastRow + 1) = ms.Cells(i, Master_CPC_Column) ' ms.Range("I" & i)
        mws.Range("b" & mLastRow + 1) = ms.Cells(i, Master_AddManualMCode_Column) ' ms.Range("H" & i)
        ms.Cells(i, Master_Mcodes_Column) = ms.Cells(i, Master_AddManualMCode_Column)
        'ms.Range("G" & i) = ms.Range("H" & i)
    
    End If
mLastRow = mws.Range("A100000").End(xlUp).Row
'mLastRow = mLastRow + 1
Next i

turnonscreenUpdate

End Sub


