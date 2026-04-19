Attribute VB_Name = "initialiseHeaders_Module_V2"
Option Explicit
Public Customer As Long
Public PO_Date As Long
Public PO_Number As Long
Public Line As Long
Public QTE As Long
Public Order_Type As Long
Public Product_Name As Long
Public qty As Long
Public Delivery_Date_on_PO As Long
Public Unit_Price_in_PO As Long
Public Unit_Price_in_Quote As Long
Public Gross_Amount As Long
Public Pricing_Status As Long
Public Proc_Batch_Code As Long
Public Notes As Long
Public Date_Delivered As Long
Public Invoice_Date As Long
Public Invoice As Long
Public Payment_Date As Long
Public Order_Status As Long
Public Other_Notes As Long
Public BOM_Name As Long
Public Gerber_Name As Long
Public MCODES_Summary As Long
Public Stencil_Name As Long
Public cx_Terms As Long
Public Payment_DueDate As Long

''New Variables added
Public Year_Column As Long
Public MinDeliveryDate_Column As Long, MaxDeliveryDate_Column As Long
Public SubTotal_Column As Long, GST_Column As Long, QST_Column As Long
Public Quarter_Column As Long

''DM Variables
Public DM_ActiveQty_Column As Long
Public DM_GlobalMFRPackage_Column As Long
Public DM_BomName_Column As Long
Public DM_PCBName_Column As Long
Public DM_QTEwithRevisions_Column As Long
Public DM_MCODESSummary_Column As Long
Public DM_StencilName_Column As Long
Public DM_Customer_Column As Long
Public DM_LastOrderDate_Column As Long
Public DM_QTY1_Column As Long
Public DM_QTY2_Column As Long
Public DM_QTY3_Column As Long
Public DM_QTY4_Column As Long
Public DM_UnitPrice1_Column As Long
Public DM_UnitPrice2_Column As Long
Public DM_UnitPrice3_Column As Long
Public DM_UnitPrice4_Column As Long
Public DM_L1MinLeadTime_Column As Long
Public DM_L1MaxLeadTime_Column As Long
Public DM_L2MinLeadTime_Column As Long
Public DM_L2MaxLeadTime_Column As Long
Public DM_SNo_Column As Long
Public DM_BOMRev_Column As Long
Public DM_PCBRev_Column As Long
Public DM_NRE1_Column As Long, DM_NRE2_Column As Long, DM_NRE3_Column As Long, DM_NRE4_Column As Long
Public DM_LastQuoteDate_Column As Long
Public DM_Status_Column As Long
Public DM_Assembly1_Column As Long
Public DM_doubleside_Column As Long
Public DM_brdpnl_Column As Long
Public DM_GlobalQTE_Column As Long
Public DM_PCB1_Column As Long
Public DM_PCB2_Column As Long
Public DM_PCB3_Column As Long
Public DM_PCB4_Column As Long
Public DM_NRE1Status_Column As Long
Public DM_NRE2Status_Column As Long
Public DM_NRE3Status_Column As Long
Public DM_NRE4Status_Column As Long

    
Public Master_Quantity_Column As Long
Public Master_CPC_Column As Long
Public Master_MFR_Column As Long
Public Master_ManufacturerName_Column As Long
Public Master_Mcodes_Column As Long
Public Master_PNTOUSE_Column As Long
Public Master_UnitPrice_Column As Long
Public Master_QTYAvlble_Column As Long
Public Master_Distrib1_Column As Long
Public Master_DistributorPartnumber_Column As Long
Public Master_Notes_Column As Long
Public Master_Result_Column As Long
Public Master_XQuant_Column As Long
Public Master_EXTRA_Column As Long
Public Master_ORDERQTY_Column As Long
Public Master_LCSCPN_Column As Long
Public Master_RDesignation_Column As Long
Public Master_Description_Column As Long
Public Master_MFRHas_Column As Long
Public Master_SNO_Column As Long
Public Master_StockStatus_Column As Long
Public Master_Distrbutor2name_Column As Long
Public Master_Distrbutor2stock_Column As Long
Public Master_Distrbutor2price_Column As Long
Public Master_Distributor2leadtime_Column As Long
Public Master_SafetyStock_Column As Long
Public Master_StockatCustomer_Column As Long
Public Master_CustomerStockPrice_unitprice_Column As Long

