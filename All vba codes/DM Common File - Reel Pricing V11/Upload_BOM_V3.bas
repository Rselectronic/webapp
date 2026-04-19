Attribute VB_Name = "Upload_BOM_V3"
Option Explicit

'Development Month - Oct 2025 Project
Public ProcessCancelled As Boolean

Sub UploadBOM()
Application.DisplayAlerts = False
Application.ScreenUpdating = False

Dim Status_GMP As String
ProcessCancelled = False
Status_GMP = GMP()

If Status_GMP <> "" Then
   MsgBox Status_GMP, vbExclamation, "Macro Status"
   Exit Sub
End If

If ProcessCancelled = True Then Exit Sub
MsgBox "Macro run successfully", vbInformation, "Macro Status"

Application.DisplayAlerts = True
Application.ScreenUpdating = True
End Sub

Private Function GMP()
On Error GoTo ErrHandler

Dim i As Double
Dim Datainputsheet As Worksheet
Dim UserInput_GMP As String
Dim findrng As Range
Dim ExistingGMPRow As Double
Dim BomName As String
Dim Bomwb As Workbook, Bomwbsheet As Worksheet, Bomwbsheetlrow As Double
Dim GMPSheet As Worksheet
Dim RevBom As String
Dim GerberName As String
Dim RevGerber As String
Dim ResultofUserform As Boolean
Dim fd As FileDialog
Dim SelectedFilePath As String
Dim SheetExistsCheck As Boolean
Dim SheetExistsCheckIndex As Double
Dim srcHeaders(5) As String, TargetHeaders(5) As String
Dim findrnginner As Range
Dim j As Double, GMPSheetIndex As Double
Dim lr As Long, sr As Long

Set Datainputsheet = ThisWorkbook.Sheets("DataInputSheets")
initialiseHeaders Datainputsheet

''Input box for user , GMP

UserInput_GMP = InputBox("Please Enter Global MFR Package", "Macro- GMP Input")

If UserInput_GMP = "" Then
   GMP = "Please enter Valid GMP"
   Exit Function
End If

Set findrng = Datainputsheet.Cells(1, DM_GlobalMFRPackage_Column).EntireColumn.Cells.Find(What:=UserInput_GMP, After:=Datainputsheet.Cells(1, DM_GlobalMFRPackage_Column), LookIn:=xlFormulas, LookAt:=xlWhole)

If findrng Is Nothing Then
 Datainputsheet.Cells(6, 1).EntireRow.Insert xlDown
 Datainputsheet.Rows("7:7").Copy
 Datainputsheet.Rows("6:6").PasteSpecial xlPasteFormats
 ExistingGMPRow = 6
 Datainputsheet.Cells(ExistingGMPRow, DM_GlobalMFRPackage_Column) = UserInput_GMP
End If

Set findrng = Datainputsheet.Cells(1, DM_GlobalMFRPackage_Column).EntireColumn.Cells.Find(What:=UserInput_GMP, After:=Datainputsheet.Cells(1, DM_GlobalMFRPackage_Column), LookIn:=xlFormulas, LookAt:=xlWhole)

 ''GMP Already exist in Datainputsheet , Old Customer
 ExistingGMPRow = findrng.Row
 BomName = Datainputsheet.Cells(ExistingGMPRow, DM_BomName_Column).value
 RevBom = Datainputsheet.Cells(ExistingGMPRow, DM_BOMRev_Column).value
 GerberName = Datainputsheet.Cells(ExistingGMPRow, DM_PCBName_Column).value
 RevGerber = Datainputsheet.Cells(ExistingGMPRow, DM_PCBRev_Column).value
 ResultofUserform = frmExistingData.ShowForm(UserInput_GMP, BomName, RevBom, GerberName, RevGerber)
 
 If ResultofUserform = False Then
    GMP = "Process terminated"
    Exit Function
 End If

Set fd = Application.FileDialog(msoFileDialogFilePicker)

