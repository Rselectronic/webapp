Attribute VB_Name = "ComponentsOrders_SendJobqueue"
Option Explicit
Sub CompInvoice()

Application.ScreenUpdating = False

Dim ProcWS As Worksheet
Set ProcWS = ThisWorkbook.Sheets("Components Orders")

Dim fullPath As String
fullPath = GetLocalPath(ThisWorkbook.FullName)

Dim folders() As String
folders() = Split(fullPath, "\")

Dim masterFolderName As String
Dim masterFolderPath As String
Dim procBatchCode As String
Dim jobQueueFolderPath As String

'masterFolderName = folders(UBound(folders) - 5)
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

initialiseHeaders , , , , ProcWS, compWS

Dim i As Integer, j As Integer
Dim procLR As Integer
Dim compLR As Integer

procLR = ProcWS.Cells(ProcWS.Rows.count, ComponentsOrders_ProcSheet_DISTRIBUTOR__Column).End(xlUp).Row
compLR = compWS.Cells(compWS.Rows.count, Jobqueue_InvoicesforComponents_Sheet_PROCBATCHCODE__Column).End(xlUp).Row

For i = 2 To procLR
    ''Check
    If UCase(ProcWS.Cells(i, ComponentsOrders_ProcSheet_SenttoJobQueue_Column).Value) <> "YES" Then
        compWS.Range(compWS.Cells(compLR + 1, Jobqueue_InvoicesforComponents_Sheet_PROCBATCHCODE__Column), compWS.Cells(compLR + 1, Jobqueue_InvoicesforComponents_Sheet_Invoice_Column)).NumberFormat = "@"
        compWS.Range(compWS.Cells(compLR + 1, Jobqueue_InvoicesforComponents_Sheet_Subtotal_Column), compWS.Cells(compLR + 1, Jobqueue_InvoicesforComponents_Sheet_Total_Column)).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
        
        Dim formula As String
        formula = "=IF(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & "<>"""","
        formula = formula & "IF(MONTH(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")=11,YEAR(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")+1&"" / Q1"","
        formula = formula & "IF(MONTH(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")=12,YEAR(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")+1&"" / Q1"","
        formula = formula & "IF(MONTH(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")=1,YEAR(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")&"" / Q1"","
        formula = formula & "IF(MONTH(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")=2,YEAR(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")&"" / Q2"","
        formula = formula & "IF(MONTH(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")=3,YEAR(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")&"" / Q2"","
        formula = formula & "IF(MONTH(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")=4,YEAR(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")&"" / Q2"","
        formula = formula & "IF(MONTH(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")=5,YEAR(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")&"" / Q3"","
        formula = formula & "IF(MONTH(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")=6,YEAR(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")&"" / Q3"","
        formula = formula & "IF(MONTH(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")=7,YEAR(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")&"" / Q3"","
        formula = formula & "IF(MONTH(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")=8,YEAR(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")&"" / Q4"","
        formula = formula & "IF(MONTH(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")=9,YEAR(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")&"" / Q4"","
        formula = formula & "IF(MONTH(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")=10,YEAR(RC" & Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column & ")&"" / Q4"","
        formula = formula & """"")))))))))))),"""")"
    
        compWS.Cells(compLR + 1, Jobqueue_InvoicesforComponents_Sheet_YearQuarter_Column).FormulaR1C1 = formula
        compWS.Cells(compLR + 1, Jobqueue_InvoicesforComponents_Sheet_PROCBATCHCODE__Column) = procBatchCode
        compWS.Cells(compLR + 1, Jobqueue_InvoicesforComponents_Sheet_DISTRIBUTOR__Column) = ProcWS.Cells(i, ComponentsOrders_ProcSheet_DISTRIBUTOR__Column)
        compWS.Cells(compLR + 1, Jobqueue_InvoicesforComponents_Sheet_SALESORDER_Column) = ProcWS.Cells(i, ComponentsOrders_ProcSheet_SALESORDER_Column)
        compWS.Cells(compLR + 1, Jobqueue_InvoicesforComponents_Sheet_Type_Column) = "Component"
        ProcWS.Cells(i, ComponentsOrders_ProcSheet_SenttoJobQueue_Column) = "Yes"
        ''Check
        compWS.Cells(compLR + 1, Jobqueue_InvoicesforComponents_Sheet_Notes_Column) = ProcWS.Cells(i, ComponentsOrders_ProcSheet_Notes_Column)
        compWS.Cells(compLR + 1, Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column).NumberFormat = "m/d/yyyy"
        
        With compWS.Cells(compLR + 1, Jobqueue_InvoicesforComponents_Sheet_PaymentStatus_Column)
            .Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, Formula1:="Credit Card,Wire,eTransfer,Cheque"
            .Validation.IgnoreBlank = True
            .Validation.InCellDropdown = True
            .Validation.ShowInput = True
            .Validation.ShowError = False
        End With
        
        compLR = compLR + 1
        
    End If
Next i

Dim borderRng As Range
'Set borderRng = compWS.Range("A1:J" & compLR)
Set borderRng = compWS.Range(compWS.Cells(1, 1), compWS.Cells(compLR, Jobqueue_InvoicesforComponents_Sheet_Subscription_Column))
    With borderRng.Borders
        .LineStyle = xlContinuous
        .ColorIndex = 0
        .Weight = xlThin
    End With

ProcWS.Activate
Application.ScreenUpdating = True

End Sub
