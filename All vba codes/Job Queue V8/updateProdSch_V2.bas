Attribute VB_Name = "updateProdSch_V2"
Option Explicit
Sub sendtoProdSch()

Application.ScreenUpdating = False
Application.EnableEvents = False
Application.Calculation = xlCalculationManual

Dim jobWS As Worksheet
Dim prodSchWB As Workbook
Dim prodSchWS As Worksheet

Set jobWS = ThisWorkbook.Sheets("Job Queue")

' inputbox the proc batch code
Dim procBatchCode As String
procBatchCode = UCase(InputBox("Please input the Proc Batch Code.", "Input Proc Batch Code"))

If procBatchCode = "" Then
    MsgBox "Proc Batch Code empty. Try Again!"
    Exit Sub
End If

initialiseHeaders jobWS

' define the paths
Dim fullPath As String
fullPath = GetLocalPath(ThisWorkbook.FullName)


Dim folders() As String
folders = Split(fullPath, "\")

Dim masterfolderName As String
Dim masterfolderPath As String

masterfolderName = folders(UBound(folders) - 2)
masterfolderPath = Left(fullPath, InStr(1, fullPath, masterfolderName, vbTextCompare) + Len(masterfolderName))

Dim prodSchWBpath As String
Dim prodSchWBname As String

prodSchWBname = Dir(masterfolderPath & "5. PRODUCTION SCHEDULE\" & "Production Schedule*", vbDirectory)
prodSchWBpath = masterfolderPath & "5. PRODUCTION SCHEDULE\" & prodSchWBname
Set prodSchWB = Workbooks.Open(prodSchWBpath)
Set prodSchWS = prodSchWB.Sheets("Project schedule - Detailed")

initialiseHeaders , prodSchWS

Dim prodSchLR As Long
prodSchLR = prodSchWS.Cells(prodSchWS.Rows.Count, wsProdSch_Task_Column).End(xlUp).row + 1



Dim jobQueueLR As Long
jobQueueLR = jobWS.Cells(jobWS.Rows.Count, wsJobQueue_customerName_Column).End(xlUp).row

Dim firstInstance As String
firstInstance = "False"

' check if proc Batch code exists or not

Dim i As Long
For i = 4 To jobQueueLR
    If jobWS.Cells(i, wsJobQueue_ProcBatchCode_Column) = procBatchCode And jobWS.Cells(i, wsJobQueue_OrderStatus_Column) Like "*PO Received" And jobWS.Cells(i, wsJobQueue_OrderType_Column) <> "NREs" Then
        If firstInstance = "False" Then
            prodSchWS.Cells(prodSchLR, wsProdSch_Task_Column) = procBatchCode
            prodSchWS.Rows(8).Copy
            prodSchWS.Rows(prodSchLR).PasteSpecial Paste:=xlPasteFormats
            firstInstance = "true"
            
            ' add the dataValidation list to Production Schedule
            With prodSchWS.Cells(prodSchLR, wsProdSch_ReceptionFileStatus_Column).Validation
                .Delete ' Clear any previous validation
                .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, _
                     Formula1:="Not Ready,Ready,In box"
                .IgnoreBlank = True
                .InCellDropdown = True
                .ShowInput = True
                .ShowError = True
            End With
            prodSchWS.Cells(prodSchLR, wsProdSch_ReceptionFileStatus_Column) = "Not Ready"
        End If
        
        prodSchWS.Cells(prodSchLR + 1, wsProdSch_CustomerName_Column) = jobWS.Cells(i, wsJobQueue_customerName_Column)
        prodSchWS.Cells(prodSchLR + 1, wsProdSch_Task_Column) = jobWS.Cells(i, wsJobQueue_ProductName_Column)
        prodSchWS.Cells(prodSchLR + 1, wsProdSch_OrderType_Column) = jobWS.Cells(i, wsJobQueue_OrderType_Column)
        prodSchWS.Cells(prodSchLR + 1, wsProdSch_Qty_Column) = "'" & jobWS.Cells(i, wsJobQueue_POQty_Column)
        prodSchWS.Cells(prodSchLR + 1, wsProdSch_PONum_Column) = jobWS.Cells(i, wsJobQueue_POnumber_Column)
        prodSchWS.Cells(prodSchLR + 1, wsProdSch_DueDate_Column) = jobWS.Cells(i, wsJobQueue_maxDeliveryDate_Column)
        prodSchWS.Cells(prodSchLR + 1, wsProdSch_DueDate_Column).NumberFormat = "mm/dd/yyyy"
        prodSchWS.Cells(prodSchLR + 1, wsProdSch_LineNo_Column) = jobWS.Cells(i, wsJobQueue_LineNumber_Column)
        prodSchWS.Cells(prodSchLR + 1, wsProdSch_ProgrammingStatus_Column) = "Not Ready"
        prodSchWS.Cells(prodSchLR + 1, wsProdSch_StencilName_Column) = jobWS.Cells(i, wsJobQueue_StencilName_Column)
        prodSchWS.Cells(prodSchLR + 1, wsProdSch_BoardLetter_Column) = jobWS.Cells(i, wsJobQueue_BoardLetter_Column)
        prodSchWS.Cells(prodSchLR + 1, wsProdSch_McodeSummary_Column) = jobWS.Cells(i, wsJobQueue_MCODESSummary_Column)
        prodSchWS.Cells(prodSchLR + 1, wsProdSch_SolderType_Column) = jobWS.Cells(i, wsJobQueue_SolderType_Column)
        prodSchWS.Cells(prodSchLR + 1, wsprodsch_ProductionStatus_Column) = ""
         
        If prodSchWS.Cells(prodSchLR + 1, wsProdSch_StencilName_Column) = "" Then
            prodSchWS.Cells(prodSchLR + 1, wsProdSch_StencilStatus_Column) = "Not Ordered"
        Else
            prodSchWS.Cells(prodSchLR + 1, wsProdSch_StencilStatus_Column) = "Ordered"
        End If
        
        
        
        
        With prodSchWS.Cells(prodSchLR + 1, wsProdSch_StencilStatus_Column).Validation
            .Delete ' Clear any previous validation
            .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, _
                 Formula1:="Ordered,Not Ordered,Stencil Not Required"
            .IgnoreBlank = True
            .InCellDropdown = True
            .ShowInput = True
            .ShowError = True
        End With
        
        With prodSchWS.Cells(prodSchLR + 1, wsProdSch_ProgrammingStatus_Column).Validation
            .Delete ' Clear any previous validation
            .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, _
                 Formula1:="Ready,Not Ready"
            .IgnoreBlank = True
            .InCellDropdown = True
            .ShowInput = True
            .ShowError = True
        End With
        
        With prodSchWS.Cells(prodSchLR + 1, wsprodsch_ProductionStatus_Column).Validation
            .Delete ' Clear any previous validation
            .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, _
                 Formula1:="1. SMT Done,2. Inspection Done,3. TH Done,4. Packing Done"
            .IgnoreBlank = True
            .InCellDropdown = True
            .ShowInput = True
            .ShowError = True
        End With
        
        
        
        
        prodSchWS.Rows(9).Copy
        prodSchWS.Rows(prodSchLR + 1).PasteSpecial Paste:=xlPasteFormats
        
        jobWS.Cells(i, wsJobQueue_OrderStatus_Column) = "6. In Production"
        prodSchLR = prodSchLR + 1
    End If
    
Next i

'if nothing entered in production schedule, then give a message

Application.ScreenUpdating = True
Application.EnableEvents = True
Application.Calculation = xlCalculationAutomatic

If prodSchWS.Cells(prodSchWS.Rows.Count, wsProdSch_Task_Column).End(xlUp).row + 1 = prodSchLR Then
    MsgBox "PROC " & """" & procBatchCode & """" & " is either already in Production Schedule or is already been processed. Please check the Order Status in the Job Queue", , "Production Schedule"
    jobWS.Activate
End If

End Sub



