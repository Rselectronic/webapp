Attribute VB_Name = "header_initialization"
Option Explicit
Public prodSch_Task_Column As Long
Public prodSch_OrderType_Column As Long
Public prodSch_Qty_Column As Long
Public prodSch_Rank_Column As Long
Public prodSch_PoNumber_Column As Long
Public prodSch_LineNo_Column As Long
Public prodSch_ReceptionofMaterial_Column As Long
Public prodSch_SMTdeliveryDate_Column As Long
Public prodSch_ProductionDate_Column As Long
Public prodSch_ReceptionQtyDone_Column As Long
Public prodSch_SetupQtyDone_Column As Long
Public prodSch_smtTopQtyDone_Column As Long
Public prodSch_smtBottomQtyDone_Column As Long
Public prodSch_THdeliveryDate_Column As Long
Public prodSch_THdate_Column As Long
Public prodSch_InspectionQtyDone_Column As Long
Public prodSch_THqtyDone_Column As Long
Public prodSch_WashingQtyDone_Column As Long
Public prodSch_PackingQtyDone_Column As Long
Public prodSch_DueDate_Column As Long
Public prodSch_TotalTimeLeft_Column As Long
Public prodSch_Comments_Column As Long
Public prodSch_CustomerName_Column As Long
Public prodSch_BoardLetter_Column As Long
Public prodSch_ReceptionFileStatus_Column As Long
Public prodSch_StencilStatus_Column As Long
Public prodSch_ProgrammingStatus_Column As Long
Public prodSch_PCBStatus_Column As Long
Public prodSch_ProductionStatus_Column As Long
Public prodSch_SMTHours_Column As Long
Public prodSch_LabourHours_Column As Long
Public prodSch_McodeSummary_Column As Long
Public prodSch_SolderType_Column As Long
Public prodSch_VersionChange_Column As Long
Public prodSch_Comment2_Column As Long


''Update Anil 10/30/2025
Public prodSch_StencilName_Column As Long
''/

Public procLog_TrackingSheet_OrderDate_Column As Long
Public procLog_TrackingSheet_ProcBatchCode_Column As Long
Public procLog_TrackingSheet_DistributorName_Column As Long
Public procLog_TrackingSheet_SalesOrder_Column As Long
Public procLog_TrackingSheet_ShipmentStatus_Column As Long
Public procLog_TrackingSheet_TrackingID_Column As Long
Public procLog_TrackingSheet_CourierName_Column As Long
Public procLog_TrackingSheet_LastStatus_Column As Long
Public procLog_TrackingSheet_DeliveryDate_Column As Long

Public procLog_LogSheet_ProcBatchCode_Column As Long
Public procLog_LogSheet_BoardName_Column As Long
Public procLog_LogSheet_ComponentStatus_Column As Long
Public procLog_LogSheet_PCBStencilStatus_Column As Long
Public procLog_LogSheet_Notes_Column As Long
Public procLog_LogSheet_DeliveryStatus_Column As Long

Public procLog_ProcLinesSheet_EntryDate_Column As Long
Public procLog_ProcLinesSheet_ProcBatchCode_Column As Long
Public procLog_ProcLinesSheet_CPC_Column As Long
Public procLog_ProcLinesSheet_CustomerMPN_Column As Long
Public procLog_ProcLinesSheet_CustomerMFR_Column As Long
Public procLog_ProcLinesSheet_Mcode_Column As Long
Public procLog_ProcLinesSheet_OrderQty_Column As Long
Public procLog_ProcLinesSheet_BoardName_Column As Long
Public procLog_ProcLinesSheet_PlaceBought_Column As Long
Public procLog_ProcLinesSheet_SalesOrderNumber_Column As Long
Public procLog_ProcLinesSheet_CustomerRef_Column As Long
Public procLog_ProcLinesSheet_UnitPrice_Column As Long
Public procLog_ProcLinesSheet_ExtPrice_Column As Long

Public wsJobQueue_PONumber_Column As Long
Public wsJobQueue_ProductName_Column As Long
Public wsJobQueue_OrderType_Column As Long
Public wsJobQueue_POQty_Column As Long
Public wsJobQueue_QtyShipped_Column As Long
Public wsJobQueue_BackOrder_Column As Long
Public wsJobQueue_OrderStatus_Column As Long

