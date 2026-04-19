Attribute VB_Name = "Procurement_Module"
Option Explicit

Sub updateProcurement_fromProcSheet()

    Dim wsProc As Worksheet
    Dim wbDMFile As Workbook
    Dim wsProcurement As Worksheet
    Dim wsProcurementLog As Worksheet
    
    Set wsProc = ThisWorkbook.Sheets("Proc")
    
    Dim procBatchCode As String
    procBatchCode = Right(Split(ThisWorkbook.Name, ".")(0), Len(Split(ThisWorkbook.Name, ".")(0)) - 5)
    
    Dim fullPath As String
    Dim folders() As String
    Dim dmFileFolderPath As String
    Dim dmFileName As String
    Dim dmFilePath As String
    
    fullPath = GetLocalPath(ThisWorkbook.FullName)
    folders() = Split(fullPath, "\")
    dmFileFolderPath = Left(fullPath, InStr(1, fullPath, folders(UBound(folders) - 3)) + Len(folders(UBound(folders) - 3))) & "2. DM FILE\"
    dmFileName = Dir(dmFileFolderPath & "DM Common File - Reel Pricing*")
    dmFilePath = dmFileFolderPath & dmFileName
    
    Set wbDMFile = Workbooks.Open(dmFilePath)
    Set wsProcurement = wbDMFile.Sheets("Procurement")
    Set wsProcurementLog = wbDMFile.Sheets("Procurement Log")
    
    initialiseHeaders , , , wsProc, , , , , , , , , wsProcurement, , wsProcurementLog
    
    Dim wsProcLR As Long, i As Long
    wsProcLR = wsProc.Cells(wsProc.Rows.count, Procsheet_CPC_Column).End(xlUp).Row
    
    Dim k As Long, logTime As Date
    k = wsProcurementLog.Cells(wsProcurementLog.Rows.count, DM_ProcurementLogWS_LogTime_Column).End(xlUp).Row + 1
    logTime = Format(FillDateTimeInCanada, "mm/dd/yyyy hh:mm:ss")
    
    For i = 5 To wsProcLR
        If wsProc.Cells(i, Procsheet_ProcurementUpdateStatus_Column) <> "Done" Then
            Dim cpc As String, newDistributorPN As String, newDistributor As String, newLCSCpn As String, newPNtoUse As String
            
            cpc = wsProc.Cells(i, Procsheet_CPC_Column)
            newDistributorPN = wsProc.Cells(i, Procsheet_DistPN_Column)
            newDistributor = wsProc.Cells(i, Procsheet_DistName_Column)
            newLCSCpn = wsProc.Cells(i, Procsheet_LCSCPN_Column)
            newPNtoUse = wsProc.Cells(i, Procsheet_PNTOUSE_Column)
            
            On Error Resume Next
            Dim findCPC As Range
            Set findCPC = wsProcurement.Columns(DM_ProcurementWS_CPC_Column).Find(What:=cpc, LookAt:=xlWhole, MatchCase:=False)
            On Error GoTo 0
            
            Dim trackChange As Boolean
            trackChange = False
            
            If Not findCPC Is Nothing Then
                Dim oldDistributorPN As String, oldDistributor As String, oldLCSCpn As String, oldPNtoUse As String
                oldDistributorPN = wsProcurement.Cells(findCPC.Row, DM_ProcurementWS_DistPN_Column)
                oldDistributor = wsProcurement.Cells(findCPC.Row, DM_ProcurementWS_DistName_Column)
                oldLCSCpn = wsProcurement.Cells(findCPC.Row, DM_ProcurementWS_lcscPN_Column)
                oldPNtoUse = wsProcurement.Cells(findCPC.Row, DM_ProcurementWS_PNtoUse_Column)
                
                
                    If oldDistributorPN <> newDistributorPN Then
                        wsProcurement.Cells(findCPC.Row, DM_ProcurementWS_DistPN_Column) = newDistributorPN     'update the new pn to procurement sheet of DM file

                        wsProcurementLog.Cells(k, DM_ProcurementLogWS_ProcBatchCode_Column) = procBatchCode
                        wsProcurementLog.Cells(k, DM_ProcurementLogWS_DistributorPN_Column) = newDistributorPN
                        wsProcurementLog.Cells(k, DM_ProcurementLogWS_Notes_Column) = wsProcurementLog.Cells(k, DM_ProcurementLogWS_Notes_Column) & "Old DistPN: " & oldDistributorPN & "; "
                        trackChange = True
                    End If
                    
                    If oldDistributor <> newDistributor Then
                        wsProcurement.Cells(findCPC.Row, DM_ProcurementWS_DistName_Column) = newDistributor    'update the new pn to procurement sheet of DM file

                        wsProcurementLog.Cells(k, DM_ProcurementLogWS_DistributorName_Column) = newDistributor
                        wsProcurementLog.Cells(k, DM_ProcurementLogWS_Notes_Column) = wsProcurementLog.Cells(k, DM_ProcurementLogWS_Notes_Column) & "Old DistName: " & oldDistributor & "; "
                        trackChange = True
                    End If
                    
                    If oldLCSCpn <> newLCSCpn Then
                        wsProcurement.Cells(findCPC.Row, DM_ProcurementWS_lcscPN_Column) = newLCSCpn    'update the new pn to procurement sheet of DM file

                        wsProcurementLog.Cells(k, DM_ProcurementLogWS_LCSCpn_Column) = newLCSCpn
                        wsProcurementLog.Cells(k, DM_ProcurementLogWS_Notes_Column) = wsProcurementLog.Cells(k, DM_ProcurementLogWS_Notes_Column) & "Old LCSC PN: " & oldLCSCpn & "; "
                        trackChange = True
                    End If
                    
                    If oldPNtoUse <> newPNtoUse Then
                        wsProcurement.Cells(findCPC.Row, DM_ProcurementWS_PNtoUse_Column) = newPNtoUse    'update the new pn to procurement sheet of DM file
                        
                        wsProcurementLog.Cells(k, DM_ProcurementLogWS_PNtoUse_Column) = newPNtoUse
                        wsProcurementLog.Cells(k, DM_ProcurementLogWS_Notes_Column) = wsProcurementLog.Cells(k, DM_ProcurementLogWS_Notes_Column) & "Old PN to Use: " & oldPNtoUse & "; "
                        trackChange = True
                    End If
                    
                    If trackChange = True Then
                        'update log in DM File
                        wsProcurementLog.Cells(k, DM_ProcurementLogWS_LogTime_Column).NumberFormat = "mm/dd/yyyy hh:mm:ss"
                        wsProcurementLog.Cells(k, DM_ProcurementLogWS_LogTime_Column) = logTime
                        wsProcurementLog.Cells(k, DM_ProcurementLogWS_cpc_Column) = cpc
                        wsProcurementLog.Cells(k, DM_ProcurementLogWS_ProcBatchCode_Column) = procBatchCode
                        wsProcurementLog.Cells(k, DM_ProcurementLogWS_EntryFrom_Column) = "Proc Sheet"
                        wsProcurementLog.Cells(k, DM_ProcurementLogWS_Notes_Column) = Left(wsProcurementLog.Cells(k, DM_ProcurementLogWS_Notes_Column), Len(wsProcurementLog.Cells(k, DM_ProcurementLogWS_Notes_Column)) - 2)
                        
                        'update status in Proc Sheet as Done
                        wsProc.Cells(i, Procsheet_ProcurementUpdateStatus_Column) = "Done"
                        k = k + 1
                    End If
            End If
        End If
    Next i
End Sub
