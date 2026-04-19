Attribute VB_Name = "procbatchcode_generator_V2"
Option Explicit
Sub generate_ProcBatchCode()

    Dim wb As Workbook
    Dim adminWS As Worksheet
    Dim jobQueueWS As Worksheet
    Dim selectedRange As Range, row As Range
    Dim area As Range
    Dim totalRows As Long
    Dim procLetter As String
    
    Set wb = ThisWorkbook
    Set adminWS = wb.Sheets("Admin")
    Set jobQueueWS = wb.Sheets("Job Queue")
    
    initialiseHeaders jobQueueWS
    
    CallInputRangeFromUser selectedRange, jobQueueWS
    
    If selectedRange Is Nothing Then
        turnOnUpdates_Calculation
        MsgBox "No range selected. Exiting the Program.", vbExclamation
        Exit Sub
    End If
    
    For Each row In selectedRange.Rows
        'totalRows = totalRows + 1
            If jobQueueWS.Cells(row.row, wsJobQueue_OrderType_Column) = "NREs" Then
                MsgBox "NREs cannot have Proc Batch Code. Please select the line(s) without NREs.", , "Operation Cancelled"
                Exit Sub
            End If
    Next row
    
    
    For Each area In selectedRange.Areas
        totalRows = totalRows + area.Rows.Count
            For Each row In selectedRange.Rows
                ' check if NRE is not selected
                If jobQueueWS.Cells(row.row, wsJobQueue_OrderType_Column) = "NREs" Then
                    MsgBox "Do not include the lines with NREs. Operation cancelled. Try again!"
                    Exit Sub
                End If
            Next row
    Next area


    '-----updated on 04/08/2025 (Piyush Tayal)------'
        Dim orderType As String
        Dim isBatch As Boolean
        
        ' Determine if it's a batch (multiple rows selected)
        isBatch = totalRows > 1
        
        orderType = jobQueueWS.Cells(selectedRange.row, wsJobQueue_OrderType_Column).Value
        
        Select Case orderType
            Case "Turnkey"
                If isBatch Then
                    procLetter = "TB"
                Else
                    procLetter = "TS"
                End If
            Case "Assy Only"
                If isBatch Then
                    procLetter = "AB"
                Else
                    procLetter = "AS"
                End If
            Case "Consignment"
                If isBatch Then
                    procLetter = "CB"
                Else
                    procLetter = "CS"
                End If
            Case "PCB Only"
                If isBatch Then
                    procLetter = "PB"
                Else
                    procLetter = "PS"
                End If
            Case "Components Only"
                If isBatch Then
                    procLetter = "DB"
                Else
                    procLetter = "DS"
                End If
            Case "PCB & Components Only"
                If isBatch Then
                    procLetter = "MB"
                Else
                    procLetter = "MS"
                End If
            Case Else
                MsgBox "Unsupported Order Type: " & orderType, vbExclamation
                Exit Sub
        End Select

    
    
    '-----updated on 04/08/2025 (Piyush Tayal)------'
    
    
    Dim procBatchCode As String
    Dim isSameCustomer As Boolean
    Dim firstCustomerName As String
    
    isSameCustomer = True
    
    firstCustomerName = jobQueueWS.Cells(selectedRange.Rows(1).row, "A")
    
    ' Check if all the lines in selected range has filled in column "Serial Number Required"
    Dim emptyCells As Collection
    Set emptyCells = New Collection
    For Each row In selectedRange
        If jobQueueWS.Cells(row.row, wsJobQueue_SerialNoRequired_Column) = "" Then
            Dim emptyCellAddresses As String
            emptyCells.Add jobQueueWS.Cells(row.row, wsJobQueue_SerialNoRequired_Column).Address
        End If
    Next row
    
    If emptyCells.Count > 1 Then
        emptyCellAddresses = "Please fill the following cells for " & """" & "Serial Number Required?" & """" & " column:" & vbNewLine
        Dim cellAddress As Variant
        For Each cellAddress In emptyCells
            emptyCellAddresses = emptyCellAddresses & Replace(cellAddress, "$", "") & vbNewLine
        Next cellAddress
        MsgBox emptyCellAddresses, vbExclamation, "!! WARNING !!"
        Exit Sub
    End If
    
    For Each row In selectedRange
        Dim customerName As String
        customerName = jobQueueWS.Cells(row.row, "A")
        
        ' Check if the customer name is different from the first one
        If customerName <> firstCustomerName Then
            isSameCustomer = False
            customerName = "MX"
            Exit For ' No need to check further
        End If
    Next row

    Dim boardLetter As String, letterIndex As Long
    letterIndex = 0
    ' Set the procBatchCode based on the result
    If isSameCustomer Then
        procBatchCode = getNewProcBatchCode(adminWS, customerName, procLetter)
        ' assign the proc batch code in Job Queue
        For Each row In selectedRange
            jobQueueWS.Cells(row.row, wsJobQueue_ProcBatchCode_Column) = procBatchCode
            boardLetter = Chr(65 + letterIndex)
            jobQueueWS.Cells(row.row, wsJobQueue_BoardLetter_Column) = boardLetter
            letterIndex = letterIndex + 1
        Next row
    Else
        procBatchCode = getNewProcBatchCode(adminWS, customerName, "")
        ' assign the proc batch code in Job Queue
        For Each row In selectedRange
            jobQueueWS.Cells(row.row, wsJobQueue_ProcBatchCode_Column) = procBatchCode
            boardLetter = Chr(65 + letterIndex)
            jobQueueWS.Cells(row.row, wsJobQueue_BoardLetter_Column) = boardLetter
            letterIndex = letterIndex + 1
        Next row
    End If

