Attribute VB_Name = "Module1"
Sub CopySheetWithinWorkbook()
    Dim sourceSheet As Worksheet
    Dim newSheet As Worksheet

    ' Set references to the source sheet and new sheet
    Set sourceSheet = ThisWorkbook.Sheets("Compliance Certificate Template")
    
    ' Check if the sheet already exists, and if it does, delete it
    On Error Resume Next
    Set newSheet = ThisWorkbook.Sheets("DoNotModifyCopy")
    On Error GoTo 0
    If Not newSheet Is Nothing Then
        Application.DisplayAlerts = False
        newSheet.Delete
        Application.DisplayAlerts = True
    End If
    
    ' Copy the source sheet to a new sheet
    sourceSheet.Copy After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count)
    ActiveSheet.Name = "DoNotModifyCopy"
    
    ' Clear the clipboard to avoid memory issues
    Application.CutCopyMode = False

End Sub


