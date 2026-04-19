Attribute VB_Name = "Module_initialiseHeaders"
Option Explicit
Public Customer As Long
Public PO_Date As Long
Public PO_Number As Long
Public Line As Long
Public QTE As Long
Public Order_Type As Long
Public Board_Name As Long
Public Qty As Long
Public Delivery_Date_on_PO As Long
Public Unit_Price_in_PO As Long
Public Unit_Price_in_Quote As Long
Public Gross_Amount As Long
Public PO_Status As Long
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

''New Variable
Public ProductName_Column As Long
Public POQty_Column As Long
Public StencilName_Column As Long
Public MCODESSummary_Column As Long
Public DateShipped_Column As Long
Public ShippingPartner_Column As Long
Public TrackingID_Column As Long
Public PricingStatus_Column As Long
Public QtyShipped_Column As Long
Public backOrder_Column As Long


Sub initialiseHeaders(jobQueue As Worksheet)

Dim ws As Worksheet
Dim Findrng As Range

Set ws = jobQueue

Customer = ws.rows(3).Find(what:="Customer", LookIn:=xlValues, LookAt:=xlWhole).Column
PO_Date = ws.rows(3).Find(what:="PO Date", LookIn:=xlValues, LookAt:=xlWhole).Column
PO_Number = ws.rows(3).Find(what:="PO Number", LookIn:=xlValues, LookAt:=xlWhole).Column
Line = ws.rows(3).Find(what:="Line #", LookIn:=xlValues, LookAt:=xlWhole).Column
QTE = ws.rows(3).Find(what:="QTE #", LookIn:=xlValues, LookAt:=xlWhole).Column
Order_Type = ws.rows(3).Find(what:="Order Type", LookIn:=xlValues, LookAt:=xlWhole).Column
Unit_Price_in_PO = ws.rows(3).Find(what:="Unit Price in PO", LookIn:=xlValues, LookAt:=xlWhole).Column
Unit_Price_in_Quote = ws.rows(3).Find(what:="Unit Price in Quote", LookIn:=xlValues, LookAt:=xlWhole).Column
Gross_Amount = ws.rows(3).Find(what:="Gross Amount", LookIn:=xlValues, LookAt:=xlWhole).Column
Proc_Batch_Code = ws.rows(3).Find(what:="Proc Batch Code", LookIn:=xlValues, LookAt:=xlWhole).Column
Notes = ws.rows(3).Find(what:="Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
Date_Delivered = ws.rows(3).Find(what:="Date Delivered", LookIn:=xlValues, LookAt:=xlWhole).Column
Invoice_Date = ws.rows(3).Find(what:="Invoice Date", LookIn:=xlValues, LookAt:=xlWhole).Column
Invoice = ws.rows(3).Find(what:="Invoice #", LookIn:=xlValues, LookAt:=xlWhole).Column
Payment_Date = ws.rows(3).Find(what:="Payment Date", LookIn:=xlValues, LookAt:=xlWhole).Column
Order_Status = ws.rows(3).Find(what:="Order Status", LookIn:=xlValues, LookAt:=xlWhole).Column
Other_Notes = ws.rows(3).Find(what:="Other Notes", LookIn:=xlValues, LookAt:=xlWhole).Column
BOM_Name = ws.rows(3).Find(what:="BOM Name", LookIn:=xlValues, LookAt:=xlWhole).Column
Gerber_Name = ws.rows(3).Find(what:="Gerber Name", LookIn:=xlValues, LookAt:=xlWhole).Column

''Update

'Board_Name = ws.Rows(3).Find(What:="Board Name", LookIn:=xlValues, LookAt:=xlWhole).Column
'Qty = ws.Rows(3).Find(What:="Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
'Delivery_Date_on_PO = ws.Rows(3).Find(What:="Delivery Date on PO", LookIn:=xlValues, LookAt:=xlWhole).Column
'PO_Status = ws.Rows(3).Find(What:="PO Status", LookIn:=xlValues, LookAt:=xlWhole).Column
ProductName_Column = ws.rows(3).Find(what:="Product Name", LookIn:=xlValues, LookAt:=xlWhole).Column
POQty_Column = ws.rows(3).Find(what:="PO Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
StencilName_Column = ws.rows(3).Find(what:="Stencil Name", LookIn:=xlValues, LookAt:=xlWhole).Column
MCODESSummary_Column = ws.rows(3).Find(what:="MCODES Summary", LookIn:=xlValues, LookAt:=xlWhole).Column


DateShipped_Column = ws.rows(3).Find(what:="Date Shipped", LookIn:=xlValues, LookAt:=xlWhole).Column
ShippingPartner_Column = ws.rows(3).Find(what:="Shipping Partner", LookIn:=xlValues, LookAt:=xlWhole).Column
TrackingID_Column = ws.rows(3).Find(what:="Tracking ID", LookIn:=xlValues, LookAt:=xlWhole).Column

PricingStatus_Column = ws.rows(3).Find(what:="Pricing Status", LookIn:=xlValues, LookAt:=xlWhole).Column
QtyShipped_Column = ws.rows(3).Find(what:="Qty Shipped", LookIn:=xlValues, LookAt:=xlWhole).Column
backOrder_Column = ws.rows(3).Find(what:="Back Order", LookIn:=xlValues, LookAt:=xlWhole).Column


End Sub
