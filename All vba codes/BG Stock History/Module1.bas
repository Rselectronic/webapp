Attribute VB_Name = "Module1"
Option Explicit

Public Sub AddStockFromCPCFile()

    Dim ws As Worksheet
    Dim fullPath As String
    Dim folders() As String
    Dim masterFolderName As String, dmFolderName As String, dmFolderPath As String
    Dim dmFileName As String
    Dim dmWB As Workbook, procWS As Worksheet
    
    '--- locate DM Common workbook (same logic as before) ---
    Set ws = ThisWorkbook.Sheets(1)
    fullPath = GetLocalPath(ThisWorkbook.FullName)
    folders = Split(fullPath, "\")
    ' Previously was UBound - 2, then you changed to -3; preserving your latest:
    masterFolderName = folders(UBound(folders) - 3)
    
    dmFolderName = "2. DM FILE"
    dmFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName) + Len(masterFolderName)) & dmFolderName & "\"
    dmFileName = Dir(dmFolderPath & "DM Common*", vbDirectory)
    If Len(dmFileName) = 0 Then
        MsgBox "Could not find a file starting with 'DM Common' in: " & vbCrLf & dmFolderPath, vbExclamation
        Exit Sub
    End If
    
    On Error GoTo FailOpenDM
    Set dmWB = Workbooks.Open(dmFolderPath & dmFileName)
    On Error GoTo 0
    
    On Error Resume Next
    Set procWS = dmWB.Worksheets("Procurement")
    On Error GoTo 0
    If procWS Is Nothing Then
        MsgBox "Sheet 'Procurement' not found in " & dmWB.Name, vbExclamation
        GoTo CleanFail
    End If
    
    '--- ask user to pick the CPC/Qty file ---
    Dim f As Variant
    f = Application.GetOpenFilename( _
            FileFilter:="Excel Files (*.xlsx;*.xls;*.xlsm),*.xlsx;*.xls;*.xlsm", _
            Title:="Select the Excel file containing CPC and Qty")
    If VarType(f) = vbBoolean And f = False Then
        MsgBox "No file selected. Exiting."
        GoTo CleanFail
    End If
    
    '--- open the source file (read-only) ---
    Dim srcWB As Workbook, srcWS As Worksheet
    On Error GoTo FailOpenSrc
    Set srcWB = Workbooks.Open(CStr(f), ReadOnly:=True)
    On Error GoTo 0
    
    Set srcWS = srcWB.Worksheets(1) ' use first sheet; adjust if needed
    
    '--- find CPC and Qty columns by header in row 1 ---
    Dim lastCol As Long, c As Long
    Dim colCPC As Long: colCPC = 0
    Dim colQty As Long: colQty = 0
    
    lastCol = srcWS.Cells(1, srcWS.Columns.count).End(xlToLeft).Column
    For c = 1 To lastCol
        Dim hdr As String
        hdr = Trim$(CStr(srcWS.Cells(1, c).Value))
        If Len(hdr) > 0 Then
            Select Case UCase$(hdr)
                Case "CPC": colCPC = c
                Case "QTY", "QUANTITY": colQty = c
            End Select
        End If
    Next c
    
    If colCPC = 0 Or colQty = 0 Then
        MsgBox "Could not find headers 'CPC' and 'Qty/Quantity' in row 1 of " & srcWS.Name & ".", vbExclamation
        GoTo CleanFail
    End If
    
    '--- aggregate quantities by CPC (handles duplicates in the file) ---
    Dim lastRow As Long
    lastRow = srcWS.Cells(srcWS.Rows.count, colCPC).End(xlUp).Row
    
    Dim dict As Object: Set dict = CreateObject("Scripting.Dictionary")
    dict.CompareMode = 1 ' TextCompare
    
    Dim r As Long, key As Variant, q As Double
    For r = 2 To lastRow
        key = Trim$(CStr(srcWS.Cells(r, colCPC).Value))
        If Len(key) > 0 Then
            If IsNumeric(srcWS.Cells(r, colQty).Value) Then
                q = CDbl(srcWS.Cells(r, colQty).Value)
                If dict.Exists(key) Then
                    dict(key) = dict(key) + q
                Else
                    dict.Add key, q
                End If
            End If
        End If
    Next r
    
    If dict.count = 0 Then
        MsgBox "No valid CPC/Qty rows found to process.", vbInformation
        GoTo CleanFail
    End If
    
    '--- push to Procurement: match CPC in column A, add to column S ---
    Dim notFound As Collection: Set notFound = New Collection
    Dim addedCount As Long: addedCount = 0
    
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    
    Dim foundCell As Range
    For Each key In dict.Keys
        Set foundCell = Nothing
        On Error Resume Next
        Set foundCell = procWS.Columns("A").Find(What:=key, LookIn:=xlValues, LookAt:=xlWhole, MatchCase:=False)
        On Error GoTo 0
        
        If foundCell Is Nothing Then
            notFound.Add key
        Else
            ' Column S is 19th column; you can also use "S"
            With procWS.Cells(foundCell.Row, "S")
                If IsNumeric(.Value) Then
                    .Value = CDbl(.Value) + dict(key)
                ElseIf IsEmpty(.Value) Or Len(.Value) = 0 Then
                    .Value = dict(key)
                Else
                    ' if non-numeric existing value, try to coerce; else overwrite with qty
                    On Error Resume Next
                    .Value = CDbl(.Value) + dict(key)
                    If Err.Number <> 0 Then
                        Err.Clear
                        .Value = dict(key)
                    End If
                    On Error GoTo 0
                End If
            End With
            addedCount = addedCount + 1
        End If
    Next key
    
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    
    '--- summary ---
    Dim msg As String
    msg = "Updated rows matched by CPC: " & addedCount & vbCrLf & _
          "Source file CPCs (unique): " & dict.count
    If notFound.count > 0 Then
        Dim s As String, itm As Variant
        For Each itm In notFound
            s = s & ", " & CStr(itm)
        Next itm
        If Len(s) > 0 Then s = Mid$(s, 3)
        msg = msg & vbCrLf & vbCrLf & "CPCs not found in Procurement (Column A):" & vbCrLf & s
    End If
    MsgBox msg, IIf(notFound.count > 0, vbExclamation, vbInformation), "Add Stock from File"
    
CleanExit:
    On Error Resume Next
    If Not srcWB Is Nothing Then srcWB.Close SaveChanges:=False
    ' Keep dmWB open so you can review/save
    On Error GoTo 0
    Exit Sub

FailOpenDM:
    MsgBox "Unable to open DM workbook at:" & vbCrLf & dmFolderPath & dmFileName, vbCritical
    Exit Sub

FailOpenSrc:
    MsgBox "Unable to open selected source file.", vbCritical
    GoTo CleanFail

CleanFail:
    On Error Resume Next
    If Not srcWB Is Nothing Then srcWB.Close SaveChanges:=False
    If Not dmWB Is Nothing Then dmWB.Close SaveChanges:=False
    On Error GoTo 0
End Sub