With fd
    .Title = "Select a BOM File"
    .AllowMultiSelect = False
    .Filters.Clear
    .Filters.Add "All Files", "*.*"
    .Filters.Add "Excel Files", "*.xls; *.xlsx; *.xlsm"
    If .Show = -1 Then
        SelectedFilePath = .SelectedItems(1)
    Else
        GMP = "No file selected , Process terminated"
        Exit Function
    End If
End With

Set Bomwb = Workbooks.Open(SelectedFilePath, False, True)
Set Bomwbsheet = Bomwb.Sheets(1)
Bomwbsheetlrow = Bomwbsheet.UsedRange.Rows.count
    
'''''''''''''''
' Step 1: Validate Quantity vs Comma-Separated Values
Dim allMatched As Boolean
allMatched = ValidateQuantityVsValues(Bomwbsheet) ' The function call for quantity matching

' Step 2: Check validation result and decide whether to proceed
If Not allMatched Then
     MsgBox "Quantity validation failed!" & vbCrLf & vbCrLf & _
           "Please review Column G in the BOM file for mismatches." & vbCrLf & _
           "Process terminated.", vbExclamation, "Validation Error"
    
    ' Make the BOM sheet visible for user review
    Bomwb.Activate
    Bomwbsheet.Activate
    ProcessCancelled = True
    ' Exit the entire Sub
    Exit Function
   
End If


Set GMPSheet = ThisWorkbook.Sheets("ATEMPLATE")
TargetHeaders(0) = GMPSheet.Range("E3").value
TargetHeaders(1) = GMPSheet.Range("F3").value
TargetHeaders(2) = GMPSheet.Range("G3").value
TargetHeaders(3) = GMPSheet.Range("H3").value
TargetHeaders(4) = GMPSheet.Range("I3").value
TargetHeaders(5) = GMPSheet.Range("J3").value
srcHeaders(0) = Bomwbsheet.Range("A1").value
srcHeaders(1) = Bomwbsheet.Range("B1").value
srcHeaders(2) = Bomwbsheet.Range("C1").value
srcHeaders(3) = Bomwbsheet.Range("d1").value
srcHeaders(4) = Bomwbsheet.Range("e1").value
srcHeaders(5) = Bomwbsheet.Range("f1").value

ThisWorkbook.Activate: Datainputsheet.Activate
ResultofUserform = frmColumnMapper.ShowForm(srcHeaders, TargetHeaders)

If ResultofUserform = False Then
    GMP = "Process terminated"
    Bomwb.Close 0
    Exit Function
End If

For i = 1 To frmColumnMapper.SourceColumns.count
    Set findrnginner = Bomwbsheet.Cells(1, 1).EntireRow.Cells.Find(What:=frmColumnMapper.SourceColumns(i), After:=Bomwbsheet.Cells(1, 1), LookIn:=xlFormulas, LookAt:=xlWhole)

    If findrnginner Is Nothing Then
        GMP = frmColumnMapper.SourceColumns(i) & " Column not found in " & Bomwb.fullName
        Bomwb.Close 0
        Exit Function
    End If
Next i
    
''''''''''''''''
    
SheetExistsCheck = SheetExists(UserInput_GMP, ThisWorkbook)
If SheetExistsCheck = True Then
   ThisWorkbook.Sheets(UserInput_GMP).Delete
End If
 
ThisWorkbook.Sheets("ATEMPLATE").Copy After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets("ATEMPLATE").Index)
Set GMPSheet = ThisWorkbook.Sheets(ThisWorkbook.Sheets("ATEMPLATE").Index + 1)
GMPSheet.Name = UserInput_GMP

