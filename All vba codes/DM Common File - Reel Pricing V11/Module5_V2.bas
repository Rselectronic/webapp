Attribute VB_Name = "Module5_V2"
Sub SortDatainIndividualSheet()
    Dim wsDataInput As Worksheet
    Dim lastRow As Long
    Dim sheetNamesRange As Range
    Dim i As Long
    
    
turnoffscreenUpdate

    Dim ws As Worksheet
    
    For Each ws In Worksheets
    If ws.Name = "Temp" Or ws.Name = "Quote Log" Or ws.Name = "Procurement Log" Or ws.Name = "MasterSheet" Or ws.Name = "ATEMPLATE" Or ws.Name = "Customer Details" Or ws.Name = "Programming" Or ws.Name = "Authorization" Or ws.Name = "Price Calc" Or ws.Name = "MachineCodes" Or ws.Name = "ExtraOrder" Or ws.Name = "ManualMachineCode" Or ws.Name = "MachineCodeSummary" Or ws.Name = "Procurement" Or ws.Name = "DataInputSheets" Or ws.Name = "Stencils Positions" Then
    Else
    If ws.Range("B2") = 1 Then
    'Debug.Print ws.Name
    
    ' Set the reference to the DataInputSheets worksheet
    Set wsDataInput = ThisWorkbook.Sheets(ws.Name)
    
    ' Find the last row in Column B of DataInputSheets
    lastRow = wsDataInput.Cells(wsDataInput.Rows.count, "A").End(xlUp).Row
    
    ' Set the range for the sheet names in Column B
    Set sheetNamesRange = wsDataInput.Range("A4:AN" & lastRow)
    
    ' Sort data in Ascending order based on Sheet Names
    sheetNamesRange.Sort Key1:=sheetNamesRange.Columns(16), Order1:=xlAscending, Header:=xlNo
    
    End If
    End If
    Next ws

turnonscreenUpdate


End Sub

Sub turnonscreenUpdate()

    Application.ScreenUpdating = True
    Application.DisplayAlerts = True
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True

End Sub
Sub turnoffscreenUpdate()

    Application.ScreenUpdating = False
    Application.DisplayAlerts = False
    Application.Calculation = xlCalculationManual
    Application.EnableEvents = False

End Sub
