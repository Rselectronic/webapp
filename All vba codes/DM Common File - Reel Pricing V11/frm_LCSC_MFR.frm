VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} frm_LCSC_MFR 
   Caption         =   "LCSC Manufacturer PN Selection"
   ClientHeight    =   9210.001
   ClientLeft      =   105
   ClientTop       =   450
   ClientWidth     =   11085
   OleObjectBlob   =   "frm_LCSC_MFR.frx":0000
   StartUpPosition =   1  'CenterOwner
End
Attribute VB_Name = "frm_LCSC_MFR"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False

Private Sub CommandButton1_Click()
Call SelectedLCSCPN
End Sub
Sub NoneSelected()
Dim mws As Worksheet
    
    Set mws = ThisWorkbook.Worksheets("MasterSheet")
' Writing variables values to cells
    mws.Cells(TargetRowNo, Master_LCSCPN_Column) = ""
    mws.Cells(TargetRowNo, Master_LCSCMPN_Column) = ""
    mws.Cells(TargetRowNo, Master_LCSCMFR_Column) = ""
    mws.Cells(TargetRowNo, Master_LCSCStock_Column) = ""

End Sub
Sub SelectedLCSCPN()

    Dim col1 As String, col2 As String, col3 As String, col4 As String, col5 As String
    Dim mws As Worksheet
    
    Set mws = ThisWorkbook.Worksheets("MasterSheet")
    ' Check if any item is selected
    If ListBox1.ListIndex = -1 Then
        MsgBox "Please select an item from the list.", vbExclamation, "Selection Required"
        Exit Sub
    End If
    
    
    
    ' Get values from the selected row
    With ListBox1
        col1 = .List(.ListIndex, 0)  ' Column 1 (index 0) which is CPC
        col2 = .List(.ListIndex, 1)  ' Column 2 (index 1) which is LCSC PN
        col3 = .List(.ListIndex, 2)  ' Column 3 (index 2)  which is MPN
        col4 = .List(.ListIndex, 3)  ' Column 4 (index 3) which is Manufacturer Name
        col5 = .List(.ListIndex, 4)  ' Column 5 (index 4) whic is stock
    End With
    
    ' Writing variables values to cells
    mws.Cells(TargetRowNo, Master_LCSCPN_Column) = col2
    mws.Cells(TargetRowNo, Master_LCSCMPN_Column) = col3
    mws.Cells(TargetRowNo, Master_LCSCMFR_Column) = col4
    mws.Cells(TargetRowNo, Master_LCSCStock_Column) = col5
    '
End Sub


Private Sub CommandButton2_Click()
NoneSelected
End Sub

Private Sub CommandButton3_Click()
Unload Me
End Sub

Private Sub UserForm_Activate()
    Dim tmpWs As Worksheet, mws As Worksheet
    Dim dataArray As Variant, filteredData() As Variant
    Dim i As Long, j As Long, matchCount As Long
    Dim cpcSearch As String
    Dim lastRow As Long
    
    On Error GoTo ErrProc

    ' 1. Setup Sheet References
    Set mws = ThisWorkbook.Worksheets("MasterSheet")
    Set tmpWs = ThisWorkbook.Worksheets("MFR_TmpSheet")
    
    ' Get the CPC we are looking for from the public variable
    cpcSearch = CStr(CPC)
    
    ' 2. Load Data into Memory Array
    lastRow = tmpWs.Cells(tmpWs.Rows.count, 1).End(xlUp).Row
    If lastRow < 2 Then
        MsgBox "No data found in MFR_TmpSheet", vbInformation
        Unload Me
        Exit Sub
    End If
    
    ' Read Columns A through E
    dataArray = tmpWs.Range("A2:E" & lastRow).value
    
    ' 3. First Pass: Count matches to size the filtered array
    matchCount = 0
    For i = 1 To UBound(dataArray, 1)
        If CStr(dataArray(i, 1)) = cpcSearch Then
            matchCount = matchCount + 1
        End If
    Next i
    
    ' 4. Second Pass: Fill filtered array
    If matchCount > 0 Then
        ' ReDim: Rows (0 to matchCount-1), Columns (0 to 4)
        ReDim filteredData(0 To matchCount - 1, 0 To 4)
        
        j = 0
        For i = 1 To UBound(dataArray, 1)
            If CStr(dataArray(i, 1)) = cpcSearch Then
                filteredData(j, 0) = dataArray(i, 1) ' CPC
                filteredData(j, 1) = dataArray(i, 2) ' LCSC PN
                filteredData(j, 2) = dataArray(i, 3) ' MPN
                filteredData(j, 3) = dataArray(i, 4) ' Manufacturer
                filteredData(j, 4) = dataArray(i, 5) ' Stock
                j = j + 1
            End If
        Next i
        
        ' 5. Load ListBox
        With Me.ListBox1
            .Clear
            .ColumnCount = 5
            ' Adjust these widths to match your UI
            .ColumnWidths = "60;80;100;120;60"
            .List = filteredData
        End With
    Else
        MsgBox "No products found for CPC: " & cpcSearch, vbInformation
        Unload Me
    End If

    Exit Sub

ErrProc:
    MsgBox "Error loading form: " & Err.Description, vbCritical
End Sub
