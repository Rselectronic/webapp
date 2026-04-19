Attribute VB_Name = "initialiseHeaders_Module"
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

Public Procsheet_QtyPerBoard_Column As Long
Public Procsheet_CPC_Column As Long
Public Procsheet_ShortenCPC_Column As Long
Public Procsheet_CustomerDescription_Column As Long
Public Procsheet_CustomerMPN_Column As Long
Public Procsheet_CustomerMFR_Column As Long
Public Procsheet_Mcodes_Column As Long
Public Procsheet_MFRtoUse_Column As Long
Public Procsheet_PNTOUSE_Column As Long
Public Procsheet_DistName_Column As Long
Public Procsheet_DistPN_Column As Long
Public Procsheet_DistStock_Column As Long
Public Procsheet_DistUnitPrice_Column As Long
Public Procsheet_Notes_Column As Long
Public Procsheet_BoardName_Column As Long
Public Procsheet_XQty_Column As Long
Public Procsheet_EXTRA_Column As Long
Public Procsheet_ORDERQTY_Column As Long
Public Procsheet_OrderQtyUnitPrice_Column As Long
Public Procsheet_OrderQtyExtPrice_Column As Long
Public Procsheet_Placetobuy_Column As Long
Public Procsheet_SalesOrderNo_Column As Long
Public Procsheet_ExtPriceAfterOrder_Column As Long
Public Procsheet_BGorSS_Column As Long
Public Procsheet_StockAtRS_Column As Long
Public ProcSheet_BGstockAddedToProcurement_Column As Long
Public Procsheet_LCSCPN_Column As Long
Public Procsheet_LCSCstock_Column As Long
Public Procsheet_LCSCUnitPrice_Column As Long
Public Procsheet_LCSCExtPrice_Column As Long
Public Procsheet_RDesignation_Column As Long
Public Procsheet_CustomerRef_Column As Long
Public Procsheet_OrderStatus_Column As Long
Public Procsheet_BestPlacetoBuy_Column As Long
Public Procsheet_PreferredDistExtPrice_Column As Long
Public Procsheet_ProcurementUpdateStatus_Column As Long
Public Procsheet_PackagingType_Column As Long
Public Procsheet_OrderNotes_Column As Long

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
Public PCB_Procsheet_BOMname_Column As Long
Public PCB_Procsheet_OrderDate_Column As Long


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

Public ProcLogSheet_PROCBATCHCODE__Column As Long
Public ProcLogSheet_ComponentsStatus__Column As Long
Public ProcLogSheet_PCBStatus_Column As Long
Public ProcLogSheet_Notes_Column As Long
Public ProcLogSheet_BoardName_Column As Long

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

Public ProcFileProcLinesSheet_Date__Column As Long
Public ProcFileProcLinesSheet_PROCBATCHCODE__Column As Long
Public ProcFileProcLinesSheet_CPC__Column As Long
Public ProcFileProcLinesSheet_MPN__Column As Long
Public ProcFileProcLinesSheet_MFR__Column As Long
Public ProcFileProcLinesSheet_QTY__Column As Long
Public ProcFileProcLinesSheet_PlaceBought__Column As Long
Public ProcFileProcLinesSheet_SalesOrder__Column As Long
Public ProcFileProcLinesSheet_ExtPrice__Column As Long
Public ProcFileProcLinesSheet_UnitPrice__Column As Long
Public ProcFileProcLinesSheet_CustomerRef__Column As Long
Public ProcFileProcLinesSheet_Mcode_Column As Long
Public ProcFileProcLinesSheet_BoardName_Column As Long

Public DM_ProcurementWS_CPC_Column As Long
Public DM_ProcurementWS_stockAtRS_Column As Long
Public DM_ProcurementWS_FeederType_Column As Long
Public DM_ProcurementWS_DistPN_Column As Long
Public DM_ProcurementWS_DistName_Column As Long
Public DM_ProcurementWS_lcscPN_Column As Long
Public DM_ProcurementWS_PNtoUse_Column As Long

Public DM_ProcurementLogWS_LogTime_Column As Long
Public DM_ProcurementLogWS_cpc_Column As Long
Public DM_ProcurementLogWS_ProcBatchCode_Column As Long
Public DM_ProcurementLogWS_PNtoUse_Column As Long
Public DM_ProcurementLogWS_DistributorPN_Column As Long
Public DM_ProcurementLogWS_DistributorName_Column As Long
Public DM_ProcurementLogWS_LCSCpn_Column As Long
Public DM_ProcurementLogWS_Notes_Column As Long
Public DM_ProcurementLogWS_EntryFrom_Column

