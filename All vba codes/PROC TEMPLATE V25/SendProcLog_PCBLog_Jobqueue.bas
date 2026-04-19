Attribute VB_Name = "SendProcLog_PCBLog_Jobqueue"
Option Explicit

Public Sub SendProcLogs_Sub()
Application.DisplayAlerts = False

Dim StatusofProc As String
StatusofProc = SendProcLogs_Function()

If StatusofProc <> "" Then
  MsgBox StatusofProc, , "Macro"
Else
  MsgBox "Proc Log Updated Successfully", , "Macro"
End If

Application.DisplayAlerts = True
End Sub

Private Function SendProcLogs_Function() As String

Dim fullPath As String, folders() As String
Dim masterFolderName As String
Dim masterFolderPath As String
Dim procBatchCode As String
Dim procLogFolderPath As String
Dim ProcLogPath As String
Dim ProcLogFileName As String
Dim ProcLogWB As Workbook

Dim ProcSheet As Worksheet, ProcSheetlrow As Double
Dim ProcLogSheet As Worksheet
Dim CountofComplete As Double
Dim TotalRowsinProcsheet As Double
Dim ProcLogSheetLROW As Double
Dim FindBatchcode As Range

Set ProcSheet = ThisWorkbook.Sheets("Proc")
initialiseHeaders , , , ProcSheet
ProcSheetlrow = ProcSheet.Cells(Rows.count, Procsheet_CPC_Column).End(xlUp).Row
If ProcSheetlrow < 5 Then GoTo SkipLog
TotalRowsinProcsheet = ProcSheetlrow - 4
CountofComplete = WorksheetFunction.CountIf(ProcSheet.Range(ProcSheet.Cells(2, Procsheet_OrderStatus_Column), ProcSheet.Cells(ProcSheetlrow, Procsheet_OrderStatus_Column)), "Complete")

fullPath = GetLocalPath(ThisWorkbook.FullName)
folders() = Split(fullPath, "\")
masterFolderName = folders(UBound(folders) - 3)
masterFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName, vbTextCompare) + Len(masterFolderName))
procBatchCode = folders(UBound(folders) - 1)
procLogFolderPath = masterFolderPath & "6. BACKEND\PROC LOG\"
ProcLogFileName = Dir(procLogFolderPath & "PROC LOG File.xlsm")
ProcLogPath = procLogFolderPath & ProcLogFileName

If Dir(ProcLogPath) = "" Then
    SendProcLogs_Function = "Proc Log File Not Found"
    Exit Function
End If

Set ProcLogWB = Workbooks.Open(ProcLogPath)
Set ProcLogSheet = ProcLogWB.Sheets("log")

Dim procPCBsheet As Worksheet
Set procPCBsheet = ThisWorkbook.Sheets("PCB + Stencils Orders")

If ProcLogSheet.AutoFilterMode Then ProcLogSheet.AutoFilterMode = False

'ProcLogSheet.Activate
initialiseHeaders , , , , , , procPCBsheet, , ProcLogSheet
ProcLogSheetLROW = ProcLogSheet.Cells(Rows.count, ProcLogSheet_PROCBATCHCODE__Column).End(xlUp).Row
Set FindBatchcode = ProcLogSheet.Cells(1, ProcLogSheet_PROCBATCHCODE__Column).EntireColumn.Find(What:=procBatchCode, LookIn:=xlFormulas, LookAt:=xlWhole)

