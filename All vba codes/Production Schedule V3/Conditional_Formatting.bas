Attribute VB_Name = "Conditional_Formatting"
Option Explicit
Sub ApplyConditionalFormatting()
    Dim ws As Worksheet
    Dim targetRange As Range
    Dim cell As Range
    
    ' Set the worksheet
    Set ws = ThisWorkbook.Sheets("Project schedule - Detailed") ' Change "YourSheetName" to the name of your sheet
    
    initaliseHeaders ws
    
    ' Set the target range
    Set targetRange = ws.Range(ws.Cells(6, prodSch_Comments_Column + 2), ws.Cells(6, ws.Cells(6, ws.Columns.Count).End(xlToLeft).Column))

    
    ' Loop through each cell in the target range
    For Each cell In targetRange
        ' Check if the day is Friday (assuming your date values are in cells)
        If Weekday(cell.Value, vbFriday) = 1 Then
            ' Apply right border if it's Friday
            cell.Borders(xlEdgeRight).LineStyle = xlContinuous
            cell.Borders(xlEdgeRight).Weight = xlThick
            
            ' apply same borders to row 4 and 6
            ws.Cells(4, cell.Column).Borders(xlEdgeRight).LineStyle = xlContinuous
            ws.Cells(4, cell.Column).Borders(xlEdgeRight).Weight = xlThick
            ws.Cells(6, cell.Column).Borders(xlEdgeRight).LineStyle = xlContinuous
            ws.Cells(6, cell.Column).Borders(xlEdgeRight).Weight = xlThick
        Else
            ' Clear right border if it's not Friday
            cell.Borders(xlEdgeRight).LineStyle = xlNone
            ws.Cells(4, cell.Column).Borders(xlEdgeRight).LineStyle = xlNone
            ws.Cells(6, cell.Column).Borders(xlEdgeRight).LineStyle = xlNone
            
        End If
    Next cell
End Sub

