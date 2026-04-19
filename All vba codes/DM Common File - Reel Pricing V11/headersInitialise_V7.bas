Attribute VB_Name = "headersInitialise_V7"
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
Public jobQueue_SolderType_Column As Long
Public jobQueue_IPCclass_Column As Long
Public jobQueue_billingAddress_Column As Long
Public jobQueue_shippingAddress_Column As Long
Public jobQueue_SerialNumberRequired_Column As Long
Public jobQueue_BoardLetter_Column As Long
Public jobQueue_ncrFlag_Column As Long

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
'Public DM_StencilName_Column As Long
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
Public DM_solderType_Column As Long
Public DM_ipcClass_Column As Long
Public DM_GlobalQTE_Column As Long
Public DM_PCB1_Column As Long
Public DM_PCB2_Column As Long
Public DM_PCB3_Column As Long
Public DM_PCB4_Column As Long
Public DM_NRE1Status_Column As Long
Public DM_NRE2Status_Column As Long
Public DM_NRE3Status_Column As Long
Public DM_NRE4Status_Column As Long
Public DM_Currency_Type_Column As Long


    
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
Public Master_StockatRS_Column As Long
Public Master_FeederType_Column As Long
Public Master_BGStockStatus_Column As Long
Public Master_ncrFlag_Column As Long
Public Master_AddManualMCode_Column As Long
Public Master_THPins_Column As Long
Public Master_STANDARDQty_Column As Long
Public Master_ProductStatus_Column As Long
Public Master_LeadTime_Column As Long
Public Master_ParametersMCodes_Column As Long
Public Master_DigikeyMCodes_Column As Long
Public Master_LCSCStock_Column As Long
Public Master_LCSCMPN_Column As Long
Public Master_LCSCMFR_Column As Long
Public Master_KeywordsUsed_Column As Long
Public Master_JSON_FetchDateTime_Column As Long
Public Master_PackgingType_Column As Long
Public Master_Multi_api_stock_Column As Long
Public Master_Maxqty_Column As Long





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
Public Procsheet_ncrFlag_Column As Long


'Declaring Procurment sheet column variables
Public ProcureSheet_CPC_Column As Long
Public ProcureSheet_DistributorPartNumber_Column As Long
Public ProcureSheet_UnitPrice_Column As Long
Public ProcureSheet_MFRNAME_Column As Long
Public ProcureSheet_PNTOUSE_Column As Long
Public ProcureSheet_QTYAvlble_Column As Long
Public ProcureSheet_Distrib_Column As Long
Public ProcureSheet_DistributorPN_Column As Long
Public ProcureSheet_Notes_Column As Long
Public ProcureSheet_StoctStatus_Column As Long
Public ProcureSheet_THPins_Column As Long
Public ProcureSheet_Distrbutor2name_Column As Long
Public ProcureSheet_Distrbutor2stock_Column As Long
Public ProcureSheet_Distrbutor2price_Column As Long
Public ProcureSheet_Distributor2leadtime_Column As Long
Public ProcureSheet_LCSCPN_Column As Long
Public ProcureSheet_SafetyStock_Column As Long
Public ProcureSheet_StockatCustomer_Column As Long
Public ProcureSheet_StockatRS_Column As Long
Public ProcureSheet_lankapnVerified_Column As Long
Public ProcureSheet_LSCCPNVerified_Column As Long
Public ProcureSheet_Customer_Column As Long
Public ProcureSheet_FeederType_Column As Long
Public ProcureSheet_NCRFlag_Column As Long
Public ProcureSheet_NCRNumber_Column As Long
Public ProcureSheet_PROCsUsed_Column As Long

'variables for ATEMPLATE sheet
Public ATEMPLATE_Serial_NO_Column As Long
Public ATEMPLATE_X_Quant_Column As Long
Public ATEMPLATE_Extras_Column As Long
Public ATEMPLATE_Order_Qty_Column As Long
Public ATEMPLATE_QTY_Column As Long
Public ATEMPLATE_R_DES_Column As Long
Public ATEMPLATE_CPC_Number_Column As Long
Public ATEMPLATE_Description_Column As Long
Public ATEMPLATE_Disrtib_Part_Number_Column As Long
Public ATEMPLATE_MFR_Name_Column As Long
Public ATEMPLATE_M_CODES_Column As Long
Public ATEMPLATE_MFR_Column As Long
Public ATEMPLATE_PN_to_USE_Column As Long
Public ATEMPLATE_Unit_Price_Column As Long
Public ATEMPLATE_Qty_Available_Column As Long
Public ATEMPLATE_Distrib_1_Column As Long
Public ATEMPLATE_Distributor_Part_number_Column As Long
Public ATEMPLATE_Notes_Column As Long
Public ATEMPLATE_Stock_Status_Column As Long
Public ATEMPLATE_TH_Pins_Column As Long
Public ATEMPLATE_X_Quant1_Column As Long
Public ATEMPLATE_Extra1_Column As Long
Public ATEMPLATE_QTY_to_order1_Column As Long
Public ATEMPLATE_Unit_Price1_Column As Long
Public ATEMPLATE_Ext_price_Units1_Column As Long
Public ATEMPLATE_X_Quant2_Column As Long
Public ATEMPLATE_Extra2_Column As Long
Public ATEMPLATE_QTY_to_order2_Column As Long
Public ATEMPLATE_Unit_Price2_Column As Long
Public ATEMPLATE_Ext_price_Units2_Column As Long
Public ATEMPLATE_X_Quant3_Column As Long
Public ATEMPLATE_Extra3_Column As Long
Public ATEMPLATE_QTY_to_order3_Column As Long
Public ATEMPLATE_Unit_Price3_Column As Long
Public ATEMPLATE_Ext_price_Units3_Column As Long
Public ATEMPLATE_X_Quant4_Column As Long
Public ATEMPLATE_Extra4_Column As Long
Public ATEMPLATE_QTY_to_order4_Column As Long
Public ATEMPLATE_Unit_Price4_Column As Long
Public ATEMPLATE_Ext_price_Units4_Column As Long
Public ATEMPLATE_LCSC_PN1_Column As Long
Public ATEMPLATE_LCSC_stock1_Column As Long
Public ATEMPLATE_LCSC_Unit_price1_Column As Long
Public ATEMPLATE_LCSC_Ext_Price1_Column As Long
Public ATEMPLATE_Preferred_Dist_Ext_Price1_Column As Long
Public ATEMPLATE_Best_Place_to_Buy1_Column As Long
Public ATEMPLATE_LCSC_Unit_price2_Column As Long
Public ATEMPLATE_LCSC_Ext_Price2_Column As Long
Public ATEMPLATE_Preferred_Dist_Ext_Price2_Column As Long
Public ATEMPLATE_Best_Place_to_Buy2_Column As Long
Public ATEMPLATE_LCSC_Unit_price3_Column As Long
Public ATEMPLATE_LCSC_Ext_Price3_Column As Long
Public ATEMPLATE_Preferred_Dist_Ext_Price3_Column As Long
Public ATEMPLATE_Best_Place_to_Buy3_Column As Long
Public ATEMPLATE_LCSC_Unit_price4_Column As Long
Public ATEMPLATE_LCSC_Ext_Price4_Column As Long
Public ATEMPLATE_Preferred_Dist_Ext_Price4_Column As Long
Public ATEMPLATE_Best_Place_to_Buy4_Column As Long
Public ATEMPLATE_SMP_Column As Long


