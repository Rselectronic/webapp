Attribute VB_Name = "Sort_by_NAME_V2"
Sub NameSortOnly()
    Dim wsDataInput As Worksheet
    Dim lastRow As Long
    Dim lastColumn As Long
    Dim lastColumnLetter As String
    Dim sheetNamesRange As Range
    Dim i As Long
    
    
    turnoffscreenUpdate

    ' Set the reference to the DataInputSheets worksheet
    Set wsDataInput = ThisWorkbook.Sheets("DataInputSheets")
    initialiseHeaders wsDataInput
      
    ' Find the last row in Column B of DataInputSheets
    lastRow = wsDataInput.Cells(wsDataInput.Rows.count, DM_GlobalMFRPackage_Column).End(xlUp).Row
    lastColumn = wsDataInput.Cells(DM_Header_Row, wsDataInput.Columns.count).End(xlToLeft).Column
    
    ' Convert the last column number to column letter
    lastColumnLetter = Split(wsDataInput.Cells(1, lastColumn).Address, "$")(1)

    ' Set the range for the sheet names in Column B
    Set sheetNamesRange = wsDataInput.Range(wsDataInput.Cells(DM_Header_Row + 1, DM_SNo_Column), wsDataInput.Cells(lastRow, lastColumnLetter))
    
    ' Sort data in Ascending order based on Sheet Names
    sheetNamesRange.Sort Key1:=sheetNamesRange.Columns(DM_GlobalMFRPackage_Column), Order1:=xlAscending, Header:=xlNo
    
    ''
    RearrangeS_No wsDataInput
    ''


turnonscreenUpdate

End Sub
