Attribute VB_Name = "Print_V2"
Option Explicit
Public Hiddencolumnnamesarray() As Double

Sub PrintVisibleSheetsToPDF()
turnOffUpdates_Calculation
On Error GoTo Errhandler
    
    Dim pdfFileName As String
    Dim customerName As String
    Dim po As String
    Dim shipmentNo As Integer
    Dim counter
    Dim Version As String
    Dim isOpen As Boolean
    Dim wb As Workbook
    Dim logLR As Long
    Dim serialRange As String
    
    Version = "SHIPDOCV8"
    isOpen = False
    
    Dim packingSheet As Worksheet
    Dim adminSheet As Worksheet
    
    Dim fullPath As String
    Dim localPath As String
    
    fullPath = GetLocalPath(ThisWorkbook.FullName)
    'Debug.Print fullPath
    
    Dim lastBackslash As Integer
    lastBackslash = InStrRev(fullPath, "\")
    localPath = Left(fullPath, lastBackslash)
    
    Dim masterFolderName As String, masterFolderPath As String
    Dim folders() As String
    
    folders = Split(fullPath, "\")
    masterFolderName = folders(UBound(folders) - 6)
    masterFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName, vbTextCompare) + Len(masterFolderName))
    
    Dim jobQueueFolder As String, jobQueuePath As String
    jobQueueFolder = masterFolderPath & "3. JOB QUEUE\"
    jobQueuePath = jobQueueFolder & Dir(jobQueueFolder)

    Set packingSheet = ThisWorkbook.Sheets("PackingSlip")
    Set adminSheet = ThisWorkbook.Sheets("Admin")
    
    customerName = adminSheet.Range("J2")
    po = packingSheet.Range("I4")
    
    Dim courierPartner As String, trackingID As String
    courierPartner = packingSheet.Range("I6")
    trackingID = packingSheet.Range("I7")
    
    If courierPartner = "" Then
        turnOnUpdates_Calculation
        MsgBox "Please enter the COURIER COMPANY Name in cell I6." & vbNewLine & "!! Operation Cancelled !!", , "Error"
        Exit Sub
    End If
    
    If trackingID = "" Then
        turnOnUpdates_Calculation
        MsgBox "Please enter the TRACKING ID in cell I7." & vbNewLine & "!! Operation Cancelled !!", , "Error"
        Exit Sub
    End If
    
    
' check if the JOB QUEUE excel file is open
    For Each wb In Application.Workbooks
        If wb.Name = Dir(jobQueueFolder) Then
            isOpen = True
            Exit For
        End If
    Next wb

Dim jobQueueWB As Workbook, jobQueue As Worksheet, snLog As Worksheet
Set jobQueueWB = Workbooks.Open(jobQueuePath)
Set jobQueue = jobQueueWB.Sheets("Job Queue")
Set snLog = jobQueueWB.Sheets("Serial Number Log")

UnHideColumns_Jobqueue jobQueue

