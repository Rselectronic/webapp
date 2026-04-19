Attribute VB_Name = "BG_Stock_Subtract_V1"
Sub subtractBGstock(procBatchCode As String)
turnoffscreenUpdate

Dim masterWS As Worksheet
Dim procWS As Worksheet
Set masterWS = ThisWorkbook.Sheets("MasterSheet")
Set procWS = ThisWorkbook.Sheets("Procurement")

Dim fullPath As String
Dim folders() As String
Dim masterFolderName As String, masterFolderPath As String
Dim bgFolderName As String
Dim bgFolderPath As String

bgFolderName = "6. BACKEND\BG FEEDERS"
fullPath = GetLocalPath(ThisWorkbook.fullName)
folders = Split(fullPath, "\")
masterFolderName = folders(UBound(folders) - 2)
bgFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName) + Len(masterFolderName)) & bgFolderName & "\"


' get the proc batch code
'procBatchCode = InputBox("Please enter the PROC BATCH CODE", "PROC BATCH CODE")

If procBatchCode = "" Then
    MsgBox "Invalid Proc Batch Code. Operation Cancelled!", , "INVALID ENTRY"
    turnonscreenUpdate
    Exit Sub
End If

'6. BACKEND\BG FEEDERS

Dim bgFileName As String
bgFileName = Dir(bgFolderPath & "BG Stock*", vbDirectory)


Dim bgWB As Workbook
Dim bgWS As Worksheet, bgDashboardWS As Worksheet
Set bgWB = Workbooks.Open(bgFolderPath & bgFileName)
Set bgWS = bgWB.Sheets("BG Stock Log")
Set bgDashboardWS = bgWB.Sheets("BG Dashboard")

If bgWS.AutoFilterMode Then bgWS.AutoFilterMode = False
If bgDashboardWS.AutoFilterMode Then bgWS.AutoFilterMode = False

Dim masterLR As Integer
Dim i As Long, k As Long

initialiseHeaders , , masterWS, , , , , , , , , , bgWS

masterLR = masterWS.Cells(masterWS.Rows.count, Master_CPC_Column).End(xlUp).Row
k = bgWS.Cells(bgWS.Rows.count, "A").End(xlUp).Row + 1

Dim entryDate As Date
entryDate = FillDateTimeInCanada

For i = 4 To masterLR
    ' check if stock at rs column is filled or empty
    If masterWS.Cells(i, Master_StockatRS_Column) <> "" Then
        Dim stockatRS As Long
        Dim orderQty As Long
        stockatRS = masterWS.Cells(i, Master_StockatRS_Column)
        orderQty = masterWS.Cells(i, Master_ORDERQTY_Column)
        
        masterWS.Cells(i, Master_StockatRS_Column) = stockatRS - orderQty
            

                ' new BG Log code
                If bgDashboardWS.AutoFilterMode Then
                    bgDashboardWS.AutoFilterMode = False
                End If

                bgWS.Cells(k, bgStockHistoryWS_Date_Column) = Format(entryDate, "MM/DD/YY hh:mm:ss")
                bgWS.Cells(k, bgStockHistoryWS_ProcBatchCode_Column) = procBatchCode
                bgWS.Cells(k, bgStockHistoryWS_CPC_Column) = masterWS.Cells(i, Master_CPC_Column)
                bgWS.Cells(k, bgStockHistoryWS_BGorSS_Column) = masterWS.Cells(i, Master_FeederType_Column)
                bgWS.Cells(k, bgStockHistoryWS_EntryType_Column) = "SUB"
                bgWS.Cells(k, bgStockHistoryWS_Qty_Column) = orderQty * -1
                bgWS.Cells(k, bgStockHistoryWS_CumulativeStockLevel_Column) = stockatRS - orderQty
                bgWS.Cells(k, bgStockHistoryWS_EntryFrom_Column) = "MasterSheet"
                On Error Resume Next
                bgWS.Cells(k, bgStockHistoryWS_SerialNumber_Column) = bgDashboardWS.Cells(bgDashboardWS.Columns("A").Find(What:=masterWS.Cells(i, Master_CPC_Column), LookAt:=xlWhole, MatchCase:=False).Row, "B")
                On Error GoTo 0
                k = k + 1
                ' new BG Log code
                
        
            masterWS.Cells(i, Master_BGStockStatus_Column) = "IN STOCK"
           
            If masterWS.Cells(i, Master_StockatRS_Column) <= 0 Then
                masterWS.Cells(i, Master_BGStockStatus_Column) = "RESTOCK"
            End If
    End If
Next i

' add borders and formatting
'bgWS.Range(bgWS.Cells(BGwsHeaderRow, bgwsLastCol), bgWS.Cells(bgWS.Cells(bgWS.Rows.count, "A").End(xlUp).Row, bgwsLastCol)).Borders.LineStyle = xlContinuous

bgWB.Close SaveChanges:=True
UpdateProcurement True

turnonscreenUpdate


End Sub

