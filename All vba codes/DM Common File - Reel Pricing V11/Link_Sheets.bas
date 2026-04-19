Attribute VB_Name = "Link_Sheets"
Sub LinkSheets()
    Dim wsDataInput As Worksheet
    Dim ws As Worksheet
    Dim lastRow As Long
    Dim sheetNamesRange As Range
    Dim cell As Range
    Dim i As Long
    Dim sr As Integer
    
    turnoffscreenUpdate

    sr = 1
    
    ' Set the reference to the DataInputSheets worksheet
    Set wsDataInput = ThisWorkbook.Sheets("DataInputSheets")
    initialiseHeaders wsDataInput
    
    ' Find the last row in Column B of DataInputSheets
    lastRow = wsDataInput.Cells(wsDataInput.Rows.count, DM_GlobalMFRPackage_Column).End(xlUp).Row
    
    ' Set the range for the sheet names in Column B
    Set sheetNamesRange = wsDataInput.Range(wsDataInput.Cells(DM_Header_Row + 1, DM_GlobalMFRPackage_Column), wsDataInput.Cells(lastRow, DM_PCB4_Column))
    
    ' Loop through the sorted sheet names and rearrange sheets
    For i = 1 To lastRow - 5
        Set ws = ThisWorkbook.Sheets(sheetNamesRange.Cells(i, 1).value)
        
        ws.Move After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.count)
        wsDataInput.Hyperlinks.Add Anchor:=sheetNamesRange.Cells(i, 1), _
            Address:="", SubAddress:="'" & ws.Name & "'!A1", TextToDisplay:=ws.Name
    
        wsDataInput.Cells(i + 5, DM_SNo_Column).value = sr
        
        sr = sr + 1
        
    Next i
wsDataInput.Activate

turnonscreenUpdate

End Sub