Public Procsheet_CPC_Column As Long
Public Procsheet_MFR_Column As Long
Public Procsheet_ManufacturerName_Column As Long
Public Procsheet_Mcodes_Column As Long
Public Procsheet_PNTOUSE_Column As Long
Public Procsheet_UnitPrice_Column As Long
Public Procsheet_QTYAvlble_Column As Long
Public Procsheet_Distrib1_Column As Long
Public Procsheet_DistributorPartnumber_Column As Long
Public Procsheet_Notes_Column As Long
Public Procsheet_Result_Column As Long
Public Procsheet_XQuant_Column As Long
Public Procsheet_EXTRA_Column As Long
Public Procsheet_ORDERQTY_Column As Long
Public Procsheet_LCSCPN_Column As Long
Public Procsheet_RDesignation_Column As Long
Public Procsheet_Description_Column As Long
Public Procsheet_MFRHas_Column As Long
Public Procsheet_SNO_Column As Long
Public Procsheet_QTY_Column As Long
Public Procsheet_StockStatus_Column As Long
Public Procsheet_Unit_Price_Column As Long
Public Procsheet_ExtpriceUnits_Column As Long
Public Procsheet_Distrbutor2name_Column As Long
Public Procsheet_Distrbutor2stock_Column As Long
Public Procsheet_Distrbutor2price_Column As Long
Public Procsheet_Distributor2leadtime_Column As Long
Public Procsheet_SafetyStock_Column As Long
Public Procsheet_StockatCustomer_Column As Long
Public Procsheet_CustomerStockPrice_unitprice_Column As Long
Public Procsheet_CustomerRef_Column As Long
Public Procsheet_ShortenMFR_Column As Long
Public Procsheet_ShortenCPC_Column As Long
Public Procsheet_LCSCUnitPrice_Column As Long
Public Procsheet_LCSCExtPrice_Column As Long
Public Procsheet_ExtPrice_Column As Long
Public Procsheet_Placetobuy_Column As Long
Public Procsheet_OrderStatus_Column As Long
Public Procsheet_Quantity_Column As Long
Public Procsheet_DistPNComp_Column As Long
Public Procsheet_DistMPN_Column As Long
Public Procsheet_DistMFR_Column As Long
Public Procsheet_DistDescription_Column As Long
Public Procsheet_LCSCDescription_Column As Long
Public Procsheet_LCSCMPN_Column As Long
Public Procsheet_LCSCMFR_Column As Long
Public Procsheet_LCSCStock_Column As Long
Public Procsheet_PreferredDistExtPrice_Column As Long
Public Procsheet_BestPlacetoBuy_Column As Long

Public ComponentsOrders_ProcSheet_DISTRIBUTOR__Column As Long
Public ComponentsOrders_ProcSheet_SALESORDER_Column As Long
Public ComponentsOrders_ProcSheet_Invoice_Column As Long
Public ComponentsOrders_ProcSheet_Subtotal_Column As Long
Public ComponentsOrders_ProcSheet_GST_Column As Long
Public ComponentsOrders_ProcSheet_QST_Column As Long
Public ComponentsOrders_ProcSheet_Total_Column As Long
Public ComponentsOrders_ProcSheet_Notes_Column As Long
Public ComponentsOrders_ProcSheet_InvoiceDate_Column As Long
Public ComponentsOrders_ProcSheet_SenttoJobQueue_Column As Long
Public ComponentsOrders_ProcSheet_InvoiceDownloaded_Column As Long

Public PCB_ProcSheet_GMP__Column As Long
Public PCB_ProcSheet_PCBStencil__Column As Long
Public PCB_ProcSheet_Type__Column As Long
Public PCB_ProcSheet_Qty__Column As Long
Public PCB_ProcSheet_Letter__Column As Long
Public PCB_ProcSheet_DISTRIBUTOR__Column As Long
Public PCB_ProcSheet_RSPO__Column As Long
Public PCB_ProcSheet_Invoice_Column As Long
Public PCB_ProcSheet_Subtotal_Column As Long
Public PCB_ProcSheet_GST_Column As Long
Public PCB_ProcSheet_QST_Column As Long
Public PCB_ProcSheet_Total_Column As Long
Public PCB_ProcSheet_Notes_Column As Long
Public PCB_ProcSheet_InvoiceDate_Column As Long
Public PCB_ProcSheet_SenttoJobQueue_Column As Long
Public PCB_ProcSheet_InvoiceDownloaded_Column As Long
Public PCB_ProcSheet_OrderStatus_Column As Long
Public PCB_Procsheet_PCBname_Column As Long
Public PCB_Procsheet_StencilName_Column As Long

Public Jobqueue_InvoicesforComponents_Sheet_YearQuarter_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_PROCBATCHCODE__Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_DISTRIBUTOR__Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_SALESORDER_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_Invoice_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_Subtotal_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_GST_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_QST_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_Total_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_Notes_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_PrintStatus_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_PaymentStatus_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_InvoiceDownloaded_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_GMP_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_pcbStencil_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_Type_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_Qty_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_Subscription_Column As Long

