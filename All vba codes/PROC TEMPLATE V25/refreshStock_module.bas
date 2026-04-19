Attribute VB_Name = "refreshStock_module"
Option Explicit

Sub refreshStockAtRS()
    
    Application.ScreenUpdating = False
    
    Dim wsProc As Worksheet, wsProcLR As Long
    Set wsProc = ThisWorkbook.Sheets("Proc")
    
    initialiseHeaders , , , wsProc
    wsProcLR = wsProc.Cells(wsProc.Rows.count, Procsheet_CPC_Column).End(xlUp).Row
    
    If wsProcLR = 4 Then
        MsgBox "The Proc Sheet is empty. Operation Cancelled", , "Operation Cancelled"
        Exit Sub
    End If
    
    Dim wbDMFile As Workbook
    Dim wsProcurement As Worksheet
    
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
    
    Dim i As Long
    
    initialiseHeaders , , , , , , , , , , , , wsProcurement
    
    ' refresh the BG stock from the Procurement Sheet of DM file.
    ' check the Customer Ref column for BG parts
    For i = 5 To wsProcLR
        If wsProc.Cells(i, Procsheet_BGorSS_Column) = "BG" Or wsProc.Cells(i, Procsheet_BGorSS_Column) = "SS" Then
            Dim findCPC As String
            findCPC = wsProc.Cells(i, Procsheet_CPC_Column)
            wsProc.Cells(i, Procsheet_StockAtRS_Column) = wsProcurement.Cells(wsProcurement.Columns.Find(What:=findCPC, LookAt:=xlWhole, MatchCase:=False).Row, DM_ProcurementWS_stockAtRS_Column)
        End If
    Next i
    
    Application.ScreenUpdating = True
End Sub

