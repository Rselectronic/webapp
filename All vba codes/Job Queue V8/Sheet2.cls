VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Sheet2"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True
'Private Sub Worksheet_Change(ByVal Target As Range)
'    Dim jobQueueSheet As Worksheet
'    Dim earningCalculatorSheet As Worksheet
'    Dim lastRow As Long
'    Dim newEntry As Variant
'    Dim foundRange As Range
'    Dim Proc_Batch_Code As Long
'
'    On Error Resume Next
'    ' Set references to the sheets
'    Set jobQueueSheet = ThisWorkbook.Sheets("Job Queue")
'    Set earningCalculatorSheet = ThisWorkbook.Sheets("Earning Calculator")
'
'    Proc_Batch_Code = jobQueueSheet.Rows(3).Find(What:="Proc Batch Code", LookIn:=xlValues, LookAt:=xlWhole).Column
'
'    ' Check if the change occurred in column N of "Job Queue" sheet
'    If Not Intersect(Target, jobQueueSheet.Columns(Proc_Batch_Code)) Is Nothing Then
'        ' Get the new entry
'        newEntry = Target.Value
'
'        ' Check if the new entry is not empty
'        If newEntry <> "" Then
'            ' Search for the new entry in column A of "Earning Calculator"
'            Set foundRange = earningCalculatorSheet.Columns("A").Find(newEntry, LookIn:=xlValues, LookAt:=xlWhole)
'
'            ' If not found, add the new entry at the last empty cell in column A of "Earning Calculator"
'            If foundRange Is Nothing Then
'                lastRow = earningCalculatorSheet.Cells(earningCalculatorSheet.Rows.Count, "A").End(xlUp).Row
'                earningCalculatorSheet.Cells(lastRow + 1, "A").Value = newEntry
'
'                ' Add the formula to column B of "Earning Calculator"
'                earningCalculatorSheet.Cells(lastRow + 1, "B").Formula = "=SUMIF('Job Queue'!N:N,'" & earningCalculatorSheet.Name & "'!" & earningCalculatorSheet.Cells(lastRow + 1, "A").Address(False, False) & ",'Job Queue'!L:L)"
'            End If
'        End If
'    End If
'    On Error GoTo 0
'End Sub
'