Public Jobqueue_PCB_Sheet_PROCBATCHCODE__Column As Long
Public Jobqueue_PCB_Sheet_GMP_Column As Long
Public Jobqueue_PCB_Sheet_PCBStencil__Column As Long
Public Jobqueue_PCB_Sheet_Type__Column As Long
Public Jobqueue_PCB_Sheet_Qty__Column As Long
Public Jobqueue_PCB_Sheet_DISTRIBUTOR__Column As Long
Public Jobqueue_PCB_Sheet_RSPO__Column As Long
Public Jobqueue_PCB_Sheet_Invoice_Column As Long
Public Jobqueue_PCB_Sheet_Subtotal_Column As Long
Public Jobqueue_PCB_Sheet_GST_Column As Long
Public Jobqueue_PCB_Sheet_QST_Column As Long
Public Jobqueue_PCB_Sheet_Total_Column As Long
Public Jobqueue_PCB_Sheet_Notes_Column As Long
Public Jobqueue_PCB_Sheet_PrintStatus_Column As Long
Public Jobqueue_PCB_Sheet_InvoiceDate_Column As Long
Public Jobqueue_PCB_Sheet_PaymentStatus_Column As Long
Public Jobqueue_PCB_Sheet_InvoiceDownloaded_Column As Long


Public Jobqueue_Proclog_Sheet_PROCBATCHCODE__Column As Long
Public Jobqueue_Proclog_Sheet_ComponentsStatus__Column As Long
Public Jobqueue_Proclog_Sheet_PCBStatus_Column As Long
Public Jobqueue_Proclog_Sheet_Notes_Column As Long

Public Jobqueue_JobqueueSheet_ProductName As Long
Public Jobqueue_JobqueueSheet_GerberName As Long
Public Jobqueue_JobqueueSheet_StencilName As Long


Public ProcFile_Tracking_Sheet_Date__Column As Long
Public ProcFile_Tracking_Sheet_PROCBATCHCODE__Column As Long
Public ProcFile_Tracking_Sheet_Suppliers__Column As Long
Public ProcFile_Tracking_Sheet_SalesOrder__Column As Long
Public ProcFile_Tracking_Sheet_Orderstatus__Column As Long
Public ProcFile_Tracking_Sheet_TrackingID__Column As Long
Public ProcFile_Tracking_Sheet_CourierName__Column As Long
Public ProcFile_Tracking_Sheet_Laststatus__Column As Long
Public ProcFile_Tracking_Sheet_DeliveryDatestatus__Column As Long
Public ProcFile_Tracking_Sheet_EstimateDeliveryDate__Column As Long

Public ProcFileProcLinesSheet_Date__Column As Long
Public ProcFileProcLinesSheet_PROCBATCHCODE__Column As Long
Public ProcFileProcLinesSheet_CPC__Column As Long
Public ProcFileProcLinesSheet_MPN__Column As Long
Public ProcFileProcLinesSheet_MFR__Column As Long
Public ProcFileProcLinesSheet_QTY__Column As Long
Public ProcFileProcLinesSheet_PlaceBought__Column As Long
Public ProcFileProcLinesSheet_SalesOrder__Column As Long

Public Const DM_Header_Row As Byte = 5
Public Const DM_Mastersheet_Header_Row As Byte = 3
Public Const Procsheet_Header_Row As Byte = 4

Public Function initialiseHeaders(Optional inputWS As Worksheet, Optional JOB_QUEUE As Worksheet, Optional Mastersheet_DM As Worksheet, Optional ProcSheet As Worksheet, Optional ComponentsOrders_ProcSheet As Worksheet, Optional Jobqueue_InvoicesforComponents_Sheet As Worksheet, Optional PCB_ProcSheet As Worksheet, Optional Jobqueue_PCB_Sheet As Worksheet, Optional Jobqueue_Proclog_Sheet As Worksheet, Optional jobQueue_JobQueueSheet As Worksheet, Optional ProcFile_Tracking_Sheet As Worksheet, Optional ProcFileProcLinesSheet As Worksheet) As String

Dim Findrng As Range

