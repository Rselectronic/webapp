Attribute VB_Name = "NCR_LOGS"
Public wsNCRcategory As Worksheet

Sub create_NCRLOG()

    Dim wbNCRlogs As Workbook, wsNCRreceivedLogs As Worksheet
    Dim NCRLogFolderPath As String, NCRLogFileName As String
    
    Dim wsJobQueue As Worksheet
    Set wsJobQueue = ThisWorkbook.Sheets("Job Queue")
    
    Dim ncrCell As Range
    
    ' Ask user to select the relevant row for which the ncr is raised.
    On Error Resume Next
    Set ncrCell = Application.InputBox("Select the GMP/Product Name to log NCR", Type:=8, Title:="NCR Form")
    On Error GoTo 0
    
    If Not ncrCell Is Nothing Then
        Dim ncrCellRow As Long
        ncrCellRow = ncrCell.row
    Else
        MsgBox "Please select valid cell!"
        Exit Sub
    End If
    
    ' Ask user to enter the NCR Number (if available).
    Dim ncrNumber As String
    On Error Resume Next
    ncrNumber = Application.InputBox("Please enter the NCR Number (if available)" & vbNewLine & "You can always add this later", "NCR Number")
    On Error GoTo 0
    
    Dim fullPath As String
    fullPath = GetLocalPath(ThisWorkbook.FullName)
    
    Dim folders() As String
    folders = Split(fullPath, "\")
    
    Dim masterfolderName As String
    Dim masterfolderPath As String
    
    masterfolderName = folders(UBound(folders) - 2)
    masterfolderPath = Left(fullPath, InStr(1, fullPath, masterfolderName, vbTextCompare) + Len(masterfolderName))
    
    NCRLogFolderPath = masterfolderPath & "8. QUALITY CONTROL\NCR\"
    NCRLogFileName = "NCR LOGS.xlsx"
    NCRLogFolderPath = NCRLogFolderPath & NCRLogFileName
    
    Set wbNCRlogs = Workbooks.Open(NCRLogFolderPath)
    Set wsNCRreceivedLogs = wbNCRlogs.Sheets("NCR Received")
    Set wsNCRcategory = wbNCRlogs.Sheets("NCR Category")
    
    ' Ask the NCR category + subcategory via the form
    Dim ncrCategory As String, ncrSubCategory As String, ncrDesc As String
    GetNcrChoice ncrCategory, ncrSubCategory, ncrDesc
    
    ' === Guard clauses ===
    ' Cancel pressed -> do nothing
    If Len(ncrCategory) = 0 And Len(ncrSubCategory) = 0 Then
        MsgBox "NCR entry cancelled.", vbInformation
        Exit Sub
    End If
    
    ' Missing either category or subcategory -> error and do nothing
    If Len(ncrCategory) = 0 Or Len(ncrSubCategory) = 0 Then
        MsgBox "NCR not logged. Please select both a Category and a Sub Category.", vbExclamation
        Exit Sub
    End If



    initialiseHeaders wsJobQueue, , wsNCRreceivedLogs
    
    Dim wsNCRreceivedLogsLR As Long
    wsNCRreceivedLogsLR = wsNCRreceivedLogs.Cells(wsNCRreceivedLogs.Rows.Count, wsNCRreceivedLogs_productName_Column).End(xlUp).row
    
    ' fill the log
    wsNCRreceivedLogs.Cells(wsNCRreceivedLogsLR + 1, wsNCRreceivedLogs_customerName_Column) = customerFullName(wsJobQueue.Cells(ncrCellRow, wsJobQueue_customerName_Column))
    wsNCRreceivedLogs.Cells(wsNCRreceivedLogsLR + 1, wsNCRreceivedLogs_productName_Column) = ncrCell.Value
    wsNCRreceivedLogs.Cells(wsNCRreceivedLogsLR + 1, wsNCRreceivedLogs_poNo_Column) = wsJobQueue.Cells(ncrCellRow, wsJobQueue_POnumber_Column)
    wsNCRreceivedLogs.Cells(wsNCRreceivedLogsLR + 1, wsNCRreceivedLogs_poQty_Column) = ""
    wsNCRreceivedLogs.Cells(wsNCRreceivedLogsLR + 1, wsNCRreceivedLogs_defectQty_Column) = ""
    wsNCRreceivedLogs.Cells(wsNCRreceivedLogsLR + 1, wsNCRreceivedLogs_poDate_Column) = wsJobQueue.Cells(ncrCellRow, wsJobQueue_POdate_Column)
    wsNCRreceivedLogs.Cells(wsNCRreceivedLogsLR + 1, wsNCRreceivedLogs_procBatchCode_Column) = GetProcBatchSuffix(wsJobQueue.Cells(ncrCellRow, wsJobQueue_ProcBatchCode_Column))
    wsNCRreceivedLogs.Cells(wsNCRreceivedLogsLR + 1, wsNCRreceivedLogs_ncrCategory_Column) = ncrCategory
    wsNCRreceivedLogs.Cells(wsNCRreceivedLogsLR + 1, wsNCRreceivedLogs_ncrSubCategory_Column) = ncrSubCategory
    wsNCRreceivedLogs.Cells(wsNCRreceivedLogsLR + 1, wsNCRreceivedLogs_ncrDescription_Column) = ncrDesc
    
    
    
    'generate CAAF number if Proc Batch Code is available
    
    If wsJobQueue.Cells(ncrCellRow, wsJobQueue_ProcBatchCode_Column) <> "" Then
        Dim caafNumber As String, procBatchCode As String
        procBatchCode = GetProcBatchSuffix(wsJobQueue.Cells(ncrCellRow, wsJobQueue_ProcBatchCode_Column))
        caafNumber = GetNextCAAFNumber(wsNCRreceivedLogs, procBatchCode)
        wsNCRreceivedLogs.Cells(wsNCRreceivedLogsLR + 1, wsNCRreceivedLogs_caafNo_Column) = caafNumber
    End If
   
    
    
End Sub

Function customerFullName(customerName As String)

    Dim wsAdmin As Worksheet
    Set wsAdmin = ThisWorkbook.Sheets("Admin")
    
    customerFullName = wsAdmin.Cells(wsAdmin.Columns("B").Find(what:=customerName, LookAt:=xlWhole, MatchCase:=False).row, "A")


End Function

Function GetNextCAAFNumber(wsLog As Worksheet, procBatchCode As String) As String
    Dim lastRow As Long
    Dim i As Long
    Dim existingCAAF As String
    Dim maxSuffix As Long
    Dim caafPrefix As String
    
    caafPrefix = "CAAF-" & procBatchCode & "-"
    maxSuffix = 0
    
    lastRow = wsLog.Cells(wsLog.Rows.Count, 1).End(xlUp).row
    
    For i = 2 To lastRow ' Assuming headers in Row 1
        existingCAAF = wsLog.Cells(i, 1).Value
        If existingCAAF Like caafPrefix & "*" Then
            Dim suffix As String
            suffix = Mid(existingCAAF, Len(caafPrefix) + 1)
            If IsNumeric(suffix) Then
                If CLng(suffix) > maxSuffix Then
                    maxSuffix = CLng(suffix)
                End If
            End If
        End If
    Next i
    
    GetNextCAAFNumber = caafPrefix & (maxSuffix + 1)
End Function

Function GetProcBatchSuffix(fullCode As String) As String
    Dim parts() As String

    ' Split by space
    parts = Split(Trim(fullCode), " ")
    
    ' If the format is "YYMMDD CODE", return the CODE part
    If UBound(parts) >= 1 Then
        GetProcBatchSuffix = parts(1)
    Else
        GetProcBatchSuffix = fullCode ' fallback if not in expected format
    End If
End Function

'== In a standard module (e.g., Module1) ==
Public Sub GetNcrChoice(ByRef outCategory As String, _
                        ByRef outSubCategory As String, _
                        ByRef outDescription As String)
    With selectNcrCategory
        .Show vbModal
        outCategory = .ResultCategory
        outSubCategory = .ResultSubCategory
        outDescription = .ResultDescription
        Unload selectNcrCategory
    End With
End Sub



