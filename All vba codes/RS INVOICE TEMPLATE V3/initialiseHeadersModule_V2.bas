Attribute VB_Name = "initialiseHeadersModule_V2"
Option Explicit
Public jobQueueWs_customer As Long
Public jobQueueWs_PO_Date As Long
Public jobQueueWs_PO_Number As Long
Public jobQueueWs_Line As Long
Public jobQueueWs_QTE As Long
Public jobQueueWs_Order_Type As Long
Public jobQueueWs_Board_Name As Long
Public jobQueueWs_qty As Long
Public jobQueueWs_Delivery_Date_on_PO As Long
Public jobQueueWs_Unit_Price_in_PO As Long
Public jobQueueWs_Unit_Price_in_Quote As Long
Public jobQueueWs_Gross_Amount As Long
Public jobQueueWs_PO_Status As Long
Public jobQueueWs_Proc_Batch_Code As Long
Public jobQueueWs_Notes As Long
Public jobQueueWs_Date_Delivered As Long
Public jobQueueWs_Invoice_Date As Long
Public jobQueueWs_Invoice As Long
Public jobQueueWs_Payment_Date As Long
Public jobQueueWs_Order_Status As Long
Public jobQueueWs_Other_Notes As Long
Public jobQueueWs_BOM_Name As Long
Public jobQueueWs_Gerber_Name As Long

''New Variable
Public jobQueueWs_ProductName_Column As Long
Public jobQueueWs_POQty_Column As Long
Public jobQueueWs_StencilName_Column As Long
Public jobQueueWs_MCODESSummary_Column As Long
Public jobQueueWs_InvoiceAmount_Column As Long
Public jobQueueWs_Subtotal_Column As Long
Public jobQueueWs_GST_Column As Long
Public jobQueueWs_QST_Column As Long

Public Subtotal_Row_Invoice As Long
Public TPSGST_Row_Invoice As Long
Public TVQQST_Row_Invoice As Long
Public TOTAL_Row_Invoice As Long

Public Discount_Row_Invoice As Long
Public Freight_Row_Invoice As Long

Public invSummary_InvoiceDate_Column As Long
Public invSummary_CustomerName_Column As Long
Public invSummary_POnumber_Column As Long
Public invSummary_InvoiceNo_Column As Long
Public invSummary_SubTotal_Column As Long
Public invSummary_GST_Column As Long
Public invSummary_QST_Column As Long
Public invSummary_Total_Column As Long



Public Function initialiseHeaders(jobWS As Worksheet)

Dim ws As Worksheet
Dim Findrng As Range

Set ws = jobWS

jobQueueWs_customer = ws.rows(3).Find(What:="Customer", LookIn:=xlValues, LookAt:=xlWhole).Column
jobQueueWs_PO_Number = ws.rows(3).Find(What:="PO Number", LookIn:=xlValues, LookAt:=xlWhole).Column
jobQueueWs_Order_Status = ws.rows(3).Find(What:="Order Status", LookIn:=xlValues, LookAt:=xlWhole).Column
jobQueueWs_Order_Type = ws.rows(3).Find(What:="Order Type", LookIn:=xlValues, LookAt:=xlWhole).Column
jobQueueWs_Invoice_Date = ws.rows(3).Find(What:="Invoice Date", LookIn:=xlValues, LookAt:=xlWhole).Column
jobQueueWs_Invoice = ws.rows(3).Find(What:="Invoice #", LookIn:=xlValues, LookAt:=xlWhole).Column
jobQueueWs_InvoiceAmount_Column = ws.rows(3).Find(What:="Invoice Amount", LookIn:=xlValues, LookAt:=xlWhole).Column
jobQueueWs_Subtotal_Column = ws.rows(3).Find(What:="Sub Total", LookIn:=xlValues, LookAt:=xlWhole).Column
jobQueueWs_POQty_Column = ws.rows(3).Find(What:="PO Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
jobQueueWs_Unit_Price_in_PO = ws.rows(3).Find(What:="Unit Price in PO", LookIn:=xlValues, LookAt:=xlWhole).Column
jobQueueWs_GST_Column = ws.rows(3).Find(What:="GST", LookIn:=xlValues, LookAt:=xlWhole).Column
jobQueueWs_QST_Column = ws.rows(3).Find(What:="QST", LookIn:=xlValues, LookAt:=xlWhole).Column
jobQueueWs_ProductName_Column = ws.rows(3).Find(What:="Product Name", LookIn:=xlValues, LookAt:=xlWhole).Column

End Function

Public Function initialiseHeadersInvoices(invWS As Worksheet)

Subtotal_Row_Invoice = invWS.Columns("I:I").Find(What:="Subtotal", LookIn:=xlValues, LookAt:=xlWhole, After:=invWS.Cells(1, "i")).Row
TPSGST_Row_Invoice = invWS.Columns("I:I").Find(What:="TPS/GST", LookIn:=xlValues, LookAt:=xlWhole, After:=invWS.Cells(1, "i")).Row
TVQQST_Row_Invoice = invWS.Columns("I:I").Find(What:="TVQ/QST", LookIn:=xlValues, LookAt:=xlWhole, After:=invWS.Cells(1, "i")).Row
TOTAL_Row_Invoice = invWS.Columns("I:I").Find(What:="TOTAL", LookIn:=xlValues, LookAt:=xlWhole, After:=invWS.Cells(1, "i")).Row
Discount_Row_Invoice = invWS.Columns("I:I").Find(What:="Discount", LookIn:=xlValues, LookAt:=xlWhole, After:=invWS.Cells(1, "i")).Row
Freight_Row_Invoice = invWS.Columns("I:I").Find(What:="Freight", LookIn:=xlValues, LookAt:=xlWhole, After:=invWS.Cells(1, "i")).Row

End Function

Public Function initialiseHeadersInvoiceSummary(invSummaryWS As Worksheet)

invSummary_InvoiceDate_Column = invSummaryWS.rows(1).Find(What:="Invoice Date", LookIn:=xlValues, LookAt:=xlWhole).Column
invSummary_CustomerName_Column = invSummaryWS.rows(1).Find(What:="Customer Name", LookIn:=xlValues, LookAt:=xlWhole).Column
invSummary_POnumber_Column = invSummaryWS.rows(1).Find(What:="PO Number", LookIn:=xlValues, LookAt:=xlWhole).Column
invSummary_InvoiceNo_Column = invSummaryWS.rows(1).Find(What:="Invoice #", LookIn:=xlValues, LookAt:=xlWhole).Column
invSummary_SubTotal_Column = invSummaryWS.rows(1).Find(What:="Sub Total", LookIn:=xlValues, LookAt:=xlWhole).Column
invSummary_GST_Column = invSummaryWS.rows(1).Find(What:="GST", LookIn:=xlValues, LookAt:=xlWhole).Column
invSummary_QST_Column = invSummaryWS.rows(1).Find(What:="QST", LookIn:=xlValues, LookAt:=xlWhole).Column
invSummary_Total_Column = invSummaryWS.rows(1).Find(What:="Total", LookIn:=xlValues, LookAt:=xlWhole).Column


End Function