Public ProcurementLog_Log_Time_Column As Long
Public ProcurementLog_CPC_Column As Long
Public ProcurementLog_Proc_Batch_Code_Column As Long
Public ProcurementLog_PN_to_Use_Column As Long
Public ProcurementLog_Distributor_PN_Column As Long
Public ProcurementLog_Distributor_Name_Column As Long
Public ProcurementLog_LCSC_PN_Column As Long
Public ProcurementLog_Entry_From_MasterSheet_or_Proc_Column As Long
Public ProcurementLog_Notes_Column As Long
Public ProcurementLog_Other_Comments_Column As Long




Public ComponentsOrders_ProcSheet_DISTRIBUTOR__Column As Long
Public ComponentsOrders_ProcSheet_SALESORDER_Column As Long
Public ComponentsOrders_ProcSheet_Invoice_Column As Long
Public ComponentsOrders_ProcSheet_Subtotal_Column As Long
Public ComponentsOrders_ProcSheet_GST_Column As Long
Public ComponentsOrders_ProcSheet_QST_Column As Long
Public ComponentsOrders_ProcSheet_Total_Column As Long
Public ComponentsOrders_ProcSheet_Notes_Column As Long
Public ComponentsOrders_SenttoJobQueue_Column As Long
Public ComponentsOrders_InvoiceDownloaded_Column As Long

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
Public PCB_ProcSheet_SenttoJobQueue_Column As Long
Public PCB_ProcSheet_InvoiceDownloaded_Column As Long
Public PCB_ProcSheet_OrderStatus_Column As Long

Public Jobqueue_InvoicesforComponents_Sheet_PROCBATCHCODE__Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_DISTRIBUTOR__Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_SALESORDER_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_Invoice_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_Subtotal_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_GST_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_QST_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_Total_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_Notes_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_PrintStatus_Column As Long
Public Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column As Long

Public Jobqueue_PCB_Sheet_PROCBATCHCODE__Column As Long
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

Public Jobqueue_Proclog_Sheet_PROCBATCHCODE__Column As Long
Public Jobqueue_Proclog_Sheet_ComponentsStatus__Column As Long
Public Jobqueue_Proclog_Sheet_PCBStatus_Column As Long
Public Jobqueue_Proclog_Sheet_Notes_Column As Long

Public dmFile_QuoteLog_Sheet_Customer_Column As Long
Public dmFile_QuoteLog_Sheet_BoardName_Column As Long
Public dmFile_QuoteLog_Sheet_rfqRef_Column As Long
Public dmFile_QuoteLog_Sheet_rfqDate_Column As Long
Public dmFile_QuoteLog_Sheet_quoteDate_Column As Long
Public dmFile_QuoteLog_Sheet_status_Column As Long
Public dmFile_QuoteLog_Sheet_comments_Column As Long
Public dmFile_QuoteLog_Sheet_qty1_Column As Long
Public dmFile_QuoteLog_Sheet_qty2_Column As Long
Public dmFile_QuoteLog_Sheet_qty3_Column As Long
Public dmFile_QuoteLog_Sheet_qty4_Column As Long
Public dmFile_QuoteLog_Sheet_Followup_Column As Long


Public Jobqueue_adminSheet_CustomerFullName_Column As Long
Public Jobqueue_adminSheet_CustomerAbbreviation_Column As Long
Public Jobqueue_adminSheet_cxTerms_Column As Long

Public timeWBsummaryWS_sheet_name_column As Long
Public timeWBsummaryWS_rs_pricing_sheet_name_column As Long
Public timeWBsummaryWS_date_quoted_column As Long
Public timeWBsummaryWS_status_column As Long
Public timeWBsummaryWS_quote_no_column As Long
Public timeWBsummaryWS_quote_category_column As Long
Public timeWBsummaryWS_bom_name_column As Long
Public timeWBsummaryWS_gerber_name_column As Long
Public timeWBsummaryWS_qty1_qty_column As Long
Public timeWBsummaryWS_qty1_labour_column As Long
Public timeWBsummaryWS_qty1_smt_column As Long
Public timeWBsummaryWS_qty1_unitprice_column As Long
Public timeWBsummaryWS_qty1_pcbMarkup_column As Long
Public timeWBsummaryWS_qty1_componentMarkup_column As Long
Public timeWBsummaryWS_qty2_qty_column As Long
Public timeWBsummaryWS_qty2_labour_column As Long
Public timeWBsummaryWS_qty2_smt_column As Long
Public timeWBsummaryWS_qty2_unitprice_column As Long
Public timeWBsummaryWS_qty2_pcbMarkup_column As Long
Public timeWBsummaryWS_qty2_componentMarkup_column As Long
Public timeWBsummaryWS_qty3_qty_column As Long
Public timeWBsummaryWS_qty3_labour_column As Long
Public timeWBsummaryWS_qty3_smt_column As Long
Public timeWBsummaryWS_qty3_unitprice_column As Long
Public timeWBsummaryWS_qty3_pcbMarkup_column As Long
Public timeWBsummaryWS_qty3_componentMarkup_column As Long
Public timeWBsummaryWS_qty4_qty_column As Long
Public timeWBsummaryWS_qty4_labour_column As Long
Public timeWBsummaryWS_qty4_smt_column As Long
Public timeWBsummaryWS_qty4_unitprice_column As Long
Public timeWBsummaryWS_qty4_pcbMarkup_column As Long
Public timeWBsummaryWS_qty4_componentMarkup_column As Long
Public timeWBsummaryWS_note1_column As Long
Public timeWBsummaryWS_note2_column As Long
Public timeWBsummaryWS_note3_column As Long
Public timeWBsummaryWS_cx_supplies_column As Long
Public timeWBsummaryWS_mcode_summary_column As Long


