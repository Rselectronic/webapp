Attribute VB_Name = "CX_Headers_V1"
Public cxfile_gmp_column As Integer
Public cxfile_bomName_column As Integer
Public cxfile_bomRev_column As Integer
Public cxfile_pcbName_column As Integer
Public cxfile_pcbRev_column As Integer
Public cxfile_quoteNo_column As Integer
Public cxfile_Qty1_column As Integer
Public cxfile_assy1_column As Integer
Public cxfile_comp1_column As Integer
Public cxfile_pcb1_column As Integer
Public cxfile_total1_column As Integer
Public cxfile_totalAssy1_column As Integer
Public cxfile_totalMat1_column As Integer
Public cxfile_totalCost1_column As Integer
Public cxfile_Qty2_column As Integer
Public cxfile_assy2_column As Integer
Public cxfile_comp2_column As Integer
Public cxfile_pcb2_column As Integer
Public cxfile_total2_column As Integer
Public cxfile_totalAssy2_column As Integer
Public cxfile_totalMat2_column As Integer
Public cxfile_totalCost2_column As Integer
Public cxfile_Qty3_column As Integer
Public cxfile_assy3_column As Integer
Public cxfile_comp3_column As Integer
Public cxfile_pcb3_column As Integer
Public cxfile_total3_column As Integer
Public cxfile_totalAssy3_column As Integer
Public cxfile_totalMat3_column As Integer
Public cxfile_totalCost3_column As Integer
Public cxfile_Qty4_column As Integer
Public cxfile_assy4_column As Integer
Public cxfile_comp4_column As Integer
Public cxfile_pcb4_column As Integer
Public cxfile_total4_column As Integer
Public cxfile_totalAssy4_column As Integer
Public cxfile_totalMat4_column As Integer
Public cxfile_totalCost4_column As Integer
Public cxfile_nre1_column As Integer
Public cxfile_nre2_column As Integer
Public cxfile_nre3_column As Integer
Public cxfile_nre4_column As Integer

Sub initilizeCXfileHeader(ws As Worksheet, HeaderRow As Integer)
    cxfile_gmp_column = ws.Rows(HeaderRow).Find(What:="Global Manufacturing Package", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_bomName_column = ws.Rows(HeaderRow).Find(What:="Bom Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_bomRev_column = ws.Rows(HeaderRow).Find(What:="Bom REV", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_pcbName_column = ws.Rows(HeaderRow).Find(What:="PCB Name", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_pcbRev_column = ws.Rows(HeaderRow).Find(What:="PCB REV", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_quoteNo_column = ws.Rows(HeaderRow).Find(What:="Quote #", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_Qty1_column = ws.Rows(HeaderRow).Find(What:="Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_assy1_column = ws.Rows(HeaderRow).Find(What:="Assy", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_comp1_column = ws.Rows(HeaderRow).Find(What:="Comp", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_pcb1_column = ws.Rows(HeaderRow).Find(What:="PCB", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_total1_column = ws.Rows(HeaderRow).Find(What:="Ttl Unit Pr", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_totalAssy1_column = ws.Rows(HeaderRow).Find(What:="Ttl Assy Cost", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_totalMat1_column = ws.Rows(HeaderRow).Find(What:="Ttl Mat Cost", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_totalCost1_column = ws.Rows(HeaderRow).Find(What:="Ttl Cost", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_Qty2_column = ws.Range(ws.Cells(HeaderRow, cxfile_Qty1_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_assy2_column = ws.Range(ws.Cells(HeaderRow, cxfile_assy1_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Assy", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_comp2_column = ws.Range(ws.Cells(HeaderRow, cxfile_comp1_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Comp", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_pcb2_column = ws.Range(ws.Cells(HeaderRow, cxfile_pcb1_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="PCB", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_total2_column = ws.Range(ws.Cells(HeaderRow, cxfile_total1_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Ttl Unit Pr", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_totalAssy2_column = ws.Range(ws.Cells(HeaderRow, cxfile_totalAssy1_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Ttl Assy Cost", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_totalMat2_column = ws.Range(ws.Cells(HeaderRow, cxfile_totalMat1_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Ttl Mat Cost", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_totalCost2_column = ws.Range(ws.Cells(HeaderRow, cxfile_totalCost1_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Ttl Cost", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_Qty3_column = ws.Range(ws.Cells(HeaderRow, cxfile_Qty2_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_assy3_column = ws.Range(ws.Cells(HeaderRow, cxfile_assy2_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Assy", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_comp3_column = ws.Range(ws.Cells(HeaderRow, cxfile_comp2_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Comp", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_pcb3_column = ws.Range(ws.Cells(HeaderRow, cxfile_pcb2_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="PCB", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_total3_column = ws.Range(ws.Cells(HeaderRow, cxfile_total2_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Ttl Unit Pr", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_totalAssy3_column = ws.Range(ws.Cells(HeaderRow, cxfile_totalAssy2_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Ttl Assy Cost", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_totalMat3_column = ws.Range(ws.Cells(HeaderRow, cxfile_totalMat2_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Ttl Mat Cost", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_totalCost3_column = ws.Range(ws.Cells(HeaderRow, cxfile_totalCost2_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Ttl Cost", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_Qty4_column = ws.Range(ws.Cells(HeaderRow, cxfile_Qty3_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Qty", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_assy4_column = ws.Range(ws.Cells(HeaderRow, cxfile_assy3_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Assy", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_comp4_column = ws.Range(ws.Cells(HeaderRow, cxfile_comp3_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Comp", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_pcb4_column = ws.Range(ws.Cells(HeaderRow, cxfile_pcb3_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="PCB", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_total4_column = ws.Range(ws.Cells(HeaderRow, cxfile_total3_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Ttl Unit Pr", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_totalAssy4_column = ws.Range(ws.Cells(HeaderRow, cxfile_totalAssy3_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Ttl Assy Cost", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_totalMat4_column = ws.Range(ws.Cells(HeaderRow, cxfile_totalMat3_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Ttl Mat Cost", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_totalCost4_column = ws.Range(ws.Cells(HeaderRow, cxfile_totalCost3_column + 1), ws.Cells(3, ws.Columns.count).End(xlToRight)).Find(What:="Ttl Cost", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_nre1_column = ws.Rows(HeaderRow).Find(What:="NRE 1", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_nre2_column = ws.Rows(HeaderRow).Find(What:="NRE 2", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_nre3_column = ws.Rows(HeaderRow).Find(What:="NRE 3", LookIn:=xlValues, LookAt:=xlWhole).Column
    cxfile_nre4_column = ws.Rows(HeaderRow).Find(What:="NRE 4", LookIn:=xlValues, LookAt:=xlWhole).Column


End Sub