If Not FindBatchcode Is Nothing Then

   If CountofComplete = TotalRowsinProcsheet Then
      ProcLogSheet.Cells(FindBatchcode.Row, ProcLogSheet_ComponentsStatus__Column).Value = "All Components Ordered"
   Else
      ProcLogSheet.Cells(FindBatchcode.Row, ProcLogSheet_ComponentsStatus__Column).Value = "" & TotalRowsinProcsheet - (CountofComplete) & "/" & TotalRowsinProcsheet & " Components left"
   End If

    ' update the board names

    If ProcLogSheet.Cells(FindBatchcode.Row, ProcLogSheet_BoardName_Column) = "" Then

    '''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
        Dim procPCBsheetLR As Long, k As Long
        Dim boardName As String
        procPCBsheetLR = procPCBsheet.Cells(procPCBsheet.Rows.count, PCB_ProcSheet_GMP__Column).End(xlUp).Row
        
        For k = 2 To procPCBsheetLR
            If procPCBsheet.Cells(k, PCB_ProcSheet_Type__Column) = "PCB" Then
                boardName = boardName & procPCBsheet.Cells(k, PCB_ProcSheet_GMP__Column) & "," & vbNewLine
            End If
        Next k
        
        boardName = Left(boardName, Len(boardName) - 3)
        ProcLogSheet.Cells(FindBatchcode.Row, ProcLogSheet_BoardName_Column) = boardName
        
    End If

Else

   ProcLogSheet.Cells(ProcLogSheetLROW + 1, ProcLogSheet_PROCBATCHCODE__Column).Value = procBatchCode
   Set FindBatchcode = ProcLogSheet.Cells(1, ProcLogSheet_PROCBATCHCODE__Column).EntireColumn.Find(What:=procBatchCode, LookIn:=xlFormulas, LookAt:=xlWhole)

   If CountofComplete = TotalRowsinProcsheet Then
      ProcLogSheet.Cells(FindBatchcode.Row, ProcLogSheet_ComponentsStatus__Column).Value = "All Components Ordered"
   Else
      ProcLogSheet.Cells(FindBatchcode.Row, ProcLogSheet_ComponentsStatus__Column).Value = "" & TotalRowsinProcsheet - (CountofComplete) & "/" & TotalRowsinProcsheet & " Components left"
   End If

   ' update the board names

    If ProcLogSheet.Cells(FindBatchcode.Row, ProcLogSheet_BoardName_Column) = "" Then

    '''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''

        procPCBsheetLR = procPCBsheet.Cells(procPCBsheet.Rows.count, PCB_ProcSheet_GMP__Column).End(xlUp).Row
        
        For k = 2 To procPCBsheetLR
            If procPCBsheet.Cells(k, PCB_ProcSheet_Type__Column) = "PCB" Then
                boardName = boardName & procPCBsheet.Cells(k, PCB_ProcSheet_GMP__Column) & "," & vbNewLine
            End If
        Next k
        
        boardName = Left(boardName, Len(boardName) - 3)
        ProcLogSheet.Cells(FindBatchcode.Row, ProcLogSheet_BoardName_Column) = boardName
        
    End If

   ' apply borders
   ProcLogSheet.Range(ProcLogSheet.Cells(ProcLogSheetLROW + 1, ProcLogSheet_PROCBATCHCODE__Column), ProcLogSheet.Cells(ProcLogSheetLROW + 1, ProcLogSheet_Notes_Column)).Borders.LineStyle = xlContinuous
   ProcLogSheetLROW = ProcLogSheetLROW + 1

End If

''New Update 02/04/2025 Added Tracking Sheet Log Update in Proc Log

Dim ProcFileTrackingSheet As Worksheet
Dim ProcFileTrackingSheetLrow As Double
Dim ComponentsOrders_ProcSheet As Worksheet, ComponentsOrders_ProcSheetlrow As Double
Dim ComponentsOrdersLoop As Double, Innerloop As Double

Set ComponentsOrders_ProcSheet = ThisWorkbook.Sheets("Components Orders")
initialiseHeaders , , , , ComponentsOrders_ProcSheet
ComponentsOrders_ProcSheetlrow = ComponentsOrders_ProcSheet.Cells(Rows.count, ComponentsOrders_ProcSheet_DISTRIBUTOR__Column).End(xlUp).Row
If ComponentsOrders_ProcSheetlrow < 2 Then GoTo SkipComponentsOrdersLogs

Set ProcFileTrackingSheet = ProcLogWB.Sheets("Tracking")

If ProcFileTrackingSheet.AutoFilterMode Then ProcFileTrackingSheet.AutoFilterMode = False

