Attribute VB_Name = "mod_TimeLog_DataExport"
Sub ExportQtyDataToTimeLog()
    '=======================================================================================
    ' PURPOSE: Export data from Qty 1-4 sheets to Time Log File (PRICING LOG)
    '
    ' SOURCE CELL FORMATS IN SETTINGS COLUMN N:
    '   1. Plain cell      e.g. "E3"                  -> read from current Qty sheet
    '   2. Sheet.Cell      e.g. "Quotation Temp.C12"  -> fixed cell, same value all 4 Qty
    '   3. Sheet.Range     e.g. "final.E30-H30"       -> column shifts per Qty
    '                           Qty1=E30, Qty2=F30, Qty3=G30, Qty4=H30
    '                           If Qty index exceeds range, writes blank
    '
    ' HARDCODED (not in Settings):
    '   "Sheet_Name" column -> writes "Qty 1", "Qty 2" etc.
    '   "Quote_No"   column -> reads from Final sheet B53, same for all Qty
    '
    ' DIVIDE BY 24:
    '   These columns are divided by 24 before writing to Time Log:
    '   - Labour
    '   - SMT Time -Without Programming
    '   - Total Labour Plush SMT
    '
    ' SKIP RULE:
    '   Qty sheet skipped if E3 is empty or zero
    '
    ' FILE PATH:
    '   E:\RS Master\6. BACKEND\PRICING LOG\Time_Log.xlsx
    '   Drive resolved dynamically from current workbook path
    '=======================================================================================

    Dim wb              As Workbook
    Dim logWb           As Workbook
    Dim settingsWs      As Worksheet
    Dim qtyWs           As Worksheet
    Dim logWs           As Worksheet

    Dim settingsArray   As Variant
    Dim qtyDataArray    As Variant
    Dim outputRow()     As Variant
    Dim headerMap       As Object       ' Time Log Header -> Column Number

    Dim fullPath        As String
    Dim rsRootPath      As String
    Dim timeLogFullPath As String
    Dim rsMasterPos     As Long

    Dim quoteValue      As Variant
    Dim nextRow         As Long
    Dim lastRow         As Long
    Dim mappingStartRow As Long

    Dim i               As Integer
    Dim j               As Long
    Dim headerName      As String
    Dim sourceCell      As String
    Dim sourceRow       As Long
    Dim sourceCol       As Long
    Dim maxSourceRow    As Long
    Dim maxSourceCol    As Long
    Dim destColNum      As Long
    Dim maxCol          As Long
    Dim lastHeaderCol   As Long
    Dim hCell           As Range
    Dim e3Val           As Variant

    Dim colSheetName    As Long
    Dim colQuoteNo      As Long

    Dim inSettingsNotInLog  As String
    Dim inLogNotInSettings  As String
    Dim mismatchReport      As String
    Dim settingsHeaders     As Object
    Dim key                 As Variant

    ' Source format parsing variables
    Dim dotPos          As Long
    Dim hyphenPos       As Long
    Dim sheetName       As String
    Dim cellPart        As String
    Dim startCell       As String
    Dim endCell         As String
    Dim startColNum     As Long
    Dim endColNum       As Long
    Dim targetColNum    As Long
    Dim targetRow       As Long
    Dim cellValue       As Variant
    Dim cellFormat      As String
    Dim rawVal          As Variant

    On Error GoTo ErrorHandler
    Set wb = ThisWorkbook


    '=======================================================================================
    ' STEP 1: BUILD FILE PATH
    '=======================================================================================
    fullPath = GetLocalPath(ThisWorkbook.FullName)

    rsMasterPos = InStr(1, fullPath, "RS Master", vbTextCompare)
    If rsMasterPos = 0 Then
        MsgBox "Could not locate 'RS Master' folder in path:" & vbCrLf & fullPath, _
               vbCritical, "Path Error"
        Exit Sub
    End If

    rsRootPath = Left(fullPath, rsMasterPos + Len("RS Master") - 1)
    timeLogFullPath = rsRootPath & "\6. BACKEND\PRICING LOG\Time_Log.xlsx"

    If Dir(timeLogFullPath) = "" Then
        MsgBox "File not found:" & vbCrLf & timeLogFullPath, vbCritical, "File Not Found"
        Exit Sub
    End If


    '=======================================================================================
    ' STEP 2: READ SETTINGS MAPPING
    ' Column M = Time Log header name
    ' Column N = Source cell (plain / Sheet.Cell / Sheet.StartCell-EndCell)
    '=======================================================================================
    Set settingsWs = wb.Sheets("Settings")

    lastRow = settingsWs.Cells(settingsWs.Rows.Count, "M").End(xlUp).Row

    mappingStartRow = 0
    For j = 2 To lastRow
        If Trim(settingsWs.Cells(j, "M").Value) <> "" Then
            mappingStartRow = j
            Exit For
        End If
    Next j

    If mappingStartRow = 0 Then
        MsgBox "No mappings found in Settings Column M.", vbCritical, "Settings Error"
        Exit Sub
    End If

    settingsArray = settingsWs.Range("M" & mappingStartRow & ":N" & lastRow).Value


    '=======================================================================================
    ' STEP 3: GET QUOTE VALUE FROM FINAL SHEET B53
    '=======================================================================================
    quoteValue = wb.Sheets("Final").Range("B53").Value


    '=======================================================================================
    ' STEP 4: FIND MAX SOURCE RANGE FOR PLAIN CELL REFERENCES (Qty sheet only)
    ' Sheet.Cell and Sheet.Range formats are read directly - not from qtyDataArray
    '=======================================================================================
    maxSourceRow = 1
    maxSourceCol = 1

    For j = 1 To UBound(settingsArray, 1)
        sourceCell = Trim(settingsArray(j, 2))
        If sourceCell = "" Then GoTo ScanNext

        ' Only scan plain cell references (no dot = reading from Qty sheet)
        dotPos = InStr(sourceCell, ".")
        If dotPos > 0 Then GoTo ScanNext

        On Error Resume Next
        sourceRow = Range(sourceCell).Row
        sourceCol = Range(sourceCell).Column
        On Error GoTo ErrorHandler

        If sourceRow > maxSourceRow Then maxSourceRow = sourceRow
        If sourceCol > maxSourceCol Then maxSourceCol = sourceCol