If Not Mastersheet_DM Is Nothing Then
    Master_Quantity_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Quantity", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_CPC_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="CPC", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_Description_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Description", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_MFRHas_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="MFR#", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_ManufacturerName_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Manufacturer Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_Mcodes_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="M codes", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_MFR_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="MFR", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_PNTOUSE_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="PN# TO USE", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_UnitPrice_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Unit Price", LookIn:=xlFormulas, LookAt:=xlWhole).Column
    Master_QTYAvlble_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="QTY Avlble", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_Distrib1_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Distrib 1", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_DistributorPartnumber_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Distributor Part number", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_Notes_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_Result_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Result", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_XQuant_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="X Quant", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_EXTRA_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="EXTRA", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_ORDERQTY_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="ORDER QTY", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_LCSCPN_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="LCSC PN", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_RDesignation_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="R. Designation", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_SNO_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="S.No", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_StockStatus_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Stock Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_Distrbutor2name_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Distrbutor 2 name", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_Distrbutor2stock_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Distrbutor 2 stock", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_Distrbutor2price_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Distrbutor 2 price", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_Distributor2leadtime_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Distributor 2 lead time", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_SafetyStock_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Safety Stock", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_StockatCustomer_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Stock at Customer", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_CustomerStockPrice_unitprice_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Customer Stock Price (unit price)", LookIn:=xlValues, LookAt:=xlWhole).Column

End If