ProcFileTrackingSheet.Activate
initialiseHeaders , , , , , , , , , , ProcFileTrackingSheet
ProcFileTrackingSheetLrow = ProcFileTrackingSheet.Cells(Rows.count, ProcFile_Tracking_Sheet_PROCBATCHCODE__Column).End(xlUp).Row
 With ProcFileTrackingSheet.Range(ProcFileTrackingSheet.Cells(3, ProcFile_Tracking_Sheet_Date__Column), ProcFileTrackingSheet.Cells(100000, ProcFile_Tracking_Sheet_Date__Column)).Interior
        .Pattern = xlNone
        .TintAndShade = 0
        .PatternTintAndShade = 0
 End With

 For ComponentsOrdersLoop = 2 To ComponentsOrders_ProcSheetlrow

     For Innerloop = 3 To ProcFileTrackingSheetLrow
        If UCase(ComponentsOrders_ProcSheet.Cells(ComponentsOrdersLoop, ComponentsOrders_ProcSheet_DISTRIBUTOR__Column).Value) = UCase(ProcFileTrackingSheet.Cells(Innerloop, ProcFile_Tracking_Sheet_Suppliers__Column).Value) And _
           UCase(ComponentsOrders_ProcSheet.Cells(ComponentsOrdersLoop, ComponentsOrders_ProcSheet_SALESORDER_Column).Value) = UCase(ProcFileTrackingSheet.Cells(Innerloop, ProcFile_Tracking_Sheet_SalesOrder__Column).Value) And _
           UCase(procBatchCode) = UCase(ProcFileTrackingSheet.Cells(Innerloop, ProcFile_Tracking_Sheet_PROCBATCHCODE__Column).Value) Then
            GoTo SkipEntryAlreadyExist
        End If
     Next Innerloop

     ProcFileTrackingSheet.Cells(ProcFileTrackingSheetLrow + 1, ProcFile_Tracking_Sheet_Date__Column).Value = Format(DateTime.Date, "MM/DD/YYYY")
     With ProcFileTrackingSheet.Cells(ProcFileTrackingSheetLrow + 1, ProcFile_Tracking_Sheet_Date__Column).Interior
            .Pattern = xlSolid
            .PatternColorIndex = xlAutomatic
            .Color = 5296274
            .TintAndShade = 0
           .PatternTintAndShade = 0
     End With

     ProcFileTrackingSheet.Cells(ProcFileTrackingSheetLrow + 1, ProcFile_Tracking_Sheet_PROCBATCHCODE__Column).Value = procBatchCode
     ProcFileTrackingSheet.Cells(ProcFileTrackingSheetLrow + 1, ProcFile_Tracking_Sheet_Suppliers__Column).Value = ComponentsOrders_ProcSheet.Cells(ComponentsOrdersLoop, ComponentsOrders_ProcSheet_DISTRIBUTOR__Column).Value
     ProcFileTrackingSheet.Cells(ProcFileTrackingSheetLrow + 1, ProcFile_Tracking_Sheet_SalesOrder__Column).Value = ComponentsOrders_ProcSheet.Cells(ComponentsOrdersLoop, ComponentsOrders_ProcSheet_SALESORDER_Column).Value
     ProcFileTrackingSheetLrow = ProcFileTrackingSheetLrow + 1

SkipEntryAlreadyExist:
 Next ComponentsOrdersLoop

ProcFileTrackingSheet.Range(ProcFileTrackingSheet.Cells(3, 2), ProcFileTrackingSheet.Cells(3, 100)).Copy
ProcFileTrackingSheet.Range(ProcFileTrackingSheet.Cells(3, 2), ProcFileTrackingSheet.Cells(ProcFileTrackingSheetLrow, 100)).PasteSpecial xlPasteFormats
SkipComponentsOrdersLogs:
''''

''''Proc lines Sheet Update in proc log file New Update 02/06/2025