Sub add_to_StockAtRS()

    ' popup to verify if all the required column are filled.
    Dim response As VbMsgBoxResult

    response = MsgBox("Are all the required fields filled?" & vbNewLine & "Required Fields: Order Qty, Place To Buy, Ext Price After Order", vbYesNo + vbQuestion, "Confirmation")

    If response = vbYes Then
        ' Continue with the rest of the macro
    Else
        MsgBox "Macro stopped. Please fill in all required fields.", vbExclamation
        Exit Sub
    End If

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.DisplayAlerts = False
    
    
    Dim wsProc As Worksheet, wsProcLR As Long
    Set wsProc = ThisWorkbook.Sheets("Proc")
    
    initialiseHeaders , , , wsProc
    wsProcLR = wsProc.Cells(wsProc.Rows.count, Procsheet_CPC_Column).End(xlUp).Row
    If wsProcLR = 4 Then
        MsgBox "The Proc Sheet is empty. Operation Cancelled", , "Operation Cancelled"
        Exit Sub
    End If
    
    Dim wbDMFile As Workbook
    Dim wsProcurement As Worksheet
    Dim wbBGstockHistory As Workbook
    Dim wsBGStockLog As Worksheet, wsBGdashboard As Worksheet
    
    Dim fullPath As String
    Dim folders() As String
    Dim dmFileFolderPath As String
    Dim dmFileName As String
    Dim dmFilePath As String
    Dim BGstockHistoryFolderPath As String
    Dim BGStockHistoryFileName As String
    Dim BGstockHistoryFilePath As String
    
    fullPath = GetLocalPath(ThisWorkbook.FullName)
    folders() = Split(fullPath, "\")
    dmFileFolderPath = Left(fullPath, InStr(1, fullPath, folders(UBound(folders) - 3)) + Len(folders(UBound(folders) - 3))) & "2. DM FILE\"
    dmFileName = Dir(dmFileFolderPath & "DM Common File - Reel Pricing*")
    dmFilePath = dmFileFolderPath & dmFileName
    BGstockHistoryFolderPath = Left(fullPath, InStr(1, fullPath, folders(UBound(folders) - 3)) + Len(folders(UBound(folders) - 3))) & "6. BACKEND\BG FEEDERS\"
    BGStockHistoryFileName = Dir(BGstockHistoryFolderPath & "BG Stock History*")
    BGstockHistoryFilePath = BGstockHistoryFolderPath & BGStockHistoryFileName
    
    Set wbDMFile = Workbooks.Open(dmFilePath)
    Set wsProcurement = wbDMFile.Sheets("Procurement")
    Set wbBGstockHistory = Workbooks.Open(BGstockHistoryFilePath)
    Set wsBGStockLog = wbBGstockHistory.Sheets("BG Stock Log")
    Set wsBGdashboard = wbBGstockHistory.Sheets("BG Dashboard")
    
    ' remove the filters from bg log sheet
    If wsBGStockLog.AutoFilterMode Then wsBGStockLog.AutoFilterMode = False
    
    initialiseHeaders , , , , , , , , , , , , wsProcurement, wsBGStockLog
    
    Dim i As Long, k As Long
    Dim EntryDate As Date
    EntryDate = Format(FillDateTimeInCanada, "mm/dd/yyyy hh:mm:ss")
    
    k = wsBGStockLog.Cells(wsBGStockLog.Rows.count, BGstockHistory_wsBGstockLog_CPC_Column).End(xlUp).Row + 1
    
    For i = 5 To wsProcLR
        If (wsProc.Cells(i, Procsheet_BGorSS_Column) = "BG" Or wsProc.Cells(i, Procsheet_BGorSS_Column) = "SS") And wsProc.Cells(i, Procsheet_Placetobuy_Column) <> "zzBGstock" And wsProc.Cells(i, Procsheet_Placetobuy_Column) <> "zzSafetyStock" And wsProc.Cells(i, ProcSheet_BGstockAddedToProcurement_Column) <> "Yes" And wsProc.Cells(i, Procsheet_OrderStatus_Column) = "Complete" Then
            Dim findCPC As String
            Dim findRow As Long
            findCPC = wsProc.Cells(i, Procsheet_CPC_Column)
            findRow = wsProcurement.Columns.Find(What:=findCPC, LookAt:=xlWhole, MatchCase:=False).Row
            
            ' add the stock to DM File Procurement Sheet
            wsProcurement.Cells(findRow, DM_ProcurementWS_stockAtRS_Column) = wsProcurement.Cells(findRow, DM_ProcurementWS_stockAtRS_Column) + wsProc.Cells(i, Procsheet_ORDERQTY_Column)
            wsProc.Cells(i, ProcSheet_BGstockAddedToProcurement_Column) = "Yes"
            
            ' add line to BG stock Log
            wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_Date_Column) = EntryDate
            wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_ProcBatchCode_Column) = Replace(Replace(ThisWorkbook.Name, "PROC ", ""), ".xlsm", "")
            wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_CPC_Column) = findCPC
            wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_BGorSS_Column) = wsProc.Cells(i, Procsheet_BGorSS_Column)
            wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_Qty_Column) = wsProc.Cells(i, Procsheet_ORDERQTY_Column)
            wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_PlaceBought_Column) = wsProc.Cells(i, Procsheet_Placetobuy_Column)
            wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_EntryFrom_Column) = "Proc Sheet"
            wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_CumulativeStockLevel_Column) = wsProcurement.Cells(findRow, DM_ProcurementWS_stockAtRS_Column)
            wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_AmountSpent_Column) = wsProc.Cells(i, Procsheet_ExtPriceAfterOrder_Column)
            
            On Error Resume Next
            wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_SerialNumber_Column) = wsBGdashboard.Cells(wsBGdashboard.Columns("A").Find(What:=findCPC, LookAt:=xlWhole, MatchCase:=False).Row, "B")
            On Error GoTo 0
            
            If wsProc.Cells(i, Procsheet_ORDERQTY_Column) < 0 Then
                wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_EntryType_Column) = "SUB"
            Else
                wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_EntryType_Column) = "ADD"
            End If
            
            ' check if BG or SS already exists. if not, make new BG or SS and add the note in BG log
            If wsProcurement.Cells(findRow, DM_ProcurementWS_FeederType_Column) <> wsProc.Cells(i, Procsheet_BGorSS_Column) Then
                wsProcurement.Cells(findRow, DM_ProcurementWS_FeederType_Column) = wsProc.Cells(i, Procsheet_BGorSS_Column)     ' add new BG to DM Procurement sheet
                Dim wsBGdashboardLR As Long
                wsBGdashboardLR = wsBGdashboard.Cells(wsBGdashboard.Rows.count, "A").End(xlUp).Row
                wsBGdashboard.Cells(wsBGdashboardLR + 1, "A") = findCPC
                wsBGdashboard.Cells(wsBGdashboardLR + 1, "F") = wsProc.Cells(i, Procsheet_BGorSS_Column)
                wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_Notes_Column) = "New " & wsProc.Cells(i, Procsheet_BGorSS_Column)
                
                ' when we make new BG or SS, we have to subtract the qty getting used in current proc
                k = k + 1
                ' add line to BG stock Log
                wsProcurement.Cells(findRow, DM_ProcurementWS_stockAtRS_Column) = wsProcurement.Cells(findRow, DM_ProcurementWS_stockAtRS_Column) - (wsProc.Cells(i, Procsheet_XQty_Column) + wsProc.Cells(i, Procsheet_EXTRA_Column))
                wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_Date_Column) = EntryDate
                wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_ProcBatchCode_Column) = Replace(Replace(ThisWorkbook.Name, "PROC ", ""), ".xlsm", "")
                wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_CPC_Column) = findCPC
                wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_BGorSS_Column) = wsProc.Cells(i, Procsheet_BGorSS_Column)
                wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_Qty_Column) = -(wsProc.Cells(i, Procsheet_XQty_Column) + wsProc.Cells(i, Procsheet_EXTRA_Column))
                wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_EntryFrom_Column) = "Proc Sheet"
                wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_CumulativeStockLevel_Column) = wsProcurement.Cells(findRow, DM_ProcurementWS_stockAtRS_Column)
                wsBGStockLog.Cells(k, BGstockHistory_wsBGstockLog_EntryType_Column) = "SUB"
            End If
            
            
            k = k + 1
            End If
    Next i
    
    ' refrest the stock at RS after adding stock to BG
    refreshStockAtRS
    
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    Application.DisplayAlerts = True
    
End Sub
