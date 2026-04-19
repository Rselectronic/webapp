Attribute VB_Name = "mod_SettingWsGlobalVariables"
'======this module to store global variables referencing for setting sheet for easy of referencing==========


Option Explicit
Public Set_Programming_Rng As Range
Public Set_Stencil_Rng As Range
Public Set_PCB_FAB_Rng As Range
Public Set_Misc_NRE_Rng As Range
Public Set_Quote_Number_Rng As Range
Public Set_Mfg_Package_Rng As Range
Public Set_Bom_Name_Rng As Range
Public Set_Rev_Rng As Range
Public Set_PCB_Name_Rng As Range
Public Set_Rev0_Rng As Range
Public Set_Board_Name_Rng As Range
Public Set_Total_BOM_Lines_Rng As Range
Public Set_SMT_Placement_Rng As Range
Public Set_CP_Feeders_Rng As Range
Public Set_CP_Parts_Rng As Range
Public Set_IP_Feeders_Count_Rng As Range
Public Set_IP_Parts_Per_PCB_Rng As Range
Public Set_SMT_Parts_Top_Bottom_Rng As Range
Public Set_TH_Parts_Per_Board_Rng As Range
Public Set_Pins_Per_PCB_Rng As Range
Public Set_Quote_Number_With_Rev_Rng As Range
Public Set_Boards_In_Panel_Rng As Range
Public Set_Double_Side_Rng As Range
Public Set_Qty_Label_Rng As Range

Public Set_Description1_Rng As Range
Public Set_Quantities_Rng As Range
Public Set_Labour_Rate_Rng As Range
Public Set_SMT_Rate_Rng As Range
Public Set_Assembly_Cost_Rng As Range
Public Set_PCB_Cost_Rng As Range
Public Set_PCB_Markup_Rng As Range
Public Set_Component_Cost_Rng As Range
Public Set_Component_Markup_Rng As Range
Public Set_Conformal_Coating_Rng As Range
Public Set_Unit_Price_Rng As Range
Public Set_Conformal_Coat_PriceTblHead_Rng As Range
Public Set_Subtotal_Rng As Range
Public Set_Lead_Time_Rng As Range
Public Set_Qty_Per_Board_Rng As Range
Public Set_Customer_PN_Rng As Range
Public Set_Description_Rng As Range
Public Set_MFR_PN_Rng As Range
Public Set_MFR_Name_Rng As Range
Public Set_Status_Rng As Range
Public Set_Cost_In_Quote_Rng As Range
Public Set_Notes_Start_First6_Rng As Range
Public Set_Notes_Last6_Rng As Range

Public Set_PCB_Proc_Charges_Rng As Range
Public Set_Comp_Proc_Charges_Rng As Range
Public Set_Comp_Ship_Charges_Rng As Range
Public Set_Currency_Option_Rng As Range
Public Set_Currency_Exchange_Rate_Rng As Range

Public Set_Qty_Adjuster_Rng As Range
Public Set_Qty_Adjuster_DD_Rng As Range


Public Const Set_QtyMatrics_Row As Long = 2
Public Const Set_QtyMatrics_Start_Col As Long = 45
Public Const Set_QtyMatrics_End_Col As Long = 190
Public Const Set_QtyMatrics_Data_Start_Row As Long = 3
Public Const Set_QtyMatrics_Data_End_Row As Long = 26
Public Const maxQuantities As Long = 20



Public Sub LoadGlobalRanges()
    Dim wsSettings As Worksheet
    Dim wsFinal As Worksheet
    Dim lastRow As Long
    Dim i As Long
    Dim addr As String
    
    Set wsSettings = Sheets("Settings")
    Set wsFinal = Sheets("final-Design1") ' CHANGE if needed
    
    lastRow = wsSettings.Cells(wsSettings.Rows.Count, "A").End(xlUp).Row
