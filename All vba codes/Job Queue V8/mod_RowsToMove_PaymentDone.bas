Attribute VB_Name = "mod_RowsToMove_PaymentDone"
Sub MovePaymentReceivedRows_Optimized()
    '========================================
    ' Move Payment Received Rows
    '========================================
   
    
    On Error GoTo ErrorHandler
    
    ' Performance settings
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.EnableEvents = False
    
    ' Declare variables
    Dim wsJobQueue As Worksheet
    Dim wsYear As Worksheet
    Dim lastRowJQ As Long, lastRowYear As Long
    Dim statusCol As Long, yearCol As Long
    Dim jqData As Variant
    Dim rowsToMove As Object, yearCounts As Object
    Dim yearBeforeCounts As Object, yearAfterCounts As Object
    Dim jqHeaders As Object, yearHeaders As Object
    Dim yearKey As Variant, headerName As Variant
    Dim i As Long, col As Long
    Dim totalRowsToMove As Long
    Dim summaryMsg As String, missingYears As String
    Dim userResponse As VbMsgBoxResult
    Dim rowYear As String
    Dim totalLastCol As Long
    
    '========================================
    ' STEP 1: Initialize
    '========================================
    On Error Resume Next
    Set wsJobQueue = ThisWorkbook.Worksheets("Job Queue")
    On Error GoTo ErrorHandler
    
    If wsJobQueue Is Nothing Then
        MsgBox "Error: 'Job Queue' sheet not found!", vbCritical, "Sheet Missing"
        GoTo CleanUp
    End If
    
    Set rowsToMove = CreateObject("Scripting.Dictionary")
    Set yearCounts = CreateObject("Scripting.Dictionary")
    Set yearBeforeCounts = CreateObject("Scripting.Dictionary")
    Set yearAfterCounts = CreateObject("Scripting.Dictionary")
    
    '========================================
    ' STEP 2: Find Columns & Load Data to Array
    '========================================
    ' Find required columns
    statusCol = 0: yearCol = 0
    For col = 1 To wsJobQueue.Cells(3, wsJobQueue.Columns.Count).End(xlToLeft).Column
        Select Case Trim(wsJobQueue.Cells(3, col).Value)
            Case "Order Status": statusCol = col
            Case "Year": yearCol = col
        End Select
        If statusCol > 0 And yearCol > 0 Then Exit For
    Next col
    
    If statusCol = 0 Then
        MsgBox "Error: 'Order Status' column not found in Job Queue sheet!", vbCritical, "Column Missing"
        GoTo CleanUp
    End If
    
    If yearCol = 0 Then
        MsgBox "Error: 'Year' column not found in Job Queue sheet!", vbCritical, "Column Missing"
        GoTo CleanUp
    End If
    
    ' Get last row and column
    lastRowJQ = wsJobQueue.Cells(wsJobQueue.Rows.Count, statusCol).End(xlUp).row
    If lastRowJQ < 4 Then
        MsgBox "No data found in Job Queue.", vbInformation, "No Data"
        GoTo CleanUp
    End If
    
    totalLastCol = wsJobQueue.Cells(3, wsJobQueue.Columns.Count).End(xlToLeft).Column
    
    ' Load entire Job Queue data into array
    ' Load data from row 3 (headers) to last row
    jqData = wsJobQueue.Range(wsJobQueue.Cells(3, 1), _
                               wsJobQueue.Cells(lastRowJQ, totalLastCol)).Value
    
    '========================================
    ' STEP 3: Build Header Dictionary (from array)
    '========================================
    Set jqHeaders = CreateObject("Scripting.Dictionary")
    For col = 1 To UBound(jqData, 2)
        headerName = Trim(jqData(1, col))
        If headerName <> "" Then jqHeaders.Add headerName, col
    Next col
    
    '========================================
    ' STEP 4: Scan for "Payment Received" (in array - FAST!)
    '========================================
    For i = 2 To UBound(jqData, 1) ' Start from row 2 (first data row after header)
        If Trim(jqData(i, statusCol)) = "1. Payment Received" Then
            rowYear = Trim(jqData(i, yearCol))
            If rowYear <> "" Then
                ' Count rows per year
                If Not yearCounts.Exists(rowYear) Then
                    yearCounts.Add rowYear, 0
                    rowsToMove.Add rowYear, CreateObject("System.Collections.ArrayList")
                End If
                yearCounts(rowYear) = yearCounts(rowYear) + 1
                rowsToMove(rowYear).Add i ' Store array row index
                totalRowsToMove = totalRowsToMove + 1
            End If
        End If
    Next i
    
    '========================================
    ' STEP 5: Confirmation
    '========================================
    If totalRowsToMove = 0 Then
        MsgBox "No rows with 'Payment Received' status found in Job Queue.", vbInformation, "No Data to Move"
        GoTo CleanUp
    End If
    
    summaryMsg = "Found " & totalRowsToMove & " row(s) to move:" & vbCrLf & vbCrLf
    For Each yearKey In yearCounts.Keys
        summaryMsg = summaryMsg & "    " & yearCounts(yearKey) & " row(s) to sheet: " & yearKey & vbCrLf
    Next yearKey
    summaryMsg = summaryMsg & vbCrLf & "Do you want to proceed?"
    
    userResponse = MsgBox(summaryMsg, vbQuestion + vbYesNo, "Confirm Move")
    If userResponse = vbNo Then
        MsgBox "Operation cancelled by user.", vbInformation, "Cancelled"
        GoTo CleanUp
    End If
    
    '========================================
    ' STEP 6: Process Each Year (Array-based)
    '========================================
    missingYears = ""
    
    For Each yearKey In rowsToMove.Keys
        On Error Resume Next
        Set wsYear = ThisWorkbook.Worksheets(CStr(yearKey))
        On Error GoTo ErrorHandler
        
        If wsYear Is Nothing Then
            missingYears = missingYears & yearKey & ", "
            Set wsYear = Nothing
            GoTo NextYear
        End If
        
        '========================================
        ' STEP 6.1: Build Year Sheet Header Dictionary
        '========================================
        Set yearHeaders = CreateObject("Scripting.Dictionary")
        For col = 1 To wsYear.Cells(1, wsYear.Columns.Count).End(xlToLeft).Column
            headerName = Trim(wsYear.Cells(1, col).Value)
            If headerName <> "" Then yearHeaders.Add headerName, col
        Next col
        
        '========================================
        ' STEP 6.2: Check for Column Mismatches
        '========================================
        Dim missingInYear As String
        Dim missingInJQ As String
        
        ' Find columns in Job Queue but NOT in Year sheet
        missingInYear = ""
        For Each headerName In jqHeaders.Keys
            If Not yearHeaders.Exists(headerName) Then
                missingInYear = missingInYear & "    " & headerName & vbCrLf
            End If
        Next headerName
        
        ' If there are missing columns in year sheet, ask for confirmation
        If missingInYear <> "" Then
            userResponse = MsgBox("The following columns exist in Job Queue but NOT in '" & yearKey & "' sheet:" & vbCrLf & vbCrLf & _
                                  missingInYear & vbCrLf & _
                                  "Only matching columns will be copied." & vbCrLf & vbCrLf & _
                                  "Do you want to continue?", _
                                  vbQuestion + vbYesNo, "Column Mismatch - " & yearKey)
            If userResponse = vbNo Then
                MsgBox "Operation cancelled by user.", vbInformation, "Cancelled"
                GoTo CleanUp
            End If
        End If
        
        ' Find columns in Year sheet but NOT in Job Queue
        missingInJQ = ""
        For Each headerName In yearHeaders.Keys
            If Not jqHeaders.Exists(headerName) Then
                missingInJQ = missingInJQ & "    " & headerName & vbCrLf
            End If
        Next headerName
        
        ' If there are extra columns in year sheet, inform user
        If missingInJQ <> "" Then
            userResponse = MsgBox("The following columns exist in '" & yearKey & "' sheet but NOT in Job Queue:" & vbCrLf & vbCrLf & _
                                  missingInJQ & vbCrLf & _
                                  "These columns will be left empty for new rows." & vbCrLf & vbCrLf & _
                                  "Do you want to continue?", _
                                  vbQuestion + vbYesNo, "Column Mismatch - " & yearKey)
            If userResponse = vbNo Then
                MsgBox "Operation cancelled by user.", vbInformation, "Cancelled"
                GoTo CleanUp
            End If
        End If
        
        '========================================
        ' STEP 6.3: Get Before Count for Year Sheet
        '========================================
        lastRowYear = wsYear.Cells(wsYear.Rows.Count, 1).End(xlUp).row
        yearBeforeCounts.Add yearKey, IIf(lastRowYear = 1, 0, lastRowYear - 1)
        
        '========================================
        ' STEP 6.4: Build Output Array & Copy Data
        '========================================
        Dim rowsToCopy As Object
        Set rowsToCopy = rowsToMove(yearKey)
        
        Dim outputArray() As Variant
        ReDim outputArray(1 To rowsToCopy.Count, 1 To yearHeaders.Count)
        
        Dim rowIndex As Long, sourceRow As Long
        Dim outputRow As Long
        Dim sourceColNum As Long, destColNum As Long
        
        ' Fill output array with data
        For rowIndex = 0 To rowsToCopy.Count - 1
            sourceRow = rowsToCopy(rowIndex) ' This is array row index
            outputRow = rowIndex + 1
            
            ' Copy each matching column
            For Each headerName In jqHeaders.Keys
                If yearHeaders.Exists(headerName) Then
                    sourceColNum = jqHeaders(headerName)
                    destColNum = yearHeaders(headerName)
                    outputArray(outputRow, destColNum) = jqData(sourceRow, sourceColNum)
                End If
            Next headerName
        Next rowIndex
        
        '========================================
        ' STEP 6.5: Bulk Write & Format
        '========================================
        Dim destStartRow As Long
        destStartRow = wsYear.Cells(wsYear.Rows.Count, 1).End(xlUp).row + 1
        
        ' Write entire array at once (SUPER FAST!)
        wsYear.Cells(destStartRow, 1).Resize(UBound(outputArray, 1), UBound(outputArray, 2)).Value = outputArray
        
        ' Bulk copy formatting from row above (if exists)
        If destStartRow > 2 Then
            wsYear.Rows(destStartRow - 1).Copy
            wsYear.Rows(destStartRow).Resize(UBound(outputArray, 1)).PasteSpecial xlPasteFormats
            Application.CutCopyMode = False
            ' Restore values (PasteFormats might clear them in some cases)
            wsYear.Cells(destStartRow, 1).Resize(UBound(outputArray, 1), UBound(outputArray, 2)).Value = outputArray
        End If
        
        '========================================
        ' STEP 6.6: Get After Count for Year Sheet
        '========================================
        lastRowYear = wsYear.Cells(wsYear.Rows.Count, 1).End(xlUp).row
        yearAfterCounts.Add yearKey, IIf(lastRowYear = 1, 0, lastRowYear - 1)
        