For i = 1 To frmColumnMapper.SourceColumns.count

    Set findrnginner = Bomwbsheet.Cells(1, 1).EntireRow.Cells.Find(What:=frmColumnMapper.SourceColumns(i), After:=Bomwbsheet.Cells(1, 1), LookIn:=xlFormulas, LookAt:=xlWhole)
    GMPSheetIndex = 4

    For j = 2 To Bomwbsheetlrow
     With GMPSheet.Cells(GMPSheetIndex, i + 4)
        .NumberFormat = "@"
        .value = .value
     End With

      GMPSheet.Cells(GMPSheetIndex, i + 4).Formula = Bomwbsheet.Cells(j, findrnginner.Column).Formula
      GMPSheetIndex = GMPSheetIndex + 1
    Next j

Next i

Bomwb.Close 0

If UCase(CStr(BomName)) <> UCase(CStr(frmExistingData.BomName)) Then
    Datainputsheet.Cells(ExistingGMPRow, DM_NRE1_Column).value = ""
    Datainputsheet.Cells(ExistingGMPRow, DM_NRE1Status_Column).value = ""
End If
If UCase(CStr(RevBom)) <> UCase(CStr(frmExistingData.RevBom)) Then
    Datainputsheet.Cells(ExistingGMPRow, DM_NRE1_Column).value = ""
    Datainputsheet.Cells(ExistingGMPRow, DM_NRE1Status_Column).value = ""
End If
If UCase(CStr(GerberName)) <> UCase(CStr(frmExistingData.GerberName)) Then
    Datainputsheet.Cells(ExistingGMPRow, DM_NRE2_Column).value = ""
    Datainputsheet.Cells(ExistingGMPRow, DM_NRE2Status_Column).value = ""
    'Remove stencil also later
End If
If UCase(CStr(RevGerber)) <> UCase(CStr(frmExistingData.RevGerber)) Then
    Datainputsheet.Cells(ExistingGMPRow, DM_NRE2_Column).value = ""
    Datainputsheet.Cells(ExistingGMPRow, DM_NRE2Status_Column).value = ""
    'Remove stencil also later
End If

Datainputsheet.Cells(ExistingGMPRow, DM_BomName_Column) = CStr(frmExistingData.BomName)
Datainputsheet.Cells(ExistingGMPRow, DM_BOMRev_Column) = CStr(frmExistingData.RevBom)
Datainputsheet.Cells(ExistingGMPRow, DM_PCBName_Column) = CStr(frmExistingData.GerberName)
Datainputsheet.Cells(ExistingGMPRow, DM_PCBRev_Column) = CStr(frmExistingData.RevGerber)

If ExistingGMPRow <> 6 Then
   Datainputsheet.Cells(ExistingGMPRow, 1).EntireRow.Cut
   Datainputsheet.Cells(6, 1).EntireRow.Insert xlDown
End If

' apply serial number
lr = Datainputsheet.Cells(Datainputsheet.Rows.count, DM_GlobalMFRPackage_Column).End(xlUp).Row
sr = 1
For i = 6 To lr
    Datainputsheet.Cells(i, DM_SNo_Column) = sr
    sr = sr + 1
Next i

ThisWorkbook.Activate: GMPSheet.Activate: GMPSheet.Range("E3").Select
Datainputsheet.Activate

Exit Function
ErrHandler:
GMP = Err.Description
End Function

Private Function SheetExists(SheetName As String, Optional wb As Workbook) As Boolean
    Dim ws As Worksheet
    Dim sName As String
    
    SheetExists = False  ' Default
    
    ' Loop through all sheets
    For Each ws In wb.Worksheets
        sName = ws.Name
        If StrComp(sName, SheetName, vbTextCompare) = 0 Then
            SheetExists = True
            Exit Function
        End If
    Next ws
End Function



'==============================================================================
' FUNCTION: CountValidValues
' Purpose: Count comma-separated values in a cell, excluding values with "#"
' Parameters: cellValue - String containing comma-separated values
' Returns: Integer count of valid values
'==============================================================================
Function CountValidValues(cellValue As String) As Integer
    Dim values() As String
    Dim i As Integer
    Dim count As Integer
    
    ' Step 1: Initialize counter
    count = 0
    
    ' Step 2: Handle empty cells
    If Trim(cellValue) = "" Then
        CountValidValues = 0
        Exit Function
    End If
    
    ' Step 3: Split the cell value by comma
    values = Split(cellValue, ",")
    
    ' Step 4: Loop through each value and count valid ones
    For i = LBound(values) To UBound(values)
        ' Exclude values containing "#" and empty values
        If InStr(Trim(values(i)), "#") = 0 And Trim(values(i)) <> "" Then
            count = count + 1
        End If
    Next i
    
    ' Step 5: Return the count
    CountValidValues = count
