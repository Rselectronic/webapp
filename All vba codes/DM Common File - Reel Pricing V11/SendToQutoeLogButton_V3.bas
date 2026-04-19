Attribute VB_Name = "SendToQutoeLogButton_V3"
Public rfqRef As String
Sub sendtoQuoteLog()

turnoffscreenUpdate
    
    Dim JOB_QUEUE As Worksheet
    Dim inputWS As Worksheet, QuoteLogWS As Worksheet
    Dim jobQueue_Workbook As Workbook, cxDetails As Worksheet
    Dim fullPath As String
    Dim masterFolderName As String
    Dim masterFolderPath As String
    Dim jobQueuePath As String
    Dim folders() As String
    Dim jobQueueFileName As String
    Dim lRow As Long
    Dim i As Long
    Dim jobQueue_Admin As Worksheet
    Dim col As Integer
    
    Dim cxRow As Integer
    Dim customerAbb As String, customerName As String
    Dim payTerms As String
    
    ''New Variables added
    Dim findrng As Range

    Set inputWS = ThisWorkbook.Sheets("DataInputSheets")
    Set QuoteLogWS = ThisWorkbook.Sheets("Quote Log")
    
    initialiseHeaders inputWS, , , , , , , , , QuoteLogWS
    
    rfqRef = "RFQ-" & Format(FillDateTimeInCanada, "yymmddhhmmss")
    
    Dim datainputsheetLR As Long
    datainputsheetLR = inputWS.Cells(inputWS.Rows.count, DM_GlobalMFRPackage_Column).End(xlUp).Row
    
    Dim quoteLogwsLR As Long
    quoteLogwsLR = QuoteLogWS.Cells(QuoteLogWS.Rows.count, dmFile_QuoteLog_Sheet_Customer_Column).End(xlUp).Row
    
    Dim q As Long
    For q = 6 To datainputsheetLR
        If inputWS.Cells(q, DM_ActiveQty_Column) > 0 Then
            inputWS.Cells(q, DM_Status_Column) = rfqRef
            QuoteLogWS.Cells(quoteLogwsLR + 1, dmFile_QuoteLog_Sheet_Customer_Column) = inputWS.Cells(q, DM_Customer_Column)
            QuoteLogWS.Cells(quoteLogwsLR + 1, dmFile_QuoteLog_Sheet_BoardName_Column) = inputWS.Cells(q, DM_GlobalMFRPackage_Column)
            QuoteLogWS.Cells(quoteLogwsLR + 1, dmFile_QuoteLog_Sheet_qty1_Column) = inputWS.Cells(q, DM_QTY1_Column)
            QuoteLogWS.Cells(quoteLogwsLR + 1, dmFile_QuoteLog_Sheet_qty2_Column) = inputWS.Cells(q, DM_QTY2_Column)
            QuoteLogWS.Cells(quoteLogwsLR + 1, dmFile_QuoteLog_Sheet_qty3_Column) = inputWS.Cells(q, DM_QTY3_Column)
            QuoteLogWS.Cells(quoteLogwsLR + 1, dmFile_QuoteLog_Sheet_qty4_Column) = inputWS.Cells(q, DM_QTY4_Column)
            QuoteLogWS.Cells(quoteLogwsLR + 1, dmFile_QuoteLog_Sheet_rfqRef_Column) = rfqRef
            QuoteLogWS.Cells(quoteLogwsLR + 1, dmFile_QuoteLog_Sheet_rfqDate_Column) = Format(FillDateTimeInCanada, "mm/dd/yyyy")
            QuoteLogWS.Cells(quoteLogwsLR + 1, dmFile_QuoteLog_Sheet_rfqDate_Column).NumberFormat = "mm/dd/yyyy"
            QuoteLogWS.Cells(quoteLogwsLR + 1, dmFile_QuoteLog_Sheet_quoteDate_Column) = ""
            QuoteLogWS.Cells(quoteLogwsLR + 1, dmFile_QuoteLog_Sheet_status_Column) = "BOM Loaded"
            
            With QuoteLogWS.Cells(quoteLogwsLR + 1, dmFile_QuoteLog_Sheet_status_Column).Validation
                .Delete ' Clear any previous validation
                .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, _
                     Formula1:="BOM Loaded,In Time File,Quote Generated,Quote Sent,Order Received"
                .IgnoreBlank = True
                .InCellDropdown = True
                .ShowInput = True
                .ShowError = True
            End With

            QuoteLogWS.Cells(quoteLogwsLR + 1, dmFile_QuoteLog_Sheet_comments_Column) = ""
            QuoteLogWS.Range(QuoteLogWS.Cells(quoteLogwsLR + 1, dmFile_QuoteLog_Sheet_Customer_Column), QuoteLogWS.Cells(quoteLogwsLR + 1, dmFile_QuoteLog_Sheet_Followup_Column)).Borders.LineStyle = xlContinuous
            quoteLogwsLR = quoteLogwsLR + 1
        End If
    Next q

    







End Sub