NextYear:
        Set wsYear = Nothing
    Next yearKey
    
    '========================================
    ' STEP 7: Delete Rows (AutoFilter - NO HELPER COLUMN!)
    '========================================
    ' Simply filter the "Order Status" column for "1. Payment Received" and delete
    
    With wsJobQueue
        .AutoFilterMode = False
        lastRowJQ = .Cells(.Rows.Count, statusCol).End(xlUp).row
        
        If lastRowJQ >= 4 Then ' Make sure there's data to filter
            ' Apply AutoFilter on Order Status column
            .Range(.Cells(3, 1), .Cells(lastRowJQ, totalLastCol)).AutoFilter _
                Field:=statusCol, Criteria1:="1. Payment Received"
            
            ' Delete visible rows (except header row 3)
            On Error Resume Next
            Dim visibleRows As Range
            Set visibleRows = .Range(.Cells(4, 1), .Cells(lastRowJQ, 1)).SpecialCells(xlCellTypeVisible)
            If Not visibleRows Is Nothing Then
                visibleRows.EntireRow.Delete
            End If
            On Error GoTo ErrorHandler
        End If
        
        .AutoFilterMode = False
    End With
    
    '========================================
    ' STEP 8: Show Final Summary
    '========================================
    summaryMsg = "Operation Completed Successfully!" & vbCrLf & vbCrLf
    summaryMsg = summaryMsg & "Summary of changes:" & vbCrLf & vbCrLf
    
    For Each yearKey In yearBeforeCounts.Keys
        Dim beforeCount As Long
        Dim afterCount As Long
        Dim addedCount As Long
        
        beforeCount = yearBeforeCounts(yearKey)
        afterCount = yearAfterCounts(yearKey)
        addedCount = afterCount - beforeCount
        
        summaryMsg = summaryMsg & "?? Sheet: " & yearKey & vbCrLf
        summaryMsg = summaryMsg & "     Rows Before Insertion:  " & Format(beforeCount, "#,##0") & vbCrLf
        summaryMsg = summaryMsg & "     Rows After Insertion:   " & Format(afterCount, "#,##0") & vbCrLf
        summaryMsg = summaryMsg & "     New Rows Added:         +" & Format(addedCount, "#,##0") & vbCrLf & vbCrLf
    Next yearKey
    
    summaryMsg = summaryMsg & "Total rows moved: " & totalRowsToMove
    
    ' Add warning for missing year sheets
    If missingYears <> "" Then
        missingYears = Left(missingYears, Len(missingYears) - 2) ' Remove trailing comma
        summaryMsg = summaryMsg & vbCrLf & vbCrLf & "? WARNING: The following year sheet(s) were not found:" & vbCrLf
        summaryMsg = summaryMsg & "  " & missingYears & vbCrLf
        summaryMsg = summaryMsg & "Rows for these years were NOT moved."
    End If
    
    MsgBox summaryMsg, vbInformation, "Move Complete"
    
