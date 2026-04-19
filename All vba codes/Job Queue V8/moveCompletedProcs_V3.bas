Attribute VB_Name = "moveCompletedProcs_V3"
Option Explicit

Sub procFolderNameUpdate()

    Dim response As VbMsgBoxResult
    response = MsgBox("Are you sure all the Excel files are closed?", vbYesNo + vbQuestion, "Confirmation")
    If response = vbNo Then
        MsgBox "Please close all Excel files and try again.", vbExclamation
        Exit Sub
    End If

    Dim wsJobQueue As Worksheet, ws2025 As Worksheet
    Dim allShipped As Boolean
    Dim uniqueCoreCodes As Object
    Dim lastRow As Long, lastRow2025 As Long
    Dim coreCode As Variant
    Dim cell As Range
    Dim movementDate As Date

    movementDate = FillDateTimeInCanada

    Set wsJobQueue = ThisWorkbook.Sheets("Job Queue")
    Set ws2025 = ThisWorkbook.Sheets("2025")

    initialiseHeaders wsJobQueue

    lastRow = wsJobQueue.Cells(wsJobQueue.Rows.Count, "G").End(xlUp).row
    lastRow2025 = ws2025.Cells(ws2025.Rows.Count, "G").End(xlUp).row

    ' === CONFIGURATION ===
    Dim baseFolder As String: baseFolder = "C:\Users\" & Environ("Username") & "\OneDrive\Desktop one drive\RS Master\4. PROC FILE\"         ' Adjust as needed
    Dim completedFolder As String: completedFolder = "C:\Users\" & Environ("Username") & "\OneDrive\Desktop one drive\RS Master\4. PROC FILE\Completed PROCS\" ' Adjust as needed

    Set uniqueCoreCodes = CreateObject("Scripting.Dictionary")

    ' Collect unique CORE Proc codes from BOTH sheets
    For Each cell In wsJobQueue.Range("G4:G" & lastRow)
        If Not IsEmpty(cell.Value) And cell.Value <> "NREs" Then
            Dim c1 As String: c1 = CoreProc(CStr(cell.Value))
            If Len(c1) > 0 Then
                If Not uniqueCoreCodes.Exists(c1) Then uniqueCoreCodes.Add c1, Nothing
            End If
        End If
    Next cell

    For Each cell In ws2025.Range("G4:G" & lastRow2025)
        If Not IsEmpty(cell.Value) And cell.Value <> "NREs" Then
            Dim c2 As String: c2 = CoreProc(CStr(cell.Value))
            If Len(c2) > 0 Then
                If Not uniqueCoreCodes.Exists(c2) Then uniqueCoreCodes.Add c2, Nothing
            End If
        End If
    Next cell

    ' Evaluate shipping status across BOTH sheets for each CORE code
    Dim lastShipDate As Date

    For Each coreCode In uniqueCoreCodes.Keys
        lastShipDate = 0
        allShipped = CheckProcFullyShippedAcrossSheets_Core( _
                        CStr(coreCode), _
                        Array(wsJobQueue, ws2025), _
                        lastShipDate)

        If allShipped Then
            Dim folderMatch As String, oldFolderName As String, newFolderName As String
            Dim sourcePath As String, destPath As String

            ' Find a folder that contains the CORE code (works for "250117 CVNS-B002" OR "CVNS-B002")
            folderMatch = Dir(baseFolder & "*" & coreCode & "*", vbDirectory)
            If folderMatch <> "" Then
                oldFolderName = folderMatch
                newFolderName = Format(lastShipDate, "yymmdd") & " COMPLETED " & oldFolderName

                sourcePath = baseFolder & oldFolderName
                destPath = completedFolder & newFolderName

                On Error Resume Next
                Name sourcePath As destPath
                If Err.Number <> 0 Then
                    Debug.Print "Failed to move/rename: " & sourcePath & " -> " & destPath & " | Error " & Err.Number & ": " & Err.Description
                    Err.Clear
                Else
                    completedProcFolderLog oldFolderName, newFolderName, movementDate, completedFolder
                End If
                On Error GoTo 0
            Else
                Debug.Print "No folder found for core proc: " & coreCode
            End If
        Else
            Debug.Print "Core Proc: " & coreCode & " - Not fully shipped."
        End If
    Next coreCode

    On Error Resume Next
    Workbooks("Completed Folders Log.xlsm").Save
    Workbooks("Completed Folders Log.xlsm").Close SaveChanges:=False
    On Error GoTo 0