'
'    Set_QtyMatrics_Row = 2
'    Set_QtyMatrics_Start_Col = 45
'    Set_QtyMatrics_End_Col = 190
'    Set_QtyMatrics_Data_Start_Row = 3
'    Set_QtyMatrics_Data_End_Row = 26
    
    For i = 2 To lastRow
        addr = Trim(wsSettings.Cells(i, "C").Value)
        If addr = "" Then GoTo nextRow
        
        Select Case wsSettings.Cells(i, "A").Value
            Case "Set_Programming_Rng":         Set Set_Programming_Rng = wsFinal.Range(addr)
            Case "Set_Stencil_Rng":             Set Set_Stencil_Rng = wsFinal.Range(addr)
            Case "Set_Quote_Number_Rng":        Set Set_Quote_Number_Rng = wsFinal.Range(addr)
            Case "Set_PCB_FAB_Rng":             Set Set_PCB_FAB_Rng = wsFinal.Range(addr)
            Case "Set_Misc_NRE_Rng":            Set Set_Misc_NRE_Rng = wsFinal.Range(addr)
            Case "Set_Mfg_Package_Rng":         Set Set_Mfg_Package_Rng = wsFinal.Range(addr)
            Case "Set_Bom_Name_Rng":            Set Set_Bom_Name_Rng = wsFinal.Range(addr)
            Case "Set_Rev_Rng":                 Set Set_Rev_Rng = wsFinal.Range(addr)
            Case "Set_PCB_Name_Rng":            Set Set_PCB_Name_Rng = wsFinal.Range(addr)
            Case "Set_Rev0_Rng":                Set Set_Rev0_Rng = wsFinal.Range(addr)
            Case "Set_Board_Name_Rng":          Set Set_Board_Name_Rng = wsFinal.Range(addr)
            Case "Set_Total_BOM_Lines_Rng":     Set Set_Total_BOM_Lines_Rng = wsFinal.Range(addr)
            Case "Set_SMT_Placement_Rng":       Set Set_SMT_Placement_Rng = wsFinal.Range(addr)
            Case "Set_CP_Feeders_Rng":          Set Set_CP_Feeders_Rng = wsFinal.Range(addr)
            Case "Set_CP_Parts_Rng":            Set Set_CP_Parts_Rng = wsFinal.Range(addr)
            Case "Set_IP_Feeders_Count_Rng":    Set Set_IP_Feeders_Count_Rng = wsFinal.Range(addr)
            Case "Set_IP_Parts_Per_PCB_Rng":    Set Set_IP_Parts_Per_PCB_Rng = wsFinal.Range(addr)
            Case "Set_SMT_Parts_Top_Bottom_Rng": Set Set_SMT_Parts_Top_Bottom_Rng = wsFinal.Range(addr)
            Case "Set_TH_Parts_Per_Board_Rng":     Set Set_TH_Parts_Per_Board_Rng = wsFinal.Range(addr)
            Case "Set_Pins_Per_PCB_Rng":        Set Set_Pins_Per_PCB_Rng = wsFinal.Range(addr)
            Case "Set_Quote_Number_With_Rev_Rng": Set Set_Quote_Number_With_Rev_Rng = wsFinal.Range(addr)
            Case "Set_Boards_In_Panel_Rng":     Set Set_Boards_In_Panel_Rng = wsFinal.Range(addr)
            Case "Set_Double_Side_Rng":         Set Set_Double_Side_Rng = wsFinal.Range(addr)
            Case "Set_Qty_Label_Rng":          Set Set_Qty_Label_Rng = wsFinal.Range(addr)
           
            Case "Set_Description1_Rng":        Set Set_Description1_Rng = wsFinal.Range(addr)
            Case "Set_Quantities_Rng":          Set Set_Quantities_Rng = wsFinal.Range(addr)
            Case "Set_Labour_Rate_Rng":         Set Set_Labour_Rate_Rng = wsFinal.Range(addr)
            Case "Set_SMT_Rate_Rng":            Set Set_SMT_Rate_Rng = wsFinal.Range(addr)
            Case "Set_Assembly_Cost_Rng":       Set Set_Assembly_Cost_Rng = wsFinal.Range(addr)
            Case "Set_PCB_Cost_Rng":            Set Set_PCB_Cost_Rng = wsFinal.Range(addr)
            Case "Set_PCB_Markup_Rng":          Set Set_PCB_Markup_Rng = wsFinal.Range(addr)
            Case "Set_Component_Cost_Rng":      Set Set_Component_Cost_Rng = wsFinal.Range(addr)
            Case "Set_Component_Markup_Rng":    Set Set_Component_Markup_Rng = wsFinal.Range(addr)
            Case "Set_Conformal_Coating_Rng":       Set Set_Conformal_Coating_Rng = wsFinal.Range(addr)
            Case "Set_Unit_Price_Rng":          Set Set_Unit_Price_Rng = wsFinal.Range(addr)
            Case "Set_Conformal_Coat_PriceTblHead_Rng":          Set Set_Conformal_Coat_PriceTblHead_Rng = wsFinal.Range(addr)
            Case "Set_Comp_Ship_Charges_Rng":          Set Set_Comp_Ship_Charges_Rng = wsFinal.Range(addr)
                 
           
            Case "Set_Subtotal_Rng":            Set Set_Subtotal_Rng = wsFinal.Range(addr)
            Case "Set_Lead_Time_Rng":           Set Set_Lead_Time_Rng = wsFinal.Range(addr)
            Case "Set_Qty_Per_Board_Rng":       Set Set_Qty_Per_Board_Rng = wsFinal.Range(addr)
            Case "Set_Customer_PN_Rng":         Set Set_Customer_PN_Rng = wsFinal.Range(addr)
            Case "Set_Description_Rng":         Set Set_Description_Rng = wsFinal.Range(addr)
            Case "Set_MFR_PN_Rng":              Set Set_MFR_PN_Rng = wsFinal.Range(addr)
            Case "Set_MFR_Name_Rng":            Set Set_MFR_Name_Rng = wsFinal.Range(addr)
            Case "Set_Status_Rng":              Set Set_Status_Rng = wsFinal.Range(addr)
            Case "Set_Cost_In_Quote_Rng":       Set Set_Cost_In_Quote_Rng = wsFinal.Range(addr)
            Case "Set_Notes_Start_First6_Rng":  Set Set_Notes_Start_First6_Rng = wsFinal.Range(addr)
            Case "Set_Notes_Last6_Rng":         Set Set_Notes_Last6_Rng = wsFinal.Range(addr)
            Case "Set_PCB_Proc_Charges_Rng":    Set Set_PCB_Proc_Charges_Rng = wsFinal.Range(addr)
            Case "Set_Comp_Proc_Charges_Rng":   Set Set_Comp_Proc_Charges_Rng = wsFinal.Range(addr)
            Case "Set_Currency_Option_Rng": Set Set_Currency_Option_Rng = wsFinal.Range(addr)
            Case "Set_Currency_Exchange_Rate_Rng": Set Set_Currency_Exchange_Rate_Rng = wsFinal.Range(addr)
            Case "Set_Qty_Adjuster_Rng":        Set Set_Qty_Adjuster_Rng = wsFinal.Range(addr)
            Case "Set_Qty_Adjuster_DD_Rng":     Set Set_Qty_Adjuster_DD_Rng = wsFinal.Range(addr)
            
        End Select
       
        
nextRow:
    Next i
End Sub