Public bgStockHistoryWS_Date_Column As Long
Public bgStockHistoryWS_ProcBatchCode_Column As Long
Public bgStockHistoryWS_CPC_Column As Long
Public bgStockHistoryWS_BGorSS_Column As Long
Public bgStockHistoryWS_EntryType_Column As Long
Public bgStockHistoryWS_Qty_Column As Long
Public bgStockHistoryWS_CumulativeStockLevel_Column As Long
Public bgStockHistoryWS_Notes_Column As Long
Public bgStockHistoryWS_SerialNumber_Column As Long
Public bgStockHistoryWS_EntryFrom_Column As Long

Public wsProcurement_cpc_column As Long
Public wsProcurement_procsUsed_column As Long


Public ProcFile_PCBorderSheet_DistName_Column As Long
Public ProcFile_PCBorderSheet_SalesOrderNumber_Column As Long
Public ProcFile_PCBorderSheet_OrderNotes_Column As Long
Public ProcFile_PCBorderSheet_SentToJobQueue_Column As Long
Public ProcFile_PCBorderSheet_GMPname_Column As Long
Public ProcFile_PCBorderSheet_BoardLetter_Column As Long
Public ProcFile_PCBorderSheet_Qty_Column As Long
Public ProcFile_PCBorderSheet_Type_Column As Long
Public ProcFile_PCBorderSheet_GerberName_Column As Long
Public ProcFile_PCBorderSheet_StencilNumber_Column As Long
Public ProcFile_PCBorderSheet_OrderStatus_Column As Long
Public ProcFile_PCBorderSheet_BOMname_Column As Long
Public ProcFile_PCBorderSheet_OrderDate_Column As Long

Public wsStencilsPositions_PositionNo_Column As Long
Public wsStencilsPositions_StencilName_Column As Long
Public wsStencilsPositions_GMPName_Column As Long
Public wsStencilsPositions_Status_Column As Long
Public wsStencilsPositions_Comment_Column As Long

Public Const DM_Header_Row As Byte = 5
Public Const DM_Mastersheet_Header_Row As Byte = 3
Public Const Procsheet_Header_Row As Byte = 4
Public Const timeWBsummaryWS_headerRow As Byte = 2
Public Const ProcureSheet_Header_Row As Byte = 1
Public Const ATemplateSheet_Header_Row As Byte = 3
Public Const ProcurementLogSheet_Header_Row As Byte = 1


Public CPC As String
Public TargetRowNo As Long
Public TargetColNo As Long

Public Function initialiseHeaders(Optional inputWS As Worksheet, Optional JOB_QUEUE As Worksheet, _
                                    Optional Mastersheet_DM As Worksheet, Optional ProcSheet As Worksheet, _
                                    Optional ComponentsOrders_ProcSheet As Worksheet, Optional Jobqueue_InvoicesforComponents_Sheet As Worksheet, _
                                    Optional PCB_ProcSheet As Worksheet, Optional Jobqueue_PCB_Sheet As Worksheet, _
                                    Optional Jobqueue_Proclog_Sheet As Worksheet, Optional dmFile_QuoteLog_Sheet As Worksheet, _
                                    Optional JobQueue_AdminSheet As Worksheet, Optional timeWBsummaryWS As Worksheet, _
                                    Optional bgStockHistoryWS As Worksheet, Optional wsProcurement As Worksheet, _
                                    Optional wsProcFilePCBorder As Worksheet, Optional wsStencilsPositions As Worksheet, _
                                    Optional ProcurementSheet As Worksheet, Optional ATemplateSheet As Worksheet, Optional ProcureLog As Worksheet) As String


Dim findrng As Range

If Not Mastersheet_DM Is Nothing Then
On Error Resume Next
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
    'Master_CustomerStockPrice_unitprice_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Customer Stock Price (unit price)", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_StockatRS_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Stock at RS", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_FeederType_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Feeder Type", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_BGStockStatus_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="BG Stock Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_ncrFlag_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="NCR Flag", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_AddManualMCode_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="ADD Manual MCODE", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_THPins_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="TH Pins", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_STANDARDQty_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Standard Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_ParametersMCodes_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Parameters MCodes", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_DigikeyMCodes_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Digikey MCodes", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_LCSCStock_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="LCSC Stock", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_LCSCMPN_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="LCSC MPN", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_LCSCMFR_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="LCSC MFR", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_KeywordsUsed_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Keywords Used", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_ProductStatus_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Part Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_LeadTime_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Lead Time", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_JSON_FetchDateTime_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="JSON Fetch Date Time", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_PackgingType_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="Packging Type", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_Multi_api_stock_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="multi api stock", LookIn:=xlValues, LookAt:=xlWhole).Column
    Master_Maxqty_Column = Mastersheet_DM.Rows(DM_Mastersheet_Header_Row).Find(What:="max qty", LookIn:=xlValues, LookAt:=xlWhole).Column


End If

If Not ProcurementSheet Is Nothing Then
    LoadProcureSheetColumns ProcurementSheet

End If

If Not ATemplateSheet Is Nothing Then
    LoadATemplateColumns ATemplateSheet

End If

If Not ProcureLog Is Nothing Then
    LoadProcurementLogColumns ProcureLog

End If

