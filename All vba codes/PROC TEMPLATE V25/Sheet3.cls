VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Sheet3"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True
Private Sub Worksheet_Change(ByVal Target As Range)
    If Not Intersect(Target, Me.Columns("B")) Is Nothing Then
        Dim cell As Range
        Application.enableEvents = False
        For Each cell In Intersect(Target, Me.Columns("B"))
            If cell.Value <> "" Then
                Me.Cells(cell.Row, "A").Value = Format(FillDateTimeInCanada, "mm/dd/yyyy hh:mm:ss")
            Else
                Me.Cells(cell.Row, "A").ClearContents
            End If
        Next cell
        Application.enableEvents = True
    End If
End Sub

