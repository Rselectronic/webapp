Attribute VB_Name = "headers_V2"
Option Explicit
' variables for Job Queue
Public wsJobQueue_customerName_Column As Long
Public wsJobQueue_POdate_Column As Long
Public wsJobQueue_POnumber_Column As Long
Public wsJobQueue_LineNumber_Column As Long
Public wsJobQueue_QTEnumber_Column As Long
Public wsJobQueue_OrderType_Column As Long
Public wsJobQueue_UnitPriceInPO_Column As Long
Public wsJobQueue_UnitPriceInQuote_Column As Long
Public wsJobQueue_GrossAmount_Column As Long
Public wsJobQueue_ProcBatchCode_Column As Long
Public wsJobQueue_Notes_Column As Long
Public wsJobQueue_DateDelivered_Column As Long
Public wsJobQueue_InvoiceDate_Column As Long
Public wsJobQueue_InvoiceNumber_Column As Long
Public wsJobQueue_PaymentDate_Column As Long
Public wsJobQueue_OrderStatus_Column As Long
Public wsJobQueue_OtherNotes_Column As Long
Public wsJobQueue_BOMName_Column As Long
Public wsJobQueue_GerberName_Column As Long
Public wsJobQueue_SolderType_Column As Long
Public wsJobQueue_IPCclass_Column As Long
Public wsJobQueue_minDeliveryDate_Column As Long
Public wsJobQueue_maxDeliveryDate_Column As Long
Public wsJobQueue_billingAddress_Column As Long
Public wsJobQueue_shippingAddress_Column As Long
Public wsJobQueue_SerialNoRequired_Column As Long
Public wsJobQueue_BoardLetter_Column As Long
Public wsJobQueue_ProductName_Column As Long
Public wsJobQueue_POQty_Column As Long
Public wsJobQueue_StencilName_Column As Long
Public wsJobQueue_MCODESSummary_Column As Long


' variables for production schedule
Public wsProdSch_Task_Column As Long
Public wsProdSch_OrderType_Column As Long
Public wsProdSch_Qty_Column As Long
Public wsProdSch_ReceptionDate_Column As Long
Public wsProdSch_LineNo_Column As Long
Public wsProdSch_ProductionDate_Column As Long
Public wsProdSch_PONum_Column As Long
Public wsProdSch_DueDate_Column As Long
Public wsProdSch_Comments_Column As Long
Public wsProdSch_CustomerName_Column As Long
Public wsProdSch_ReceptionFileStatus_Column As Long
Public wsProdSch_StencilStatus_Column As Long
Public wsProdSch_ProgrammingStatus_Column As Long
Public wsProdSch_StencilName_Column As Long
Public wsProdSch_BoardLetter_Column As Long
Public wsProdSch_McodeSummary_Column As Long
Public wsProdSch_SolderType_Column As Long
Public wsprodsch_ProductionStatus_Column As Long


Public wsNCRreceivedLogs_caafNo_Column As Long
Public wsNCRreceivedLogs_customerName_Column As Long
Public wsNCRreceivedLogs_productName_Column As Long
Public wsNCRreceivedLogs_poNo_Column As Long
Public wsNCRreceivedLogs_poQty_Column As Long
Public wsNCRreceivedLogs_defectQty_Column As Long
Public wsNCRreceivedLogs_poDate_Column As Long
Public wsNCRreceivedLogs_procBatchCode_Column As Long
Public wsNCRreceivedLogs_ncrNumber_Column As Long
Public wsNCRreceivedLogs_ncrDate_Column As Long
Public wsNCRreceivedLogs_buyerName_Column As Long
Public wsNCRreceivedLogs_ncrStatus_Column As Long
Public wsNCRreceivedLogs_buyerTitle_Column As Long
Public wsNCRreceivedLogs_buyerEmailid_Column As Long
Public wsNCRreceivedLogs_titleofcorrectiveaction_Column As Long
Public wsNCRreceivedLogs_dueDate_Column As Long
Public wsNCRreceivedLogs_owner_Column As Long
Public wsNCRreceivedLogs_completionDate_Column As Long
Public wsNCRreceivedLogs_signoffby_Column As Long
Public wsNCRreceivedLogs_signoffdate_Column As Long
Public wsNCRreceivedLogs_completionstatus_Column As Long
Public wsNCRreceivedLogs_ncrCategory_Column As Long
Public wsNCRreceivedLogs_ncrSubCategory_Column As Long
Public wsNCRreceivedLogs_ncrDescription_Column As Long

Public wsJobCard_HeaderRow As Integer
Public wsJobCard_poNumber_Column As Long
Public wsJobCard_boardName_Column As Long
Public wsJobCard_boardLetter_Column As Long
Public wsJobCard_Qty_Column As Long
Public wsJobCard_bomName_Column As Long
Public wsJobCard_gerberName_Column As Long
Public wsJobCard_stencilName_Column As Long
Public wsJobCard_mcodeSummary_Column As Long



