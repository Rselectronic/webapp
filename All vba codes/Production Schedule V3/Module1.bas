Attribute VB_Name = "Module1"
Option Explicit
Public dateFormat As String

Sub get_EstimatedDeliveryDate_from_ProcLogFile()
    dateFormat = "mm/dd/yyyy"
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets("Project schedule - Detailed")
    
    Dim SMTarray() As Variant, SMTdate As Date, THdate As Date
    SMTarray = Array("CP", "IP", "CPEXP", "0402", "402", "MANSMT")
    
    
    Dim fullPath As String
    Dim folders() As String
    Dim masterfolderName As String
    Dim masterfolderPath As String
    
    fullPath = GetLocalPath(ThisWorkbook.FullName)
    
    folders() = Split(fullPath, "\")
    masterfolderName = folders(UBound(folders) - 2)
    masterfolderPath = Left(fullPath, InStr(1, fullPath, masterfolderName, vbTextCompare) + Len(masterfolderName))
    
    Dim procLogFileName As String
    Dim procLogFilePath As String
    
    procLogFilePath = masterfolderPath & "6. BACKEND\PROC LOG\"
    procLogFileName = Dir(procLogFilePath & "PROC LOG File*")
    
    If procLogFileName = "" Then
        MsgBox "Proc Log File does not exists in " & procLogFilePath
        Exit Sub
    End If
    
    Dim wbProcLog As Workbook
    Dim wsProcLog_Tracking As Worksheet, wsProcLog_Log As Worksheet, wsProcLog_ProcLines As Worksheet
    
    Set wbProcLog = Workbooks.Open(procLogFilePath & procLogFileName)
    Set wsProcLog_Log = wbProcLog.Sheets("Log")
    Set wsProcLog_ProcLines = wbProcLog.Sheets("Proc lines")
    Set wsProcLog_Tracking = wbProcLog.Sheets("Tracking")
    
    ' initialise headers
    initaliseHeaders ws, wsProcLog_Tracking, wsProcLog_Log, wsProcLog_ProcLines
    
    
    Dim procBatchCode As String
    Dim POnumber As String
    Dim boardName As String
    Dim isHeaderRow As Boolean
    
    Dim prodSchLR As Long, i As Long
    prodSchLR = ws.Cells(ws.Rows.Count, prodSch_Task_Column).End(xlUp).Row
    
    Dim procDeliveryStatus As String
    Dim foundRow As Range
    ' loop through each line in production schedule and fill the delivery date
    For i = 8 To prodSchLR
        If ws.Cells(i, prodSch_OrderType_Column) = "" Then
            procBatchCode = ws.Cells(i, prodSch_Task_Column)
            If InStr(1, procBatchCode, "_") > 0 Then procBatchCode = Left(procBatchCode, InStr(1, procBatchCode, "_") - 1)
                ws.Cells(i, prodSch_SMTdeliveryDate_Column) = ""
                ws.Cells(i, prodSch_THdeliveryDate_Column) = ""
                isHeaderRow = True
            Else
                isHeaderRow = False
            End If
        
        ' Step 1: Check if the proc if delivered completely
        On Error Resume Next
        Set foundRow = wsProcLog_Log.Columns(procLog_LogSheet_ProcBatchCode_Column).Find(What:=procBatchCode, LookAt:=xlWhole, MatchCase:=False)
        On Error GoTo 0
        
        If Not foundRow Is Nothing Then
            procDeliveryStatus = wsProcLog_Log.Columns.Cells(foundRow.Row, procLog_LogSheet_DeliveryStatus_Column)
        Else
            procDeliveryStatus = ""
        End If
        
        If procDeliveryStatus = "" Then
            GoTo nextLine
        End If
        
        If procDeliveryStatus <> "" And procDeliveryStatus = "All delivered" Then
            ws.Cells(i, prodSch_SMTdeliveryDate_Column) = "Delivered"
            ws.Cells(i, prodSch_THdeliveryDate_Column) = "Delivered"
        End If
        
        If procDeliveryStatus = "Not Available" Then
            GoTo nextLine
        End If
        
        ' Step 2: If everything is not delivered then get the max delivery date
        If procDeliveryStatus <> "All delivered" Then
            If isHeaderRow Then
                Dim procHeaderRow As Long
                procHeaderRow = i               ' preserve header row number
                
                ' move to next
                i = i + 1
            End If
        
            Dim k As Long, trackingSheetLR As Long
            Dim maxDate As Date, deliveryDate As Date
            Dim isDeliveryDateBlank As Boolean
            Dim smtCount As Long, thCount As Long
            trackingSheetLR = wsProcLog_Tracking.Cells(wsProcLog_Tracking.Rows.Count, "A").End(xlUp).Row
            boardName = ws.Cells(i, prodSch_Task_Column)
            
            For k = 3 To trackingSheetLR
                If wsProcLog_Tracking.Cells(k, procLog_TrackingSheet_ProcBatchCode_Column) = procBatchCode And wsProcLog_Tracking.Cells(k, procLog_TrackingSheet_LastStatus_Column) <> "Delivered" Then
                    deliveryDate = wsProcLog_Tracking.Cells(k, procLog_TrackingSheet_DeliveryDate_Column)
                            
                            If deliveryDate = 0 Then isDeliveryDateBlank = True
                            ' check the mcode of this sales order
                            Dim p As Long, procLineLR As Long
                            Dim procLineMcode As String
                            procLineLR = wsProcLog_ProcLines.Cells(wsProcLog_ProcLines.Rows.Count, procLog_ProcLinesSheet_ProcBatchCode_Column).End(xlUp).Row
                            
                            For p = 3 To procLineLR
                                If wsProcLog_ProcLines.Cells(p, procLog_ProcLinesSheet_ProcBatchCode_Column) = procBatchCode And CStr(wsProcLog_ProcLines.Cells(p, procLog_ProcLinesSheet_SalesOrderNumber_Column)) = CStr(wsProcLog_Tracking.Cells(k, procLog_TrackingSheet_SalesOrder_Column)) And InStr(1, wsProcLog_ProcLines.Cells(p, procLog_ProcLinesSheet_BoardName_Column), boardName) > 0 Then
                                    procLineMcode = wsProcLog_ProcLines.Cells(p, procLog_ProcLinesSheet_Mcode_Column)
                                    Dim n As Long, isSMT As Boolean
                                    For n = LBound(SMTarray) To UBound(SMTarray)
                                        If procLineMcode = SMTarray(n) Then
                                            If SMTdate < deliveryDate Then SMTdate = deliveryDate
                                            isSMT = True
                                            smtCount = smtCount + 1
                                            Exit For
                                        End If
                                    Next n
                                    
                                    ' if mcode is not SMT, then it should be TH
                                    If Not isSMT Then
                                        If THdate < deliveryDate Then THdate = deliveryDate
                                        thCount = thCount + 1
                                    End If
                                    
                                End If
                                
                                ' reset isSMT boolen
                                isSMT = False
                            Next p
                        
                        
                    
                End If
            Next k
            
            If SMTdate > 0 And smtCount > 0 Then
                ws.Cells(i, prodSch_SMTdeliveryDate_Column) = SMTdate
                ws.Cells(i, prodSch_SMTdeliveryDate_Column).NumberFormat = dateFormat
                If SMTdate > ws.Cells(procHeaderRow, prodSch_SMTdeliveryDate_Column) Or ws.Cells(procHeaderRow, prodSch_SMTdeliveryDate_Column) = "Delivered" Then
                    ws.Cells(procHeaderRow, prodSch_SMTdeliveryDate_Column) = SMTdate
                    ws.Cells(procHeaderRow, prodSch_SMTdeliveryDate_Column).NumberFormat = dateFormat
                End If
            ElseIf isDeliveryDateBlank = True And smtCount > 0 Then
                ' DNA = Delivery Date Not Available
                ws.Cells(i, prodSch_SMTdeliveryDate_Column) = "DDNA"
                ws.Cells(procHeaderRow, prodSch_SMTdeliveryDate_Column) = "DDNA"
            Else
                ws.Cells(i, prodSch_SMTdeliveryDate_Column) = "Delivered"
                If ws.Cells(procHeaderRow, prodSch_SMTdeliveryDate_Column) <= 0 Then ws.Cells(procHeaderRow, prodSch_SMTdeliveryDate_Column) = "Delivered"
            End If
            
            If THdate > 0 And thCount > 0 Then
                ws.Cells(i, prodSch_THdeliveryDate_Column) = THdate
                ws.Cells(i, prodSch_THdeliveryDate_Column).NumberFormat = dateFormat
                If THdate > ws.Cells(procHeaderRow, prodSch_THdeliveryDate_Column) Or ws.Cells(procHeaderRow, prodSch_THdeliveryDate_Column) = "Delivered" Then
                    ws.Cells(procHeaderRow, prodSch_THdeliveryDate_Column) = THdate
                    ws.Cells(procHeaderRow, prodSch_THdeliveryDate_Column).NumberFormat = dateFormat
                End If
            ElseIf isDeliveryDateBlank = True And thCount > 0 Then
                ws.Cells(i, prodSch_THdeliveryDate_Column) = "DDNA"
                ws.Cells(procHeaderRow, prodSch_THdeliveryDate_Column) = "DDNA"
            Else
                ws.Cells(i, prodSch_THdeliveryDate_Column) = "Delivered"
                If ws.Cells(procHeaderRow, prodSch_THdeliveryDate_Column) <= 0 Then ws.Cells(procHeaderRow, prodSch_THdeliveryDate_Column) = "Delivered"
            End If
            ' reset smt and th dates
            SMTdate = 0
            THdate = 0
            maxDate = 0
            isDeliveryDateBlank = False
            smtCount = 0
            thCount = 0
            
        End If
        
        
nextLine:
    Next i
    

End Sub