CleanUp:
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True
    Exit Sub
    
ErrorHandler:
    MsgBox "An error occurred: " & Err.Description & vbCrLf & _
           "Error Number: " & Err.Number, vbCritical, "Error"
    GoTo CleanUp
End Sub

''Sub MovePaymentReceivedRows()
''    '========================================
''    ' MACRO: Move Payment Received Rows to Year Sheets
''    '========================================
''    ' Purpose: Moves rows with "Payment Received" status from Job Queue
''    '          to respective year sheets (2025, 2026, etc.)
''
''    '========================================
''
''    On Error GoTo ErrorHandler
''
''    ' Declare variables
''    Dim wsJobQueue As Worksheet
''    Dim wsYear As Worksheet
''    Dim lastRowJQ As Long
''    Dim lastRowYear As Long
''    Dim i As Long
''    Dim statusCol As Long
''    Dim yearCol As Long
''    Dim rowYear As String
''    Dim rowsToMove As Object
''    Dim yearKey As Variant
''    Dim rowData As Variant
''    Dim jqHeaders As Object
''    Dim yearHeaders As Object
''    Dim col As Long
''    Dim headerName As Variant
''    Dim missingInYear As String
''    Dim missingInJQ As String
''    Dim userResponse As VbMsgBoxResult
''    Dim totalRowsToMove As Long
''    Dim yearCounts As Object
''    Dim yearBeforeCounts As Object
''    Dim yearAfterCounts As Object
''    Dim summaryMsg As String
''    Dim missingYears As String
''    Dim rowsToDelete As Object
''
''    '========================================
''    ' STEP 1: Initialize and Set References
''    '========================================
''    ' Set reference to Job Queue worksheet
''    On Error Resume Next
''    Set wsJobQueue = ThisWorkbook.Worksheets("Job Queue")
''    On Error GoTo ErrorHandler
''
''    If wsJobQueue Is Nothing Then
''        MsgBox "Error: 'Job Queue' sheet not found!", vbCritical, "Sheet Missing"
''        Exit Sub
''    End If
''
''    ' Initialize collections to store data
''    Set rowsToMove = CreateObject("Scripting.Dictionary")
''    Set yearCounts = CreateObject("Scripting.Dictionary")
''    Set yearBeforeCounts = CreateObject("Scripting.Dictionary")
''    Set yearAfterCounts = CreateObject("Scripting.Dictionary")
''    Set rowsToDelete = CreateObject("Scripting.Dictionary")
''
''    '========================================
''    ' STEP 2: Find Required Columns in Job Queue
''    '========================================
''    ' Job Queue header is in Row 3
''    ' Find "Order Status" column
''    statusCol = 0
''    yearCol = 0
''
''    For col = 1 To wsJobQueue.Cells(3, wsJobQueue.Columns.Count).End(xlToLeft).Column
''        If Trim(wsJobQueue.Cells(3, col).Value) = "Order Status" Then
''            statusCol = col
''        End If
''        If Trim(wsJobQueue.Cells(3, col).Value) = "Year" Then
''            yearCol = col
''        End If
''    Next col
''
''    ' Validate required columns exist
''    If statusCol = 0 Then
''        MsgBox "Error: 'Order Status' column not found in Job Queue sheet!", vbCritical, "Column Missing"
''        Exit Sub
''    End If
''
''    If yearCol = 0 Then
''        MsgBox "Error: 'Year' column not found in Job Queue sheet!", vbCritical, "Column Missing"
''        Exit Sub
''    End If
''
''    '========================================
''    ' STEP 3: Scan Job Queue for "Payment Received" Rows
''    '========================================
''    ' Get last row with data in Job Queue (data starts from row 4)
''    lastRowJQ = wsJobQueue.Cells(wsJobQueue.Rows.Count, statusCol).End(xlUp).row
''
''    totalRowsToMove = 0
''
''    ' Loop through all data rows (starting from row 4, as header is in row 3)
''    For i = 4 To lastRowJQ
''        ' Check if Order Status = "Payment Received"
''        If Trim(wsJobQueue.Cells(i, statusCol).Value) = "1. Payment Received" Then
''            ' Get the year for this row
''            rowYear = Trim(wsJobQueue.Cells(i, yearCol).Value)
''
''            If rowYear <> "" Then
''                ' Count rows per year
''                If Not yearCounts.Exists(rowYear) Then
''                    yearCounts.Add rowYear, 0
''                End If
''                yearCounts(rowYear) = yearCounts(rowYear) + 1
''
''                ' Store row number for this year
''                If Not rowsToMove.Exists(rowYear) Then
''                    rowsToMove.Add rowYear, CreateObject("System.Collections.ArrayList")
''                End If
''                rowsToMove(rowYear).Add i
''
''                totalRowsToMove = totalRowsToMove + 1
''            End If
''        End If
''    Next i
''
''    '========================================
''    ' STEP 4: Show Initial Confirmation
''    '========================================
''    ' If no rows found, exit
''    If totalRowsToMove = 0 Then
''        MsgBox "No rows with 'Payment Received' status found in Job Queue.", vbInformation, "No Data to Move"
''        Exit Sub
''    End If
''
''    ' Build confirmation message showing breakdown by year
''    summaryMsg = "Found " & totalRowsToMove & " row(s) to move:" & vbCrLf & vbCrLf
''    For Each yearKey In yearCounts.Keys
''        summaryMsg = summaryMsg & "    " & yearCounts(yearKey) & " row(s) to sheet: " & yearKey & vbCrLf
''    Next yearKey
''    summaryMsg = summaryMsg & vbCrLf & "Do you want to proceed?"
''
''    userResponse = MsgBox(summaryMsg, vbQuestion + vbYesNo, "Confirm Move")
''    If userResponse = vbNo Then
''        MsgBox "Operation cancelled by user.", vbInformation, "Cancelled"
''        Exit Sub
''    End If
''
''    '========================================
''    ' STEP 5: Build Job Queue Header Dictionary
''    '========================================
''    ' Store all column headers from Job Queue (row 3) with their positions
''    Set jqHeaders = CreateObject("Scripting.Dictionary")
''    For col = 1 To wsJobQueue.Cells(3, wsJobQueue.Columns.Count).End(xlToLeft).Column
''        headerName = Trim(wsJobQueue.Cells(3, col).Value)
''        If headerName <> "" Then
''            jqHeaders.Add headerName, col
''        End If
''    Next col
''
''    '========================================
''    ' STEP 6: Process Each Year Sheet
''    '========================================
''    missingYears = ""
''
''    For Each yearKey In rowsToMove.Keys
''        '========================================
''        ' STEP 6.1: Check if Year Sheet Exists
''        '========================================
''        On Error Resume Next
''        Set wsYear = ThisWorkbook.Worksheets(CStr(yearKey))
''        On Error GoTo ErrorHandler
''
''        If wsYear Is Nothing Then
''            ' Year sheet not found - track it for warning later
''            missingYears = missingYears & yearKey & ", "
''            Set wsYear = Nothing
''            GoTo NextYear
''        End If
''
''        '========================================
''        ' STEP 6.2: Build Year Sheet Header Dictionary
''        '========================================
''        ' Store all column headers from Year sheet (row 1) with their positions
''        Set yearHeaders = CreateObject("Scripting.Dictionary")
''        For col = 1 To wsYear.Cells(1, wsYear.Columns.Count).End(xlToLeft).Column
''            headerName = Trim(wsYear.Cells(1, col).Value)
''            If headerName <> "" Then
''                yearHeaders.Add headerName, col
''            End If
''        Next col
''
''        '========================================
''        ' STEP 6.3: Check for Column Mismatches
''        '========================================
''        ' Find columns in Job Queue but NOT in Year sheet
''        missingInYear = ""
''        For Each headerName In jqHeaders.Keys
''            If Not yearHeaders.Exists(headerName) Then
''                missingInYear = missingInYear & "    " & headerName & vbCrLf
''            End If
''        Next headerName
''
''        ' If there are missing columns in year sheet, ask for confirmation
''        If missingInYear <> "" Then
''            userResponse = MsgBox("The following columns exist in Job Queue but NOT in '" & yearKey & "' sheet:" & vbCrLf & vbCrLf & _
''                                  missingInYear & vbCrLf & _
''                                  "Only matching columns will be copied." & vbCrLf & vbCrLf & _
''                                  "Do you want to continue?", _
''                                  vbQuestion + vbYesNo, "Column Mismatch - " & yearKey)
''            If userResponse = vbNo Then
''                MsgBox "Operation cancelled by user.", vbInformation, "Cancelled"
''                Exit Sub
''            End If
''        End If
''
''        ' Find columns in Year sheet but NOT in Job Queue
''        missingInJQ = ""
''        For Each headerName In yearHeaders.Keys
''            If Not jqHeaders.Exists(headerName) Then
''                missingInJQ = missingInJQ & "    " & headerName & vbCrLf
''            End If
''        Next headerName
''
''        ' If there are extra columns in year sheet, inform user
''        If missingInJQ <> "" Then
''            userResponse = MsgBox("The following columns exist in '" & yearKey & "' sheet but NOT in Job Queue:" & vbCrLf & vbCrLf & _
''                                  missingInJQ & vbCrLf & _
''                                  "These columns will be ignored (left empty for new rows)." & vbCrLf & vbCrLf & _
''                                  "Do you want to continue?", _
''                                  vbQuestion + vbYesNo, "Column Mismatch - " & yearKey)
''            If userResponse = vbNo Then
''                MsgBox "Operation cancelled by user.", vbInformation, "Cancelled"
''                Exit Sub
''            End If
''        End If
''
''        '========================================
''        ' STEP 6.4: Get Before Count for Year Sheet
''        '========================================
''        lastRowYear = wsYear.Cells(wsYear.Rows.Count, 1).End(xlUp).row
''        ' If only header exists, before count is 0
''        If lastRowYear = 1 Then
''            yearBeforeCounts.Add yearKey, 0
''        Else
''            yearBeforeCounts.Add yearKey, lastRowYear - 1 ' Subtract header row
''        End If
''
''        '========================================
''        ' STEP 6.5: Copy Rows from Job Queue to Year Sheet
''        '========================================
''        ' Loop through each row that needs to be moved to this year
''        Dim rowsToCopy As Object
''        Set rowsToCopy = rowsToMove(yearKey)
''
''        Dim rowIndex As Long
''        Dim sourceRow As Variant
''        Dim destRow As Long
''        Dim sourceColNum As Long
''        Dim destColNum As Long
''
''        For rowIndex = 0 To rowsToCopy.Count - 1
''            sourceRow = rowsToCopy(rowIndex)
''
''            ' Find next empty row in year sheet
''            destRow = wsYear.Cells(wsYear.Rows.Count, 1).End(xlUp).row + 1
''
''            ' Copy each matching column from Job Queue to Year sheet
''            For Each headerName In jqHeaders.Keys
''                If yearHeaders.Exists(headerName) Then
''                    sourceColNum = jqHeaders(headerName)
''                    destColNum = yearHeaders(headerName)
''
''                    ' Copy cell value from Job Queue to Year sheet
''                    wsYear.Cells(destRow, destColNum).Value = wsJobQueue.Cells(sourceRow, sourceColNum).Value
''
''
''                        ' Copy complete cell formatting from the cell above in the year sheet (to maintain consistency)
''                        ' Only copy if there's a row above (not the header row)
''
''                        If destRow > 2 Then
''                            wsYear.Cells(destRow - 1, destColNum).Copy
''                            wsYear.Cells(destRow, destColNum).PasteSpecial xlPasteFormats
''                            wsYear.Cells(destRow, destColNum).Value = wsJobQueue.Cells(sourceRow, sourceColNum).Value
''                        Application.CutCopyMode = False
''                        End If
''                End If
''            Next headerName
''
''            ' Mark this row for deletion from Job Queue
''            If Not rowsToDelete.Exists(sourceRow) Then
''                rowsToDelete.Add sourceRow, True
''            End If
''        Next rowIndex
''
''        '========================================
''        ' STEP 6.6: Get After Count for Year Sheet
''        '========================================
''        lastRowYear = wsYear.Cells(wsYear.Rows.Count, 1).End(xlUp).row
''        If lastRowYear = 1 Then
''            yearAfterCounts.Add yearKey, 0
''        Else
''            yearAfterCounts.Add yearKey, lastRowYear - 1
''        End If
''
''NextYear:
''        Set wsYear = Nothing
''    Next yearKey
''
''    '========================================
''    ' STEP 7: Delete Moved Rows from Job Queue
''    '========================================
''    ' Delete rows in reverse order to avoid index shifting issues
''    Dim rowsArray() As Variant
''    Dim deleteIndex As Long
''
''    ' Convert dictionary keys to array and sort in descending order
''    ReDim rowsArray(0 To rowsToDelete.Count - 1)
''    deleteIndex = 0
''    For Each sourceRow In rowsToDelete.Keys
''        rowsArray(deleteIndex) = sourceRow
''        deleteIndex = deleteIndex + 1
''    Next sourceRow
''
''    ' Simple bubble sort in descending order
''    Dim temp As Variant
''    Dim j As Long
''    For i = 0 To UBound(rowsArray) - 1
''        For j = i + 1 To UBound(rowsArray)
''            If rowsArray(i) < rowsArray(j) Then
''                temp = rowsArray(i)
''                rowsArray(i) = rowsArray(j)
''                rowsArray(j) = temp
''            End If
''        Next j
''    Next i
''
''    ' Now delete rows from highest to lowest
''    Application.ScreenUpdating = False
''    For i = 0 To UBound(rowsArray)
''        wsJobQueue.Rows(rowsArray(i)).Delete
''    Next i
''    Application.ScreenUpdating = True
''
''    '========================================
''    ' STEP 8: Show Final Summary
''    '========================================
''    summaryMsg = "Operation Completed Successfully!" & vbCrLf & vbCrLf
''    summaryMsg = summaryMsg & "Summary of changes:" & vbCrLf & vbCrLf
''
''    For Each yearKey In yearBeforeCounts.Keys
''        Dim beforeCount As Long
''        Dim afterCount As Long
''        Dim addedCount As Long
''
''        beforeCount = yearBeforeCounts(yearKey)
''        afterCount = yearAfterCounts(yearKey)
''        addedCount = afterCount - beforeCount
''
''        summaryMsg = summaryMsg & "Sheet '" & yearKey & "':" & vbCrLf
''        summaryMsg = summaryMsg & "    Before: " & beforeCount & " row(s)" & vbCrLf
''        summaryMsg = summaryMsg & "    After: " & afterCount & " row(s)" & vbCrLf
''        summaryMsg = summaryMsg & "    Added: +" & addedCount & " row(s)" & vbCrLf & vbCrLf
''    Next yearKey
''
''    summaryMsg = summaryMsg & "Total rows moved: " & rowsToDelete.Count
''
''    ' Add warning for missing year sheets
''    If missingYears <> "" Then
''        missingYears = Left(missingYears, Len(missingYears) - 2) ' Remove trailing comma
''        summaryMsg = summaryMsg & vbCrLf & vbCrLf & "?? WARNING: The following year sheet(s) were not found:" & vbCrLf
''        summaryMsg = summaryMsg & "  " & missingYears & vbCrLf
''        summaryMsg = summaryMsg & "Rows for these years were NOT moved."
''    End If
''
''    MsgBox summaryMsg, vbInformation, "Move Complete"
''
''    Exit Sub
''
''ErrorHandler:
''    MsgBox "An error occurred: " & Err.Description & vbCrLf & _
''           "Error Number: " & Err.Number, vbCritical, "Error"
''End Sub
''


