Attribute VB_Name = "Module4"
Sub KeepSpecificSheets()
    Dim ws As Worksheet
    Dim sheetName As String
    
    Application.DisplayAlerts = False ' Turn off alerts to avoid confirmation prompts
    
    ' Loop through all worksheets in the workbook
    For Each ws In ThisWorkbook.Worksheets
        sheetName = ws.Name
        
        ' Check if the sheet name is not "Compliance Certificate Template" or "PackingSlip"
        If sheetName <> "Lead Free Certificate Template" And sheetName <> "Compliance Certificate Template" And sheetName <> "PackingSlip" And sheetName <> "Admin" Then
            ws.Delete ' Delete the sheet
        End If
    Next ws
    
    Application.DisplayAlerts = True ' Turn alerts back on
    
    ' Activate a specific sheet (e.g., "Compliance Certificate Template") to ensure it's visible after deletion of others
    On Error Resume Next
    Sheets("PackingSlip").Activate
    On Error GoTo 0
End Sub

