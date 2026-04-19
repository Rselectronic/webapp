Attribute VB_Name = "Send_DATA_to_BOM_V3"
Sub SendQtytoBOM()
    Dim wsDataInput As Worksheet
    Dim ws As Worksheet
    Dim lastRow As Long
    Dim sheetNamesRange As Range
    Dim cell As Range
    Dim i As Long
    Dim sr As Integer
    Dim rowsToDelete As New Collection
    
    turnoffscreenUpdate

    sr = 1
    
    ' Set the reference to the DataInputSheets worksheet
    Set wsDataInput = ThisWorkbook.Sheets("DataInputSheets")
    initialiseHeaders wsDataInput
    
    ' Find the last row in Column B of DataInputSheets
    lastRow = wsDataInput.Cells(wsDataInput.Rows.count, DM_GlobalMFRPackage_Column).End(xlUp).Row
    
    ' Set the range for the sheet names in Column B
    'Set sheetNamesRange = wsDataInput.Range("B6:F" & lastRow)
    
    ' fill the project name in mastersheet
    frmTaskEntry.Show
    

    ' Loop through the sorted sheet names and rearrange sheets
    For i = 6 To lastRow
    On Error Resume Next
        Set ws = ThisWorkbook.Sheets(wsDataInput.Cells(i, DM_GlobalMFRPackage_Column).value)
    
        'Debug.Print ws.Name
        ws.Range("B2").value = wsDataInput.Cells(i, DM_ActiveQty_Column).value
        ws.Range("X2").value = wsDataInput.Cells(i, DM_QTY1_Column).value
        ws.Range("AC2").value = wsDataInput.Cells(i, DM_QTY2_Column).value
        ws.Range("AH2").value = wsDataInput.Cells(i, DM_QTY3_Column).value
        ws.Range("AM2").value = wsDataInput.Cells(i, DM_QTY4_Column).value

        wsDataInput.Cells(i, DM_SNo_Column).value = sr
        
        sr = sr + 1
        
    On Error GoTo 0
    If ws Is Nothing Then
    rowsToDelete.Add i
    End If
    
    Set ws = Nothing
    
    Next i
    
    
' Delete the rows outside of the loop, in reverse order
For i = rowsToDelete.count To 1 Step -1
    wsDataInput.Rows(rowsToDelete(i)).Delete
Next i
    
    
wsDataInput.Activate
    
turnonscreenUpdate


End Sub






