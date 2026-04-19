Attribute VB_Name = "Module3"
Sub CreateWeeklyPlanningWB()

    Application.DisplayAlerts = False
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    
    Dim headerRow As Long
    headerRow = 2

    
    
    Dim wsProductionSchedule As Worksheet
    Dim wbWeeklyPlanning As Workbook, wsSMTpriority As Worksheet, wsTHpriority As Worksheet
    
    Set wsProductionSchedule = ThisWorkbook.Sheets("Project schedule - Detailed")
    
    Dim weeklyPlanningFolderPath As String
    weeklyPlanningFolderPath = GetLocalPath(ThisWorkbook.Path) & "\Weekly Planning Sheet\"
    
    Set wbWeeklyPlanning = Workbooks.Add

    ' Rename first sheet
    Set wsSMTpriority = wbWeeklyPlanning.Worksheets(1)
    wsSMTpriority.Name = "SMT Priority"
    
    ' Add second sheet and name it
    Set wsTHpriority = wbWeeklyPlanning.Worksheets.Add(After:=wsSMTpriority)
    wsTHpriority.Name = "TH Priority"
    
    wsSMTpriority.Name = "SMT Priority"
    wsTHpriority.Name = "TH Priority"
    
    
    ' create headers of new worksheet
    Dim headers As Variant
    headers = Array( _
            "CX", _
            "Proc Batch Code", _
            "Board Name", _
            "Board Letter", _
            "Qty", _
            "Stencil Name", _
            "Due Date MM/DD/YY", _
            "Priority", _
            "Comment 2", _
            "Mcode Summary" _
        )
    
    ' Write Title of both sheets
    With wsSMTpriority.Range("A1")
        .Value = "SMT Priority " & Format(Date, "mmm dd")
        .Font.Bold = True
        .Font.size = 24
    End With
    
    With wsTHpriority.Range("A1")
        .Value = "TH Priority " & Format(Date, "mmm dd")
        .Font.Bold = True
        .Font.size = 24
    End With
    
    ' Write headers
    Dim h As Long
    For h = LBound(headers) To UBound(headers)
        wsSMTpriority.Cells(headerRow, h + 1).Value = headers(h)
        wsTHpriority.Cells(headerRow, h + 1).Value = headers(h)
    Next h
    
    initaliseHeaders wsProductionSchedule
    
    Dim productionScheduleLR As Long, i As Long, k As Long
    productionScheduleLR = wsProductionSchedule.Cells(wsProductionSchedule.Rows.Count, prodSch_Task_Column).End(xlUp).Row
    
    Dim procBatchCode As String
    
    k = headerRow + 1
    
    ' fill the SMT priority sheet
    For i = 8 To productionScheduleLR
        If wsProductionSchedule.Cells(i, prodSch_CustomerName_Column) = "" Then
            procBatchCode = wsProductionSchedule.Cells(i, prodSch_Task_Column)
            GoTo SMTnextLine
        End If
        
        wsSMTpriority.Cells(k, "A") = wsProductionSchedule.Cells(i, prodSch_CustomerName_Column)
        wsSMTpriority.Cells(k, "B") = procBatchCode
        wsSMTpriority.Cells(k, "C") = wsProductionSchedule.Cells(i, prodSch_Task_Column)
        wsSMTpriority.Cells(k, "D") = wsProductionSchedule.Cells(i, prodSch_BoardLetter_Column)
        wsSMTpriority.Cells(k, "E") = wsProductionSchedule.Cells(i, prodSch_Qty_Column)
        wsSMTpriority.Cells(k, "F") = wsProductionSchedule.Cells(i, prodSch_StencilName_Column)
        wsSMTpriority.Cells(k, "G") = wsProductionSchedule.Cells(i, prodSch_DueDate_Column)
        wsSMTpriority.Cells(k, "G").NumberFormat = "mm/dd/yyyy"
        wsSMTpriority.Cells(k, "H") = GetSMTStatus(wsProductionSchedule.Cells(i, prodSch_ProductionStatus_Column))
        wsSMTpriority.Cells(k, "I") = wsProductionSchedule.Cells(i, prodSch_Comment2_Column)
        wsSMTpriority.Cells(k, "J") = GetLinesFromMcodeSummary(wsProductionSchedule.Cells(i, prodSch_McodeSummary_Column))
        k = k + 1
