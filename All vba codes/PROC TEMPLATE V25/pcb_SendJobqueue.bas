Attribute VB_Name = "pcb_SendJobqueue"
Option Explicit
Sub PCB_Stencil_Invoice()

'Application.ScreenUpdating = False

Dim ProcWS As Worksheet
Set ProcWS = ThisWorkbook.Sheets("PCB + Stencils Orders")

Dim fullPath As String
fullPath = GetLocalPath(ThisWorkbook.FullName)

Dim folders() As String
folders() = Split(fullPath, "\")

Dim masterFolderName As String
Dim masterFolderPath As String
Dim procBatchCode As String
Dim jobQueueFolderPath As String

masterFolderName = folders(UBound(folders) - 3)
masterFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName, vbTextCompare) + Len(masterFolderName))
procBatchCode = folders(UBound(folders) - 1)
jobQueueFolderPath = masterFolderPath & "3. JOB QUEUE\"

Dim jobQueuePath As String
Dim jobqueueFileName As String

jobqueueFileName = Dir(jobQueueFolderPath & "Job*.xlsm")
jobQueuePath = jobQueueFolderPath & jobqueueFileName

Dim jobqueueWB As Workbook
Dim compWS As Worksheet
Dim pcbWS As Worksheet

Set jobqueueWB = Workbooks.Open(jobQueuePath)
Set compWS = jobqueueWB.Sheets("Distributor Invoices")
Set pcbWS = jobqueueWB.Sheets("Distributor Invoices")

initialiseHeaders , , , , , compWS, ProcWS, compWS


Dim i As Integer, j As Integer
Dim procLR As Integer
Dim pcbLR As Integer

procLR = ProcWS.Cells(ProcWS.Rows.count, PCB_ProcSheet_DISTRIBUTOR__Column).End(xlUp).Row
pcbLR = pcbWS.Cells(pcbWS.Rows.count, Jobqueue_PCB_Sheet_PROCBATCHCODE__Column).End(xlUp).Row


For i = 2 To procLR
    ''CHECK
    If UCase(ProcWS.Cells(i, PCB_ProcSheet_SenttoJobQueue_Column)) <> "YES" Then
        compWS.Range(compWS.Cells(pcbLR + 1, Jobqueue_PCB_Sheet_PROCBATCHCODE__Column), compWS.Cells(pcbLR + 1, Jobqueue_PCB_Sheet_Invoice_Column)).NumberFormat = "@"
        compWS.Range(compWS.Cells(pcbLR + 1, Jobqueue_PCB_Sheet_Subtotal_Column), compWS.Cells(pcbLR + 1, Jobqueue_PCB_Sheet_Total_Column)).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
        compWS.Cells(pcbLR + 1, Jobqueue_PCB_Sheet_PROCBATCHCODE__Column) = procBatchCode
        compWS.Cells(pcbLR + 1, Jobqueue_PCB_Sheet_GMP_Column) = ProcWS.Cells(i, PCB_ProcSheet_GMP__Column)
        compWS.Cells(pcbLR + 1, Jobqueue_PCB_Sheet_Type__Column) = ProcWS.Cells(i, PCB_ProcSheet_Type__Column)
        compWS.Cells(pcbLR + 1, Jobqueue_PCB_Sheet_Qty__Column) = ProcWS.Cells(i, PCB_ProcSheet_Qty__Column)
        compWS.Cells(pcbLR + 1, Jobqueue_PCB_Sheet_DISTRIBUTOR__Column) = ProcWS.Cells(i, PCB_ProcSheet_DISTRIBUTOR__Column)
        compWS.Cells(pcbLR + 1, Jobqueue_PCB_Sheet_RSPO__Column) = ProcWS.Cells(i, PCB_ProcSheet_RSPO__Column)
        
        If ProcWS.Cells(i, PCB_ProcSheet_Type__Column) = "PCB" Then
            compWS.Cells(pcbLR + 1, Jobqueue_PCB_Sheet_PCBStencil__Column) = ProcWS.Cells(i, PCB_ProcSheet_PCBStencil__Column)
        ElseIf ProcWS.Cells(i, PCB_ProcSheet_Type__Column) = "Stencil" Then
            compWS.Cells(pcbLR + 1, Jobqueue_PCB_Sheet_PCBStencil__Column) = ProcWS.Cells(i, PCB_ProcSheet_PCBStencil__Column)
        End If
        
        ''CHECK
        ProcWS.Cells(i, PCB_ProcSheet_SenttoJobQueue_Column) = "Yes"
        compWS.Cells(pcbLR + 1, Jobqueue_PCB_Sheet_Notes_Column) = ProcWS.Cells(i, PCB_ProcSheet_Notes_Column)
        
        compWS.Cells(pcbLR + 1, Jobqueue_PCB_Sheet_InvoiceDate_Column).NumberFormat = "m/d/yyyy"
        'compWS.Cells(pcbLR + 1, Jobqueue_PCB_Sheet_InvoiceDate_Column) = procWs.Cells(i, PCB_ProcSheet_InvoiceDate_Column)
        
        With compWS.Cells(pcbLR + 1, Jobqueue_PCB_Sheet_PaymentStatus_Column)
            .Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, Formula1:="Credit Card,Wire,eTransfer,Cheque"
            .Validation.IgnoreBlank = True
            .Validation.InCellDropdown = True
            .Validation.ShowInput = True
            .Validation.ShowError = False
        End With
        
        pcbLR = pcbLR + 1
    End If
Next i

Dim borderRng As Range
'Set borderRng = compWS.Range("A1:M" & pcbLR)
Set borderRng = compWS.Range(compWS.Cells(1, 1), compWS.Cells(pcbLR, Jobqueue_InvoicesforComponents_Sheet_Subscription_Column))
    
    With borderRng.Borders
        .LineStyle = xlContinuous
        .ColorIndex = 0
        .Weight = xlThin
    End With
    

ProcWS.Activate
'Application.ScreenUpdating = True

End Sub