initialiseHeaders jobQueue

        Dim dateString As String
        dateString = Format(FillDateTimeInCanada, "mm/dd/yyyy hh:mm:ss")

    ' When there are backorders left
    If packingSheet.Range("K35") > 0 And packingSheet.Range("J35") > 0 Then
    ' pdf path and name
        shipmentNo = 1
        pdfFileName = localPath & "SHIPMENT" & shipmentNo & " " & Version & " " & customerName & " " & po & ".pdf"
    
        Do While Dir(pdfFileName) <> ""
            shipmentNo = shipmentNo + 1
            pdfFileName = localPath & "SHIPMENT" & shipmentNo & " " & Version & " " & customerName & " " & po & ".pdf"
        Loop
   
        ' send the tracking details to Job Queue
        Dim i As Integer, j As Integer
        
        For i = 18 To 34
        If packingSheet.Cells(i, "J") > 0 Then
            Dim orderQTY As Integer, shippedQTY As Integer, currentQTY As Integer, backOrder As Integer
            Dim jobqueueLR As Long
            jobqueueLR = jobQueue.Cells(jobQueue.rows.Count, ProductName_Column).End(xlUp).Row
 
            For j = 4 To jobqueueLR
                If jobQueue.Cells(j, PO_Number) = po And jobQueue.Cells(j, ProductName_Column) = packingSheet.Cells(i, "C") And jobQueue.Cells(j, Line) = packingSheet.Cells(i, "B") Then
                If (jobQueue.Cells(j, Order_Status) = "7. PO Received" Or jobQueue.Cells(j, Order_Status) = "6. In Production") Then
                    jobQueue.Cells(j, DateShipped_Column).NumberFormat = "m/d/yyyy"
                    jobQueue.Cells(j, DateShipped_Column) = Now()
                    jobQueue.Cells(j, ShippingPartner_Column) = courierPartner
                    jobQueue.Cells(j, TrackingID_Column).NumberFormat = "@"
                    jobQueue.Cells(j, TrackingID_Column) = trackingID
                    
                    orderQTY = packingSheet.Cells(i, "H")
                    shippedQTY = packingSheet.Cells(i, "I")
                    currentQTY = packingSheet.Cells(i, "J")
                    backOrder = packingSheet.Cells(i, "K")
                    
                    Dim orderStatus As String
                    ' When line is shipped completely
                    If orderQTY = currentQTY Then
                        orderStatus = "4. Order Shipped"
                        
                    ' When line is shipped partially with backorders
                    ElseIf orderQTY > currentQTY And currentQTY > 0 And backOrder > 0 Then
                        orderStatus = "5. Partially Shipped"
                        ' insert a row in job queue for remaining back order
                        jobQueue.rows(j + 1).Insert Shift:=xlDown
                        jobQueue.rows(j).Copy
                        jobQueue.rows(j + 1).PasteSpecial Paste:=xlPasteAll, Operation:=xlNone, SkipBlanks:=False, Transpose:=False

                        'jobQueue.Cells(j + 1, POQty_Column) = "PS"
                        ''Updated
                        jobQueue.Cells(j + 1, POQty_Column) = backOrder
                        jobQueue.Cells(j, POQty_Column) = currentQTY
                        
                        