SMTnextLine:
    Next i
    
    
    k = headerRow + 1
    ' fill the SMT priority sheet
    For i = 8 To productionScheduleLR
        If wsProductionSchedule.Cells(i, prodSch_CustomerName_Column) = "" Then
            procBatchCode = wsProductionSchedule.Cells(i, prodSch_Task_Column)
            GoTo THnextLine
        End If
        
        wsTHpriority.Cells(k, "A") = wsProductionSchedule.Cells(i, prodSch_CustomerName_Column)
        wsTHpriority.Cells(k, "B") = procBatchCode
        wsTHpriority.Cells(k, "C") = wsProductionSchedule.Cells(i, prodSch_Task_Column)
        wsTHpriority.Cells(k, "D") = wsProductionSchedule.Cells(i, prodSch_BoardLetter_Column)
        wsTHpriority.Cells(k, "E") = wsProductionSchedule.Cells(i, prodSch_Qty_Column)
        wsTHpriority.Cells(k, "F") = wsProductionSchedule.Cells(i, prodSch_StencilName_Column)
        wsTHpriority.Cells(k, "G") = wsProductionSchedule.Cells(i, prodSch_DueDate_Column)
        wsTHpriority.Cells(k, "G").NumberFormat = "mm/dd/yyyy"
        wsTHpriority.Cells(k, "H") = GetTHStatus(wsProductionSchedule.Cells(i, prodSch_ProductionStatus_Column))
        If wsTHpriority.Cells(k, "H") = "" Then
            wsTHpriority.Cells(k, "H") = wsProductionSchedule.Cells(i, prodSch_ProductionStatus_Column)
        End If
        wsTHpriority.Cells(k, "I") = wsProductionSchedule.Cells(i, prodSch_Comment2_Column)
        wsTHpriority.Cells(k, "J") = GetLinesFromMcodeSummary(wsProductionSchedule.Cells(i, prodSch_McodeSummary_Column))
        k = k + 1
THnextLine:
    Next i
    
    Dim wsSMT_LR As Long, wsSMT_LC As Long
    wsSMT_LR = wsSMTpriority.Cells(wsSMTpriority.Rows.Count, "A").End(xlUp).Row
    wsSMT_LC = wsSMTpriority.Cells(headerRow, wsSMTpriority.Columns.Count).End(xlToLeft).Column
    
    With wsSMTpriority.Range(wsSMTpriority.Cells(headerRow, "A"), wsSMTpriority.Cells(wsSMT_LR, wsSMT_LC))
        .Columns.AutoFit
        .Rows.AutoFit
        .Borders.LineStyle = xlContinuous
        .VerticalAlignment = xlCenter
        .HorizontalAlignment = xlLeft
    End With
    
    With wsTHpriority.Range(wsTHpriority.Cells(headerRow, "A"), wsTHpriority.Cells(wsSMT_LR, wsSMT_LC))
        .Columns.AutoFit
        .Rows.AutoFit
        .Borders.LineStyle = xlContinuous
        .VerticalAlignment = xlCenter
        .HorizontalAlignment = xlLeft
    End With
    
    wsSMTpriority.Range(wsSMTpriority.Cells(headerRow + 1, "A"), wsSMTpriority.Cells(wsSMT_LR, wsSMT_LC)).Columns.AutoFit
    wsTHpriority.Range(wsTHpriority.Cells(headerRow + 1, "A"), wsTHpriority.Cells(wsSMT_LR, wsSMT_LC)).Columns.AutoFit
    
    
     ' === Format the headers ===
    With wsSMTpriority.Range(wsSMTpriority.Cells(headerRow, "A"), wsSMTpriority.Cells(headerRow, wsSMT_LC))
        .Font.Bold = True
        .Interior.Color = RGB(217, 217, 217) ' light gray background
        .Font.Color = RGB(0, 0, 0)
        .HorizontalAlignment = xlLeft
        .VerticalAlignment = xlCenter
        .RowHeight = 27
        .WrapText = True
    End With
    
    With wsTHpriority.Range(wsTHpriority.Cells(headerRow, "A"), wsTHpriority.Cells(headerRow, wsSMT_LC))
        .Font.Bold = True
        .Interior.Color = RGB(217, 217, 217) ' light gray background
        .Font.Color = RGB(0, 0, 0)
        .HorizontalAlignment = xlLeft
        .VerticalAlignment = xlCenter
        .RowHeight = 27
        .WrapText = True
    End With
    
    Dim fileName As String
    fileName = "Weekly Planning " & Format(FillDateTimeInCanada, "yymmdd-hhmmss")
    wbWeeklyPlanning.SaveAs fileName:=weeklyPlanningFolderPath & fileName, FileFormat:=xlOpenXMLWorkbook
    
    
    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    
End Sub

Function GetLinesFromMcodeSummary(mcodeSummary As String) As String

    If mcodeSummary <> "" Then
        GetLinesFromMcodeSummary = Split(mcodeSummary, ", ")(0)
    Else
        GetLinesFromMcodeSummary = ""
    End If
    
End Function

Function GetSMTStatus(productionStatus As String) As String
    
    If productionStatus <> "" Or productionStatus = "1. SMT Done" Or productionStatus = "2. Inspection Done" Or productionStatus = "3. TH Done" Or productionStatus = "4. Packing Done" Then
        GetSMTStatus = "Complete"
    Else
        GetSMTStatus = ""
    End If

End Function

Function GetTHStatus(productionStatus As String) As String
    
    If productionStatus = "3. TH Done" Or productionStatus = "4. Packing Done" Then
        GetTHStatus = "Complete"
'    Else
'        GetTHStatus = ""
    End If

End Function