Public BGstockHistory_wsBGstockLog_Date_Column As Long
Public BGstockHistory_wsBGstockLog_ProcBatchCode_Column As Long
Public BGstockHistory_wsBGstockLog_CPC_Column As Long
Public BGstockHistory_wsBGstockLog_BGorSS_Column As Long
Public BGstockHistory_wsBGstockLog_EntryType_Column As Long
Public BGstockHistory_wsBGstockLog_Qty_Column As Long
Public BGstockHistory_wsBGstockLog_CumulativeStockLevel_Column As Long
Public BGstockHistory_wsBGstockLog_PlaceBought_Column As Long
Public BGstockHistory_wsBGstockLog_Notes_Column As Long
Public BGstockHistory_wsBGstockLog_EntryFrom_Column As Long
Public BGstockHistory_wsBGstockLog_SerialNumber_Column As Long
Public BGstockHistory_wsBGstockLog_AmountSpent_Column As Long

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
Public wsprodSch_PackagingType_Column As Long

''Update Anil 11/02/2025 Supplier Sheet Job queue
Public jobQueue_SupplierSheet_SupplierName As Long
Public jobQueue_SupplierSheet_CompanyFullName As Long
Public jobQueue_SupplierSheet_StreetAddress As Long
Public jobQueue_SupplierSheet_City As Long
Public jobQueue_SupplierSheet_ProvinceState As Long
Public jobQueue_SupplierSheet_PostalCode As Long
Public jobQueue_SupplierSheet_Country As Long
Public jobQueue_SupplierSheet_EmailID As Long
Public jobQueue_SupplierSheet_ContactNo As Long
Public jobQueue_SupplierSheet_PaymentTerms As Long
''''----

Public Const DM_Header_Row As Byte = 5
Public Const DM_Mastersheet_Header_Row As Byte = 3
Public Const Procsheet_Header_Row As Byte = 4

Public Function initialiseHeaders(Optional inputWS As Worksheet, Optional JOB_QUEUE As Worksheet, Optional Mastersheet_DM As Worksheet, _
                                    Optional ProcSheet As Worksheet, Optional ComponentsOrders_ProcSheet As Worksheet, _
                                    Optional Jobqueue_InvoicesforComponents_Sheet As Worksheet, Optional PCB_ProcSheet As Worksheet, _
                                    Optional Jobqueue_PCB_Sheet As Worksheet, Optional ProcLogSheet As Worksheet, _
                                    Optional jobQueue_JobQueueSheet As Worksheet, Optional ProcFile_Tracking_Sheet As Worksheet, _
                                    Optional ProcFileProcLinesSheet As Worksheet, Optional DM_ProcurementWS As Worksheet, _
                                    Optional BGstockHistory_wsBGstockLog As Worksheet, Optional DM_ProcurementLogWS As Worksheet, _
                                    Optional wsProductionSchedule As Worksheet, Optional jobQueue_SupplierSheet As Worksheet) As String
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
    Procsheet_QtyPerBoard_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Qty Per Board", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_CPC_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="CPC", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_ShortenCPC_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Shorten CPC", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_CustomerDescription_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Customer Description", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_CustomerMPN_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Customer MPN", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_CustomerMFR_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Customer MFR", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_Mcodes_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="M Codes", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_MFRtoUse_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="MFR to Use", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_PNTOUSE_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="PN# TO USE", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_DistName_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Distributor Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_DistPN_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Distributor PN", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_DistStock_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Distributor Stock", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_DistUnitPrice_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Distributor Unit Price", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_Notes_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_BoardName_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Board Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_XQty_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="X Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_EXTRA_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Extra", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_ORDERQTY_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Order Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_OrderQtyUnitPrice_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Order Qty Unit Price", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_OrderQtyExtPrice_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Order Qty Ext Price", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_Placetobuy_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Place to Buy", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_SalesOrderNo_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Sales Order #", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_ExtPriceAfterOrder_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Ext Price After Order", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_BGorSS_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="BG or SS?", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_StockAtRS_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Stock at RS", LookIn:=xlValues, LookAt:=xlWhole).Column
    ProcSheet_BGstockAddedToProcurement_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="BG Stock Added to Procurement", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_LCSCPN_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="LCSC PN", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_LCSCstock_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="LCSC Stock", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_LCSCUnitPrice_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="LCSC Unit Price", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_LCSCExtPrice_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="LCSC Ext Price", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_RDesignation_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="R. Designation", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_CustomerRef_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Customer Ref", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_OrderStatus_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Order Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_BestPlacetoBuy_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Best Place to Buy", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_PreferredDistExtPrice_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Preferred Dist Ext Price", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_ProcurementUpdateStatus_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Procurement Update Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_PackagingType_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Packaging Type", LookIn:=xlValues, LookAt:=xlWhole).Column
    Procsheet_OrderNotes_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="Order Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
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
  ComponentsOrders_ProcSheet_DISTRIBUTOR__Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Distributor Name", LookIn:=xlValues, LookAt:=xlWhole).Column
  ComponentsOrders_ProcSheet_SALESORDER_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Sales Order # / PO", LookIn:=xlValues, LookAt:=xlWhole).Column
  ComponentsOrders_ProcSheet_Notes_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Order Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
  ComponentsOrders_ProcSheet_SenttoJobQueue_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Sent to Job Queue for Invoice Collection", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not PCB_ProcSheet Is Nothing Then
  PCB_ProcSheet_GMP__Column = PCB_ProcSheet.Rows(1).Find(What:="GMP Name", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_PCBStencil__Column = PCB_ProcSheet.Rows(1).Find(What:="Stencil #", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_Type__Column = PCB_ProcSheet.Rows(1).Find(What:="Type", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_Qty__Column = PCB_ProcSheet.Rows(1).Find(What:="Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_Letter__Column = PCB_ProcSheet.Rows(1).Find(What:="Board Letter", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_DISTRIBUTOR__Column = PCB_ProcSheet.Rows(1).Find(What:="Distributor Name", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_RSPO__Column = PCB_ProcSheet.Rows(1).Find(What:="Sales Order #", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_Notes_Column = PCB_ProcSheet.Rows(1).Find(What:="Order Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_SenttoJobQueue_Column = PCB_ProcSheet.Rows(1).Find(What:="Sent to Job Queue for Invoice Collection", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_OrderStatus_Column = PCB_ProcSheet.Rows(1).Find(What:="Order Status", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_Procsheet_PCBname_Column = PCB_ProcSheet.Rows(1).Find(What:="Gerber Name", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_Procsheet_BOMname_Column = PCB_ProcSheet.Rows(1).Find(What:="BOM Name", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_Procsheet_OrderDate_Column = PCB_ProcSheet.Rows(1).Find(What:="Order Date", LookIn:=xlValues, LookAt:=xlWhole).Column
  
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

If Not ProcLogSheet Is Nothing Then
  ProcLogSheet_PROCBATCHCODE__Column = ProcLogSheet.Rows(1).Find(What:="PROC BATCH CODE", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcLogSheet_BoardName_Column = ProcLogSheet.Rows(1).Find(What:="Board Name", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcLogSheet_ComponentsStatus__Column = ProcLogSheet.Rows(1).Find(What:="Components Status", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcLogSheet_PCBStatus_Column = ProcLogSheet.Rows(1).Find(What:="PCB/Stencil Status", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcLogSheet_Notes_Column = ProcLogSheet.Rows(1).Find(What:="Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
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
End If

If Not ProcFileProcLinesSheet Is Nothing Then
  ProcFileProcLinesSheet_Date__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="Entry Date", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_PROCBATCHCODE__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="PROC BATCH CODE", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_CPC__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="CPC", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_MPN__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="Customer MPN", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_MFR__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="Customer MFR", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_QTY__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="QTY", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_PlaceBought__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="Place Bought", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_SalesOrder__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="Sales Order", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_ExtPrice__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="Ext Price", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_UnitPrice__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="Unit Price", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_CustomerRef__Column = ProcFileProcLinesSheet.Rows(2).Find(What:="Customer Ref", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_Mcode_Column = ProcFileProcLinesSheet.Rows(2).Find(What:="Mcode", LookIn:=xlValues, LookAt:=xlWhole).Column
  ProcFileProcLinesSheet_BoardName_Column = ProcFileProcLinesSheet.Rows(2).Find(What:="Board Name", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not DM_ProcurementWS Is Nothing Then
    DM_ProcurementWS_CPC_Column = DM_ProcurementWS.Rows(1).Find(What:="CPC", LookAt:=xlWhole).Column
    DM_ProcurementWS_stockAtRS_Column = DM_ProcurementWS.Rows(1).Find(What:="Stock at RS", LookAt:=xlWhole).Column
    DM_ProcurementWS_FeederType_Column = DM_ProcurementWS.Rows(1).Find(What:="Feeder Type", LookAt:=xlWhole).Column
    DM_ProcurementWS_DistPN_Column = DM_ProcurementWS.Rows(1).Find(What:="Distributor PN (DIGIKEY MOUSER PRIORITY)", LookAt:=xlWhole).Column
    DM_ProcurementWS_DistName_Column = DM_ProcurementWS.Rows(1).Find(What:="Distrib", LookAt:=xlWhole).Column
    DM_ProcurementWS_lcscPN_Column = DM_ProcurementWS.Rows(1).Find(What:="LCSC PN", LookAt:=xlWhole).Column
    DM_ProcurementWS_PNtoUse_Column = DM_ProcurementWS.Rows(1).Find(What:="PN# TO USE", LookAt:=xlWhole).Column
End If

If Not DM_ProcurementLogWS Is Nothing Then
    DM_ProcurementLogWS_LogTime_Column = DM_ProcurementLogWS.Rows(1).Find(What:="Log Time", LookAt:=xlWhole).Column
    DM_ProcurementLogWS_cpc_Column = DM_ProcurementLogWS.Rows(1).Find(What:="CPC", LookAt:=xlWhole).Column
    DM_ProcurementLogWS_ProcBatchCode_Column = DM_ProcurementLogWS.Rows(1).Find(What:="Proc Batch Code", LookAt:=xlWhole).Column
    DM_ProcurementLogWS_PNtoUse_Column = DM_ProcurementLogWS.Rows(1).Find(What:="PN to Use", LookAt:=xlWhole).Column
    DM_ProcurementLogWS_DistributorPN_Column = DM_ProcurementLogWS.Rows(1).Find(What:="Distributor PN", LookAt:=xlWhole).Column
    DM_ProcurementLogWS_DistributorName_Column = DM_ProcurementLogWS.Rows(1).Find(What:="Distributor Name", LookAt:=xlWhole).Column
    DM_ProcurementLogWS_LCSCpn_Column = DM_ProcurementLogWS.Rows(1).Find(What:="LCSC PN", LookAt:=xlWhole).Column
    DM_ProcurementLogWS_Notes_Column = DM_ProcurementLogWS.Rows(1).Find(What:="Notes", LookAt:=xlWhole).Column
    DM_ProcurementLogWS_EntryFrom_Column = DM_ProcurementLogWS.Rows(1).Find(What:="Entry From MasterSheet or Proc?", LookAt:=xlWhole).Column
End If

If Not BGstockHistory_wsBGstockLog Is Nothing Then
    BGstockHistory_wsBGstockLog_Date_Column = BGstockHistory_wsBGstockLog.Rows(1).Find(What:="Date & Time", LookAt:=xlWhole, MatchCase:=False).Column
    BGstockHistory_wsBGstockLog_ProcBatchCode_Column = BGstockHistory_wsBGstockLog.Rows(1).Find(What:="Proc Batch Code", LookAt:=xlWhole, MatchCase:=False).Column
    BGstockHistory_wsBGstockLog_CPC_Column = BGstockHistory_wsBGstockLog.Rows(1).Find(What:="CPC", LookAt:=xlWhole, MatchCase:=False).Column
    BGstockHistory_wsBGstockLog_BGorSS_Column = BGstockHistory_wsBGstockLog.Rows(1).Find(What:="BG or SS?", LookAt:=xlWhole, MatchCase:=False).Column
    BGstockHistory_wsBGstockLog_EntryType_Column = BGstockHistory_wsBGstockLog.Rows(1).Find(What:="Entry Type", LookAt:=xlWhole, MatchCase:=False).Column
    BGstockHistory_wsBGstockLog_Qty_Column = BGstockHistory_wsBGstockLog.Rows(1).Find(What:="Qty (Added/Subtracted)", LookAt:=xlWhole, MatchCase:=False).Column
    BGstockHistory_wsBGstockLog_CumulativeStockLevel_Column = BGstockHistory_wsBGstockLog.Rows(1).Find(What:="Stock Level After Deduction (Column G)", LookAt:=xlWhole, MatchCase:=False).Column
    BGstockHistory_wsBGstockLog_PlaceBought_Column = BGstockHistory_wsBGstockLog.Rows(1).Find(What:="Place Bought", LookAt:=xlWhole, MatchCase:=False).Column
    BGstockHistory_wsBGstockLog_Notes_Column = BGstockHistory_wsBGstockLog.Rows(1).Find(What:="Notes", LookAt:=xlWhole, MatchCase:=False).Column
    BGstockHistory_wsBGstockLog_EntryFrom_Column = BGstockHistory_wsBGstockLog.Rows(1).Find(What:="Entry From MasterSheet or Proc?", LookAt:=xlWhole, MatchCase:=False).Column
    BGstockHistory_wsBGstockLog_SerialNumber_Column = BGstockHistory_wsBGstockLog.Rows(1).Find(What:="Serial Number", LookAt:=xlWhole, MatchCase:=False).Column
    BGstockHistory_wsBGstockLog_AmountSpent_Column = BGstockHistory_wsBGstockLog.Rows(1).Find(What:="Amount Spent", LookAt:=xlWhole, MatchCase:=False).Column
End If

If Not wsProductionSchedule Is Nothing Then
    wsProdSch_Task_Column = wsProductionSchedule.Rows(6).Find(What:="TASK", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_OrderType_Column = wsProductionSchedule.Rows(6).Find(What:="ORDER TYPE", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_Qty_Column = wsProductionSchedule.Rows(6).Find(What:="Qty", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_ReceptionDate_Column = wsProductionSchedule.Rows(6).Find(What:="Reception of All Material", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_LineNo_Column = wsProductionSchedule.Rows(6).Find(What:="Line #", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_ProductionDate_Column = wsProductionSchedule.Rows(6).Find(What:="Production Date", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_PONum_Column = wsProductionSchedule.Rows(6).Find(What:="PO #", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_DueDate_Column = wsProductionSchedule.Rows(6).Find(What:="Due Date" & Chr(10) & "MM/DD/YY", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_Comments_Column = wsProductionSchedule.Rows(6).Find(What:="Comments", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_CustomerName_Column = wsProductionSchedule.Rows(6).Find(What:="Customer Name", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_ReceptionFileStatus_Column = wsProductionSchedule.Rows(6).Find(What:="Reception File Status", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_StencilStatus_Column = wsProductionSchedule.Rows(6).Find(What:="Stencil Status", LookAt:=xlWhole, MatchCase:=False).Column
    wsProdSch_ProgrammingStatus_Column = wsProductionSchedule.Rows(6).Find(What:="Programming Status", LookAt:=xlWhole, MatchCase:=False).Column
    wsprodSch_PackagingType_Column = wsProductionSchedule.Rows(6).Find(What:="Packaging Type", LookAt:=xlWhole, MatchCase:=False).Column

    
End If

''Update 11/02/2025 Anil
If Not jobQueue_SupplierSheet Is Nothing Then
    jobQueue_SupplierSheet_SupplierName = jobQueue_SupplierSheet.Rows(1).Find(What:="Supplier Name", LookIn:=xlFormulas, LookAt:=xlWhole).Column
    jobQueue_SupplierSheet_CompanyFullName = jobQueue_SupplierSheet.Rows(1).Find(What:="Company Full Name", LookIn:=xlFormulas, LookAt:=xlWhole).Column
    jobQueue_SupplierSheet_StreetAddress = jobQueue_SupplierSheet.Rows(1).Find(What:="Street Address", LookIn:=xlFormulas, LookAt:=xlWhole).Column
    jobQueue_SupplierSheet_City = jobQueue_SupplierSheet.Rows(1).Find(What:="City", LookIn:=xlFormulas, LookAt:=xlWhole).Column
    jobQueue_SupplierSheet_ProvinceState = jobQueue_SupplierSheet.Rows(1).Find(What:="Province/State", LookIn:=xlFormulas, LookAt:=xlWhole).Column
    jobQueue_SupplierSheet_PostalCode = jobQueue_SupplierSheet.Rows(1).Find(What:="Postal Code", LookIn:=xlFormulas, LookAt:=xlWhole).Column
    jobQueue_SupplierSheet_Country = jobQueue_SupplierSheet.Rows(1).Find(What:="Country", LookIn:=xlFormulas, LookAt:=xlWhole).Column
    jobQueue_SupplierSheet_EmailID = jobQueue_SupplierSheet.Rows(1).Find(What:="Email ID", LookIn:=xlFormulas, LookAt:=xlWhole).Column
    jobQueue_SupplierSheet_ContactNo = jobQueue_SupplierSheet.Rows(1).Find(What:="Contact No.", LookIn:=xlFormulas, LookAt:=xlWhole).Column
    jobQueue_SupplierSheet_PaymentTerms = jobQueue_SupplierSheet.Rows(1).Find(What:="Payment Terms", LookIn:=xlFormulas, LookAt:=xlWhole).Column
End If
''---------------------------------------


Set Findrng = Nothing
End Function