Sub initialiseHeaders(Optional wsJobQueue As Worksheet, Optional wsProductionSchedule As Worksheet, _
                        Optional wsNCRreceivedLogs As Worksheet, Optional wsJobCard As Worksheet)

If Not wsJobQueue Is Nothing Then
    wsJobQueue_customerName_Column = wsJobQueue.Rows(3).Find(what:="Customer", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_POdate_Column = wsJobQueue.Rows(3).Find(what:="PO Date", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_POnumber_Column = wsJobQueue.Rows(3).Find(what:="PO Number", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_LineNumber_Column = wsJobQueue.Rows(3).Find(what:="Line #", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_QTEnumber_Column = wsJobQueue.Rows(3).Find(what:="QTE #", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_OrderType_Column = wsJobQueue.Rows(3).Find(what:="Order Type", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_UnitPriceInPO_Column = wsJobQueue.Rows(3).Find(what:="Unit Price in PO", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_UnitPriceInQuote_Column = wsJobQueue.Rows(3).Find(what:="Unit Price in Quote", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_GrossAmount_Column = wsJobQueue.Rows(3).Find(what:="Gross Amount", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_ProcBatchCode_Column = wsJobQueue.Rows(3).Find(what:="Proc Batch Code", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_Notes_Column = wsJobQueue.Rows(3).Find(what:="Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_DateDelivered_Column = wsJobQueue.Rows(3).Find(what:="Date Delivered", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_InvoiceDate_Column = wsJobQueue.Rows(3).Find(what:="Invoice Date", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_InvoiceNumber_Column = wsJobQueue.Rows(3).Find(what:="Invoice #", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_PaymentDate_Column = wsJobQueue.Rows(3).Find(what:="Payment Date", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_OrderStatus_Column = wsJobQueue.Rows(3).Find(what:="Order Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_OtherNotes_Column = wsJobQueue.Rows(3).Find(what:="Other Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_BOMName_Column = wsJobQueue.Rows(3).Find(what:="BOM Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_GerberName_Column = wsJobQueue.Rows(3).Find(what:="Gerber Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_SolderType_Column = wsJobQueue.Rows(3).Find(what:="Solder Type", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_IPCclass_Column = wsJobQueue.Rows(3).Find(what:="IPC Class", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_minDeliveryDate_Column = wsJobQueue.Rows(3).Find(what:="Min Delivery Date", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_maxDeliveryDate_Column = wsJobQueue.Rows(3).Find(what:="Max Delivery Date", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_billingAddress_Column = wsJobQueue.Rows(3).Find(what:="Billing Address", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_shippingAddress_Column = wsJobQueue.Rows(3).Find(what:="Shipping Address", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_SerialNoRequired_Column = wsJobQueue.Rows(3).Find(what:="Serial Number Required?", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_BoardLetter_Column = wsJobQueue.Rows(3).Find(what:="Board Letter", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_ProductName_Column = wsJobQueue.Rows(3).Find(what:="Product Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_POQty_Column = wsJobQueue.Rows(3).Find(what:="PO Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_StencilName_Column = wsJobQueue.Rows(3).Find(what:="Stencil Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsJobQueue_MCODESSummary_Column = wsJobQueue.Rows(3).Find(what:="MCODES Summary", LookIn:=xlValues, LookAt:=xlWhole).Column

End If

If Not wsProductionSchedule Is Nothing Then
    
    wsProdSch_Task_Column = wsProductionSchedule.Rows(6).Find(what:="TASK", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_OrderType_Column = wsProductionSchedule.Rows(6).Find(what:="ORDER TYPE", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_Qty_Column = wsProductionSchedule.Rows(6).Find(what:="Qty", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_ReceptionDate_Column = wsProductionSchedule.Rows(6).Find(what:="Reception of All Material", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_LineNo_Column = wsProductionSchedule.Rows(6).Find(what:="Line #", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_ProductionDate_Column = wsProductionSchedule.Rows(6).Find(what:="Production Date", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_PONum_Column = wsProductionSchedule.Rows(6).Find(what:="PO #", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_DueDate_Column = wsProductionSchedule.Rows(6).Find(what:="Due Date" & Chr(10) & "MM/DD/YY", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_Comments_Column = wsProductionSchedule.Rows(6).Find(what:="Comments", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_CustomerName_Column = wsProductionSchedule.Rows(6).Find(what:="Customer Name", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_ReceptionFileStatus_Column = wsProductionSchedule.Rows(6).Find(what:="Reception File Status", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_StencilStatus_Column = wsProductionSchedule.Rows(6).Find(what:="Stencil Status", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_ProgrammingStatus_Column = wsProductionSchedule.Rows(6).Find(what:="Programming Status", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_StencilName_Column = wsProductionSchedule.Rows(6).Find(what:="Stencil Name", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_BoardLetter_Column = wsProductionSchedule.Rows(6).Find(what:="Board Letter", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_McodeSummary_Column = wsProductionSchedule.Rows(6).Find(what:="MCODE Summary", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_SolderType_Column = wsProductionSchedule.Rows(6).Find(what:="Solder Type", LookAt:=xlWhole, MatchCase:=False).Column
    wsprodsch_ProductionStatus_Column = wsProductionSchedule.Rows(6).Find(what:="Production Status", LookAt:=xlWhole, MatchCase:=False).Column
    
End If

If Not wsNCRreceivedLogs Is Nothing Then
    wsNCRreceivedLogs_caafNo_Column = wsNCRreceivedLogs.Rows(1).Find(what:="CAAF No.", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_customerName_Column = wsNCRreceivedLogs.Rows(1).Find(what:="Customer Name", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_productName_Column = wsNCRreceivedLogs.Rows(1).Find(what:="Product Name", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_poNo_Column = wsNCRreceivedLogs.Rows(1).Find(what:="PO#", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_poQty_Column = wsNCRreceivedLogs.Rows(1).Find(what:="PO QTY", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_defectQty_Column = wsNCRreceivedLogs.Rows(1).Find(what:="Defect Qty", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_poDate_Column = wsNCRreceivedLogs.Rows(1).Find(what:="PO Date", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_procBatchCode_Column = wsNCRreceivedLogs.Rows(1).Find(what:="Proc Batch Code", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_ncrNumber_Column = wsNCRreceivedLogs.Rows(1).Find(what:="NCR Number", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_ncrDate_Column = wsNCRreceivedLogs.Rows(1).Find(what:="NCR Date", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_buyerName_Column = wsNCRreceivedLogs.Rows(1).Find(what:="Buyer Name", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_ncrStatus_Column = wsNCRreceivedLogs.Rows(1).Find(what:="Status ", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_buyerTitle_Column = wsNCRreceivedLogs.Rows(1).Find(what:="Buyer Title", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_buyerEmailid_Column = wsNCRreceivedLogs.Rows(1).Find(what:="Buyer Email ID", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_titleofcorrectiveaction_Column = wsNCRreceivedLogs.Rows(1).Find(what:="Title of Corrective Action", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_dueDate_Column = wsNCRreceivedLogs.Rows(1).Find(what:="Due date", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_owner_Column = wsNCRreceivedLogs.Rows(1).Find(what:="Owner", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_completionDate_Column = wsNCRreceivedLogs.Rows(1).Find(what:="Completion date", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_signoffby_Column = wsNCRreceivedLogs.Rows(1).Find(what:="Sign-Off By", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_signoffdate_Column = wsNCRreceivedLogs.Rows(1).Find(what:="Sign-off Date", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_completionstatus_Column = wsNCRreceivedLogs.Rows(1).Find(what:="Completion Status", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_ncrCategory_Column = wsNCRreceivedLogs.Rows(1).Find(what:="NCR Category", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_ncrSubCategory_Column = wsNCRreceivedLogs.Rows(1).Find(what:="NCR Sub Category", LookAt:=xlWhole, MatchCase:=False).Column
    wsNCRreceivedLogs_ncrDescription_Column = wsNCRreceivedLogs.Rows(1).Find(what:="NCR Description", LookAt:=xlWhole, MatchCase:=False).Column
End If

If Not wsJobCard Is Nothing Then
    wsJobCard_HeaderRow = 8
    wsJobCard_poNumber_Column = wsJobCard.Rows(wsJobCard_HeaderRow).Find(what:="PO #", LookAt:=xlWhole, MatchCase:=False).Column
    wsJobCard_boardName_Column = wsJobCard.Rows(wsJobCard_HeaderRow).Find(what:="Product Name", LookAt:=xlWhole, MatchCase:=False).Column
    wsJobCard_boardLetter_Column = wsJobCard.Rows(wsJobCard_HeaderRow).Find(what:="BL", LookAt:=xlWhole, MatchCase:=False).Column
    wsJobCard_Qty_Column = wsJobCard.Rows(wsJobCard_HeaderRow).Find(what:="Qty", LookAt:=xlWhole, MatchCase:=False).Column
    wsJobCard_bomName_Column = wsJobCard.Rows(wsJobCard_HeaderRow).Find(what:="BOM Name", LookAt:=xlWhole, MatchCase:=False).Column
    wsJobCard_gerberName_Column = wsJobCard.Rows(wsJobCard_HeaderRow).Find(what:="Gerber Name", LookAt:=xlWhole, MatchCase:=False).Column
    wsJobCard_stencilName_Column = wsJobCard.Rows(wsJobCard_HeaderRow).Find(what:="Stencil Name", LookAt:=xlWhole, MatchCase:=False).Column
    wsJobCard_mcodeSummary_Column = wsJobCard.Rows(wsJobCard_HeaderRow).Find(what:="MCODE Summary", LookAt:=xlWhole, MatchCase:=False).Column
End If

End Sub