End Sub
Private Function CallInputRangeFromUser(ByRef selectedRange As Range, ByRef jobQueue As Worksheet) As String
On Error GoTo leaveit

Set selectedRange = _
       Application.InputBox("Select the cells with BOARD NAME in Column " & Replace(jobQueue.Cells(1, wsJobQueue_ProductName_Column).Address(False, False), "1", "") & "", Type:=8)

leaveit:
turnOnUpdates_Calculation
End Function

Private Function getNewProcBatchCode(adminWS As Worksheet, customerName As String, procLetter As String) As String
    
    Dim lastProcBatchCode As String
    Dim newProcBatchCode As String
    Dim lastRow As Long
    Dim i As Long
    
    ' Get the last used row in the worksheet
    lastRow = adminWS.Cells(adminWS.Rows.Count, "A").End(xlUp).row
    
    ' Initialize the default result in case no match is found
    lastProcBatchCode = ""
    
    ' Loop through column B to find the matching customer name
    For i = 2 To lastRow
        If adminWS.Cells(i, "B").Value = customerName Then
            ' Get the corresponding value from column X
            lastProcBatchCode = adminWS.Cells(i, "X").Value
            ' generate new proc batch code
            If lastProcBatchCode = "" Then
                newProcBatchCode = adminWS.Cells(i, "W").Value & "-" & procLetter & "001"
                'update the new proc batch code in admin sheet also
                adminWS.Cells(i, "X").Value = newProcBatchCode
            Else
                newProcBatchCode = adminWS.Cells(i, "W").Value & "-" & procLetter & Format(Right(lastProcBatchCode, 3) + 1, "000")
                'update the new proc batch code in admin sheet also
                adminWS.Cells(i, "X").Value = newProcBatchCode
            End If
            
            Exit For ' Exit the loop once the last matching row is found
        End If
    Next i
    
    ' Return the result
    Dim datePrefix As String
    datePrefix = Format(FillDateTimeInCanada, "yyMMdd")

    getNewProcBatchCode = datePrefix & " " & newProcBatchCode

End Function