If Not ProcSheet Is Nothing Then
On Error Resume Next
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
    Procsheet_ncrFlag_Column = ProcSheet.Rows(Procsheet_Header_Row).Find(What:="NCR Flag", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not inputWS Is Nothing Then
On Error Resume Next
    ''DM DataInputSheets
    DM_ActiveQty_Column = inputWS.Rows(DM_Header_Row).Find(What:="Active Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_GlobalMFRPackage_Column = inputWS.Rows(DM_Header_Row).Find(What:="Global MFR Package", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_BomName_Column = inputWS.Rows(DM_Header_Row).Find(What:="Bom Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_PCBName_Column = inputWS.Rows(DM_Header_Row).Find(What:="PCB Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_QTEwithRevisions_Column = inputWS.Rows(DM_Header_Row).Find(What:="QTE# (with Revisions)", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_MCODESSummary_Column = inputWS.Rows(DM_Header_Row).Find(What:="MCODES Summary", LookIn:=xlValues, LookAt:=xlWhole).Column
    'DM_StencilName_Column = inputWS.Rows(DM_Header_Row).find(what:="Stencil Name", LookIn:=xlValues, lookat:=xlWhole).Column
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
    DM_solderType_Column = inputWS.Rows(DM_Header_Row).Find(What:="Solder Type", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_ipcClass_Column = inputWS.Rows(DM_Header_Row).Find(What:="IPC Class", LookIn:=xlValues, LookAt:=xlWhole).Column
    
    DM_GlobalQTE_Column = inputWS.Rows(DM_Header_Row).Find(What:="Global QTE#", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_PCB1_Column = inputWS.Rows(DM_Header_Row).Find(What:="PCB 1", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_PCB2_Column = inputWS.Rows(DM_Header_Row).Find(What:="PCB 2", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_PCB3_Column = inputWS.Rows(DM_Header_Row).Find(What:="PCB 3", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_PCB4_Column = inputWS.Rows(DM_Header_Row).Find(What:="PCB 4", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_NRE1Status_Column = inputWS.Rows(DM_Header_Row).Find(What:="NRE 1 Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_NRE2Status_Column = inputWS.Rows(DM_Header_Row).Find(What:="NRE 2 Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_NRE3Status_Column = inputWS.Rows(DM_Header_Row).Find(What:="NRE 3 Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_NRE4Status_Column = inputWS.Rows(DM_Header_Row).Find(What:="NRE 4 Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    DM_Currency_Type_Column = inputWS.Rows(DM_Header_Row).Find(What:="currency type", LookIn:=xlValues, LookAt:=xlWhole).Column


    
End If

If Not JOB_QUEUE Is Nothing Then
On Error Resume Next
    ''Mandatory column
    
    Customer = JOB_QUEUE.Rows(3).Find(What:="Customer", LookIn:=xlValues, LookAt:=xlWhole).Column
    Line = JOB_QUEUE.Rows(3).Find(What:="Line #", LookIn:=xlValues, LookAt:=xlWhole).Column
    PO_Number = JOB_QUEUE.Rows(3).Find(What:="PO Number", LookIn:=xlValues, LookAt:=xlWhole).Column
    Product_Name = JOB_QUEUE.Rows(3).Find(What:="Product Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    Order_Type = JOB_QUEUE.Rows(3).Find(What:="Order Type", LookIn:=xlValues, LookAt:=xlWhole).Column
    Proc_Batch_Code = JOB_QUEUE.Rows(3).Find(What:="Proc Batch Code", LookIn:=xlValues, LookAt:=xlWhole).Column
    QTE = JOB_QUEUE.Rows(3).Find(What:="QTE #", LookIn:=xlValues, LookAt:=xlWhole).Column
    qty = JOB_QUEUE.Rows(3).Find(What:="PO Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
    PO_Date = JOB_QUEUE.Rows(3).Find(What:="PO Date", LookIn:=xlValues, LookAt:=xlWhole).Column
    Unit_Price_in_PO = JOB_QUEUE.Rows(3).Find(What:="Unit Price in PO", LookIn:=xlValues, LookAt:=xlWhole).Column
    Unit_Price_in_Quote = JOB_QUEUE.Rows(3).Find(What:="Unit Price in Quote", LookIn:=xlValues, LookAt:=xlWhole).Column
    Gross_Amount = JOB_QUEUE.Rows(3).Find(What:="Gross Amount", LookIn:=xlValues, LookAt:=xlWhole).Column
    Pricing_Status = JOB_QUEUE.Rows(3).Find(What:="Pricing Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    Notes = JOB_QUEUE.Rows(3).Find(What:="Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
    Date_Delivered = JOB_QUEUE.Rows(3).Find(What:="Date Delivered", LookIn:=xlValues, LookAt:=xlWhole).Column
    Invoice_Date = JOB_QUEUE.Rows(3).Find(What:="Invoice Date", LookIn:=xlValues, LookAt:=xlWhole).Column
    Invoice = JOB_QUEUE.Rows(3).Find(What:="Invoice #", LookIn:=xlValues, LookAt:=xlWhole).Column
    Payment_Date = JOB_QUEUE.Rows(3).Find(What:="Payment Date", LookIn:=xlValues, LookAt:=xlWhole).Column
    Order_Status = JOB_QUEUE.Rows(3).Find(What:="Order Status", LookIn:=xlValues, LookAt:=xlWhole).Column
    Other_Notes = JOB_QUEUE.Rows(3).Find(What:="Other Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
    BOM_Name = JOB_QUEUE.Rows(3).Find(What:="BOM Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    Gerber_Name = JOB_QUEUE.Rows(3).Find(What:="Gerber Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    jobQueue_SolderType_Column = JOB_QUEUE.Rows(3).Find(What:="Solder Type", LookIn:=xlValues, LookAt:=xlWhole).Column
    jobQueue_IPCclass_Column = JOB_QUEUE.Rows(3).Find(What:="IPC Class", LookIn:=xlValues, LookAt:=xlWhole).Column
    jobQueue_billingAddress_Column = JOB_QUEUE.Rows(3).Find(What:="Billing Address", LookIn:=xlValues, LookAt:=xlWhole).Column
    jobQueue_shippingAddress_Column = JOB_QUEUE.Rows(3).Find(What:="Shipping Address", LookIn:=xlValues, LookAt:=xlWhole).Column
    jobQueue_SerialNumberRequired_Column = JOB_QUEUE.Rows(3).Find(What:="Serial Number Required?", LookIn:=xlValues, LookAt:=xlWhole).Column
    jobQueue_BoardLetter_Column = JOB_QUEUE.Rows(3).Find(What:="Board Letter", LookIn:=xlValues, LookAt:=xlWhole).Column
    jobQueue_ncrFlag_Column = JOB_QUEUE.Rows(3).Find(What:="NCR Flag", LookIn:=xlValues, LookAt:=xlWhole).Column
    
    ''Updated
    ''Any of below result = 0 means not found in file , Treat as NON-Mandatory column
    
    Set findrng = JOB_QUEUE.Rows(3).Find(What:="Delivery Date on PO", LookIn:=xlValues, LookAt:=xlWhole)
    If Not findrng Is Nothing Then
      Delivery_Date_on_PO = findrng.Column
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
    
    Set findrng = JOB_QUEUE.Rows(3).Find(What:="Sub Total", LookIn:=xlValues, LookAt:=xlWhole)
    If Not findrng Is Nothing Then
      SubTotal_Column = findrng.Column
    Else
      SubTotal_Column = 0
    End If
    
    Set findrng = JOB_QUEUE.Rows(3).Find(What:="GST", LookIn:=xlValues, LookAt:=xlWhole)
    If Not findrng Is Nothing Then
      GST_Column = findrng.Column
    Else
      GST_Column = 0
    End If
    
    Set findrng = JOB_QUEUE.Rows(3).Find(What:="QST", LookIn:=xlValues, LookAt:=xlWhole)
    If Not findrng Is Nothing Then
      QST_Column = findrng.Column
    Else
      QST_Column = 0
    End If

End If

If Not ComponentsOrders_ProcSheet Is Nothing Then
On Error Resume Next
  ComponentsOrders_ProcSheet_DISTRIBUTOR__Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="DISTRIBUTOR", LookIn:=xlValues, LookAt:=xlWhole).Column
  ComponentsOrders_ProcSheet_SALESORDER_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="SALESORDER", LookIn:=xlValues, LookAt:=xlWhole).Column
  ComponentsOrders_ProcSheet_Invoice_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Invoice #", LookIn:=xlValues, LookAt:=xlWhole).Column
  ComponentsOrders_ProcSheet_Subtotal_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Subtotal", LookIn:=xlValues, LookAt:=xlWhole).Column
  ComponentsOrders_ProcSheet_GST_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="GST", LookIn:=xlValues, LookAt:=xlWhole).Column
  ComponentsOrders_ProcSheet_QST_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="QST", LookIn:=xlValues, LookAt:=xlWhole).Column
  ComponentsOrders_ProcSheet_Total_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Total", LookIn:=xlValues, LookAt:=xlWhole).Column
  ComponentsOrders_ProcSheet_Notes_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Notes (if any)", LookIn:=xlValues, LookAt:=xlWhole).Column
  ComponentsOrders_SenttoJobQueue_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Sent to Job Queue", LookIn:=xlValues, LookAt:=xlWhole).Column
  ComponentsOrders_InvoiceDownloaded_Column = ComponentsOrders_ProcSheet.Rows(1).Find(What:="Invoice Downloaded", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not PCB_ProcSheet Is Nothing Then
On Error Resume Next
  PCB_ProcSheet_GMP__Column = PCB_ProcSheet.Rows(1).Find(What:="GMP", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_PCBStencil__Column = PCB_ProcSheet.Rows(1).Find(What:="PCB/Stencil #", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_Type__Column = PCB_ProcSheet.Rows(1).Find(What:="Type", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_Qty__Column = PCB_ProcSheet.Rows(1).Find(What:="Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_Letter__Column = PCB_ProcSheet.Rows(1).Find(What:="Letter", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_DISTRIBUTOR__Column = PCB_ProcSheet.Rows(1).Find(What:="DISTRIBUTOR", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_RSPO__Column = PCB_ProcSheet.Rows(1).Find(What:="RS PO #", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_Invoice_Column = PCB_ProcSheet.Rows(1).Find(What:="Invoice #", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_Subtotal_Column = PCB_ProcSheet.Rows(1).Find(What:="Subtotal", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_GST_Column = PCB_ProcSheet.Rows(1).Find(What:="GST", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_QST_Column = PCB_ProcSheet.Rows(1).Find(What:="QST", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_Total_Column = PCB_ProcSheet.Rows(1).Find(What:="Total", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_Notes_Column = PCB_ProcSheet.Rows(1).Find(What:="Notes (if any)", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_SenttoJobQueue_Column = PCB_ProcSheet.Rows(1).Find(What:="Sent to Job Queue", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_InvoiceDownloaded_Column = PCB_ProcSheet.Rows(1).Find(What:="Invoice Downloaded", LookIn:=xlValues, LookAt:=xlWhole).Column
  PCB_ProcSheet_OrderStatus_Column = PCB_ProcSheet.Rows(1).Find(What:="Order Status", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not Jobqueue_InvoicesforComponents_Sheet Is Nothing Then
On Error Resume Next
  Jobqueue_InvoicesforComponents_Sheet_PROCBATCHCODE__Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="PROC BATCH CODE", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_DISTRIBUTOR__Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="DISTRIBUTOR", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_SALESORDER_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="SALESORDER", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_Invoice_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Invoice #", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_Subtotal_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Subtotal", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_GST_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="GST", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_QST_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="QST", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_Total_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Total", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_Notes_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Notes (if any)", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_PrintStatus_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Print Status", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_InvoicesforComponents_Sheet_InvoiceDate_Column = Jobqueue_InvoicesforComponents_Sheet.Rows(1).Find(What:="Invoice Date", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not Jobqueue_PCB_Sheet Is Nothing Then
On Error Resume Next
  Jobqueue_PCB_Sheet_PROCBATCHCODE__Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="PROC BATCH CODE", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_PCBStencil__Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="PCB/Stencil #", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_Type__Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Type", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_Qty__Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_DISTRIBUTOR__Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="DISTRIBUTOR", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_RSPO__Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="RS PO #", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_Invoice_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Invoice #", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_Subtotal_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Subtotal", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_GST_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="GST", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_QST_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="QST", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_Total_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Total", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_Notes_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Notes (if any)", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_PrintStatus_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Print Status", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_PCB_Sheet_InvoiceDate_Column = Jobqueue_PCB_Sheet.Rows(1).Find(What:="Invoice Date", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not Jobqueue_Proclog_Sheet Is Nothing Then
On Error Resume Next
  Jobqueue_Proclog_Sheet_PROCBATCHCODE__Column = Jobqueue_Proclog_Sheet.Rows(1).Find(What:="PROC BATCH CODE", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_Proclog_Sheet_ComponentsStatus__Column = Jobqueue_Proclog_Sheet.Rows(1).Find(What:="Components Status", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_Proclog_Sheet_PCBStatus_Column = Jobqueue_Proclog_Sheet.Rows(1).Find(What:="PCB Status", LookIn:=xlValues, LookAt:=xlWhole).Column
  Jobqueue_Proclog_Sheet_Notes_Column = Jobqueue_Proclog_Sheet.Rows(1).Find(What:="Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not dmFile_QuoteLog_Sheet Is Nothing Then
On Error Resume Next
  dmFile_QuoteLog_Sheet_Customer_Column = dmFile_QuoteLog_Sheet.Rows(1).Find(What:="Customer Name", LookIn:=xlValues, LookAt:=xlWhole).Column
  dmFile_QuoteLog_Sheet_BoardName_Column = dmFile_QuoteLog_Sheet.Rows(1).Find(What:="Board Name", LookIn:=xlValues, LookAt:=xlWhole).Column
  dmFile_QuoteLog_Sheet_rfqRef_Column = dmFile_QuoteLog_Sheet.Rows(1).Find(What:="RFQ Ref #", LookIn:=xlValues, LookAt:=xlWhole).Column
  dmFile_QuoteLog_Sheet_rfqDate_Column = dmFile_QuoteLog_Sheet.Rows(1).Find(What:="RFQ Date", LookIn:=xlValues, LookAt:=xlWhole).Column
  dmFile_QuoteLog_Sheet_quoteDate_Column = dmFile_QuoteLog_Sheet.Rows(1).Find(What:="Quote Sent Date", LookIn:=xlValues, LookAt:=xlWhole).Column
  dmFile_QuoteLog_Sheet_status_Column = dmFile_QuoteLog_Sheet.Rows(1).Find(What:="Status", LookIn:=xlValues, LookAt:=xlWhole).Column
  dmFile_QuoteLog_Sheet_comments_Column = dmFile_QuoteLog_Sheet.Rows(1).Find(What:="Comments", LookIn:=xlValues, LookAt:=xlWhole).Column
  dmFile_QuoteLog_Sheet_qty1_Column = dmFile_QuoteLog_Sheet.Rows(1).Find(What:="Qty1", LookIn:=xlValues, LookAt:=xlWhole).Column
  dmFile_QuoteLog_Sheet_qty2_Column = dmFile_QuoteLog_Sheet.Rows(1).Find(What:="Qty2", LookIn:=xlValues, LookAt:=xlWhole).Column
  dmFile_QuoteLog_Sheet_qty3_Column = dmFile_QuoteLog_Sheet.Rows(1).Find(What:="Qty3", LookIn:=xlValues, LookAt:=xlWhole).Column
  dmFile_QuoteLog_Sheet_qty4_Column = dmFile_QuoteLog_Sheet.Rows(1).Find(What:="Qty4", LookIn:=xlValues, LookAt:=xlWhole).Column
  dmFile_QuoteLog_Sheet_Followup_Column = dmFile_QuoteLog_Sheet.Rows(1).Find(What:="Follow Up", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not JobQueue_AdminSheet Is Nothing Then
On Error Resume Next
    Jobqueue_adminSheet_CustomerFullName_Column = JobQueue_AdminSheet.Rows(1).Find(What:="Customer Names", LookIn:=xlValues, LookAt:=xlWhole).Column
    Jobqueue_adminSheet_CustomerAbbreviation_Column = JobQueue_AdminSheet.Rows(1).Find(What:="Abbreviation (for Files/Folders)", LookIn:=xlValues, LookAt:=xlWhole).Column
    Jobqueue_adminSheet_cxTerms_Column = JobQueue_AdminSheet.Rows(1).Find(What:="CX Terms", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not timeWBsummaryWS Is Nothing Then
On Error Resume Next
    timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Hidden = False
    timeWBsummaryWS_sheet_name_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="sheet_name", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_rs_pricing_sheet_name_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="rs_pricing_sheet_name", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_date_quoted_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="date_quoted", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_status_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="status", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_quote_no_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="quote_no", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_quote_category_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="quote_category", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_bom_name_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="bom_name", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_gerber_name_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="gerber_name", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty1_qty_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty1_qty", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty1_labour_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty1_labour", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty1_smt_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty1_smt", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty1_unitprice_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty1_unitprice", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty1_pcbMarkup_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty1_pcbMarkup", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty1_componentMarkup_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty1_componentMarkup", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty2_qty_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty2_qty", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty2_labour_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty2_labour", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty2_smt_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty2_smt", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty2_unitprice_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty2_unitprice", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty2_pcbMarkup_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty2_pcbMarkup", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty2_componentMarkup_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty2_componentMarkup", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty3_qty_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty3_qty", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty3_labour_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty3_labour", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty3_smt_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty3_smt", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty3_unitprice_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty3_unitprice", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty3_pcbMarkup_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty3_pcbMarkup", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty3_componentMarkup_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty3_componentMarkup", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty4_qty_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty4_qty", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty4_labour_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty4_labour", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty4_smt_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty4_smt", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty4_unitprice_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty4_unitprice", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty4_pcbMarkup_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty4_pcbMarkup", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_qty4_componentMarkup_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="qty4_componentMarkup", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_note1_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="note1", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_note2_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="note2", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_note3_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="note3", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_cx_supplies_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="cx_supplies", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS_mcode_summary_column = timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Find(What:="mcode_summary", LookIn:=xlValues, LookAt:=xlWhole).Column
    timeWBsummaryWS.Rows(timeWBsummaryWS_headerRow).Hidden = True
End If

If Not bgStockHistoryWS Is Nothing Then
On Error Resume Next
    bgStockHistoryWS_Date_Column = bgStockHistoryWS.Rows(1).Find(What:="Date & Time", LookIn:=xlValues, LookAt:=xlWhole).Column
    bgStockHistoryWS_ProcBatchCode_Column = bgStockHistoryWS.Rows(1).Find(What:="Proc Batch Code", LookIn:=xlValues, LookAt:=xlWhole).Column
    bgStockHistoryWS_CPC_Column = bgStockHistoryWS.Rows(1).Find(What:="CPC", LookIn:=xlValues, LookAt:=xlWhole).Column
    bgStockHistoryWS_BGorSS_Column = bgStockHistoryWS.Rows(1).Find(What:="BG or SS?", LookIn:=xlValues, LookAt:=xlWhole).Column
    bgStockHistoryWS_EntryType_Column = bgStockHistoryWS.Rows(1).Find(What:="Entry Type", LookIn:=xlValues, LookAt:=xlWhole).Column
    bgStockHistoryWS_Qty_Column = bgStockHistoryWS.Rows(1).Find(What:="Qty (Added/Subtracted)", LookIn:=xlValues, LookAt:=xlWhole).Column
    bgStockHistoryWS_CumulativeStockLevel_Column = bgStockHistoryWS.Rows(1).Find(What:="Stock Level After Deduction (Column G)", LookIn:=xlValues, LookAt:=xlWhole).Column
    bgStockHistoryWS_Notes_Column = bgStockHistoryWS.Rows(1).Find(What:="Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
    bgStockHistoryWS_SerialNumber_Column = bgStockHistoryWS.Rows(1).Find(What:="Serial Number", LookIn:=xlValues, LookAt:=xlWhole).Column
    bgStockHistoryWS_EntryFrom_Column = bgStockHistoryWS.Rows(1).Find(What:="Entry From MasterSheet or Proc?", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not wsProcurement Is Nothing Then
On Error Resume Next
    wsProcurement_cpc_column = wsProcurement.Rows(1).Find(What:="CPC", LookIn:=xlValues, LookAt:=xlWhole).Column
    wsProcurement_procsUsed_column = wsProcurement.Rows(1).Find(What:="PROCs Used", LookIn:=xlValues, LookAt:=xlWhole).Column
End If

If Not wsProcFilePCBorder Is Nothing Then
On Error Resume Next
    ProcFile_PCBorderSheet_DistName_Column = wsProcFilePCBorder.Rows(1).Find(What:="Distributor Name", LookAt:=xlWhole, MatchCase:=False).Column
    ProcFile_PCBorderSheet_SalesOrderNumber_Column = wsProcFilePCBorder.Rows(1).Find(What:="Sales Order #", LookAt:=xlWhole, MatchCase:=False).Column
    ProcFile_PCBorderSheet_OrderNotes_Column = wsProcFilePCBorder.Rows(1).Find(What:="Order Notes", LookAt:=xlWhole, MatchCase:=False).Column
    ProcFile_PCBorderSheet_SentToJobQueue_Column = wsProcFilePCBorder.Rows(1).Find(What:="Sent to Job Queue for Invoice Collection", LookAt:=xlWhole, MatchCase:=False).Column
    ProcFile_PCBorderSheet_GMPname_Column = wsProcFilePCBorder.Rows(1).Find(What:="GMP Name", LookAt:=xlWhole, MatchCase:=False).Column
    ProcFile_PCBorderSheet_BoardLetter_Column = wsProcFilePCBorder.Rows(1).Find(What:="Board Letter", LookAt:=xlWhole, MatchCase:=False).Column
    ProcFile_PCBorderSheet_Qty_Column = wsProcFilePCBorder.Rows(1).Find(What:="Qty", LookAt:=xlWhole, MatchCase:=False).Column
    ProcFile_PCBorderSheet_Type_Column = wsProcFilePCBorder.Rows(1).Find(What:="Type", LookAt:=xlWhole, MatchCase:=False).Column
    ProcFile_PCBorderSheet_GerberName_Column = wsProcFilePCBorder.Rows(1).Find(What:="Gerber Name", LookAt:=xlWhole, MatchCase:=False).Column
    ProcFile_PCBorderSheet_StencilNumber_Column = wsProcFilePCBorder.Rows(1).Find(What:="Stencil #", LookAt:=xlWhole, MatchCase:=False).Column
    ProcFile_PCBorderSheet_OrderStatus_Column = wsProcFilePCBorder.Rows(1).Find(What:="Order Status", LookAt:=xlWhole, MatchCase:=False).Column
    ProcFile_PCBorderSheet_BOMname_Column = wsProcFilePCBorder.Rows(1).Find(What:="BOM Name", LookAt:=xlWhole, MatchCase:=False).Column
    ProcFile_PCBorderSheet_OrderDate_Column = wsProcFilePCBorder.Rows(1).Find(What:="Order Date", LookAt:=xlWhole, MatchCase:=False).Column
End If


If Not wsStencilsPositions Is Nothing Then
On Error Resume Next
    wsStencilsPositions_PositionNo_Column = wsStencilsPositions.Rows(1).Find(What:="Position No.", LookAt:=xlWhole, MatchCase:=False).Column
    wsStencilsPositions_StencilName_Column = wsStencilsPositions.Rows(1).Find(What:="Stencil Name", LookAt:=xlWhole, MatchCase:=False).Column
    wsStencilsPositions_GMPName_Column = wsStencilsPositions.Rows(1).Find(What:="GMP Name", LookAt:=xlWhole, MatchCase:=False).Column
End If


Set findrng = Nothing
End Function


Sub LoadProcureSheetColumns(ByVal ProcureSheet As Worksheet)

    Dim Procsheet_Header_Row As Long
    Dim headerDict As Object
    Dim headerList As Variant
    Dim i As Long, lastCol As Long
    Dim missing As String
    
        
    Set headerDict = CreateObject("Scripting.Dictionary")


    With ProcureSheet
        lastCol = .Cells(ProcureSheet_Header_Row, .Columns.count).End(xlToLeft).Column
        
        'SCAN HEADER ROW ONE TIME
        For i = 1 To lastCol
            If Not headerDict.Exists(.Cells(ProcureSheet_Header_Row, i).value) Then
                headerDict(.Cells(ProcureSheet_Header_Row, i).value) = i
            End If
        Next i
    End With

    'Mapping VARIABLE COLUMNs NUMBERS
    ProcureSheet_CPC_Column = headerDict("CPC")
    ProcureSheet_DistributorPartNumber_Column = headerDict("Distributor Part Number")
    ProcureSheet_UnitPrice_Column = headerDict("Unit Price")
    ProcureSheet_MFRNAME_Column = headerDict("MFR NAME")
    ProcureSheet_PNTOUSE_Column = headerDict("PN# TO USE")
    ProcureSheet_QTYAvlble_Column = headerDict("QTY Avlble")
    ProcureSheet_Distrib_Column = headerDict("Distrib")
    ProcureSheet_DistributorPN_Column = headerDict("Distributor PN (DIGIKEY MOUSER PRIORITY)")
    ProcureSheet_Notes_Column = headerDict("Notes")
    ProcureSheet_StoctStatus_Column = headerDict("Stoct Status")
    ProcureSheet_THPins_Column = headerDict("TH Pins")
    ProcureSheet_Distrbutor2name_Column = headerDict("Distrbutor 2 name")
    ProcureSheet_Distrbutor2stock_Column = headerDict("Distrbutor 2 stock")
    ProcureSheet_Distrbutor2price_Column = headerDict("Distrbutor 2 price")
    ProcureSheet_Distributor2leadtime_Column = headerDict("Distributor 2 lead time")
    ProcureSheet_LCSCPN_Column = headerDict("LCSC PN")
    ProcureSheet_SafetyStock_Column = headerDict("Safety Stock")
    ProcureSheet_StockatCustomer_Column = headerDict("Stock at Customer")
    ProcureSheet_StockatRS_Column = headerDict("Stock at RS")
    ProcureSheet_lankapnVerified_Column = headerDict("lanka pn Verified")
    ProcureSheet_LSCCPNVerified_Column = headerDict("LSCC PN Verified")
    ProcureSheet_Customer_Column = headerDict("Customer")
    ProcureSheet_FeederType_Column = headerDict("Feeder Type")
    ProcureSheet_NCRFlag_Column = headerDict("NCR Flag")
    ProcureSheet_NCRNumber_Column = headerDict("NCR Number")
    ProcureSheet_PROCsUsed_Column = headerDict("PROCs Used")

End Sub

Public Sub LoadATemplateColumns(ByVal ATEMPLATE As Worksheet)

    Dim HeaderRow As Long
    Dim headerDict As Object
    Dim i As Long, lastCol As Long

      
    Set headerDict = CreateObject("Scripting.Dictionary")

    With ATEMPLATE
        lastCol = .Cells(ATemplateSheet_Header_Row, .Columns.count).End(xlToLeft).Column
        
        'scan headers row ONE time
        For i = 1 To lastCol
            If Not headerDict.Exists(.Cells(ATemplateSheet_Header_Row, i).value) Then
                headerDict(.Cells(ATemplateSheet_Header_Row, i).value) = i
            End If
        Next i
    End With

    '----------------------------------------
    'ASSIGN COLUMN NUMBER VARIABLES
    '----------------------------------------

    ATEMPLATE_Serial_NO_Column = headerDict("Serial NO")
    ATEMPLATE_X_Quant_Column = headerDict("X Quant")
    ATEMPLATE_Extras_Column = headerDict("Extras")
    ATEMPLATE_Order_Qty_Column = headerDict("Order Qty")
    ATEMPLATE_QTY_Column = headerDict("QTY")
    ATEMPLATE_R_DES_Column = headerDict("R DES.")
    ATEMPLATE_CPC_Number_Column = headerDict("CPC #")
    ATEMPLATE_Description_Column = headerDict("Description")
    ATEMPLATE_Disrtib_Part_Number_Column = headerDict("Disrtib Part#")
    ATEMPLATE_MFR_Name_Column = headerDict("MFR Name")
    ATEMPLATE_M_CODES_Column = headerDict("M CODES")
    ATEMPLATE_MFR_Column = headerDict("MFR")
    ATEMPLATE_PN_to_USE_Column = headerDict("PN to USE")
    ATEMPLATE_Unit_Price_Column = headerDict("Unit Price")
    ATEMPLATE_Qty_Available_Column = headerDict("Qty Available")
    ATEMPLATE_Distrib_1_Column = headerDict("Distrib 1")
    ATEMPLATE_Distributor_Part_number_Column = headerDict("Distributor Part number")
    ATEMPLATE_Notes_Column = headerDict("Notes")
    ATEMPLATE_Stock_Status_Column = headerDict("Stock Status")
    ATEMPLATE_TH_Pins_Column = headerDict("TH Pins")
    ATEMPLATE_X_Quant1_Column = headerDict("X Quant1")
    ATEMPLATE_Extra1_Column = headerDict("Extra1")
    ATEMPLATE_QTY_to_order1_Column = headerDict("QTY to order1")
    ATEMPLATE_Unit_Price1_Column = headerDict("Unit Price1")
    ATEMPLATE_Ext_price_Units1_Column = headerDict("Ext price Units1")
    ATEMPLATE_X_Quant2_Column = headerDict("X Quant2")
    ATEMPLATE_Extra2_Column = headerDict("Extra2")
    ATEMPLATE_QTY_to_order2_Column = headerDict("QTY to order2")
    ATEMPLATE_Unit_Price2_Column = headerDict("Unit Price2")
    ATEMPLATE_Ext_price_Units2_Column = headerDict("Ext price Units2")
    ATEMPLATE_X_Quant3_Column = headerDict("X Quant3")
    ATEMPLATE_Extra3_Column = headerDict("Extra3")
    ATEMPLATE_QTY_to_order3_Column = headerDict("QTY to order3")
    ATEMPLATE_Unit_Price3_Column = headerDict("Unit Price3")
    ATEMPLATE_Ext_price_Units3_Column = headerDict("Ext price Units3")
    ATEMPLATE_X_Quant4_Column = headerDict("X Quant4")
    ATEMPLATE_Extra4_Column = headerDict("Extra4")
    ATEMPLATE_QTY_to_order4_Column = headerDict("QTY to order4")
    ATEMPLATE_Unit_Price4_Column = headerDict("Unit Price4")
    ATEMPLATE_Ext_price_Units4_Column = headerDict("Ext price Units4")
    ATEMPLATE_LCSC_PN1_Column = headerDict("LCSC PN1")
    ATEMPLATE_LCSC_stock1_Column = headerDict("LCSC stock1")
    ATEMPLATE_LCSC_Unit_price1_Column = headerDict("LCSC Unit price1")
    ATEMPLATE_LCSC_Ext_Price1_Column = headerDict("LCSC Ext Price1")
    ATEMPLATE_Preferred_Dist_Ext_Price1_Column = headerDict("Preferred Dist Ext Price1")
    ATEMPLATE_Best_Place_to_Buy1_Column = headerDict("Best Place to Buy1")
    ATEMPLATE_LCSC_Unit_price2_Column = headerDict("LCSC Unit price2")
    ATEMPLATE_LCSC_Ext_Price2_Column = headerDict("LCSC Ext Price2")
    ATEMPLATE_Preferred_Dist_Ext_Price2_Column = headerDict("Preferred Dist Ext Price2")
    ATEMPLATE_Best_Place_to_Buy2_Column = headerDict("Best Place to Buy2")
    ATEMPLATE_LCSC_Unit_price3_Column = headerDict("LCSC Unit price3")
    ATEMPLATE_LCSC_Ext_Price3_Column = headerDict("LCSC Ext Price3")
    ATEMPLATE_Preferred_Dist_Ext_Price3_Column = headerDict("Preferred Dist Ext Price3")
    ATEMPLATE_Best_Place_to_Buy3_Column = headerDict("Best Place to Buy3")
    ATEMPLATE_LCSC_Unit_price4_Column = headerDict("LCSC Unit price4")
    ATEMPLATE_LCSC_Ext_Price4_Column = headerDict("LCSC Ext Price4")
    ATEMPLATE_Preferred_Dist_Ext_Price4_Column = headerDict("Preferred Dist Ext Price4")
    ATEMPLATE_Best_Place_to_Buy4_Column = headerDict("Best Place to Buy4")
    ATEMPLATE_SMP_Column = headerDict("SMP")

End Sub

Public Sub LoadProcurementLogColumns(ByVal ProcurementLog As Worksheet)

    Dim HeaderRow As Long
    Dim headerDict As Object
    Dim i As Long, lastCol As Long

  
    Set headerDict = CreateObject("Scripting.Dictionary")

    With ProcurementLog
        lastCol = .Cells(ProcurementLogSheet_Header_Row, .Columns.count).End(xlToLeft).Column
        
        'scan headers row once
        For i = 1 To lastCol
            If Not headerDict.Exists(.Cells(ProcurementLogSheet_Header_Row, i).value) Then
                headerDict(.Cells(ProcurementLogSheet_Header_Row, i).value) = i
            End If
        Next i
    End With

    'assign column number variables
    ProcurementLog_Log_Time_Column = headerDict("Log Time")
    ProcurementLog_CPC_Column = headerDict("CPC")
    ProcurementLog_Proc_Batch_Code_Column = headerDict("Proc Batch Code")
    ProcurementLog_PN_to_Use_Column = headerDict("PN to Use")
    ProcurementLog_Distributor_PN_Column = headerDict("Distributor PN")
    ProcurementLog_Distributor_Name_Column = headerDict("Distributor Name")
    ProcurementLog_LCSC_PN_Column = headerDict("LCSC PN")
    ProcurementLog_Entry_From_MasterSheet_or_Proc_Column = headerDict("Entry From MasterSheet or Proc?")
    ProcurementLog_Notes_Column = headerDict("Notes")
    ProcurementLog_Other_Comments_Column = headerDict("Other Comments")

End Sub