End Function

'==============================================================================
' FUNCTION: ValidateQuantityVsValues_Fast
' Purpose: Fast validation using arrays - compares Quantity (Col A) with
'          count of comma-separated values (Col B)
' Parameters:
'   - ws: Worksheet to validate
' Returns: TRUE if all matched, FALSE if any mismatch found
'==============================================================================
Function ValidateQuantityVsValues(ws As Worksheet) As Boolean
    Dim arrQty As Variant
    Dim arrColB As Variant
    Dim arrResults() As Variant
    Dim i As Long
    Dim valueCount As Integer
    Dim startRow As Long
    Dim lastRow As Long
    Dim allMatched As Boolean
    
    ' Step 1: Initialize variables
    startRow = 2  ' Assuming row 1 has headers
    allMatched = True  ' Assume all matched unless we find a mismatch
    
    ' Step 1a: Calculate last row with data in Column A
    lastRow = ws.Cells(ws.Rows.count, "A").End(xlUp).Row
    
    ' Step 2: Handle empty worksheet
    If lastRow < startRow Then
        ValidateQuantityVsValues = True
        Exit Function
    End If
    
    ' Step 3: Read Column A (Quantity) and Column B (Designator) into arrays
    
    arrQty = ws.Range("A" & startRow & ":A" & lastRow).value
    arrColB = ws.Range("B" & startRow & ":B" & lastRow).value
    
    ' Step 4: Prepare results array for Column G output
    ReDim arrResults(1 To UBound(arrQty, 1), 1 To 1)
    
    ' Step 5: Process each row in memory
    For i = 1 To UBound(arrQty, 1)
        ' Only process non-empty rows
        If arrQty(i, 1) <> "" Or arrColB(i, 1) <> "" Then
            
            ' Step 5a: Count valid comma-separated values (excluding # values)
            valueCount = CountValidValues(CStr(arrColB(i, 1)))
            
            ' Step 5b: Compare quantity with value count
            If IsNumeric(arrQty(i, 1)) Then
                If CLng(arrQty(i, 1)) <> valueCount Then
                    ' Mismatch found
                    arrResults(i, 1) = "Not Matched"
                    allMatched = False  ' Set flag to FALSE
                Else
                    ' Match found
                    arrResults(i, 1) = "Matched"
                End If
            Else
                ' Invalid quantity (not a number)
                arrResults(i, 1) = "Invalid Quantity"
                allMatched = False  ' Treat as validation failure
            End If
        Else
            ' Empty row
            arrResults(i, 1) = ""
        End If
    Next i
    
    ' Step 6: Write all results to Column G in ONE operation (FAST!)
    ws.Range("G1").value = "Validation Status"
    ws.Range("G" & startRow & ":G" & lastRow).value = arrResults
    
    ' Step 7: Apply color coding using conditional formatting
    With ws.Range("G" & startRow & ":G" & lastRow)
        .FormatConditions.Delete  ' Clear existing formatting
        
        ' Red background for "Not Matched"
        .FormatConditions.Add Type:=xlTextString, String:="Not Matched", TextOperator:=xlContains
        .FormatConditions(1).Interior.Color = RGB(255, 200, 200)
        
        ' Green background for "Matched"
        .FormatConditions.Add Type:=xlTextString, String:="Matched", TextOperator:=xlContains
        .FormatConditions(2).Interior.Color = RGB(200, 255, 200)
    End With
    
    ' Step 8: Return validation result
    ValidateQuantityVsValues = allMatched
End Function















