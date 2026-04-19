Attribute VB_Name = "get_pcbName_StencilName_Module"
Option Explicit
Sub get_pcbName_StencilName()

Dim procPCBws As Worksheet
Set procPCBws = ThisWorkbook.Sheets("PCB + Stencils Orders")

initialiseHeaders , , , , , , procPCBws

Dim procPCBwsLR As Long
procPCBwsLR = procPCBws.Cells(procPCBws.Rows.count, PCB_ProcSheet_GMP__Column).End(xlUp).Row

Dim i As Integer
Dim rGerberName As String
Dim rStencilName As String


For i = 2 To procPCBwsLR
    
    rStencilName = procPCBws.Cells(i, PCB_ProcSheet_PCBStencil__Column)
    
    If rStencilName = "" Then
        rStencilName = "Need to buy"
    End If
    
    'Dim activeQTY As Integer
    
    procPCBws.Cells(i, PCB_ProcSheet_PCBStencil__Column) = rStencilName
    procPCBws.Cells(i, PCB_ProcSheet_Type__Column) = "PCB"
    'procPCBws.Cells(i, PCB_ProcSheet_Qty__Column) = activeQTY
    
    
    ' Dropdown list for order status
    
    procPCBws.Cells(i, PCB_ProcSheet_OrderStatus_Column).Validation.Delete
    With procPCBws.Cells(i, PCB_ProcSheet_OrderStatus_Column)
        .Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, Formula1:="Complete,Ask Manager,RFQ sent waiting for Price"
        .Validation.IgnoreBlank = True
        .Validation.InCellDropdown = True
        .Validation.ShowInput = True
        .Validation.ShowError = False
        
    End With

If rStencilName = "Need to buy" Then
    procPCBws.Rows(i).Copy
    procPCBws.Rows(procPCBwsLR + 1).PasteSpecial Paste:=xlPasteAll
    procPCBws.Cells(procPCBwsLR + 1, PCB_ProcSheet_Qty__Column) = "1"
    procPCBws.Cells(procPCBwsLR + 1, PCB_ProcSheet_Type__Column) = "Stencil"
    procPCBws.Cells(procPCBwsLR + 1, PCB_ProcSheet_PCBStencil__Column) = ""
    procPCBwsLR = procPCBwsLR + 1
End If


    
Next i

Application.CutCopyMode = False

End Sub
