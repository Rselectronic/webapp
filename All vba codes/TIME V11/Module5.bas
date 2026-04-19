Attribute VB_Name = "Module5"
Sub ValidateData()

Application.ScreenUpdating = False
Application.DisplayAlerts = False

    Dim myRanges As Variant
    Dim cell As Range
    Dim myRange As Range
    
    ' Define an array of cell ranges you want to check
    myRanges = Array("B15:F18", "B21:B26", "B28:B30", "B32:B36", "B38", _
                     "B40:B41", "B43:B51", "J1:J3", "I7:O16", "O28:O33", "O26") ' Add your cell ranges
    
    ' Loop through each cell range in the array
    For Each myRangeAddress In myRanges
        Set myRange = ThisWorkbook.Sheets("final").Range(myRangeAddress)
        
        If myRange.Cells.Count = 1 Then
            ' If the range contains only one cell
            If myRange.Value = "" Then
                ' If the cell is empty, fill with yellow color
                myRange.Interior.Color = RGB(255, 255, 0) ' Yellow
            Else
                ' If the cell is not empty, fill with light green color
                myRange.Interior.Color = RGB(146, 208, 80) ' Light Green
            End If
        Else
            ' If the range contains multiple cells
            For Each cell In myRange
                If cell.Value = "" Then
                    ' If the cell is empty, fill with yellow color
                    cell.Interior.Color = RGB(255, 255, 0) ' Yellow
                Else
                    ' If the cell is not empty, fill with light green color
                    cell.Interior.Color = RGB(146, 208, 80) ' Light Green
                End If
            Next cell
        End If
    Next myRangeAddress
    
Application.ScreenUpdating = True
Application.DisplayAlerts = True


End Sub



Sub MakeAllCellsYellow()
    Dim myRanges As Variant
    Dim myRange As Range
    
    ' Define an array of cell ranges you want to format yellow
    myRanges = Array("B15:F18", "B21:B26", "B28:B30", "B32:B36", "B38", _
                     "B40:B41", "B43:B51", "J1:J3", "I7:O16", "O28:O33", "O26") ' Add your cell ranges
    
    ' Loop through each cell range in the array
    For Each myRangeAddress In myRanges
        Set myRange = ThisWorkbook.Sheets("final").Range(myRangeAddress)
        myRange.Interior.Color = RGB(255, 255, 0) ' Yellow
    Next myRangeAddress
End Sub



