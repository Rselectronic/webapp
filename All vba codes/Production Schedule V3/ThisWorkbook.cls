VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ThisWorkbook"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True
Private Sub Workbook_Open()
    ' This code runs when the workbook is opened
    
    ' Change the sheet and cell reference as needed
    ThisWorkbook.Names("StartDateCell").RefersToRange.Value = Date - 3

    ' refresh the qty when opening the production schedule to get the latest numbers
    'Call refresh_Qty
    
End Sub