Dim ProcFileProcLinesSheet As Worksheet
Dim ProcFileProcLinesSheetLrow As Double
Dim ProcFileProcLinesSheetloop As Double

Set ProcFileProcLinesSheet = ProcLogWB.Sheets("Proc lines")

If ProcFileProcLinesSheet.AutoFilterMode Then ProcFileProcLinesSheet.AutoFilterMode = False


ProcFileProcLinesSheet.Activate
initialiseHeaders , , , , , , , , , , , ProcFileProcLinesSheet

 ProcFileProcLinesSheetLrow = ProcFileProcLinesSheet.Cells(Rows.count, ProcFileProcLinesSheet_PROCBATCHCODE__Column).End(xlUp).Row
 With ProcFileProcLinesSheet.Range(ProcFileProcLinesSheet.Cells(3, ProcFileProcLinesSheet_Date__Column), ProcFileProcLinesSheet.Cells(100000, ProcFileProcLinesSheet_Date__Column)).Interior
        .Pattern = xlNone
        .TintAndShade = 0
        .PatternTintAndShade = 0
 End With

 For ProcFileProcLinesSheetloop = 5 To ProcSheetlrow

     For Innerloop = 3 To ProcFileProcLinesSheetLrow
        If UCase(ProcSheet.Cells(ProcFileProcLinesSheetloop, Procsheet_CPC_Column).Value) = UCase(ProcFileProcLinesSheet.Cells(Innerloop, ProcFileProcLinesSheet_CPC__Column).Value) And UCase(procBatchCode) = UCase(ProcFileProcLinesSheet.Cells(Innerloop, ProcFileProcLinesSheet_PROCBATCHCODE__Column).Value) Then
            ProcFileProcLinesSheet.Cells(Innerloop, ProcFileProcLinesSheet_PlaceBought__Column).Value = ProcSheet.Cells(ProcFileProcLinesSheetloop, Procsheet_Placetobuy_Column)
            ProcFileProcLinesSheet.Cells(Innerloop, ProcFileProcLinesSheet_SalesOrder__Column).Value = ProcSheet.Cells(ProcFileProcLinesSheetloop, Procsheet_SalesOrderNo_Column)
            GoTo SkipEntryAlreadyExist2
        End If
     Next Innerloop

     ProcFileProcLinesSheet.Cells(ProcFileProcLinesSheetLrow + 1, ProcFileProcLinesSheet_Date__Column).Value = Format(DateTime.Date, "MM/DD/YYYY")
     With ProcFileProcLinesSheet.Cells(ProcFileProcLinesSheetLrow + 1, ProcFileProcLinesSheet_Date__Column).Interior
            .Pattern = xlSolid
            .PatternColorIndex = xlAutomatic
            .Color = 5296274
            .TintAndShade = 0
           .PatternTintAndShade = 0
     End With

     ProcFileProcLinesSheet.Cells(ProcFileProcLinesSheetLrow + 1, ProcFileProcLinesSheet_PROCBATCHCODE__Column).Value = procBatchCode
     ProcFileProcLinesSheet.Cells(ProcFileProcLinesSheetLrow + 1, ProcFileProcLinesSheet_CPC__Column).Value = ProcSheet.Cells(ProcFileProcLinesSheetloop, Procsheet_CPC_Column)
     ProcFileProcLinesSheet.Cells(ProcFileProcLinesSheetLrow + 1, ProcFileProcLinesSheet_MPN__Column).Value = ProcSheet.Cells(ProcFileProcLinesSheetloop, Procsheet_PNTOUSE_Column)
     ProcFileProcLinesSheet.Cells(ProcFileProcLinesSheetLrow + 1, ProcFileProcLinesSheet_MFR__Column).Value = ProcSheet.Cells(ProcFileProcLinesSheetloop, Procsheet_MFRtoUse_Column)
     ProcFileProcLinesSheet.Cells(ProcFileProcLinesSheetLrow + 1, ProcFileProcLinesSheet_QTY__Column).Value = ProcSheet.Cells(ProcFileProcLinesSheetloop, Procsheet_ORDERQTY_Column)
     ProcFileProcLinesSheet.Cells(ProcFileProcLinesSheetLrow + 1, ProcFileProcLinesSheet_PlaceBought__Column).Value = ProcSheet.Cells(ProcFileProcLinesSheetloop, Procsheet_Placetobuy_Column)
     ProcFileProcLinesSheet.Cells(ProcFileProcLinesSheetLrow + 1, ProcFileProcLinesSheet_ExtPrice__Column).Value = ProcSheet.Cells(ProcFileProcLinesSheetloop, Procsheet_ExtPriceAfterOrder_Column)
     ProcFileProcLinesSheet.Cells(ProcFileProcLinesSheetLrow + 1, ProcFileProcLinesSheet_UnitPrice__Column).Value = ProcSheet.Cells(ProcFileProcLinesSheetloop, Procsheet_ExtPriceAfterOrder_Column) / ProcSheet.Cells(ProcFileProcLinesSheetloop, Procsheet_ORDERQTY_Column)
     ProcFileProcLinesSheet.Cells(ProcFileProcLinesSheetLrow + 1, ProcFileProcLinesSheet_CustomerRef__Column).Value = ProcSheet.Cells(ProcFileProcLinesSheetloop, Procsheet_CustomerRef_Column)
     ProcFileProcLinesSheet.Cells(ProcFileProcLinesSheetLrow + 1, ProcFileProcLinesSheet_SalesOrder__Column).Value = ProcSheet.Cells(ProcFileProcLinesSheetloop, Procsheet_SalesOrderNo_Column)
     ProcFileProcLinesSheet.Cells(ProcFileProcLinesSheetLrow + 1, ProcFileProcLinesSheet_Mcode_Column).Value = ProcSheet.Cells(ProcFileProcLinesSheetloop, Procsheet_Mcodes_Column)
     ProcFileProcLinesSheet.Cells(ProcFileProcLinesSheetLrow + 1, ProcFileProcLinesSheet_BoardName_Column).Value = ProcSheet.Cells(ProcFileProcLinesSheetloop, Procsheet_BoardName_Column)
     ProcFileProcLinesSheetLrow = ProcFileProcLinesSheetLrow + 1

