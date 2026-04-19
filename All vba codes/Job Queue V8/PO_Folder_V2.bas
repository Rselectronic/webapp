Attribute VB_Name = "PO_Folder_V2"
Option Explicit

Public Const SHIPDOCFileName As String = "6. BACKEND\SHIP DOC\SHIPDOC V7.xlsm"
Public Hiddencolumnnamesarray() As Double

Sub createPOFolder()

On Error GoTo Errhandler

Dim jobQueue As Worksheet
Dim admin As Worksheet
Dim selectedRange As Range
Dim cell As Range
Dim rowNumbers As String

ThisWorkbook.Activate
Set jobQueue = ThisWorkbook.Sheets("Job Queue")
''Update
UnHideColumns_Jobqueue jobQueue

Set admin = ThisWorkbook.Sheets("Admin")

''Updated
initialiseHeaders jobQueue

''Updated
CallInputRangeFromUser selectedRange, jobQueue

If selectedRange Is Nothing Then
        MsgBox "No range selected. Exiting the Program.", vbExclamation
        Exit Sub
End If

For Each cell In selectedRange
    rowNumbers = rowNumbers & cell.row
    Exit For
Next cell

Dim customerName As String
Dim customerFullNams As String
Dim customerRow As Integer
Dim poNumber As String

''Updated
customerName = jobQueue.Cells(rowNumbers, wsJobQueue_customerName_Column)
customerRow = admin.Columns("B").Find(what:=customerName, LookIn:=xlValues, LookAt:=xlWhole).row
customerFullNams = admin.Cells(customerRow, "A")
poNumber = jobQueue.Cells(rowNumbers, wsJobQueue_POnumber_Column)
rowNumbers = ""

    ' define paths
    Dim fullPath As String
    Dim masterfolderName As String
    Dim masterfolderPath As String
    Dim shipDocFolder As String
    Dim folders() As String
    Dim po_Folder As String
        
    fullPath = GetLocalPath(ThisWorkbook.FullName)
    
    ' Split the path string using backslash as delimiter
    
    folders = Split(fullPath, "\")
    masterfolderName = folders(UBound(folders) - 2)
    masterfolderPath = Left(fullPath, InStr(1, fullPath, masterfolderName, vbTextCompare) + Len(masterfolderName))
    po_Folder = masterfolderPath & "1. CUSTOMERS\" & customerName & "\" & "2. PO's RECEIVED AND COMPLETED\" & poNumber

    ' Check if the PO Folder exists
    If Dir(po_Folder) = "" Then
        
        ' create a PO Folder and sub folders
        MkDir po_Folder
        MkDir po_Folder & "\" & "1. PURCHASE ORDER RECIEVED" & " - " & poNumber
        MkDir po_Folder & "\" & "2. INVOICES" & " - " & poNumber
        MkDir po_Folder & "\" & "3. SHIPPING DOCS" & " - " & poNumber
    End If

Exit Sub
Errhandler:
MsgBox Err.Description, vbExclamation, "Macro"
End Sub

Private Function CallInputRangeFromUser(ByRef selectedRange As Range, ByRef jobQueue As Worksheet) As String
On Error GoTo leaveit

Set selectedRange = _
       Application.InputBox("Select the cell that has PO# in Column " & Replace(jobQueue.Cells(1, wsJobQueue_POnumber_Column).Address(False, False), "1", "") & "", Type:=8)

leaveit:
End Function


Public Function UnHideColumns_Jobqueue(JOB_QUEUE As Worksheet) As String
On Error GoTo Errhh

''Update
'unhide all the columns in Job Queue
    
    Dim JOB_QUEUE_LCol As Double, i As Double
    
    JOB_QUEUE_LCol = JOB_QUEUE.UsedRange.Columns.Count
    ReDim Hiddencolumnnamesarray(0)
    For i = 1 To JOB_QUEUE_LCol
        If JOB_QUEUE.Cells(1, i).EntireColumn.Hidden = True Then
                ReDim Preserve Hiddencolumnnamesarray(UBound(Hiddencolumnnamesarray) + 1)
                Hiddencolumnnamesarray(UBound(Hiddencolumnnamesarray)) = JOB_QUEUE.Cells(1, i).Column
                JOB_QUEUE.Cells(1, i).EntireColumn.Hidden = False
        End If
    Next i

Exit Function
Errhh:
UnHideColumns_Jobqueue = Err.Description
End Function

Public Function ReHideColumns_Jobqueue(JOB_QUEUE As Worksheet) As String
On Error GoTo Errhh

''Update
'code to hide the columns again
Dim i As Double

If UBound(Hiddencolumnnamesarray) > 0 Then
    For i = 1 To UBound(Hiddencolumnnamesarray)
        JOB_QUEUE.Cells(1, Hiddencolumnnamesarray(i)).EntireColumn.Hidden = True
    Next i
End If
''/

Exit Function
Errhh:
ReHideColumns_Jobqueue = Err.Description
End Function