ScanNext:
    Next j

    maxSourceRow = maxSourceRow + 5
    maxSourceCol = maxSourceCol + 3


    '=======================================================================================
    ' STEP 5: OPEN TIME LOG & BUILD HEADER MAP
    '=======================================================================================
    Application.ScreenUpdating = False
    Application.DisplayAlerts = False

    Set logWb = Workbooks.Open(timeLogFullPath)
    Set logWs = logWb.Sheets(1)

    Set headerMap = CreateObject("Scripting.Dictionary")
    headerMap.CompareMode = vbTextCompare

    lastHeaderCol = logWs.Cells(1, logWs.Columns.Count).End(xlToLeft).Column
    maxCol = lastHeaderCol

    For Each hCell In logWs.Range(logWs.Cells(1, 1), logWs.Cells(1, lastHeaderCol))
        If Trim(hCell.Value) <> "" Then
            If Not headerMap.Exists(Trim(hCell.Value)) Then
                headerMap.Add Trim(hCell.Value), hCell.Column
            End If
        End If
    Next hCell

    ' Locate hardcoded columns
    colSheetName = 0
    colQuoteNo = 0
    If headerMap.Exists("Sheet_Name") Then colSheetName = headerMap("Sheet_Name")
    If headerMap.Exists("Quote_No") Then colQuoteNo = headerMap("Quote_No")

    If colSheetName = 0 Then
        MsgBox "'Sheet_Name' column not found in Time Log Row 1.", vbCritical, "Missing Column"
        logWb.Close SaveChanges:=False
        Application.ScreenUpdating = True
        Application.DisplayAlerts = True
        Exit Sub
    End If

    If colQuoteNo = 0 Then
        MsgBox "'Quote_No' column not found in Time Log Row 1.", vbCritical, "Missing Column"
        logWb.Close SaveChanges:=False
        Application.ScreenUpdating = True
        Application.DisplayAlerts = True
        Exit Sub
    End If


    '=======================================================================================
    ' STEP 6: MISMATCH REPORT
    ' Check 1: In Settings but missing in Time Log
    ' Check 2: In Time Log but not in Settings (exclude Sheet_Name and Quote_No)
    '=======================================================================================
    Set settingsHeaders = CreateObject("Scripting.Dictionary")
    settingsHeaders.CompareMode = vbTextCompare

    inSettingsNotInLog = ""
    For j = 1 To UBound(settingsArray, 1)
        headerName = Trim(settingsArray(j, 1))
        If headerName = "" Then GoTo CheckNext
        If Not settingsHeaders.Exists(headerName) Then
            settingsHeaders.Add headerName, 1
        End If
        If Not headerMap.Exists(headerName) Then
            inSettingsNotInLog = inSettingsNotInLog & "  - """ & headerName & """" & vbCrLf
        End If
CheckNext:
    Next j

    inLogNotInSettings = ""
    For Each key In headerMap.Keys
        If key = "Sheet_Name" Or key = "Quote_No" Then GoTo LogCheckNext
        If Not settingsHeaders.Exists(key) Then
            inLogNotInSettings = inLogNotInSettings & "  - """ & key & """" & vbCrLf
        End If
LogCheckNext:
    Next key

    If inSettingsNotInLog <> "" Or inLogNotInSettings <> "" Then
        mismatchReport = "Header mismatch found:" & vbCrLf & vbCrLf

        If inSettingsNotInLog <> "" Then
            mismatchReport = mismatchReport & _
                "In Settings but NOT in Time Log (will be skipped):" & vbCrLf & _
                inSettingsNotInLog & vbCrLf
        End If

        If inLogNotInSettings <> "" Then
            mismatchReport = mismatchReport & _
                "In Time Log but NOT in Settings (will be left blank):" & vbCrLf & _
                inLogNotInSettings & vbCrLf
        End If

        mismatchReport = mismatchReport & "Continue with matched headers only?"

        If MsgBox(mismatchReport, vbQuestion + vbYesNo, "Header Mismatch Report") = vbNo Then
            logWb.Close SaveChanges:=False
            Application.ScreenUpdating = True
            Application.DisplayAlerts = True
            Exit Sub
        End If
    End If

    nextRow = logWs.Cells(logWs.Rows.Count, "A").End(xlUp).Row + 1
    If nextRow < 2 Then nextRow = 2


    '=======================================================================================
    ' STEP 7: PROCESS EACH QTY SHEET
    '=======================================================================================
    For i = 1 To 4

        On Error Resume Next
        Set qtyWs = Nothing
        Set qtyWs = wb.Sheets("Qty " & i)
        On Error GoTo ErrorHandler

        If qtyWs Is Nothing Then
            Debug.Print "Qty " & i & " not found. Skipping."
            GoTo NextQtySheet
        End If

        ' Skip if E3 is empty or zero
        e3Val = qtyWs.Range("E3").Value
        If IsEmpty(e3Val) Or Trim(CStr(e3Val)) = "" Or e3Val = 0 Then
            Debug.Print "Qty " & i & ": E3 empty/zero. Skipping."
            GoTo NextQtySheet
        End If

        ' Read Qty sheet into array (plain cell references only - single read)
        qtyDataArray = qtyWs.Range(qtyWs.Cells(1, 1), _
                                   qtyWs.Cells(maxSourceRow, maxSourceCol)).Value

        ReDim outputRow(1 To 1, 1 To maxCol)

        ' Hardcoded columns
        outputRow(1, colSheetName) = "Qty " & i
        outputRow(1, colQuoteNo) = quoteValue

        '------------------------------------------------------------------------------------
        ' PASS 1: Values
        ' Handles all 3 source formats:
        '   Format 1 - "E3"                 -> Qty sheet array
        '   Format 2 - "Quotation Temp.C12" -> fixed cell from named sheet
        '   Format 3 - "final.E30-H30"      -> column shifts per Qty index
        '
        ' DIVIDE BY 24 applied for:
        '   Labour / SMT Time -Without Programming / Total Labour Plush SMT
        '------------------------------------------------------------------------------------
        For j = 1 To UBound(settingsArray, 1)

            headerName = Trim(settingsArray(j, 1))
            sourceCell = Trim(settingsArray(j, 2))

            If headerName = "" Or sourceCell = "" Then GoTo NextMap
            If Not headerMap.Exists(headerName) Then GoTo NextMap

            destColNum = headerMap(headerName)
            dotPos = InStr(sourceCell, ".")

            If dotPos = 0 Then
                '--- FORMAT 1: Plain cell - read from Qty sheet array ---
                sourceRow = Range(sourceCell).Row
                sourceCol = Range(sourceCell).Column
                rawVal = qtyDataArray(sourceRow, sourceCol)

            Else
                '--- FORMAT 2 or 3: External sheet reference ---
                sheetName = Trim(Left(sourceCell, dotPos - 1))
                cellPart = Trim(Mid(sourceCell, dotPos + 1))
                hyphenPos = InStr(cellPart, "-")

                If hyphenPos = 0 Then
                    '--- FORMAT 2: Sheet.Cell - fixed cell same for all Qty ---
                    On Error Resume Next
                    rawVal = wb.Sheets(sheetName).Range(cellPart).Value
                    On Error GoTo ErrorHandler

                Else
                    '--- FORMAT 3: Sheet.StartCell-EndCell - column shifts per Qty ---
                    startCell = Trim(Left(cellPart, hyphenPos - 1))
                    endCell = Trim(Mid(cellPart, hyphenPos + 1))
                    startColNum = Range(startCell).Column
                    endColNum = Range(endCell).Column
                    targetRow = Range(startCell).Row
                    targetColNum = startColNum + (i - 1)

                    If targetColNum <= endColNum Then
                        On Error Resume Next
                        rawVal = wb.Sheets(sheetName).Cells(targetRow, targetColNum).Value
                        On Error GoTo ErrorHandler
                    Else
                        rawVal = ""     ' Qty index exceeds defined range - write blank
                    End If
                End If
            End If

            ' Divide by 24 for specific columns
            Select Case headerName
                Case "Labour", "SMT Time -Without Programming", "Total Labour Plush SMT"
                    If IsNumeric(rawVal) And rawVal <> "" Then rawVal = rawVal / 24
            End Select

            outputRow(1, destColNum) = rawVal
NextMap:
        Next j

        ' Write entire row to Time Log in one operation
        logWs.Range(logWs.Cells(nextRow, 1), logWs.Cells(nextRow, maxCol)).Value = outputRow

        '------------------------------------------------------------------------------------
        ' PASS 2: NumberFormat - copy format from source to destination
        '------------------------------------------------------------------------------------
        For j = 1 To UBound(settingsArray, 1)

            headerName = Trim(settingsArray(j, 1))
            sourceCell = Trim(settingsArray(j, 2))

            If headerName = "" Or sourceCell = "" Then GoTo NextFormat
            If Not headerMap.Exists(headerName) Then GoTo NextFormat

            destColNum = headerMap(headerName)
            dotPos = InStr(sourceCell, ".")

            If dotPos = 0 Then
                '--- FORMAT 1: Copy format from Qty sheet ---
                sourceRow = Range(sourceCell).Row
                sourceCol = Range(sourceCell).Column
                cellFormat = qtyWs.Cells(sourceRow, sourceCol).NumberFormat

            Else
                sheetName = Trim(Left(sourceCell, dotPos - 1))
                cellPart = Trim(Mid(sourceCell, dotPos + 1))
                hyphenPos = InStr(cellPart, "-")

                If hyphenPos = 0 Then
                    '--- FORMAT 2: Copy format from external fixed cell ---
                    On Error Resume Next
                    cellFormat = wb.Sheets(sheetName).Range(cellPart).NumberFormat
                    On Error GoTo ErrorHandler

                Else
                    '--- FORMAT 3: Copy format from shifted column cell ---
                    startCell = Trim(Left(cellPart, hyphenPos - 1))
                    endCell = Trim(Mid(cellPart, hyphenPos + 1))
                    startColNum = Range(startCell).Column
                    endColNum = Range(endCell).Column
                    targetRow = Range(startCell).Row
                    targetColNum = startColNum + (i - 1)

                    If targetColNum <= endColNum Then
                        On Error Resume Next
                        cellFormat = wb.Sheets(sheetName).Cells(targetRow, targetColNum).NumberFormat
                        On Error GoTo ErrorHandler
                    Else
                        GoTo NextFormat     ' blank cell - no format to apply
                    End If
                End If
            End If

            logWs.Cells(nextRow, destColNum).NumberFormat = cellFormat
           ' AFTER - override format for divide-by-24 columns
            Select Case headerName
                Case "Labour", "SMT Time -Without Programming", "Total Labour Plush SMT"
                    logWs.Cells(nextRow, destColNum).NumberFormat = "[h]:mm:ss"
                Case Else
                    logWs.Cells(nextRow, destColNum).NumberFormat = cellFormat
            End Select
NextFormat:
        Next j

        nextRow = nextRow + 1

NextQtySheet:
        Set qtyWs = Nothing
    Next i


    '=======================================================================================
    ' STEP 8: SAVE AND CLOSE
    '=======================================================================================
    logWb.Close SaveChanges:=True

    Application.ScreenUpdating = True
    Application.DisplayAlerts = True

    MsgBox "Export complete!" & vbCrLf & timeLogFullPath, vbInformation, "Done"
    Exit Sub


'=======================================================================================
' ERROR HANDLER
'=======================================================================================
ErrorHandler:
    Application.ScreenUpdating = True
    Application.DisplayAlerts = True
    MsgBox "Error " & Err.Number & ": " & Err.Description, vbCritical, "Export Error"
    If Not logWb Is Nothing Then
        On Error Resume Next
        logWb.Close SaveChanges:=False
        On Error GoTo 0
    End If

End Sub



'Sub ExportQtyDataToTimeLog()
'    '=======================================================================================
'    ' PURPOSE: Export data from Qty 1-4 sheets to Time Log File (PRICING LOG)
'    '
'    ' HOW IT WORKS:
'    '   - Reads Settings sheet Column M (Time Log headers) and Column N (source cells)
'    '   - "Sheet Name" column in Time Log  -> hardcoded: writes "Qty 1", "Qty 2" etc.
'    '   - "Quote No"  column in Time Log   -> hardcoded: reads from Final sheet B53
'    '   - All other columns matched by header name between Settings and Time Log Row 1
'    '   - Values written via array (fast), formatting applied cell-by-cell after
'    '   - Skips Qty sheet if E3 is empty or zero
'    '   - If headers mismatch between Settings and Time Log -> report + ask to continue
'    '
'    ' SETTINGS SHEET (Column M & N):
'    '   Column M = Header name exactly as it appears in Time Log Row 1
'    '   Column N = Source cell reference in Qty sheet (e.g. E3, B10, H58)
'    '   NOTE: Do NOT add "Sheet Name" or "Quote No" in Settings - handled by code
'    '
'    ' FILE PATH:
'    '   E:\RS Master\6. BACKEND\PRICING LOG\Time_Log.xlsx
'    '   Drive letter resolved dynamically from current workbook path
'    '=======================================================================================
'
'    Dim wb              As Workbook
'    Dim logWb           As Workbook
'    Dim settingsWs      As Worksheet
'    Dim qtyWs           As Worksheet
'    Dim logWs           As Worksheet
'
'    Dim settingsArray   As Variant
'    Dim qtyDataArray    As Variant
'    Dim outputRow()     As Variant
'    Dim headerMap       As Object       ' Time Log Header Name -> Column Number
'
'    Dim fullPath        As String
'    Dim rsRootPath      As String
'    Dim timeLogFullPath As String
'    Dim rsMasterPos     As Long
'
'    Dim quoteValue      As Variant
'    Dim nextRow         As Long
'    Dim lastRow         As Long
'    Dim mappingStartRow As Long
'
'    Dim i               As Integer
'    Dim j               As Long
'    Dim headerName      As String
'    Dim sourceCell      As String
'    Dim sourceRow       As Long
'    Dim sourceCol       As Long
'    Dim maxSourceRow    As Long
'    Dim maxSourceCol    As Long
'    Dim destColNum      As Long
'    Dim maxCol          As Long
'    Dim lastHeaderCol   As Long
'    Dim hCell           As Range
'    Dim e3Val           As Variant
'
'    Dim colSheetName    As Long         ' Column number of "Sheet Name" in Time Log
'    Dim colQuoteNo      As Long         ' Column number of "Quote No" in Time Log
'
'    Dim inSettingsNotInLog  As String   ' Headers in Settings but missing in Time Log
'    Dim inLogNotInSettings  As String   ' Headers in Time Log but not mapped in Settings
'    Dim mismatchReport      As String
'
'    On Error GoTo ErrorHandler
'    Set wb = ThisWorkbook
'
'
'    '=======================================================================================
'    ' STEP 1: BUILD FILE PATH
'    '=======================================================================================
'    fullPath = GetLocalPath(ThisWorkbook.FullName)
'
'    rsMasterPos = InStr(1, fullPath, "RS Master", vbTextCompare)
'    If rsMasterPos = 0 Then
'        MsgBox "Could not locate 'RS Master' folder in path:" & vbCrLf & fullPath, _
'               vbCritical, "Path Error"
'        Exit Sub
'    End If
'
'    rsRootPath = Left(fullPath, rsMasterPos + Len("RS Master") - 1)
'    timeLogFullPath = rsRootPath & "\6. BACKEND\PRICING LOG\Time_Log.xlsx"
'
'    If Dir(timeLogFullPath) = "" Then
'        MsgBox "File not found:" & vbCrLf & timeLogFullPath, vbCritical, "File Not Found"
'        Exit Sub
'    End If
'
'
'    '=======================================================================================
'    ' STEP 2: READ SETTINGS MAPPING (Column M = Log Header, Column N = Source Cell)
'    '=======================================================================================
'    Set settingsWs = wb.Sheets("Settings")
'
'    lastRow = settingsWs.Cells(settingsWs.Rows.Count, "M").End(xlUp).Row
'
'    ' Find first non-empty row in Column M
'    mappingStartRow = 0
'    For j = 2 To lastRow
'        If Trim(settingsWs.Cells(j, "M").Value) <> "" Then
'            mappingStartRow = j
'            Exit For
'        End If
'    Next j
'
'    If mappingStartRow = 0 Then
'        MsgBox "No mappings found in Settings Column M.", vbCritical, "Settings Error"
'        Exit Sub
'    End If
'
'    ' Read all Settings mappings into array in one shot
'    settingsArray = settingsWs.Range("M" & mappingStartRow & ":N" & lastRow).Value
'
'
'    '=======================================================================================
'    ' STEP 3: GET QUOTE VALUE FROM FINAL SHEET B53
'    '=======================================================================================
'    quoteValue = wb.Sheets("Final").Range("B53").Value
'
'
'    '=======================================================================================
'    ' STEP 4: FIND MAX SOURCE RANGE NEEDED
'    ' Scan all source cells in Settings to determine minimum array size for Qty sheets
'    '=======================================================================================
'    maxSourceRow = 1
'    maxSourceCol = 1
'
'    For j = 1 To UBound(settingsArray, 1)
'        sourceCell = Trim(settingsArray(j, 2))
'        If sourceCell = "" Then GoTo ScanNext
'
'        On Error Resume Next
'        sourceRow = Range(sourceCell).Row
'        sourceCol = Range(sourceCell).Column
'        On Error GoTo ErrorHandler
'
'        If sourceRow > maxSourceRow Then maxSourceRow = sourceRow
'        If sourceCol > maxSourceCol Then maxSourceCol = sourceCol
'ScanNext:
'    Next j
'
'    maxSourceRow = maxSourceRow + 5     ' small buffer
'    maxSourceCol = maxSourceCol + 3
'
'
'    '=======================================================================================
'    ' STEP 5: OPEN TIME LOG & BUILD HEADER MAP
'    '=======================================================================================
'    Application.ScreenUpdating = False
'    Application.DisplayAlerts = False
'
'    Set logWb = Workbooks.Open(timeLogFullPath)
'    Set logWs = logWb.Sheets(1)
'
'    ' Build dictionary: Time Log Header -> Column Number (case-insensitive)
'    Set headerMap = CreateObject("Scripting.Dictionary")
'    headerMap.CompareMode = vbTextCompare
'
'    lastHeaderCol = logWs.Cells(1, logWs.Columns.Count).End(xlToLeft).Column
'    maxCol = lastHeaderCol
'
'    For Each hCell In logWs.Range(logWs.Cells(1, 1), logWs.Cells(1, lastHeaderCol))
'        If Trim(hCell.Value) <> "" Then
'            If Not headerMap.Exists(Trim(hCell.Value)) Then
'                headerMap.Add Trim(hCell.Value), hCell.Column
'            End If
'        End If
'    Next hCell
'
'    ' Locate "Sheet Name" and "Quote No" columns in Time Log
'    colSheetName = 0
'    colQuoteNo = 0
'    If headerMap.Exists("Sheet Name") Then colSheetName = headerMap("Sheet Name")
'    If headerMap.Exists("Quote No") Then colQuoteNo = headerMap("Quote No")
'
'    If colSheetName = 0 Then
'        MsgBox "'Sheet Name' column not found in Time Log Row 1." & vbCrLf & _
'               "Please add it as a header in Time Log.", vbCritical, "Missing Column"
'        logWb.Close SaveChanges:=False
'        Application.ScreenUpdating = True
'        Application.DisplayAlerts = True
'        Exit Sub
'    End If
'
'    If colQuoteNo = 0 Then
'        MsgBox "'Quote No' column not found in Time Log Row 1." & vbCrLf & _
'               "Please add it as a header in Time Log.", vbCritical, "Missing Column"
'        logWb.Close SaveChanges:=False
'        Application.ScreenUpdating = True
'        Application.DisplayAlerts = True
'        Exit Sub
'    End If
'
'
'    '=======================================================================================
'    ' STEP 6: MISMATCH REPORT
'    ' Check 1: Headers in Settings Column M that are missing in Time Log Row 1
'    ' Check 2: Headers in Time Log Row 1 that have no mapping in Settings
'    '          (exclude "Sheet Name" and "Quote No" - they are hardcoded)
'    '=======================================================================================
'    Dim settingsHeaders As Object
'    Set settingsHeaders = CreateObject("Scripting.Dictionary")
'    settingsHeaders.CompareMode = vbTextCompare
'
'    inSettingsNotInLog = ""
'    For j = 1 To UBound(settingsArray, 1)
'        headerName = Trim(settingsArray(j, 1))
'        If headerName = "" Then GoTo CheckNext
'        settingsHeaders.Add headerName, 1   ' build lookup for Check 2
'
'        If Not headerMap.Exists(headerName) Then
'            inSettingsNotInLog = inSettingsNotInLog & "  - """ & headerName & """" & vbCrLf
'        End If
'CheckNext:
'    Next j
'
'    inLogNotInSettings = ""
'    Dim key As Variant
'    For Each key In headerMap.Keys
'        ' Skip Sheet Name and Quote No - hardcoded, not in Settings by design
'        If key = "Sheet Name" Or key = "Quote No" Then GoTo LogCheckNext
'        If Not settingsHeaders.Exists(key) Then
'            inLogNotInSettings = inLogNotInSettings & "  - """ & key & """" & vbCrLf
'        End If
'LogCheckNext:
'    Next key
'
'    ' Build report and ask confirmation if any mismatch found
'    If inSettingsNotInLog <> "" Or inLogNotInSettings <> "" Then
'        mismatchReport = "Header mismatch found:" & vbCrLf & vbCrLf
'
'        If inSettingsNotInLog <> "" Then
'            mismatchReport = mismatchReport & _
'                "In Settings but NOT in Time Log (will be skipped):" & vbCrLf & _
'                inSettingsNotInLog & vbCrLf
'        End If
'
'        If inLogNotInSettings <> "" Then
'            mismatchReport = mismatchReport & _
'                "In Time Log but NOT in Settings (will be left blank):" & vbCrLf & _
'                inLogNotInSettings & vbCrLf
'        End If
'
'        mismatchReport = mismatchReport & "Do you want to continue with matched headers only?"
'
'        If MsgBox(mismatchReport, vbQuestion + vbYesNo, "Header Mismatch Report") = vbNo Then
'            logWb.Close SaveChanges:=False
'            Application.ScreenUpdating = True
'            Application.DisplayAlerts = True
'            Exit Sub
'        End If
'    End If
'
'    ' Find next empty row in Time Log
'    nextRow = logWs.Cells(logWs.Rows.Count, "A").End(xlUp).Row + 1
'    If nextRow < 2 Then nextRow = 2
'
'
'    '=======================================================================================
'    ' STEP 7: PROCESS EACH QTY SHEET AND WRITE TO TIME LOG
'    '=======================================================================================
'    For i = 1 To 4
'
'        ' Get Qty sheet
'        On Error Resume Next
'        Set qtyWs = Nothing
'        Set qtyWs = wb.Sheets("Qty " & i)
'        On Error GoTo ErrorHandler
'
'        If qtyWs Is Nothing Then
'            Debug.Print "Qty " & i & " sheet not found. Skipping."
'            GoTo NextQtySheet
'        End If
'
'        ' Skip if E3 is empty or zero
'        e3Val = qtyWs.Range("E3").Value
'        If IsEmpty(e3Val) Or Trim(CStr(e3Val)) = "" Or e3Val = 0 Then
'            Debug.Print "Qty " & i & ": E3 empty/zero. Skipping."
'            GoTo NextQtySheet
'        End If
'
'        ' Read Qty sheet into array - single read operation
'        qtyDataArray = qtyWs.Range(qtyWs.Cells(1, 1), _
'                                   qtyWs.Cells(maxSourceRow, maxSourceCol)).Value
'
'        ' Initialise output row
'        ReDim outputRow(1 To 1, 1 To maxCol)
'
'        '--- Hardcoded columns ---
'        outputRow(1, colSheetName) = "Qty " & i        ' Sheet Name column
'        outputRow(1, colQuoteNo) = quoteValue           ' Quote No column
'
'        '------------------------------------------------------------------------------------
'        ' PASS 1: Read values from Settings mappings into output array (in memory)
'        '------------------------------------------------------------------------------------
'        For j = 1 To UBound(settingsArray, 1)
'
'            headerName = Trim(settingsArray(j, 1))
'            sourceCell = Trim(settingsArray(j, 2))
'
'            If headerName = "" Or sourceCell = "" Then GoTo NextMap
'            If Not headerMap.Exists(headerName) Then GoTo NextMap
'
'            destColNum = headerMap(headerName)
'            sourceRow = Range(sourceCell).Row
'            sourceCol = Range(sourceCell).Column
'
'            outputRow(1, destColNum) = qtyDataArray(sourceRow, sourceCol)
'NextMap:
'        Next j
'
'        ' Write entire row to Time Log in one operation
'        logWs.Range(logWs.Cells(nextRow, 1), logWs.Cells(nextRow, maxCol)).Value = outputRow
'
'        '------------------------------------------------------------------------------------
'        ' PASS 2: Apply NumberFormat from source cells to Time Log destination cells
'        ' Arrays hold values only - formatting must be applied separately
'        '------------------------------------------------------------------------------------
'        For j = 1 To UBound(settingsArray, 1)
'
'            headerName = Trim(settingsArray(j, 1))
'            sourceCell = Trim(settingsArray(j, 2))
'
'            If headerName = "" Or sourceCell = "" Then GoTo NextFormat
'            If Not headerMap.Exists(headerName) Then GoTo NextFormat
'
'            destColNum = headerMap(headerName)
'            sourceRow = Range(sourceCell).Row
'            sourceCol = Range(sourceCell).Column
'
'            logWs.Cells(nextRow, destColNum).NumberFormat = _
'                qtyWs.Cells(sourceRow, sourceCol).NumberFormat
'NextFormat:
'        Next j
'
'        nextRow = nextRow + 1
'
'NextQtySheet:
'        Set qtyWs = Nothing
'    Next i
'
'
'    '=======================================================================================
'    ' STEP 8: SAVE AND CLOSE TIME LOG
'    '=======================================================================================
'    logWb.Close SaveChanges:=True
'
'    Application.ScreenUpdating = True
'    Application.DisplayAlerts = True
'
'    MsgBox "Export complete!" & vbCrLf & timeLogFullPath, vbInformation, "Done"
'    Exit Sub
'
'
''=======================================================================================
'' ERROR HANDLER
''=======================================================================================
'ErrorHandler:
'    Application.ScreenUpdating = True
'    Application.DisplayAlerts = True
'    MsgBox "Error " & Err.Number & ": " & Err.Description, vbCritical, "Export Error"
'    If Not logWb Is Nothing Then
'        On Error Resume Next
'        logWb.Close SaveChanges:=False
'        On Error GoTo 0
'    End If
'
'End Sub
'
'