'                        jobQueue.Cells(j + 1, Unit_Price_in_PO).ClearContents
'                        jobQueue.Cells(j + 1, Unit_Price_in_Quote).ClearContents
'                        jobQueue.Cells(j + 1, Gross_Amount).ClearContents
                        
                        
                        jobQueue.Cells(j, PricingStatus_Column).Copy
                        jobQueue.Cells(j + 1, PricingStatus_Column).PasteSpecial Paste:=xlPasteValues, Operation:=xlNone, SkipBlanks:=False, Transpose:=False
                        jobQueue.Cells(j + 1, DateShipped_Column).ClearContents
                        jobQueue.Cells(j + 1, ShippingPartner_Column).ClearContents
                        jobQueue.Cells(j + 1, TrackingID_Column).ClearContents
                          
                    ' When line is shipped partially with no backorders
                    ElseIf orderQTY > currentQTY And currentQTY > 0 And backOrder = 0 Then
                        orderStatus = "5. Partially Shipped"
                    
                    End If
                    
                    jobQueue.Cells(j, QtyShipped_Column) = currentQTY
                    jobQueue.Cells(j, backOrder_Column) = backOrder
                    jobQueue.Cells(j, Order_Status) = orderStatus
                Exit For
                End If
                End If
            Next j
        
            
            ' Serial Number Log
            If packingSheet.Cells(i, "J") > 0 And adminSheet.Cells(adminSheet.Columns("A").Find(what:=packingSheet.Cells(i, "C"), LookIn:=xlValues, LookAt:=xlWhole, MatchCase:=False).Row, "G") = "YES" Then
                logLR = snLog.Cells(snLog.rows.Count, "A").End(xlUp).Row + 1
                serialRange = packingSheet.Cells(i, "D")
                snLog.Cells(logLR, "A") = dateString
                snLog.Cells(logLR, "B") = customerName
                snLog.Cells(logLR, "C") = packingSheet.Range("I4")
                snLog.Cells(logLR, "D") = packingSheet.Cells(i, "C")
                snLog.Cells(logLR, "E") = packingSheet.Cells(i, "J")
                snLog.Cells(logLR, "F") = serialNumberFrom(serialRange)
                snLog.Cells(logLR, "G") = serialNumberTo(serialRange)
                snLog.Cells(logLR, "H") = packingSheet.Range("I6")
                snLog.Cells(logLR, "I") = packingSheet.Range("I7")
                logLR = logLR + 1
            End If
        End If
        Next i
        
        
        
        
        
        ' Print the active sheets to PDF
        ThisWorkbook.ExportAsFixedFormat Type:=xlTypePDF, fileName:=pdfFileName, Quality:=xlQualityStandard, IncludeDocProperties:=False, IgnorePrintAreas:=False, OpenAfterPublish:=True
        
        ' create new workbook
        Dim copiedWorkbook As Workbook
        Dim newFileName As String
        
        shipmentNo = shipmentNo + 1
        newFileName = localPath & "SHIPMENT" & shipmentNo & " " & Version & " " & customerName & " " & po & ".xlsm"
        ThisWorkbook.SaveCopyAs newFileName
        
        ' Open the copied workbook
        Set copiedWorkbook = Workbooks.Open(newFileName)
        
        For i = 18 To 34
            If copiedWorkbook.Sheets("PackingSlip").Range("C" & i) <> "" Then
                copiedWorkbook.Sheets("PackingSlip").Range("I" & i) = copiedWorkbook.Sheets("PackingSlip").Range("I" & i) + copiedWorkbook.Sheets("PackingSlip").Range("J" & i)
                copiedWorkbook.Sheets("PackingSlip").Range("J" & i) = "0"
                copiedWorkbook.Sheets("PackingSlip").Range("D" & i) = ""
            End If
        Next i
        
        ' Remove the tracking details from new shipDoc
        copiedWorkbook.Sheets("PackingSlip").Range("I6") = ""
        copiedWorkbook.Sheets("PackingSlip").Range("I7") = ""
        
        
        Application.Run "'" & copiedWorkbook.Name & "'!KeepSpecificSheets"
            
        ' save the workbook and close
        copiedWorkbook.Save
        copiedWorkbook.Close SaveChanges:=False
    
    ElseIf packingSheet.Range("K35") = 0 Then
        ' when all the shipment are shipped. There is no backorder
        
        counter = Mid(ThisWorkbook.Name, 9, InStr(1, ThisWorkbook.Name, " ", vbTextCompare) - 9)
        
        pdfFileName = localPath & "SHIPMENT" & counter & " COMPLETE " & " " & Version & " " & customerName & " " & po & ".pdf"
        ' Print the active sheets to PDF
        ThisWorkbook.ExportAsFixedFormat Type:=xlTypePDF, fileName:=pdfFileName, Quality:=xlQualityStandard, IncludeDocProperties:=False, IgnorePrintAreas:=False, OpenAfterPublish:=True
        
        ' send shipment status to job queue
        Dim k
        
        For i = 18 To 34
            If packingSheet.Range("K" & i) = 0 And packingSheet.Range("K" & i) <> "" Then
                For k = 4 To jobQueue.Cells(jobQueue.rows.Count, Customer).End(xlUp).Row
                    If jobQueue.Cells(k, PO_Number) = po And jobQueue.Cells(k, ProductName_Column) = packingSheet.Cells(i, "C") And jobQueue.Cells(k, Line) = packingSheet.Cells(i, "B") Then
                    If jobQueue.Cells(k, Order_Status) = "7. PO Received" Or jobQueue.Cells(k, Order_Status) = "6. In Production" Then
                        If packingSheet.Cells(i, "I") > 0 Then
                            jobQueue.Cells(k, Order_Status) = "5. Partially Shipped"
                        Else
                            jobQueue.Cells(k, Order_Status) = "4. Order Shipped"
                        End If
                        
                        'send other details to job queue
                        jobQueue.Cells(k, DateShipped_Column) = "m/d/yyyy"
                        jobQueue.Cells(k, DateShipped_Column) = Now()
                        jobQueue.Cells(k, ShippingPartner_Column) = courierPartner
                        jobQueue.Cells(k, TrackingID_Column) = trackingID
                        jobQueue.Cells(k, QtyShipped_Column) = packingSheet.Cells(i, "J")
                        jobQueue.Cells(k, backOrder_Column) = packingSheet.Cells(i, "K")
                        
                    End If
                    End If
                Next k
                
                ' Serial Number Log
                If packingSheet.Cells(i, "J") > 0 And adminSheet.Cells(adminSheet.Columns("A").Find(what:=packingSheet.Cells(i, "C"), LookIn:=xlValues, LookAt:=xlWhole, MatchCase:=False).Row, "G") = "YES" Then
                    logLR = snLog.Cells(snLog.rows.Count, "A").End(xlUp).Row + 1
                    serialRange = packingSheet.Cells(i, "D")
                    snLog.Cells(logLR, "A") = dateString
                    snLog.Cells(logLR, "B") = customerName
                    snLog.Cells(logLR, "C") = packingSheet.Range("I4")
                    snLog.Cells(logLR, "D") = packingSheet.Cells(i, "C")
                    snLog.Cells(logLR, "E") = packingSheet.Cells(i, "J")
                    snLog.Cells(logLR, "F") = serialNumberFrom(serialRange)
                    snLog.Cells(logLR, "G") = serialNumberTo(serialRange)
                    snLog.Cells(logLR, "H") = packingSheet.Range("I6")
                    snLog.Cells(logLR, "I") = packingSheet.Range("I7")
                    logLR = logLR + 1
                End If
            End If
        Next i
    
    Else
    packingSheet.Activate
    MsgBox ("No shipment in Current Orders - Column J")
    End If
    
