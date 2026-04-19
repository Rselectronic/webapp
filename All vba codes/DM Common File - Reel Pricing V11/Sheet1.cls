VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Sheet1"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True





Sub DeleteAllStandardModules()

'    Dim vbComp As Object
'    Dim wb As Workbook
'
'    Set wb = ThisWorkbook
'
'    Application.DisplayAlerts = False
'
'    For Each vbComp In wb.VBProject.VBComponents
'        If vbComp.Type = 1 Then ' vbext_ct_StdModule
'            wb.VBProject.VBComponents.Remove vbComp
'        End If
'    Next vbComp
'
'    Application.DisplayAlerts = True
'
'    MsgBox "All standard modules deleted from current workbook.", vbInformation

End Sub

Sub ImportAllModulesFromSelectedFile()

    Dim fd As FileDialog
    Dim srcWB As Workbook
    Dim tgtWB As Workbook
    Dim vbComp As Object
    Dim tempPath As String
    Dim fileName As String

    Set tgtWB = ThisWorkbook

    ' File picker
    Set fd = Application.FileDialog(msoFileDialogFilePicker)
    With fd
        .Title = "Select Excel file containing VBA modules"
        .Filters.Clear
        .Filters.Add "Excel Files", "*.xls; *.xlsx; *.xlsm; *.xlsb"
        .AllowMultiSelect = False

        If .Show <> -1 Then Exit Sub
    End With

    Application.ScreenUpdating = False

    ' Open source workbook
    Set srcWB = Workbooks.Open(fd.SelectedItems(1), ReadOnly:=True)

    tempPath = Environ("TEMP") & "\VBA_Import\"
    If Dir(tempPath, vbDirectory) = "" Then MkDir tempPath

    ' Export modules from source
    For Each vbComp In srcWB.VBProject.VBComponents
        If vbComp.Type = 1 Then
            vbComp.Export tempPath & vbComp.Name & ".bas"
        End If
    Next vbComp

    ' Import into current workbook
    fileName = Dir(tempPath & "*.bas")
    Do While fileName <> ""
        tgtWB.VBProject.VBComponents.Import tempPath & fileName
        fileName = Dir
    Loop

    srcWB.Close False
    Application.ScreenUpdating = True

    MsgBox "All modules imported successfully!", vbInformation

End Sub


Private Sub Worksheet_BeforeDoubleClick(ByVal Target As Range, Cancel As Boolean)
    On Error GoTo ErrorHandler
    
    Dim columnNo As Long
    Dim endRow As Long
    Dim clickedRow As Long
    Dim clickedColumn As Long
    Dim mws As Worksheet
    
    Set mws = ThisWorkbook.Worksheets("MasterSheet")
    
    ' Initialize variables
    initialiseHeaders , , mws
    columnNo = Master_LCSCMFR_Column
    endRow = mws.Cells(mws.Rows.count, Master_CPC_Column).End(xlUp).Row
    
    ' Get clicked cell info
    clickedRow = Target.Row
    clickedColumn = Target.Column
    
    ' Validate range
    If clickedColumn <> columnNo Then Exit Sub
    If clickedRow < 4 Or clickedRow > endRow Then Exit Sub
    
    ' Cancel default action
    Cancel = True
    
    ' Set public variables FIRST
   TargetRowNo = CLng(clickedRow)
   TargetColNo = CLng(clickedColumn)
    CPC = mws.Cells(clickedRow, Master_CPC_Column).value
    
    ' Validate CPC value
    If Len(Trim(CPC)) = 0 Then
        MsgBox "CPC value is empty in row " & clickedRow, vbExclamation
        Exit Sub
    End If
    
    ' Load and show form
    'Load frm_LCSC_MFR
    If mws.Cells(clickedRow, clickedColumn).value <> "" Then
     frm_LCSC_MFR.Show
    End If
    Exit Sub
    
ErrorHandler:
    MsgBox "Error in double-click event: " & Err.Number & " - " & Err.Description, vbCritical
    
End Sub

''Private Sub Worksheet_BeforeDoubleClick(ByVal Target As Range, Cancel As Boolean)
''    ' This event fires when user double-clicks any cell in the Master sheet
''
''    ' Declare variables
''    Dim columnNo As Long        ' The column number where double-click is allowed
''    Dim endRow As Long          ' The last row of valid data
''    Dim clickedRow As Long      ' The row number that was double-clicked
''    Dim clickedColumn As Long   ' The column number that was double-clicked
''    Dim mws As Worksheet
''
''
''    Set mws = ThisWorkbook.Worksheets("MasterSheet")
''
''    ' ========================================================================
''    ' STEP 1: initalizing variables
''    ' ========================================================================
''    initialiseHeaders , , mws
''    ' Set the column number where double-click should work (e.g., Column 5 = Column E)
''    columnNo = Master_LCSCMFR_Column ' Change this to your desired column number
''
''    ' Calculate the last row with data in Column A (adjust as needed)
''    endRow = mws.Cells(mws.Rows.count, Master_CPC_Column).End(xlUp).Row
''
''    ' Alternatively, if you want to use a specific column to find last row:
''    ' endRow = Me.Cells(Me.Rows.Count, columnNo).End(xlUp).Row
''
''    ' ========================================================================
''    ' STEP 2: GET THE CLICKED CELL INFORMATION
''    ' ========================================================================
''
''    ' Get the row number that was double-clicked
''    clickedRow = Target.Row
''
''    ' Get the column number that was double-clicked
''    clickedColumn = Target.Column
''
''    ' ========================================================================
''    ' STEP 3: VALIDATE IF DOUBLE-CLICK IS IN THE CORRECT RANGE
''    ' ========================================================================
''
''    ' Check if double-click occurred in the specified column
''    If clickedColumn <> columnNo Then
''        Exit Sub  ' Exit if not in the target column
''    End If
''
''    ' Check if double-click occurred within valid row range (skip header row)
''    If clickedRow < 4 Or clickedRow > endRow Then
''        Exit Sub  ' Exit if outside valid range (row 2 to endRow)
''    End If
''
''    ' ========================================================================
''    ' STEP 4: CANCEL DEFAULT DOUBLE-CLICK ACTION
''    ' ========================================================================
''
''    ' Prevent Excel's default double-click behavior (entering edit mode)
''    Cancel = True
''
''    ' ========================================================================
''    ' STEP 5: LAUNCH THE FORM WITH ROW NUMBER
''    ' ========================================================================
''    'frm_LCSC_MFR.Show
''    'Load frm_LCSC_MFR
''    ' Store the row number in a public variable (see Module code below)
''    ' This allows the form to access which row was double-clicked
''       TargetRowNo = clickedRow
''       TargetColNo = clickedColumn
''       CPC = mws.Cells(TargetRowNo, Master_CPC_Column)
''
''
''    ' Show your form (replace "YourFormName" with actual form name)
''    ' Use .Show for modal (blocks Excel) or .Show vbModeless for non-modal
''    frm_LCSC_MFR.Show vbModal
''
''    ' Optional: Display a message for testing
''    ' MsgBox "Form launched from Row: " & clickedRow, vbInformation
''
''End Sub
''







