Attribute VB_Name = "new_Worksheet"
Option Explicit
Sub createNewWS()
    
    Application.ScreenUpdating = False
    Application.DisplayAlerts = False
    Application.Calculation = xlCalculationManual
    
    Dim mainWS As Worksheet, newWS As Worksheet, oldWS As Worksheet
    Dim lastRow As Long
    
    Set mainWS = ThisWorkbook.Sheets("Project schedule - Detailed")
    initaliseHeaders mainWS

    Dim mainWSlastRow As Long
    mainWSlastRow = mainWS.Cells(mainWS.Rows.Count, prodSch_Task_Column).End(xlUp).Row

    ' check if atleast one row have production date in column "K"
    If Application.WorksheetFunction.CountA(mainWS.Range(mainWS.Cells(8, prodSch_ProductionDate_Column), mainWS.Cells(mainWSlastRow, prodSch_ProductionDate_Column))) = 0 Then
        MsgBox "Production Date not filled"
        Exit Sub
    End If
    
    ' Duplicate mainWS
    mainWS.Copy After:=mainWS
    Set newWS = ActiveSheet
    newWS.Name = "PS " & Format(FillDateTimeInCanada, "mmddyy_hhmmss")
    
    ' Delete all Form Control buttons (Shapes)
    Dim shp As Shape
    For Each shp In newWS.Shapes
        If shp.Type = msoFormControl Or shp.Type = msoOLEControlObject Then
            shp.Delete
        End If
    Next shp
    
    initaliseHeaders newWS
    
    ' Find the last used row
    lastRow = newWS.Cells(newWS.Rows.Count, prodSch_Task_Column).End(xlUp).Row
    
    ' Clear contents from row 8 to last row
    If lastRow >= 8 Then
        newWS.Rows("8:" & lastRow).Delete
    End If
    
    Dim newRow As Long
    newRow = 8
    
    Dim shouldCopyRow As Boolean, i As Long

    For i = 8 To mainWSlastRow
        shouldCopyRow = False

        ' If production date (col H) is filled
        If Trim(mainWS.Cells(i, prodSch_ProductionDate_Column).Value) <> "" Then
            shouldCopyRow = True

            ' copy header row
            If i > 8 Then
                If mainWS.Cells(i, prodSch_Task_Column).Value <> "" And mainWS.Cells(i, prodSch_PoNumber_Column).Value = "" And mainWS.Cells(i, prodSch_Qty_Column).Value = "" And mainWS.Cells(i, prodSch_ProductionDate_Column).Value <> "" Then
                    Dim isHeaderRow As Boolean
                    isHeaderRow = True

                    If isHeaderRow Then
                        mainWS.Rows(i).Copy Destination:=newWS.Rows(newRow)
                        newRow = newRow + 1
                    End If
                End If
            End If
            
            ' copy proc row
            If i > 8 Then
                If mainWS.Cells(i, prodSch_Task_Column).Value <> "" And mainWS.Cells(i, prodSch_PoNumber_Column).Value <> "" And mainWS.Cells(i, prodSch_Qty_Column).Value <> "" And mainWS.Cells(i, prodSch_ProductionDate_Column).Value <> "" Then
                    Dim isProcRow As Boolean
                    isProcRow = True

                    If isProcRow Then
                        mainWS.Rows(i).Copy Destination:=newWS.Rows(newRow)
                        newRow = newRow + 1
                    End If
                End If
            End If
        End If
    Next i

   ' Set print area for the copied content
    If newRow > 7 Then
        newWS.PageSetup.PrintArea = "$A$1:$K$" & newRow - 1
    End If
    
    'newWS.Range("F:H").EntireColumn.Hidden = True
    'newWS.Range("B:B,D:D,C:C,H:H,I:I,J:J,K:K").EntireColumn.AutoFit



    ' Add a button to sort by production date
    Dim btn As Button
    Set btn = newWS.Buttons.Add(300, 10, 160, 30) ' (Left, Top, Width, Height)

    With btn
        .Caption = "Sort By Production Date"
        .OnAction = "'" & ThisWorkbook.Name & "'!SortDataByProductionDate"
        .Name = "btnSortByProdDate"
    End With


    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic

End Sub