''Anil 10/30/2025"
Public wsStencilsPositions_PositionNo_Column As Long
Public wsStencilsPositions_StencilName_Column As Long
Public wsStencilsPositions_GMPName_Column As Long
Public wsStencilsPositions_Status_Column As Long
Public wsStencilsPositions_Comment_Column As Long
''Anil 10/30/2025"

Sub initaliseHeaders(Optional wsProdSch As Worksheet, Optional wsProcLog_TrackingSheet As Worksheet, _
                    Optional wsProcLog_LogSheet As Worksheet, Optional wsProcLog_ProcLinesSheet As Worksheet, _
                    Optional wsJobQueue As Worksheet, Optional wsStencilsPositions As Worksheet)

    If Not wsProdSch Is Nothing Then
        Dim col As Long
        Dim lastCol As Long
        
        lastCol = wsProdSch.Cells(5, wsProdSch.Columns.Count).End(xlToLeft).Column
        
        ' Initialize all column variables to 0 (optional but good practice)
        prodSch_Task_Column = 0
        prodSch_OrderType_Column = 0
        prodSch_Qty_Column = 0
        prodSch_Rank_Column = 0
        prodSch_PoNumber_Column = 0
        prodSch_LineNo_Column = 0
        prodSch_ReceptionofMaterial_Column = 0
        prodSch_SMTdeliveryDate_Column = 0
        prodSch_ProductionDate_Column = 0
        prodSch_ReceptionQtyDone_Column = 0
        prodSch_SetupQtyDone_Column = 0
        prodSch_smtTopQtyDone_Column = 0
        prodSch_smtBottomQtyDone_Column = 0
        prodSch_THdeliveryDate_Column = 0
        prodSch_THdate_Column = 0
        prodSch_InspectionQtyDone_Column = 0
        prodSch_THqtyDone_Column = 0
        prodSch_WashingQtyDone_Column = 0
        prodSch_PackingQtyDone_Column = 0
        prodSch_DueDate_Column = 0
        prodSch_TotalTimeLeft_Column = 0
        prodSch_Comments_Column = 0
        
        ''Anil 10/30/2025"
        prodSch_StencilName_Column = 0
        ''Anil 10/30/2025"
        
        
        For col = 1 To lastCol
            Dim headerText As String
            headerText = wsProdSch.Cells(5, col).Value
            
            Select Case headerText
                Case "task": prodSch_Task_Column = col
                Case "order_type": prodSch_OrderType_Column = col
                Case "order_qty": prodSch_Qty_Column = col
                Case "rank": prodSch_Rank_Column = col
                Case "po_number": prodSch_PoNumber_Column = col
                Case "line_number": prodSch_LineNo_Column = col
                Case "reception_of_material": prodSch_ReceptionofMaterial_Column = col
                Case "smt_delivery_date": prodSch_SMTdeliveryDate_Column = col
                Case "production_date": prodSch_ProductionDate_Column = col
                Case "reception_qty_done": prodSch_ReceptionQtyDone_Column = col
                Case "setup_qty_done": prodSch_SetupQtyDone_Column = col
                Case "smt_top_qty_done": prodSch_smtTopQtyDone_Column = col
                Case "smt_bottom_qty_done": prodSch_smtBottomQtyDone_Column = col
                Case "th_delivery_date": prodSch_THdeliveryDate_Column = col
                Case "th_date": prodSch_THdate_Column = col
                Case "inspection_qty_done": prodSch_InspectionQtyDone_Column = col
                Case "th_qty_done": prodSch_THqtyDone_Column = col
                Case "washing_qty_done": prodSch_WashingQtyDone_Column = col
                Case "packing_qty_done": prodSch_PackingQtyDone_Column = col
                Case "due_date": prodSch_DueDate_Column = col
                Case "total_time_left": prodSch_TotalTimeLeft_Column = col
                Case "comments": prodSch_Comments_Column = col
                
                ''Piyush 11/10/2025''
                Case "customer_name": prodSch_CustomerName_Column = col
                Case "board_letter": prodSch_BoardLetter_Column = col
                Case "reception_file_status": prodSch_ReceptionFileStatus_Column = col
                Case "stencil_status": prodSch_StencilStatus_Column = col
                Case "programming_status": prodSch_ProgrammingStatus_Column = col
                Case "pcb_status": prodSch_PCBStatus_Column = col
                Case "production_status": prodSch_ProductionStatus_Column = col
                Case "smt_hours": prodSch_SMTHours_Column = col
                Case "labour_hours": prodSch_LabourHours_Column = col
                Case "mcode_summary": prodSch_McodeSummary_Column = col
                Case "solder_type": prodSch_SolderType_Column = col
                Case "version_change": prodSch_VersionChange_Column = col
                Case "comment_2": prodSch_Comment2_Column = col
                
                ''Piyush 11/10/2025''
                
                ''Anil 10/30/2025"
                Case "stencil_name": prodSch_StencilName_Column = col
                ''Anil 10/30/2025"

            End Select
        Next col
    End If
    
    
    If Not wsProcLog_TrackingSheet Is Nothing Then
        lastCol = wsProcLog_TrackingSheet.Cells(2, wsProcLog_TrackingSheet.Columns.Count).End(xlToLeft).Column
        procLog_TrackingSheet_OrderDate_Column = 0
        procLog_TrackingSheet_ProcBatchCode_Column = 0
        procLog_TrackingSheet_DistributorName_Column = 0
        procLog_TrackingSheet_SalesOrder_Column = 0
        procLog_TrackingSheet_ShipmentStatus_Column = 0
        procLog_TrackingSheet_TrackingID_Column = 0
        procLog_TrackingSheet_CourierName_Column = 0
        procLog_TrackingSheet_LastStatus_Column = 0
        procLog_TrackingSheet_DeliveryDate_Column = 0
        
        For col = 1 To lastCol
            headerText = wsProcLog_TrackingSheet.Cells(2, col).Value
            
            Select Case headerText
                Case "Order Date": procLog_TrackingSheet_OrderDate_Column = col
                Case "Proc Batch Code": procLog_TrackingSheet_ProcBatchCode_Column = col
                Case "Distributor Name": procLog_TrackingSheet_DistributorName_Column = col
                Case "Sales Order": procLog_TrackingSheet_SalesOrder_Column = col
                Case "Shipment Status": procLog_TrackingSheet_ShipmentStatus_Column = col
                Case "Tracking ID": procLog_TrackingSheet_TrackingID_Column = col
                Case "Courier Name": procLog_TrackingSheet_CourierName_Column = col
                Case "Last status": procLog_TrackingSheet_LastStatus_Column = col
                Case "Delivery Date": procLog_TrackingSheet_DeliveryDate_Column = col
            End Select
        Next col
    End If
    
    If Not wsProcLog_LogSheet Is Nothing Then
        lastCol = wsProcLog_LogSheet.Cells(1, wsProcLog_LogSheet.Columns.Count).End(xlToLeft).Column
        procLog_LogSheet_ProcBatchCode_Column = 0
        procLog_LogSheet_BoardName_Column = 0
        procLog_LogSheet_ComponentStatus_Column = 0
        procLog_LogSheet_PCBStencilStatus_Column = 0
        procLog_LogSheet_Notes_Column = 0
        procLog_LogSheet_DeliveryStatus_Column = 0
        
        For col = 1 To lastCol
            headerText = wsProcLog_LogSheet.Cells(1, col).Value
            
            Select Case headerText
                Case "PROC BATCH CODE": procLog_LogSheet_ProcBatchCode_Column = col
                Case "Board Name": procLog_LogSheet_BoardName_Column = col
                Case "Components Status": procLog_LogSheet_ComponentStatus_Column = col
                Case "PCB/Stencil Status": procLog_LogSheet_PCBStencilStatus_Column = col
                Case "Notes": procLog_LogSheet_Notes_Column = col
                Case "Delivery Status": procLog_LogSheet_DeliveryStatus_Column = col
            End Select
        Next col
    End If
    
    If Not wsProcLog_ProcLinesSheet Is Nothing Then
        lastCol = wsProcLog_ProcLinesSheet.Cells(2, wsProcLog_ProcLinesSheet.Columns.Count).End(xlToLeft).Column
        procLog_ProcLinesSheet_EntryDate_Column = 0
        procLog_ProcLinesSheet_ProcBatchCode_Column = 0
        procLog_ProcLinesSheet_CPC_Column = 0
        procLog_ProcLinesSheet_CustomerMPN_Column = 0
        procLog_ProcLinesSheet_CustomerMFR_Column = 0
        procLog_ProcLinesSheet_Mcode_Column = 0
        procLog_ProcLinesSheet_OrderQty_Column = 0
        procLog_ProcLinesSheet_BoardName_Column = 0
        procLog_ProcLinesSheet_PlaceBought_Column = 0
        procLog_ProcLinesSheet_SalesOrderNumber_Column = 0
        procLog_ProcLinesSheet_CustomerRef_Column = 0
        procLog_ProcLinesSheet_UnitPrice_Column = 0
        procLog_ProcLinesSheet_ExtPrice_Column = 0
        
        For col = 1 To lastCol
            headerText = wsProcLog_ProcLinesSheet.Cells(2, col).Value
            
            Select Case headerText
                Case "Entry Date": procLog_ProcLinesSheet_EntryDate_Column = col
                Case "Proc batch code": procLog_ProcLinesSheet_ProcBatchCode_Column = col
                Case "CPC": procLog_ProcLinesSheet_CPC_Column = col
                Case "Customer MPN": procLog_ProcLinesSheet_CustomerMPN_Column = col
                Case "Customer MFR": procLog_ProcLinesSheet_CustomerMFR_Column = col
                Case "Mcode": procLog_ProcLinesSheet_Mcode_Column = col
                Case "QTY": procLog_ProcLinesSheet_OrderQty_Column = col
                Case "Board Name": procLog_ProcLinesSheet_BoardName_Column = col
                Case "Place Bought": procLog_ProcLinesSheet_PlaceBought_Column = col
                Case "Sales Order": procLog_ProcLinesSheet_SalesOrderNumber_Column = col
                Case "Customer Ref": procLog_ProcLinesSheet_CustomerRef_Column = col
                Case "Unit Price": procLog_ProcLinesSheet_UnitPrice_Column = col
                Case "Ext Price": procLog_ProcLinesSheet_ExtPrice_Column = col
            End Select
        Next col
    End If
    
    If Not wsJobQueue Is Nothing Then
        lastCol = wsJobQueue.Cells(3, wsJobQueue.Columns.Count).End(xlToLeft).Column
        
        wsJobQueue_PONumber_Column = 0
        wsJobQueue_ProductName_Column = 0
        wsJobQueue_OrderType_Column = 0
        wsJobQueue_POQty_Column = 0
        wsJobQueue_QtyShipped_Column = 0
        wsJobQueue_BackOrder_Column = 0
        wsJobQueue_OrderStatus_Column = 0
        
        For col = 1 To lastCol
            headerText = wsJobQueue.Cells(3, col).Value
            
            Select Case headerText
                Case "PO Number": wsJobQueue_PONumber_Column = col
                Case "Product Name": wsJobQueue_ProductName_Column = col
                Case "Order Type": wsJobQueue_OrderType_Column = col
                Case "PO Qty": wsJobQueue_POQty_Column = col
                Case "QTY Shipped": wsJobQueue_QtyShipped_Column = col
                Case "Back Order": wsJobQueue_BackOrder_Column = col
                Case "Order Status": wsJobQueue_OrderStatus_Column = col
            End Select
        Next col
    End If
    
    ''Anil 10/30/2025"
    If Not wsStencilsPositions Is Nothing Then
        wsStencilsPositions_PositionNo_Column = wsStencilsPositions.Rows(1).Find(What:="Position No.", LookAt:=xlWhole, MatchCase:=False).Column
        wsStencilsPositions_StencilName_Column = wsStencilsPositions.Rows(1).Find(What:="Stencil Name", LookAt:=xlWhole, MatchCase:=False).Column
        wsStencilsPositions_GMPName_Column = wsStencilsPositions.Rows(1).Find(What:="GMP Name", LookAt:=xlWhole, MatchCase:=False).Column
    End If
    ''Anil 10/30/2025"

End Sub
