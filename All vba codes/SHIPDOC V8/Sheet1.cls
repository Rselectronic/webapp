VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Sheet1"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True
Private Sub worksheet_change(ByVal Target As Range)
    Application.EnableEvents = True
    Dim rng As Range
    Dim cell As Range
    
    ' Set the range where you want to apply borders
    Set rng = Me.Range("A18:K34")
    
    ' Check if the changed cell is within the specified range and in column B
    If Not Intersect(Target, rng) Is Nothing And Target.Column = 3 Then
        ' Loop through each cell in the changed range
        For Each cell In Target
            ' Apply or remove borders to the cells within the same row up to column J
            If cell.Value <> "" Then
                ApplyBorders cell
            Else
                RemoveTopBottomBorders cell
            End If
        Next cell
    End If



    
    
    Dim lastRow As Long
    Dim serialNumber As Long
    
    
    ' Define the range where data entry and deletion will occur
    Set rng = Me.Range("C18:C" & Me.rows.Count)
    
    ' Check if the changed cell is within the specified range
    If Not Intersect(Target, rng) Is Nothing Then
        Application.EnableEvents = False ' Disable events to prevent recursive calls
        
        ' Find the last row with data in column C
        lastRow = Me.Cells(Me.rows.Count, "C").End(xlUp).Row
        
        ' Loop through the changed cells
        For Each cell In Target
            ' Check if data was added or deleted
            If cell.Value <> "" Then
                ' Data added - update serial numbers in column A
                For serialNumber = 18 To lastRow
                    Me.Cells(serialNumber, "A").Value = serialNumber - 17
                    ' Add formula in column J
                    Me.Cells(serialNumber, "K").Formula = "=H" & serialNumber & "-(I" & serialNumber & "+J" & serialNumber & ")"
                    If Me.Cells(serialNumber, "I").Value = "" Then
                    Me.Cells(serialNumber, "I").Value = 0
                    End If
                    If Me.Cells(serialNumber, "J").Value = "" Then
                    Me.Cells(serialNumber, "J").Value = 0
                    End If
                Next serialNumber
            Else
                ' Data deleted - clear corresponding serial number in column A and formula in column J
                Me.Cells(cell.Row, "A").ClearContents
                Me.Cells(cell.Row, "D") = ""
                Me.Cells(cell.Row, "K").ClearContents
                Me.Cells(cell.Row, "I").ClearContents
                Me.Cells(cell.Row, "J").ClearContents
                Me.Cells(cell.Row, "H").ClearContents
                Me.Cells(cell.Row, "B").ClearContents
            End If
        Next cell
        
        Application.EnableEvents = True ' Re-enable events
    End If



End Sub

Private Sub ApplyBorders(rng As Range)
    With Me.Range(Cells(rng.Row, 1), Cells(rng.Row, 11)).Borders
        .Item(xlEdgeTop).LineStyle = xlContinuous
        .Item(xlEdgeTop).ColorIndex = 0
        .Item(xlEdgeTop).TintAndShade = 0
        .Item(xlEdgeTop).Weight = xlThin
        
        .Item(xlEdgeBottom).LineStyle = xlContinuous
        .Item(xlEdgeBottom).ColorIndex = 0
        .Item(xlEdgeBottom).TintAndShade = 0
        .Item(xlEdgeBottom).Weight = xlThin
    End With
End Sub

Private Sub RemoveTopBottomBorders(rng As Range)
    With Me.Range(Cells(rng.Row, 1), Cells(rng.Row, 11)).Borders
        '.Item(xlEdgeTop).LineStyle = xlNone
        .Item(xlEdgeBottom).LineStyle = xlNone
    End With
End Sub