ReHideColumns_Jobqueue jobQueue
    
' close the JOB Queue if opened by macro
If isOpen Then
Else
    jobQueueWB.Save
    jobQueueWB.Close SaveChanges:=False
End If

' close the current shipdoc
ThisWorkbook.Save
ThisWorkbook.Close SaveChanges:=False

turnOnUpdates_Calculation
Exit Sub
Errhandler:
turnOnUpdates_Calculation
MsgBox Err.Description, vbExclamation, "Macro"
End Sub

Public Function UnHideColumns_Jobqueue(JOB_QUEUE As Worksheet) As String
'On Error GoTo Errhh

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
turnOnUpdates_Calculation
Exit Function
Errhh:
turnOnUpdates_Calculation
UnHideColumns_Jobqueue = Err.Description
End Function

Public Function ReHideColumns_Jobqueue(JOB_QUEUE As Worksheet) As String
'On Error GoTo Errhh

''Update
'code to hide the columns again
Dim i As Double

If UBound(Hiddencolumnnamesarray) > 0 Then
    For i = 1 To UBound(Hiddencolumnnamesarray)
        JOB_QUEUE.Cells(1, Hiddencolumnnamesarray(i)).EntireColumn.Hidden = True
    Next i
End If
''/
turnOnUpdates_Calculation
Exit Function
Errhh:
turnOnUpdates_Calculation
ReHideColumns_Jobqueue = Err.Description
End Function

Private Function serialNumberFrom(ByVal serialRange As String) As String
    Dim prefix As String
    Dim startNum As Integer
    Dim endNum As Integer
    Dim startPart As String
    Dim endPart As String
    Dim dashPos As Integer
    Dim toPos As Integer
    Dim i As Integer
    
    
    ' Validate the input format
    toPos = InStr(serialRange, " to ")
    If toPos = 0 Then
        Err.Raise vbObjectError + 1, "GenerateSerialNumbers", "Invalid format. Use 'PrefixStart to PrefixEnd' format."
    End If
    
    ' Split the start and end parts
    startPart = Trim(Left(serialRange, toPos - 1))
    endPart = Trim(Mid(serialRange, toPos + 4))
    
    ' Return the collection
    serialNumberFrom = startPart
    Exit Function
    
ParseError:
    Err.Raise vbObjectError + 4, "GenerateSerialNumbers", "Invalid numeric range in input."
End Function

Private Function serialNumberTo(ByVal serialRange As String) As String
    Dim prefix As String
    Dim startNum As Integer
    Dim endNum As Integer
    Dim startPart As String
    Dim endPart As String
    Dim dashPos As Integer
    Dim toPos As Integer
    Dim i As Integer
    
    
    ' Validate the input format
    toPos = InStr(serialRange, " to ")
    If toPos = 0 Then
        Err.Raise vbObjectError + 1, "GenerateSerialNumbers", "Invalid format. Use 'PrefixStart to PrefixEnd' format."
    End If
    
    ' Split the start and end parts
    startPart = Trim(Left(serialRange, toPos - 1))
    endPart = Trim(Mid(serialRange, toPos + 4))

    
    ' Return the collection
    serialNumberTo = endPart
    Exit Function
    
ParseError:
    Err.Raise vbObjectError + 4, "GenerateSerialNumbers", "Invalid numeric range in input."
End Function