SkipEntryAlreadyExist2:
 Next ProcFileProcLinesSheetloop

ProcFileProcLinesSheet.Range(ProcFileProcLinesSheet.Cells(3, 2), ProcFileProcLinesSheet.Cells(3, 100)).Copy
ProcFileProcLinesSheet.Range(ProcFileProcLinesSheet.Cells(3, 2), ProcFileProcLinesSheet.Cells(ProcFileProcLinesSheetLrow, 100)).PasteSpecial xlPasteFormats
''''

ProcLogWB.Activate
Application.Wait Now() + TimeValue("00:00:02")
'ProcFileTrackingSheet.Activate: ProcFileTrackingSheet.Range("A1").Select
'ProcFileProcLinesSheet.Activate: ProcFileProcLinesSheet.Range("A1").Select
'ProcLogSheet.Activate: ProcLogSheet.Range("A1").Select
Application.CutCopyMode = False
ProcLogWB.Save

'''''''''''''''
Dim StatusofProc As String
StatusofProc = SendPCBLogs_Function()

If StatusofProc <> "" Then
  SendProcLogs_Function = StatusofProc
  Exit Function
End If
''''''''''''''''

SkipLog:
Exit Function
SendProcLogs_Function = Err.description
End Function

''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
Private Function SendPCBLogs_Function() As String

Dim fullPath As String, folders() As String
Dim masterFolderName As String
Dim masterFolderPath As String
Dim procBatchCode As String
Dim procLogFolderPath As String
Dim ProcLogPath As String
Dim ProcLogFileName As String
Dim ProcLogWB As Workbook

Dim PCBSheet As Worksheet, PCBSheetlrow As Double
Dim ProcLogSheet As Worksheet
Dim CountofComplete As Double
Dim TotalRowsinPCBSheet As Double
Dim ProcLogSheetLROW As Double
Dim FindBatchcode As Range

Set PCBSheet = ThisWorkbook.Sheets("PCB + Stencils Orders")
initialiseHeaders , , , , , , PCBSheet
PCBSheetlrow = PCBSheet.Cells(Rows.count, PCB_ProcSheet_GMP__Column).End(xlUp).Row
If PCBSheetlrow < 2 Then GoTo SkipLog
TotalRowsinPCBSheet = PCBSheetlrow - 1
CountofComplete = WorksheetFunction.CountIf(PCBSheet.Range(PCBSheet.Cells(2, PCB_ProcSheet_OrderStatus_Column), PCBSheet.Cells(PCBSheetlrow, PCB_ProcSheet_OrderStatus_Column)), "Complete")

fullPath = GetLocalPath(ThisWorkbook.FullName)
folders() = Split(fullPath, "\")
masterFolderName = folders(UBound(folders) - 3)
masterFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName, vbTextCompare) + Len(masterFolderName))
procBatchCode = folders(UBound(folders) - 1)
procLogFolderPath = masterFolderPath & "6. BACKEND\PROC LOG\"

ProcLogFileName = Dir(procLogFolderPath & "PROC LOG File.xlsm")
ProcLogPath = procLogFolderPath & ProcLogFileName

If Dir(ProcLogPath) = "" Then
    SendPCBLogs_Function = "Proc Log File Not Found"
    Exit Function
End If

Set ProcLogWB = Workbooks.Open(ProcLogPath)
Set ProcLogSheet = ProcLogWB.Sheets("log")
ProcLogSheet.Activate
initialiseHeaders , , , , , , , , ProcLogSheet
ProcLogSheetLROW = ProcLogSheet.Cells(Rows.count, ProcLogSheet_PROCBATCHCODE__Column).End(xlUp).Row

Set FindBatchcode = ProcLogSheet.Cells(1, ProcLogSheet_PROCBATCHCODE__Column).EntireColumn.Find(What:=procBatchCode, LookIn:=xlFormulas, LookAt:=xlWhole)

If Not FindBatchcode Is Nothing Then

   If CountofComplete = TotalRowsinPCBSheet Then
      ProcLogSheet.Cells(FindBatchcode.Row, ProcLogSheet_PCBStatus_Column).Value = "All PCB Ordered"
   Else
      ProcLogSheet.Cells(FindBatchcode.Row, ProcLogSheet_PCBStatus_Column).Value = "" & TotalRowsinPCBSheet - (CountofComplete) & "/" & TotalRowsinPCBSheet & " PCB/Stencil left"
   End If

Else

   ProcLogSheet.Cells(ProcLogSheetLROW + 1, ProcLogSheet_PROCBATCHCODE__Column).Value = procBatchCode
   Set FindBatchcode = ProcLogSheet.Cells(1, ProcLogSheet_PROCBATCHCODE__Column).EntireColumn.Find(What:=procBatchCode, LookIn:=xlFormulas, LookAt:=xlWhole)

   If CountofComplete = TotalRowsinPCBSheet Then
      ProcLogSheet.Cells(FindBatchcode.Row, ProcLogSheet_PCBStatus_Column).Value = "All PCB Ordered"
   Else
      ProcLogSheet.Cells(FindBatchcode.Row, ProcLogSheet_PCBStatus_Column).Value = "" & TotalRowsinPCBSheet - (CountofComplete) & "/" & TotalRowsinPCBSheet & " PCB left"
   End If

   ' apply borders
   ProcLogSheet.Range(ProcLogSheet.Cells(ProcLogSheetLROW + 1, ProcLogSheet_PROCBATCHCODE__Column), ProcLogSheet.Cells(ProcLogSheetLROW + 1, ProcLogSheet_Notes_Column)).Borders.LineStyle = xlContinuous
   ProcLogSheetLROW = ProcLogSheetLROW + 1

End If

SkipLog:
Exit Function
SendPCBLogs_Function = Err.description
End Function


