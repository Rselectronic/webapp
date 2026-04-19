Attribute VB_Name = "refresh_productionSchedule"
Option Explicit
' Optimized version of refreshProductionSchedule
Sub refreshProductionSchedule()
    'On Error GoTo ErrorHandler
    Application.EnableEvents = False
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual

    Dim ws As Worksheet
    Set ws = ThisWorkbook.ActiveSheet

    initaliseHeaders ws
    
    Dim targetRow As Long: targetRow = 9
    Dim lastRow As Long: lastRow = ws.Cells(ws.Rows.Count, "B").End(xlUp).Row
    Dim lastCol As Long: lastCol = ws.UsedRange.Columns(ws.UsedRange.Columns.Count).Column

    Dim rowCounter As Long
    Dim materialDate As Date, productionDate As Date, dueDate As Date
    Dim materialCol As Long, productionCol As Long, dueCol As Long
    Dim RECPcomment As String, PRODcomment As String, DDcomment As String
    Dim cellColor As Long, redComponent As Integer, greenComponent As Integer, blueComponent As Integer
    Dim headerCell As Range

    For rowCounter = targetRow To lastRow
        If ws.Cells(rowCounter, prodSch_ReceptionofMaterial_Column).Value <> "" Then
            On Error Resume Next
            materialDate = AdjustForWeekend(ws.Cells(rowCounter, prodSch_ReceptionofMaterial_Column).Value)
            productionDate = AdjustForWeekend(IIf(ws.Cells(rowCounter, prodSch_ProductionDate_Column).Value <> "", ws.Cells(rowCounter, prodSch_ProductionDate_Column).Value, materialDate))
            dueDate = AdjustForWeekend(IIf(ws.Cells(rowCounter, prodSch_DueDate_Column).Value <> "", ws.Cells(rowCounter, prodSch_DueDate_Column).Value, materialDate))
            On Error GoTo 0
            
            cellColor = ws.Cells(rowCounter, prodSch_ReceptionofMaterial_Column).Interior.Color
            redComponent = cellColor Mod 256
            greenComponent = (cellColor \ 256) Mod 256
            blueComponent = (cellColor \ 256 \ 256) Mod 256

            materialCol = 0: productionCol = 0: dueCol = 0
            For Each headerCell In ws.Rows(6).Cells
                If headerCell.Value = materialDate Then materialCol = headerCell.Column
                If headerCell.Value = productionDate Then productionCol = headerCell.Column
                If headerCell.Value = dueDate Then dueCol = headerCell.Column
            Next headerCell

            If dueCol = 0 And dueDate > ws.Cells(6, lastCol) Then dueCol = lastCol
            If dueCol = 0 And dueDate < ws.Cells(6, prodSch_Comments_Column + 2) Then dueCol = ws.Columns(prodSch_Comments_Column + 2).Column
            If materialCol = 0 Then materialCol = ws.Columns(prodSch_Comments_Column + 2).Column
            If productionCol = 0 Then productionCol = ws.Columns(prodSch_Comments_Column + 2).Column

            'RECPcomment = IIf(ws.Cells(rowCounter, prodSch_LineNo_Column) <> "", " (" & ws.Cells(rowCounter, prodSch_LineNo_Column) & ")", "")
            'PRODcomment = IIf(ws.Cells(rowCounter, prodSch_PoNumber_Column) <> "", " (" & ws.Cells(rowCounter, prodSch_PoNumber_Column) & ")", "")
            'DDcomment = IIf(ws.Cells(rowCounter, prodSch_ReceptionQtyDone_Column) <> "", " (" & ws.Cells(rowCounter, prodSch_ReceptionQtyDone_Column) & ")", "")

            If materialCol > 11 And productionCol > 11 And dueCol > 11 Then
                With ws.Range(ws.Cells(rowCounter, prodSch_Comments_Column + 1), ws.Cells(rowCounter, lastCol))
                    .ClearContents
                    .Interior.Color = xlNone
                    .Borders.LineStyle = xlNone
                End With

                With ws
                    .Range(.Cells(rowCounter, materialCol), .Cells(rowCounter, productionCol)).Interior.Color = RGB(redComponent, greenComponent, blueComponent)
                    .Range(.Cells(rowCounter, productionCol), .Cells(rowCounter, dueCol)).Interior.Color = RGB(redComponent - 31, greenComponent - 42, blueComponent - 2)
                    .Cells(rowCounter, dueCol).Interior.Color = RGB(0, 0, 0)

                    .Cells(rowCounter, materialCol - 1).Value = .Cells(rowCounter, prodSch_Task_Column)
                    .Cells(rowCounter, materialCol - 1).Font.Color = RGB(0, 0, 0)
                    .Cells(rowCounter, materialCol - 1).HorizontalAlignment = xlRight
                    .Cells(rowCounter, materialCol - 1).NumberFormat = "@"

                    .Cells(rowCounter, materialCol).Value = "RECP" & RECPcomment
                    .Cells(rowCounter, materialCol).Font.Color = RGB(0, 0, 0)
                    .Cells(rowCounter, materialCol).HorizontalAlignment = xlLeft

                    .Cells(rowCounter, productionCol).Value = "PROD" & PRODcomment
                    .Cells(rowCounter, productionCol).Font.Color = RGB(0, 0, 0)
                    .Cells(rowCounter, productionCol).HorizontalAlignment = xlLeft

                    .Cells(rowCounter, dueCol).Value = "DD" & DDcomment
                    .Cells(rowCounter, dueCol).Font.Color = RGB(255, 255, 255)
                    .Cells(rowCounter, dueCol).Characters(4, Len(DDcomment)).Font.Color = RGB(255, 0, 0)
                    .Cells(rowCounter, dueCol).Characters(4, Len(DDcomment)).Font.Bold = True
                    .Cells(rowCounter, dueCol).HorizontalAlignment = xlLeft

                    .Range(.Cells(rowCounter, materialCol), .Cells(rowCounter, dueCol)).Borders(xlEdgeLeft).LineStyle = xlContinuous
                    .Range(.Cells(rowCounter, materialCol), .Cells(rowCounter, dueCol)).Borders(xlEdgeTop).LineStyle = xlContinuous
                    .Range(.Cells(rowCounter, materialCol), .Cells(rowCounter, dueCol)).Borders(xlEdgeBottom).LineStyle = xlContinuous
                    .Range(.Cells(rowCounter, materialCol), .Cells(rowCounter, dueCol)).Borders(xlEdgeRight).LineStyle = xlContinuous
                End With
            Else
                With ws.Range(ws.Cells(rowCounter, prodSch_Comments_Column + 1), ws.Cells(rowCounter, lastCol))
                    .ClearContents
                    .Interior.Color = xlNone
                    .Borders.LineStyle = xlNone
                End With
            End If
        Else
            With ws.Range(ws.Cells(rowCounter, prodSch_Comments_Column + 1), ws.Cells(rowCounter, lastCol))
                .ClearContents
                .Interior.Color = xlNone
                .Borders.LineStyle = xlNone
            End With
        End If
    Next rowCounter

    ApplyConditionalFormatting

CleanExit:
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Application.DisplayAlerts = True
    Application.Calculation = xlCalculationAutomatic
    Exit Sub

ErrorHandler:
    Debug.Print "An error occurred: " & Err.Description
    Resume CleanExit
End Sub

Private Function AdjustForWeekend(d As Date) As Date
    Select Case Weekday(d, vbMonday)
        Case 6: AdjustForWeekend = d + 2 ' Saturday ? Monday
        Case 7: AdjustForWeekend = d + 1 ' Sunday ? Monday
        Case Else: AdjustForWeekend = d
    End Select
End Function


