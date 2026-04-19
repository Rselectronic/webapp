Attribute VB_Name = "Refresh_Qty_Module_V2"
Option Explicit
Sub refresh_Qty()

    On Error GoTo errHandler
    
    Application.ScreenUpdating = False

    Dim wbJobQueue As Workbook, wsJobQueue As Worksheet
    Dim wsProductionSchedule As Worksheet
    Dim wasAlreadyOpen As Boolean
    Dim wb As Workbook
    
    wasAlreadyOpen = False
    
    Set wsProductionSchedule = ThisWorkbook.Sheets("Project schedule - Detailed")
    
    Dim fullPath As String
    Dim folders() As String
    Dim masterfolderName As String
    Dim masterfolderPath As String
    
    fullPath = GetLocalPath(ThisWorkbook.FullName)
    
    folders() = Split(fullPath, "\")
    masterfolderName = folders(UBound(folders) - 2)
    masterfolderPath = Left(fullPath, InStr(1, fullPath, masterfolderName, vbTextCompare) + Len(masterfolderName))
        
    Dim jobQueuePath As String, jobQueueFileName As String
    
    jobQueuePath = masterfolderPath & "3. JOB QUEUE\"
    jobQueueFileName = Dir(jobQueuePath & "Job*.xlsm")
    jobQueuePath = jobQueuePath & jobQueueFileName
    
    ' --- Check if job queue workbook is already open ---
    For Each wb In Application.Workbooks
        If StrComp(GetLocalPath(wb.FullName), jobQueuePath, vbTextCompare) = 0 Then
            Set wbJobQueue = wb
            wasAlreadyOpen = True
            Exit For
        End If
    Next wb

    ' --- If job queue was not already open, open it now ---
    On Error Resume Next
    If wbJobQueue Is Nothing Then
        Set wbJobQueue = Workbooks.Open(jobQueuePath)
        wbJobQueue.Windows(1).Visible = False  ' Keep it hidden
    End If
    On Error GoTo 0

    
    
    ' Open JOB QUEUE File
    Set wsJobQueue = wbJobQueue.Sheets("Job Queue")
    
    initaliseHeaders wsProductionSchedule, , , , wsJobQueue
    
    Dim jobQueueLR As Long, i As Long
    Dim productionScheduleLR As Long, k As Long
    
    jobQueueLR = wsJobQueue.Cells(wsJobQueue.Rows.Count, wsJobQueue_ProductName_Column).End(xlUp).Row
    productionScheduleLR = wsProductionSchedule.Cells(wsProductionSchedule.Rows.Count, prodSch_Task_Column).End(xlUp).Row
    
    For k = 8 To productionScheduleLR
        Dim prodSchPONumber As String
        Dim prodSchPartNumber As String
        Dim matchFound As Boolean
        
        prodSchPONumber = wsProductionSchedule.Cells(k, prodSch_PoNumber_Column)
        prodSchPartNumber = wsProductionSchedule.Cells(k, prodSch_Task_Column)
        matchFound = False
        
        If prodSchPONumber <> "" Then
    
            For i = 4 To jobQueueLR
                If wsJobQueue.Cells(i, wsJobQueue_OrderType_Column) <> "NREs" Then
                    Dim jobQueuePoNumber As String
                    Dim jobQueuePartNumber As String
                    Dim jobQueueQty As Long
                    Dim jonQueueBackOrderQty As Long
                    
                    jobQueuePoNumber = wsJobQueue.Cells(i, wsJobQueue_PONumber_Column)
                    jobQueuePartNumber = wsJobQueue.Cells(i, wsJobQueue_ProductName_Column)
                    jobQueueQty = wsJobQueue.Cells(i, wsJobQueue_POQty_Column)
                    jonQueueBackOrderQty = wsJobQueue.Cells(i, wsJobQueue_BackOrder_Column)
                    
                    If wsJobQueue.Cells(i, wsJobQueue_OrderStatus_Column) = "6. In Production" Or _
                       wsJobQueue.Cells(i, wsJobQueue_OrderStatus_Column) = "7. PO Received" Then
                       
                        If prodSchPONumber = jobQueuePoNumber And prodSchPartNumber = jobQueuePartNumber Then
                            wsProductionSchedule.Cells(k, prodSch_Qty_Column) = "'" & jobQueueQty
                            matchFound = True
                            Exit For
                        End If
                        
                    ElseIf wsJobQueue.Cells(i, wsJobQueue_OrderStatus_Column) = "4. Order Shipped" Then
                        If prodSchPONumber = jobQueuePoNumber And prodSchPartNumber = jobQueuePartNumber Then
                            wsProductionSchedule.Cells(k, prodSch_Qty_Column) = "'" & jonQueueBackOrderQty
                            matchFound = True
                            Exit For
                        End If
                    End If
                End If
            Next i
            
            ' If no match found after scanning all Job Queue rows, set qty to 0
            If Not matchFound Then
                wsProductionSchedule.Cells(k, prodSch_Qty_Column).Value = "'0"
            End If
        End If
    Next k


    Application.ScreenUpdating = True
    
errHandler:
    Application.ScreenUpdating = True
    If Not wasAlreadyOpen Then
        On Error Resume Next
        wbJobQueue.Windows(1).Visible = True  ' Unhide before closing
        wbJobQueue.Close SaveChanges:=True
        On Error GoTo 0
    End If
    
    If Err.Description <> "" Then
        MsgBox Err.Description, , "Error"
    End If
End Sub