If Not ProcSheet Is Nothing Then
    Procsheet_CPC_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="CPC", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_Description_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Description", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_MFRHas_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="MFR#", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_ManufacturerName_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Manufacturer Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_Mcodes_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="M codes", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_MFR_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="MFR", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_PNTOUSE_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="PN# TO USE", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_UnitPrice_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Unit Price", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_Unit_Price_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Unit_Price", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_QTYAvlble_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="QTY Available", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_Distrib1_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Distrib 1", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_DistributorPartnumber_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Distributor PN", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_Notes_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_Result_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Result", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_XQuant_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="X Quant", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_EXTRA_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="EXTRA", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_ORDERQTY_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="ORDER QTY", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_LCSCPN_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="LCSC PN", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_RDesignation_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="R. Designation", LookIn:=xlValues, LookAt:=xlWhole).Column
    'Procsheet_SNO_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="S.No", LookIn:=xlValues, LookAt:=xlWhole).Column
    'Procsheet_QTY_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Quantity", LookIn:=xlValues, LookAt:=xlWhole).Column
    'Procsheet_StockStatus_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Stock Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    'Procsheet_ExtpriceUnits_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Ext price Units", LookIn:=xlValues, LookAt:=xlWhole).Column
    'Procsheet_Distrbutor2name_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Distrbutor 2 name", LookIn:=xlValues, LookAt:=xlWhole).Column
    'Procsheet_Distrbutor2stock_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Distrbutor 2 stock", LookIn:=xlValues, LookAt:=xlWhole).Column
    'Procsheet_Distrbutor2price_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Distrbutor 2 price", LookIn:=xlValues, LookAt:=xlWhole).Column
    'Procsheet_Distributor2leadtime_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Distributor 2 lead time", LookIn:=xlValues, LookAt:=xlWhole).Column
    'Procsheet_SafetyStock_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Safety Stock", LookIn:=xlValues, LookAt:=xlWhole).Column
    'Procsheet_StockatCustomer_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Stock at Customer", LookIn:=xlValues, LookAt:=xlWhole).Column
    'Procsheet_CustomerStockPrice_unitprice_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Customer Stock Price (unit price)", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_CustomerRef_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Customer Ref", LookIn:=xlValues, LookAt:=xlWhole).Column
    'Procsheet_ShortenMFR_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Shorten MFR", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_ShortenCPC_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Shorten CPC", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_LCSCUnitPrice_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="LCSC Unit Price", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_LCSCExtPrice_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="LCSC Ext Price", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_ExtPrice_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Ext Price", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_Placetobuy_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Place to buy", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_OrderStatus_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Order Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_Quantity_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Quantity", LookIn:=xlValues, LookAt:=xlWhole).Column
    'Procsheet_LCSCDescription_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="LCSC Description", LookIn:=xlValues, LookAt:=xlWhole).Column
    'Procsheet_LCSCMPN_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="LCSC MPN", LookIn:=xlValues, LookAt:=xlWhole).Column
    'Procsheet_LCSCMFR_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="LCSC MFR", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_LCSCStock_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="LCSC Stock", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_PreferredDistExtPrice_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Preferred Dist Ext Price", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_BestPlacetoBuy_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Best Place to Buy", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_DistPNComp_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Dist PN of Comp", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not inputWS Is Nothing Then

    ''DM DataInputSheets
    DM_ActiveQty_Column = inputWS.Rows(DM_Header_Row).Find(What:="Active Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_GlobalMFRPackage_Column = inputWS.Rows(DM_Header_Row).Find(What:="Global MFR Package", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_BomName_Column = inputWS.Rows(DM_Header_Row).Find(What:="Bom Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_PCBName_Column = inputWS.Rows(DM_Header_Row).Find(What:="PCB Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_QTEwithRevisions_Column = inputWS.Rows(DM_Header_Row).Find(What:="QTE# (with Revisions)", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_MCODESSummary_Column = inputWS.Rows(DM_Header_Row).Find(What:="MCODES Summary", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_StencilName_Column = inputWS.Rows(DM_Header_Row).Find(What:="Stencil Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_Customer_Column = inputWS.Rows(DM_Header_Row).Find(What:="Customer", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_LastOrderDate_Column = inputWS.Rows(DM_Header_Row).Find(What:="Last Order Date", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_QTY1_Column = inputWS.Rows(DM_Header_Row).Find(What:="QTY #1", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_QTY2_Column = inputWS.Rows(DM_Header_Row).Find(What:="QTY #2", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_QTY3_Column = inputWS.Rows(DM_Header_Row).Find(What:="QTY #3", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_QTY4_Column = inputWS.Rows(DM_Header_Row).Find(What:="QTY #4", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_UnitPrice1_Column = inputWS.Rows(DM_Header_Row).Find(What:="Unit Price1", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_UnitPrice2_Column = inputWS.Rows(DM_Header_Row).Find(What:="Unit Price2", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_UnitPrice3_Column = inputWS.Rows(DM_Header_Row).Find(What:="Unit Price3", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_UnitPrice4_Column = inputWS.Rows(DM_Header_Row).Find(What:="Unit Price4", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_L1MinLeadTime_Column = inputWS.Rows(DM_Header_Row).Find(What:="Min Lead Time L1", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_L1MaxLeadTime_Column = inputWS.Rows(DM_Header_Row).Find(What:="Max Lead Time L1", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_L2MinLeadTime_Column = inputWS.Rows(DM_Header_Row).Find(What:="Min Lead Time L2", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_L2MaxLeadTime_Column = inputWS.Rows(DM_Header_Row).Find(What:="Max Lead Time L2", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_SNo_Column = inputWS.Rows(DM_Header_Row).Find(What:="S.No", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_BOMRev_Column = inputWS.Rows(DM_Header_Row).Find(What:="Rev (Bom)", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_PCBRev_Column = inputWS.Rows(DM_Header_Row).Find(What:="Rev (PCB)", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_NRE1_Column = inputWS.Rows(DM_Header_Row).Find(What:="NRE 1", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_NRE2_Column = inputWS.Rows(DM_Header_Row).Find(What:="NRE 2", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_NRE3_Column = inputWS.Rows(DM_Header_Row).Find(What:="NRE 3", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_NRE4_Column = inputWS.Rows(DM_Header_Row).Find(What:="NRE 4", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_LastQuoteDate_Column = inputWS.Rows(DM_Header_Row).Find(What:="Last Quote Date", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_Status_Column = inputWS.Rows(DM_Header_Row).Find(What:="Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_Assembly1_Column = inputWS.Rows(DM_Header_Row).Find(What:="Assembly", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_doubleside_Column = inputWS.Rows(DM_Header_Row).Find(What:="double side (1 if yes)", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_brdpnl_Column = inputWS.Rows(DM_Header_Row).Find(What:="#brd/pnl(put 1 if 1)", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_GlobalQTE_Column = inputWS.Rows(DM_Header_Row).Find(What:="Global QTE#", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_PCB1_Column = inputWS.Rows(DM_Header_Row).Find(What:="PCB 1", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_PCB2_Column = inputWS.Rows(DM_Header_Row).Find(What:="PCB 2", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_PCB3_Column = inputWS.Rows(DM_Header_Row).Find(What:="PCB 3", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_PCB4_Column = inputWS.Rows(DM_Header_Row).Find(What:="PCB 4", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_NRE1Status_Column = inputWS.Rows(DM_Header_Row).Find(What:="NRE 1 Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_NRE2Status_Column = inputWS.Rows(DM_Header_Row).Find(What:="NRE 2 Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_NRE3Status_Column = inputWS.Rows(DM_Header_Row).Find(What:="NRE 3 Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_NRE4Status_Column = inputWS.Rows(DM_Header_Row).Find(What:="NRE 4 Status", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not JOB_QUEUE Is Nothing Then

    ''Mandatory column
    
    Customer = JOB_QUEUE.Rows(3).Find(What:="Customer", LookIn:=xlValues, LookAt:=xlWhole).Column
    PO_Date = JOB_QUEUE.Rows(3).Find(What:="PO Date", LookIn:=xlValues, LookAt:=xlWhole).Column
    PO_Number = JOB_QUEUE.Rows(3).Find(What:="PO Number", LookIn:=xlValues, LookAt:=xlWhole).Column
    Line = JOB_QUEUE.Rows(3).Find(What:="Line #", LookIn:=xlValues, LookAt:=xlWhole).Column
    QTE = JOB_QUEUE.Rows(3).Find(What:="QTE #", LookIn:=xlValues, LookAt:=xlWhole).Column
    Order_Type = JOB_QUEUE.Rows(3).Find(What:="Order Type", LookIn:=xlValues, LookAt:=xlWhole).Column
    Product_Name = JOB_QUEUE.Rows(3).Find(What:="Product Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    qty = JOB_QUEUE.Rows(3).Find(What:="PO Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
    Unit_Price_in_PO = JOB_QUEUE.Rows(3).Find(What:="Unit Price in PO", LookIn:=xlValues, LookAt:=xlWhole).Column
    Unit_Price_in_Quote = JOB_QUEUE.Rows(3).Find(What:="Unit Price in Quote", LookIn:=xlValues, LookAt:=xlWhole).Column
    Gross_Amount = JOB_QUEUE.Rows(3).Find(What:="Gross Amount", LookIn:=xlValues, LookAt:=xlWhole).Column
    Pricing_Status = JOB_QUEUE.Rows(3).Find(What:="Pricing Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    Proc_Batch_Code = JOB_QUEUE.Rows(3).Find(What:="Proc Batch Code", LookIn:=xlValues, LookAt:=xlWhole).Column
    Notes = JOB_QUEUE.Rows(3).Find(What:="Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
    Date_Delivered = JOB_QUEUE.Rows(3).Find(What:="Date Delivered", LookIn:=xlValues, LookAt:=xlWhole).Column
    Invoice_Date = JOB_QUEUE.Rows(3).Find(What:="Invoice Date", LookIn:=xlValues, LookAt:=xlWhole).Column
    Invoice = JOB_QUEUE.Rows(3).Find(What:="Invoice #", LookIn:=xlValues, LookAt:=xlWhole).Column
    Payment_Date = JOB_QUEUE.Rows(3).Find(What:="Payment Date", LookIn:=xlValues, LookAt:=xlWhole).Column
    Order_Status = JOB_QUEUE.Rows(3).Find(What:="Order Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    Other_Notes = JOB_QUEUE.Rows(3).Find(What:="Other Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
    BOM_Name = JOB_QUEUE.Rows(3).Find(What:="BOM Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    Gerber_Name = JOB_QUEUE.Rows(3).Find(What:="Gerber Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    
    ''Updated
    ''Any of below result = 0 means not found in file , Treat as NON-Mandatory column
    
    Set Findrng = JOB_QUEUE.Rows(3).Find(What:="Delivery Date on PO", LookIn:=xlValues, LookAt:=xlWhole)
    If Not Findrng Is Nothing Then
      Delivery_Date_on_PO = Findrng.Column
    Else
      Delivery_Date_on_PO = 0
    End If
    
    MCODES_Summary = JOB_QUEUE.Rows(3).Find(What:="MCODES Summary", LookIn:=xlValues, LookAt:=xlWhole).Column
    Stencil_Name = JOB_QUEUE.Rows(3).Find(What:="Stencil Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    cx_Terms = JOB_QUEUE.Rows(3).Find(What:="CX Terms", LookIn:=xlValues, LookAt:=xlWhole).Column
    Payment_DueDate = JOB_QUEUE.Rows(3).Find(What:="Payment Due Date", LookIn:=xlValues, LookAt:=xlWhole).Column
    
    ''Updated new added
    Year_Column = JOB_QUEUE.Rows(3).Find(What:="Year", LookIn:=xlValues, LookAt:=xlWhole).Column
    MaxDeliveryDate_Column = JOB_QUEUE.Rows(3).Find(What:="Max Delivery Date", LookIn:=xlValues, LookAt:=xlWhole).Column
    MinDeliveryDate_Column = JOB_QUEUE.Rows(3).Find(What:="Min Delivery Date", LookIn:=xlValues, LookAt:=xlWhole).Column
    Quarter_Column = JOB_QUEUE.Rows(3).Find(What:="Quarter", LookIn:=xlValues, LookAt:=xlWhole).Column
    
    Set Findrng = JOB_QUEUE.Rows(3).Find(What:="Sub Total", LookIn:=xlValues, LookAt:=xlWhole)
    If Not Findrng Is Nothing Then
      SubTotal_Column = Findrng.Column
    Else
      SubTotal_Column = 0
    End If
    
    Set Findrng = JOB_QUEUE.Rows(3).Find(What:="GST", LookIn:=xlValues, LookAt:=xlWhole)
    If Not Findrng Is Nothing Then
      GST_Column = Findrng.Column
    Else
      GST_Column = 0
    End If
    
    Set Findrng = JOB_QUEUE.Rows(3).Find(What:="QST", LookIn:=xlValues, LookAt:=xlWhole)
    If Not Findrng Is Nothing Then
      QST_Column = Findrng.Column
    Else
      QST_Column = 0
    End If

End If

If Not ComponentsOrders_ProcSheet Is Nothing Then
  ComponentsOrders_ProcSheet_DISTRIBUTOR__Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="DISTRIBUTOR", LookIn:=xlValues, LookAt:=xlWhole).Column
  ComponentsOrders_ProcSheet_SALESORDER_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="SALESORDER/P.O", LookIn:=xlValues, LookAt:=xlWhole).Column
  'ComponentsOrders_ProcSheet_Invoice_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Invoice #", LookIn:=xlValues, LookAt:=xlWhole).Column
  'ComponentsOrders_ProcSheet_Subtotal_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Subtotal", LookIn:=xlValues, LookAt:=xlWhole).Column
  'ComponentsOrders_ProcSheet_GST_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="GST", LookIn:=xlValues, LookAt:=xlWhole).Column
  'ComponentsOrders_ProcSheet_QST_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="QST", LookIn:=xlValues, LookAt:=xlWhole).Column
  'ComponentsOrders_ProcSheet_Total_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Total", LookIn:=xlValues, LookAt:=xlWhole).Column
  ComponentsOrders_ProcSheet_Notes_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Notes (if any)", LookIn:=xlValues, LookAt:=xlWhole).Column
  ComponentsOrders_ProcSheet_SenttoJobQueue_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Sent to Job Queue", LookIn:=xlValues, LookAt:=xlWhole).Column
  'ComponentsOrders_ProcSheet_InvoiceDownloaded_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Invoice Downloaded", LookIn:=xlValues, LookAt:=xlWhole).Column
  'ComponentsOrders_ProcSheet_InvoiceDate_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Invoice Date", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not PCB_ProcSheet Is Nothing Then
  PCB_ProcSheet_GMP__Column = PCB_ProcSheet.Rows(1).Find(What:="GMP", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_PCBStencil__Column = PCB_ProcSheet.Rows(1).Find(What:="PCB Name", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_Type__Column = PCB_ProcSheet.Rows(1).Find(What:="Type", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_Qty__Column = PCB_ProcSheet.Rows(1).Find(What:="Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_Letter__Column = PCB_ProcSheet.Rows(1).Find(What:="Letter", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_DISTRIBUTOR__Column = PCB_ProcSheet.Rows(1).Find(What:="DISTRIBUTOR", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_RSPO__Column = PCB_ProcSheet.Rows(1).Find(What:="SALESORDER/P.O", LookIn:=xlValues, LookAt:=xlWhole).Column
  'PCB_ProcSheet_Invoice_Column = PCB_ProcSheet.Rows(1).Find(What:="Invoice #", LookIn:=xlValues, LookAt:=xlWhole).Column
  'PCB_ProcSheet_Subtotal_Column = PCB_ProcSheet.Rows(1).Find(What:="Subtotal", LookIn:=xlValues, LookAt:=xlWhole).Column
  'PCB_ProcSheet_GST_Column = PCB_ProcSheet.Rows(1).Find(What:="GST", LookIn:=xlValues, LookAt:=xlWhole).Column
  'PCB_ProcSheet_QST_Column = PCB_ProcSheet.Rows(1).Find(What:="QST", LookIn:=xlValues, LookAt:=xlWhole).Column
  'PCB_ProcSheet_Total_Column = PCB_ProcSheet.Rows(1).Find(What:="Total", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_Notes_Column = PCB_ProcSheet.Rows(1).Find(What:="Notes (if any)", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_SenttoJobQueue_Column = PCB_ProcSheet.Rows(1).Find(What:="Sent to Job Queue", LookIn:=xlValues, LookAt:=xlWhole).Column
  'PCB_ProcSheet_InvoiceDownloaded_Column = PCB_ProcSheet.Rows(1).Find(What:="Invoice Downloaded", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_OrderStatus_Column = PCB_ProcSheet.Rows(1).Find(What:="Order Status", LookIn:=xlValues, LookAt:=xlWhole).Column
  'PCB_ProcSheet_InvoiceDate_Column = PCB_ProcSheet.Rows(1).Find(What:="Invoice Date", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_Procsheet_PCBname_Column = PCB_ProcSheet.Rows(1).Find(What:="PCB Name", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_Procsheet_StencilName_Column = PCB_ProcSheet.Rows(1).Find(What:="Stencil #", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not Jobqueue_InvoicesforComponents_Sheet Is Nothing Then
  Jobqueue_InvoicesforComponents_Sheet_YearQuarter_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Year/Quarter", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_PROCBATCHCODE__Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="PROC BATCH CODE", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_DISTRIBUTOR__Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="DISTRIBUTOR", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_SALESORDER_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="SALESORDER/P.O", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_Invoice_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Invoice #", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_Subtotal_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Subtotal", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_GST_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="GST", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_QST_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="QST", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_Total_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Total", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_Notes_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Notes (if any)", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_PrintStatus_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Print Status", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Invoice Date", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_PaymentStatus_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Payment Status", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_InvoiceDownloaded_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Invoice Downloaded", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_GMP_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="GMP", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_pcbStencil_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="PCB/Stencil #", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_Type_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Type", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_Qty_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_Subscription_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Subscription", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not Jobqueue_PCB_Sheet Is Nothing Then
  Jobqueue_PCB_Sheet_PROCBATCHCODE__Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="PROC BATCH CODE", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_GMP_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="GMP", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_PCBStencil__Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="PCB/Stencil #", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_Type__Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Type", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_Qty__Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_DISTRIBUTOR__Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="DISTRIBUTOR", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_RSPO__Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="SALESORDER/P.O", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_Invoice_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Invoice #", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_Subtotal_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Subtotal", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_GST_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="GST", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_QST_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="QST", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_Total_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Total", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_Notes_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Notes (if any)", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_PrintStatus_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Print Status", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_InvoiceDate_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Invoice Date", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_PaymentStatus_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Payment Status", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_InvoiceDownloaded_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Invoice Downloaded", LookIn:=xlValues, LookAt:=xlWhole).Column

End If

If Not Jobqueue_Proclog_Sheet Is Nothing Then
  Jobqueue_Proclog_Sheet_PROCBATCHCODE__Column = Jobqueue_Proclog_Sheet.Rows(1).Find(What:="PROC BATCH CODE", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_Proclog_Sheet_ComponentsStatus__Column = Jobqueue_Proclog_Sheet.Rows(1).Find(What:="Components Status", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_Proclog_Sheet_PCBStatus_Column = Jobqueue_Proclog_Sheet.Rows(1).Find(What:="PCB/Stencil Status", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_Proclog_Sheet_Notes_Column = Jobqueue_Proclog_Sheet.Rows(1).Find(What:="Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
End If


If Not jobQueue_JobQueueSheet Is Nothing Then
    Jobqueue_JobqueueSheet_ProductName = jobQueue_JobQueueSheet.Rows(3).Find(What:="Product Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    Jobqueue_JobqueueSheet_GerberName = jobQueue_JobQueueSheet.Rows(3).Find(What:="Gerber Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    Jobqueue_JobqueueSheet_StencilName = jobQueue_JobQueueSheet.Rows(3).Find(What:="Stencil Name", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not ProcFile_Tracking_Sheet Is Nothing Then
  ProcFile_Tracking_Sheet_Date__Column = ProcFile_Tracking_Sheet.Rows(2).Find(What:="Order Date", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFile_Tracking_Sheet_PROCBATCHCODE__Column = ProcFile_Tracking_Sheet.Rows(2).Find(What:="PROC BATCH CODE", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFile_Tracking_Sheet_Suppliers__Column = ProcFile_Tracking_Sheet.Rows(2).Find(What:="Distributor Name", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFile_Tracking_Sheet_SalesOrder__Column = ProcFile_Tracking_Sheet.Rows(2).Find(What:="Sales Order", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFile_Tracking_Sheet_Orderstatus__Column = ProcFile_Tracking_Sheet.Rows(2).Find(What:="Shipment Status", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFile_Tracking_Sheet_TrackingID__Column = ProcFile_Tracking_Sheet.Rows(2).Find(What:="Tracking ID", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFile_Tracking_Sheet_CourierName__Column = ProcFile_Tracking_Sheet.Rows(2).Find(What:="Courier Name", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFile_Tracking_Sheet_Laststatus__Column = ProcFile_Tracking_Sheet.Rows(2).Find(What:="Last status", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFile_Tracking_Sheet_DeliveryDatestatus__Column = ProcFile_Tracking_Sheet.Rows(2).Find(What:="Delivery Date", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFile_Tracking_Sheet_EstimateDeliveryDate__Column = ProcFile_Tracking_Sheet.Rows(2).Find(What:="Delivery Date", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not ProcFileProcLinesSheet Is Nothing Then
  ProcFileProcLinesSheet_Date__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="Entry Date", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_PROCBATCHCODE__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="PROC BATCH CODE", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_CPC__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="CPC", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_MPN__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="MPN", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_MFR__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="MFR", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_QTY__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="QTY", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_PlaceBought__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="Place Bought", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_SalesOrder__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="Sales Order", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

Set Findrng = Nothing
End Function