End Sub

'==========================================================
' Normalize a Proc string by removing an optional leading
' YYMMDD date + separators/spaces. Examples:
'   "250117 CVNS-B002" -> "CVNS-B002"
'   "250117-CVNS-B002" -> "CVNS-B002"
'   "CVNS-B002"        -> "CVNS-B002"
'==========================================================
Function CoreProc(ByVal s As String) As String
    Dim t As String
    t = Trim$(s)

    If Len(t) >= 6 Then
        Dim prefix As String
        prefix = Left$(t, 6)
        If IsNumeric(prefix) Then
            ' Drop first 6 (YYMMDD)
            t = Mid$(t, 7)
            ' Remove leading separators/spaces after date
            Do While Len(t) > 0 And (Left$(t, 1) = " " Or Left$(t, 1) = "-" Or Left$(t, 1) = "_" Or Left$(t, 1) = ".")
                t = Mid$(t, 2)
            Loop
        End If
    End If

    CoreProc = Trim$(t)
End Function

'==========================================================
' True if EVERY line for the given CORE code across sheets
' has a valid Ship Date (col T). Returns max ship date.
' We compare using CoreProc(cell in col G) = coreCode.
'==========================================================
Function CheckProcFullyShippedAcrossSheets_Core( _
    ByVal coreCode As String, _
    ByVal sheetsArr As Variant, _
    ByRef lastShipDateOut As Date) As Boolean

    Dim i As Long
    Dim ws As Worksheet
    Dim r As Long, lastRow As Long
    Dim foundAny As Boolean
    Dim shipDate As Variant
    Dim maxShip As Date
    Dim cellCode As String

    maxShip = 0
    foundAny = False
    CheckProcFullyShippedAcrossSheets_Core = True

    For i = LBound(sheetsArr) To UBound(sheetsArr)
        Set ws = sheetsArr(i)
        lastRow = ws.Cells(ws.Rows.Count, "G").End(xlUp).row

        For r = 4 To lastRow
            cellCode = CoreProc(CStr(ws.Cells(r, "G").Value))
            If Len(cellCode) > 0 And cellCode = coreCode Then
                foundAny = True
                shipDate = ws.Cells(r, "T").Value
                If IsEmpty(shipDate) Or Not IsDate(shipDate) Then
                    CheckProcFullyShippedAcrossSheets_Core = False
                Else
                    If CDate(shipDate) > maxShip Then maxShip = CDate(shipDate)
                End If
            End If
        Next r
    Next i

    If Not foundAny Then
        CheckProcFullyShippedAcrossSheets_Core = False
    End If

    lastShipDateOut = maxShip
End Function

'==========================================================
' Logging helper (unchanged)
'==========================================================
Function completedProcFolderLog(oldFolderName As String, newFolderName As String, movementDate As Date, completedFolderPath As String)
    Dim wbLog As Workbook
    Dim wsLog As Worksheet
    Dim wsLR As Long, i As Long

    On Error Resume Next
    Set wbLog = Workbooks.Open(completedFolderPath & "Completed Folders Log.xlsm")
    If wbLog Is Nothing Then
        MsgBox "Could not open Completed Folders Log at:" & vbCrLf & completedFolderPath & "Completed Folders Log.xlsm", vbExclamation
        Exit Function
    End If
    On Error GoTo 0

    Set wsLog = wbLog.Sheets(1)

    wsLR = wsLog.Cells(wsLog.Rows.Count, "A").End(xlUp).row
    i = wsLR + 1

    wsLog.Cells(i, "A").Value = movementDate
    wsLog.Cells(i, "B").Value = oldFolderName
    wsLog.Cells(i, "C").Value = newFolderName

    wbLog.Save
End Function


