Attribute VB_Name = "Generate_TIME_File_V4"
Public cx1 As String
Public isCancelled As Boolean
Public jobQueueSh As Worksheet
Public cx2 As String, cx3 As String, cx4 As String, cx5 As String, cx6 As String
Sub CopyAndRenameFile()
    isCancelled = False ' Reset flag before starting
    turnoffscreenUpdate

    Dim fileName As String
    Dim fileExtension As String
    Dim inputWS As Worksheet
    Dim programming As Worksheet
    Dim copiedWorkbook As Workbook, summaryWS As Worksheet
    Dim TimeWS As Worksheet
    Dim timeFilePath As String
    Dim timeFileGenerated As Boolean
    
    
    ' set worksheet variables
    Set inputWS = ThisWorkbook.Sheets("DataInputSheets")
    initialiseHeaders inputWS
    Set programming = ThisWorkbook.Sheets("Programming")
    
    ' define paths
    Dim fullPath As String
    Dim localPath As String
    Dim parentPath As String
    Dim parentFolderName As String
    Dim customerFolderpath As String
    Dim prodPath As String
    Dim timeProjectPath As String
    
    fullPath = GetLocalPath(ThisWorkbook.fullName)
    parentFolderName = ExtractFolderName(fullPath)
    localPath = Left(fullPath, InStrRev(fullPath, "\"))
    parentPath = Left(localPath, InStr(1, localPath, parentFolderName, vbTextCompare) + Len(parentFolderName))

    ' get customer address from Job Queue
    Dim jobQueueWB As Workbook
    Dim jobQueueFileName As String, jobQueueFilePath As String
    Dim QuoteLogWS As Worksheet
    
    Dim wbOpened As Boolean
    wbOpened = False
    
    jobQueueFileName = Dir(parentPath & "3. JOB QUEUE\" & "job*.xlsm")
    'jobQueueFileName = Dir(parentPath & "3. JOB QUEUE\" & "Job Queue V4.xlsm")
    If jobQueueFileName = "" Then
        MsgBox ("Job Queue not found.")
        Exit Sub
    End If
        
    jobQueueFilePath = parentPath & "3. JOB QUEUE\" & jobQueueFileName
    
    
    ' check if job queue file is already open
    On Error Resume Next
        Set jobQueueWB = Workbooks(jobQueueFilePath)
    On Error GoTo 0
    
    ' If the workbook is not already open, open it
    If jobQueueWB Is Nothing Then
        Set jobQueueWB = Workbooks.Open(jobQueueFilePath)
        wbOpened = True
    End If
    
    Set jobQueueSh = jobQueueWB.Sheets("Admin")
    Set QuoteLogWS = ThisWorkbook.Sheets("Quote Log")
    
    
    
    ' customer Details
    Dim cxRow As Integer
    Dim customerAbb As String, customerName As String
    Dim payTerms As String
   
    ' find the last row# in DataInputSheet
    Dim lRow, i As Long
    lRow = inputWS.Cells(inputWS.Rows.count, DM_SNo_Column).End(xlUp).Row
    
    ' Generate the TIME FILE
For i = 6 To lRow
    If inputWS.Cells(i, DM_ActiveQty_Column) > 0 Then
        On Error GoTo CancelHandler
        customerAbb = inputWS.Cells(i, DM_Customer_Column)
        
        Dim rfqNumber As String, boardName As String
        rfqNumber = inputWS.Cells(i, DM_Status_Column)
        boardName = inputWS.Cells(i, DM_GlobalMFRPackage_Column)
        
        ' update the rfq status to "In Time File"
        Dim cell As Range, firstAddress As String
        With QuoteLogWS.Columns("G:G")
            Set cell = .Find(What:=rfqNumber, LookAt:=xlWhole, MatchCase:=False)
            If Not cell Is Nothing Then
                firstAddress = cell.Address
                Do
                    ' Check if board name in column B of same row matches
                    If QuoteLogWS.Cells(cell.Row, "B").value = boardName Then
                        QuoteLogWS.Cells(cell.Row, "J").value = "In Time File" ' Or whatever new status
                    End If
                    Set cell = .FindNext(cell)
                Loop While Not cell Is Nothing And cell.Address <> firstAddress
            End If
        End With

        
        
        ' Call the subroutine to handle the user form
        CheckAndInitializeUserForm customerAbb, jobQueueSh
        
        ' Check if user cancelled
        If isCancelled Then Exit Sub
        
        prodPath = parentPath & "1. CUSTOMERS\" & customerAbb & "\" & "1. PROD FILES AND QUOTES\"
        timeProjectPath = parentPath & "6. BACKEND\TIME FILE\"
        
        ' Proceed with the rest of your logic, using the cx1 variable
            'Debug.Print "Selected Requisitioner: " & cx1
        
        On Error Resume Next
        cxRow = jobQueueSh.Columns("B").Find(What:=customerAbb, LookIn:=xlValues, LookAt:=xlWhole).Row
        On Error GoTo 0
        
        If cxRow = 0 Then
            'MsgBox ("Customer Name in DM File Name is not matching with the name on Job Queue Admin Sheet Column ""B""")
            MsgBox """" & (inputWS.Cells(i, DM_Customer_Column) & """" & " Customer Name in DM File is not matching with the name on Job Queue Admin Sheet Column ""B""")
            Exit Sub
        End If
            
'        cx1 = jobQueueSh.Cells(cxRow, "D")                                                  ' Requisitioner name
'        cx2 = jobQueueSh.Cells(cxRow, "A")                                                  ' Company Name
'        cx3 = jobQueueSh.Cells(cxRow, "F")                                                  ' Street Address
'        cx4 = jobQueueSh.Cells(cxRow, "G") & ", " & jobQueueSh.Cells(cxRow, "H") & ", " & jobQueueSh.Cells(cxRow, "I") & ", " & jobQueueSh.Cells(cxRow, "J")            ' City & Province, Postal Code & Country Code
'        cx5 = jobQueueSh.Cells(cxRow, "K")                                                  ' email ID
'        cx6 = jobQueueSh.Cells(cxRow, "L")                                                  ' Contact Number
        payTerms = jobQueueSh.Cells(cxRow, "C")                                             ' Payment Terms
                
        'generate Global Quote Number
        Dim globalQuoteNumber As String
        If inputWS.Cells(i, DM_GlobalQTE_Column) = "" Then
            Dim quoteabb As String
            Dim quoteInt As Integer
            
            quoteabb = jobQueueSh.Cells(cxRow, "W")
            
            globalQuoteNumber = GetNextQuoteNumber(lRow, inputWS, quoteabb)
            inputWS.Cells(i, DM_GlobalQTE_Column) = globalQuoteNumber
            
        End If
    
    Dim TIMEfile As String
    TIMEfile = Dir(timeProjectPath & "TIME*.xlsm")
    'Debug.Print TIMEfile
    
    ' extract the file name and extension
    fileName = Left(TIMEfile, InStrRev(TIMEfile, ".") - 1)
    fileExtension = Mid(TIMEfile, InStrRev(TIMEfile, "."), Len(TIMEfile) - InStrRev(TIMEfile, ".") + 1)
    
    ' define the path of new TIME FILE. Code V3
    Dim NewFileName As String
    NewFileName = prodPath & inputWS.Cells(i, DM_GlobalMFRPackage_Column) & "\" & fileName & " " & inputWS.Cells(i, DM_GlobalMFRPackage_Column) & fileExtension
    'Debug.Print NewFileName
    
    
    
'    ' Check if NEW TIME File name already exists in Production folder. If yes then add Revision # in file name
'    Dim counter As Integer
'    Do While Dir(NewFileName) <> ""
'        counter = counter + 1
'        NewFileName = prodPath & inputWS.Cells(i, DM_GlobalMFRPackage_Column) & "\" & fileName & " " & "R" & counter & " " & inputWS.Cells(i, DM_BomName_Column) & fileExtension
'        'Debug.Print NewFileName
'    Loop
    
    ' Check if Original TIME File path exists. If yes then copy the TIME FILE
    If Dir(parentPath & "6. BACKEND\TIME FILE\" & fileName & fileExtension) <> "" Then
        ' check if the time file already exists. If not, then create the new time file otherwise update the parameters in the existing time file
        Do While Dir(NewFileName) = ""
            FileCopy parentPath & "6. BACKEND\TIME FILE\" & fileName & fileExtension, NewFileName
        Loop
        
        'FileCopy parentPath & "6. BACKEND\TIME FILE\" & fileName & fileExtension, NewFileName
        
        ' Open the copied file
        Set copiedWorkbook = Workbooks.Open(NewFileName)
        Set summaryWS = copiedWorkbook.Sheets("Summary")
        initialiseHeaders , , , , , , , , , , , summaryWS
        Set TimeWS = copiedWorkbook.Sheets("final")
        TimeWS.Activate
        
        
        Dim q1 As Integer, q2 As Integer, q3 As Integer, q4 As Integer
        q1 = inputWS.Cells(i, DM_QTY1_Column)
        q2 = inputWS.Cells(i, DM_QTY2_Column)
        q3 = inputWS.Cells(i, DM_QTY3_Column)
        q4 = inputWS.Cells(i, DM_QTY4_Column)
        
        
        'Global Manufacturing package name
        Dim GMP As String
        Dim bom As String
        Dim BRev As String
        Dim PCB As String
        Dim PRev As String
        GMP = inputWS.Cells(i, DM_GlobalMFRPackage_Column)
        bom = inputWS.Cells(i, DM_BomName_Column)
        BRev = inputWS.Cells(i, DM_BOMRev_Column)
        PCB = inputWS.Cells(i, DM_PCBName_Column)
        PRev = inputWS.Cells(i, DM_PCBRev_Column)
        
        
        
        
        ' add the details in time file
        TimeWS.Range("B32:B36").NumberFormat = "@"
        TimeWS.Range("B32") = GMP
        TimeWS.Range("B33") = bom
        TimeWS.Range("B34") = BRev
        TimeWS.Range("B35") = PCB
        TimeWS.Range("B36") = PRev
        TimeWS.Range("B40") = inputWS.Cells(i, DM_brdpnl_Column)
        TimeWS.Range("B41") = inputWS.Cells(i, DM_doubleside_Column)
        
        TimeWS.Range("B38").NumberFormat = "@"
        TimeWS.Range("B38") = GMP
        
        TimeWS.Range("B15") = q1
        TimeWS.Range("B16") = q2
        TimeWS.Range("B17") = q3
        TimeWS.Range("B18") = q4
        
        ' add the standard pricing to Time File
        TimeWS.Range("C15:C18") = 130           ' standard labour
        TimeWS.Range("D15:D18") = 165           ' standard SMT
        'TimeWS.Range("F15:F18") = 0.3           ' standard PCB Markup
        'TimeWS.Range("H15:H18") = 0.3           ' standard components markup
        
        
        copiedWorkbook.Sheets("Quotation Temp").Range("C11:C16").NumberFormat = "@"
        copiedWorkbook.Sheets("Quotation Temp").Range("C11") = "'" & cx1
        copiedWorkbook.Sheets("Quotation Temp").Range("C12") = "'" & cx2
        copiedWorkbook.Sheets("Quotation Temp").Range("C13") = "'" & cx3
        copiedWorkbook.Sheets("Quotation Temp").Range("C14") = "'" & cx4
        copiedWorkbook.Sheets("Quotation Temp").Range("C15") = "'" & cx5
        copiedWorkbook.Sheets("Quotation Temp").Range("C16") = "'" & "Tél.:" & cx6
        
        copiedWorkbook.Sheets("Quotation Temp").Range("AK19") = payTerms        'Send Payment Terms from DM to TIME
        copiedWorkbook.Sheets("Quotation Temp").Range("S19") = inputWS.Cells(i, DM_solderType_Column)
        copiedWorkbook.Sheets("Quotation Temp").Range("X19") = "IPC Class " & inputWS.Cells(i, DM_ipcClass_Column)
        
        TimeWS.Range("B28").NumberFormat = "@"
        TimeWS.Range("B28") = inputWS.Cells(i, DM_GlobalQTE_Column)      'send quote number from DM to TIME
        
        TimeWS.Range("E15:E18").NumberFormat = "#,##0.00 $"
        TimeWS.Range("E15") = inputWS.Cells(i, DM_PCB1_Column)      'send PCB Price 1 from DM to TIME
        TimeWS.Range("E16") = inputWS.Cells(i, DM_PCB2_Column)      'send PCB Price 2 from DM to TIME
        TimeWS.Range("E17") = inputWS.Cells(i, DM_PCB3_Column)      'send PCB Price 3 from DM to TIME
        TimeWS.Range("E18") = inputWS.Cells(i, DM_PCB4_Column)      'send PCB Price 4 from DM to TIME
        
        ' insert rfq number
        TimeWS.Range("A54") = "RFQ Number"
        TimeWS.Range("B54") = rfqNumber
        
'        TimeWS.Range("P19") = ThisWorkbook.Name         'DM FILE NAME
        
        ' get the component cost from dm
        
        Dim s As Worksheet
        Dim targetCell As String
        targetCell = inputWS.Cells(i, DM_GlobalMFRPackage_Column)
        Set ws = ThisWorkbook.Sheets(targetCell)
        
        
        Dim lr As Long
        lr = ws.Cells(ws.Rows.count, "G").End(xlUp).Row
        lr = lr + 5
        
        Dim CompCost1 As Double, CompCost2 As Double, CompCost3 As Double, CompCost4 As Double
        
        On Error Resume Next
        If ws.Cells(lr - 4, "Y") <> 0 Then
        CompCost1 = ws.Cells(lr - 4, "Y").value
        End If
        
        If ws.Cells(lr - 4, "AD") <> 0 Then
        CompCost2 = ws.Cells(lr - 4, "AD").value
        End If
        
        If ws.Cells(lr - 4, "AI") <> 0 Then
        CompCost3 = ws.Cells(lr - 4, "AI").value
        End If
        
        If ws.Cells(lr - 4, "AN") <> 0 Then
        CompCost4 = ws.Cells(lr - 4, "AN").value
        End If
        On Error GoTo 0
        
        ' add component cost to final sheet
        TimeWS.Range("G15:G18").NumberFormat = "#,##0.00 $"
        TimeWS.Range("G15") = CompCost1
        TimeWS.Range("G16") = CompCost2
        TimeWS.Range("G17") = CompCost3
        TimeWS.Range("G18") = CompCost4
        
        
        ' add who is working to TIME File
        'TimeWS.Range("O26") = inputWS.Cells(3, "L")
        
        
        ' send NRE1, NRE2, NRE3, NRE4 from DM to TIME file
        'uppercase the NRE Status
        inputWS.Cells(i, DM_NRE1Status_Column) = Trim(UCase(inputWS.Cells(i, DM_NRE1Status_Column)))
        inputWS.Cells(i, DM_NRE2Status_Column) = Trim(UCase(inputWS.Cells(i, DM_NRE2Status_Column)))
        inputWS.Cells(i, DM_NRE3Status_Column) = Trim(UCase(inputWS.Cells(i, DM_NRE3Status_Column)))
        inputWS.Cells(i, DM_NRE4Status_Column) = Trim(UCase(inputWS.Cells(i, DM_NRE4Status_Column)))
        
        TimeWS.Range("B21:B24").NumberFormat = "#,##0.00 $"
        
        Dim Note() As String
        Dim n As Long
        n = 0
        
        If inputWS.Cells(i, DM_NRE1Status_Column) <> "PAID" Then
        TimeWS.Range("B21") = inputWS.Cells(i, DM_NRE1_Column)      'Programming Fees
        Else
        TimeWS.Range("B21") = 0
        n = n + 1
        ReDim Preserve Note(1 To n)
        Note(n) = "Programming"
        End If
        
        If inputWS.Cells(i, DM_NRE2Status_Column) <> "PAID" Then
        TimeWS.Range("B22") = inputWS.Cells(i, DM_NRE2_Column)     'Stencil Fees
        Else
        TimeWS.Range("B22") = 0
        n = n + 1
        ReDim Preserve Note(1 To n)
        Note(n) = "Stencil"
        End If
        
        If inputWS.Cells(i, DM_NRE3Status_Column) <> "PAID" Then
        TimeWS.Range("B23") = inputWS.Cells(i, DM_NRE3_Column)     'PCB FAB
        Else
        TimeWS.Range("B23") = 0
        n = n + 1
        ReDim Preserve Note(1 To n)
        Note(n) = "PCB FAB"
        End If
        
        If inputWS.Cells(i, DM_NRE4Status_Column) <> "PAID" Then
        TimeWS.Range("B24") = inputWS.Cells(i, DM_NRE4_Column)     'Misc NRE on whole order
        Else
        TimeWS.Range("B24") = 0
        n = n + 1
        ReDim Preserve Note(1 To n)
        Note(n) = "Misc. NRE on Whole Order"
        End If
        
        ' note NREs paid note in NOTE1 of TIME FILE
        Dim Note1 As String
        
        If n = 0 Then
        Note1 = ""
        ElseIf n = 1 Then
        Note1 = "NRE's for " & Note(1) & " have already been paid."
        ElseIf n = 2 Then
        Note1 = "NRE's for " & Note(1) & ", " & Note(2) & " have already been paid."
        ElseIf n = 3 Then
        Note1 = "NRE's for " & Note(1) & ", " & Note(2) & ", " & Note(3) & " have already been paid."
        ElseIf n = 4 Then
        Note1 = "NRE's for " & Note(1) & ", " & Note(2) & ", " & Note(3) & ", " & Note(4) & " have already been paid."
        End If
        
        TimeWS.Range("K1") = Note1
        
        
                        ' vba to count mcodes
        

                        Dim lastRow As Long
                        Dim rowCount As Long
                        Dim currentRow As Long
                        Dim countCP As Long
                        Dim sumCP As Double
                        Dim ipCount As Long
                        Dim sumIP As Double
                        Dim smtCount As Long
                        Dim THsum As Double
                        
                        ' Get the last row in column A with data
                        lastRow = ws.Cells(ws.Rows.count, "E").End(xlUp).Row
                        
                        ' Count the number of rows with data in column A, starting from cell A1
                        'rowCount = lastRow - 3
                        Dim r As Long
                        rowCount = 0
                        For r = 4 To lastRow
                            If IsNumeric(ws.Cells(r, "E").value) Then
                                If ws.Cells(r, "E").value > 0 Then
                                    rowCount = rowCount + 1
                                End If
                            End If
                        Next r
                        
                        'rowCount = Application.WorksheetFunction.CountA(ws.Range(ws.Cells(4, "E"), ws.Cells(lastRow, "E")))
                        
                        TimeWS.Range("B43") = rowCount
                        
                        ' Count the number of cells with "CP" or "CPEXP" or "0402" in column G
                        countCP = 0
                        
                        For currentRow = 4 To lastRow
                            If ws.Cells(currentRow, "K").value = "CP" Or ws.Cells(currentRow, "K").value = "CPEXP" Or ws.Cells(currentRow, "K").value = "0402" Or ws.Cells(currentRow, "K").value = "402" Or ws.Cells(currentRow, "K").value = "0201" Or ws.Cells(currentRow, "K").value = "201" Then
                                countCP = countCP + 1
                            End If
                        Next currentRow
                        
                        ' Output the count to cell K8
                        TimeWS.Range("B45") = countCP
                        
                        ' Calculate the sum of column A for each row that is using an SMT part (mcodes:CP,0402,402,CPEXP,IP,mansmt) in column G
                        sumCP = 0
                        For currentRow = 4 To lastRow
                            If ws.Range("K" & currentRow).value = "CP" Or ws.Range("K" & currentRow).value = "CPEXP" Or ws.Range("K" & currentRow).value = "IP" Or ws.Range("K" & currentRow).value = "0402" Or ws.Range("K" & currentRow).value = "402" Or ws.Range("K" & currentRow).value = "MANSMT" Then
                                sumCP = sumCP + ws.Range("E" & currentRow).value
                            End If
                        Next currentRow
                    
                        ' Output the sum to cell K9
                        ' Range("K9").Value = sumCP
                        TimeWS.Range("B44") = "" & sumCP
                        
                        Dim smtPlacement As Variant
                        smtPlacement = sumCP
                        
                        ' Calculate the sum of column A for each row that has "CP", "CPEXP" & "0402" in column G
                        sumCP = 0
                        For currentRow = 4 To lastRow
                            If ws.Range("K" & currentRow).value = "CP" Or ws.Range("K" & currentRow).value = "CPEXP" Or ws.Range("K" & currentRow).value = "0402" Or ws.Range("K" & currentRow).value = "402" Then
                                sumCP = sumCP + ws.Range("E" & currentRow).value
                            End If
                        Next currentRow
                    
                        ' Output the sum to cell K9
                        TimeWS.Range("B46") = sumCP
                       
                        
                        ' Count the number of cells with "IP" in column G
                        ipCount = 0
                        
                        For currentRow = 4 To lastRow
                            If ws.Cells(currentRow, "K").value = "IP" Then
                                ipCount = ipCount + 1
                            End If
                        Next currentRow
                        
                        ' Output the count to cell K10
                        TimeWS.Range("B47") = ipCount
                        
                        ' Calculate the sum of column A for each row that has "IP" in column G
                        sumIP = 0
                        For currentRow = 4 To lastRow
                            If ws.Range("K" & currentRow).value = "IP" Then
                                sumIP = sumIP + ws.Range("E" & currentRow).value
                            End If
                        Next currentRow
                        
                        ' Output the sum to cell K11
                        TimeWS.Range("B48") = sumIP
                        
                        ' Count the number of cells with "MANSMT" in column G
                        smtCount = 0
                        
                        For currentRow = 4 To lastRow
                            If ws.Cells(currentRow, "K").value = "MANSMT" Then
                                smtCount = smtCount + ws.Cells(currentRow, "E").value
                            End If
                        Next currentRow
                        
                        ' Output the count to cell K12
                        TimeWS.Range("B49") = smtCount
                        
                        ' Calculate the sum of Quantity for each row that has "TH" in column G
                        sumTH = 0
                        For currentRow = 4 To lastRow
                            If ws.Range("K" & currentRow).value = "TH" Then
                                sumTH = sumTH + ws.Range("E" & currentRow).value
                            End If
                        Next currentRow
                        
                        ' Output the sum to cell K13
                        TimeWS.Range("B50") = sumTH
                        
                        
                        'Update || Adding "zzCX Supplies" customer supplies to Notes Table
                        Dim TimeValueTableCurrentIndex As Double
                        
                        TimeValueTableCurrentIndex = 7
                        For currentRow = 4 To lastRow
                            If UCase(Trim(ws.Range("P" & currentRow).value)) Like UCase(Trim("*Supplies")) Then
                               
                               If TimeValueTableCurrentIndex > 16 Then
                                  MsgBox "TIME FILE CX Supplies Table Row Limit Reached max. Please Recheck", vbExclamation, "Macro"
                               End If
                               
                               ws.Range(ws.Cells(currentRow, "E"), ws.Cells(currentRow, "E")).Copy
                               TimeWS.Cells(TimeValueTableCurrentIndex, "J").PasteSpecial xlPasteValuesAndNumberFormats
                               ws.Range(ws.Cells(currentRow, "G"), ws.Cells(currentRow, "J")).Copy
                               TimeWS.Cells(TimeValueTableCurrentIndex, "K").PasteSpecial xlPasteValuesAndNumberFormats
                               TimeWS.Cells(TimeValueTableCurrentIndex, "O").value = "CX Supplies"
                               TimeWS.Cells(TimeValueTableCurrentIndex, "P").value = "NO"
                               TimeValueTableCurrentIndex = TimeValueTableCurrentIndex + 1
                            End If
                        Next currentRow
                        ''/
                        
                        
                        ''/
                        ' # of TH Pins from individual sheet to Time File
                        TimeWS.Range("B51") = ws.Range("K2")
        Dim mcodeSummary As String
        mcodeSummary = "#Lines: " & rowCount & ", " & "#Ttl prts: " & smtPlacement & ", " & "Cpfd: " & countCP & ", " & "IP Fd: " & ipCount & ", " & "TH: " & sumTH & ", " & ws.Range("K2")
        inputWS.Cells(i, DM_MCODESSummary_Column) = mcodeSummary
        
    'export the BOM to production folder
    
    Call BOM_export(inputWS.Cells(i, DM_GlobalMFRPackage_Column), inputWS.Cells(i, DM_BomName_Column), prodPath & inputWS.Cells(i, DM_GlobalMFRPackage_Column), copiedWorkbook, summaryWS)
    
    ' update the summary sheet with other details
    Dim summaryLR As Long
    summaryLR = summaryWS.Cells(summaryWS.Rows.count, timeWBsummaryWS_sheet_name_column).End(xlUp).Row
    If summaryLR < 5 Then summaryLR = 5
    
    summaryWS.Cells(summaryLR, timeWBsummaryWS_bom_name_column) = bom
    summaryWS.Cells(summaryLR, timeWBsummaryWS_gerber_name_column) = PCB
    summaryWS.Cells(summaryLR, timeWBsummaryWS_qty1_qty_column) = q1
    summaryWS.Cells(summaryLR, timeWBsummaryWS_qty2_qty_column) = q2
    summaryWS.Cells(summaryLR, timeWBsummaryWS_qty3_qty_column) = q3
    summaryWS.Cells(summaryLR, timeWBsummaryWS_qty4_qty_column) = q4
    summaryWS.Cells(summaryLR, timeWBsummaryWS_mcode_summary_column) = mcodeSummary
    
    TimeWS.Activate
    
    timeFileGenerated = True
    'MsgBox "File copied and renamed successfully!", vbInformation
    copiedWorkbook.Save
    Else
        MsgBox "Source file not found or destination folder does not exists", vbExclamation
    End If
Exit For
End If
Next i



' check if quote folder exists. If not then create a Quotation folder
If Dir(prodPath & inputWS.Cells(i, DM_GlobalMFRPackage_Column) & " QTE " & inputWS.Cells(i, DM_GlobalQTE_Column), vbDirectory) = "" Then
MkDir prodPath & inputWS.Cells(i, DM_GlobalMFRPackage_Column) & " QTE " & inputWS.Cells(i, DM_GlobalQTE_Column)
End If


If wbOpened Then
    'jobQueueWB.Close SaveChanges:=True
End If

turnonscreenUpdate

If timeFileGenerated = True Then
    MsgBox "File copied and renamed successfully!", vbInformation
End If

Exit Sub
CancelHandler:
    ' Handle cancellation gracefully
    If Err.Number = vbObjectError + 1 Then
        ' User cancelled the operation
        MsgBox Err.Description, vbExclamation, "Operation Aborted"
        turnonscreenUpdate
    Else
        ' Handle other unexpected errors
        MsgBox "An unexpected error occurred: " & Err.Description, vbCritical, "Error"
        turnonscreenUpdate
    End If
End Sub




'this code was linked with new time file so commented for now and when again use must rechecked
''Sub CopyAndRenameFile()
''    isCancelled = False ' Reset flag before starting
''    turnoffscreenUpdate
''
''    Dim fileName As String
''    Dim fileExtension As String
''    Dim inputWS As Worksheet
''    Dim programming As Worksheet
''    Dim copiedWorkbook As Workbook, summaryWS As Worksheet
''    Dim TimeWS As Worksheet
''    Dim timeFilePath As String
''    Dim timeFileGenerated As Boolean
''
''
''    ' set worksheet variables
''    Set inputWS = ThisWorkbook.Sheets("DataInputSheets")
''    initialiseHeaders inputWS
''    Set programming = ThisWorkbook.Sheets("Programming")
''
''    ' define paths
''    Dim fullPath As String
''    Dim localPath As String
''    Dim parentPath As String
''    Dim parentFolderName As String
''    Dim customerFolderpath As String
''    Dim prodPath As String
''    Dim timeProjectPath As String
''
''    fullPath = GetLocalPath(ThisWorkbook.FullName)
''    parentFolderName = ExtractFolderName(fullPath)
''    localPath = Left(fullPath, InStrRev(fullPath, "\"))
''    parentPath = Left(localPath, InStr(1, localPath, parentFolderName, vbTextCompare) + Len(parentFolderName))
''
''    ' get customer address from Job Queue
''    Dim jobQueueWB As Workbook
''    Dim jobQueueFileName As String, jobQueueFilePath As String
''    Dim QuoteLogWS As Worksheet
''
''    Dim wbOpened As Boolean
''    wbOpened = False
''
''    jobQueueFileName = Dir(parentPath & "3. JOB QUEUE\" & "job*.xlsm")
''    'jobQueueFileName = Dir(parentPath & "3. JOB QUEUE\" & "Job Queue V4.xlsm")
''    If jobQueueFileName = "" Then
''        MsgBox ("Job Queue not found.")
''        Exit Sub
''    End If
''
''    jobQueueFilePath = parentPath & "3. JOB QUEUE\" & jobQueueFileName
''
''
''    ' check if job queue file is already open
''    On Error Resume Next
''        Set jobQueueWB = Workbooks(jobQueueFilePath)
''    On Error GoTo 0
''
''    ' If the workbook is not already open, open it
''    If jobQueueWB Is Nothing Then
''        Set jobQueueWB = Workbooks.Open(jobQueueFilePath)
''        wbOpened = True
''    End If
''
''    Set jobQueueSh = jobQueueWB.Sheets("Admin")
''    Set QuoteLogWS = ThisWorkbook.Sheets("Quote Log")
''
''
''
''    ' customer Details
''    Dim cxRow As Integer
''    Dim customerAbb As String, CustomerName As String
''    Dim payTerms As String
''
''    ' find the last row# in DataInputSheet
''    Dim lrow, i As Long
''    lrow = inputWS.Cells(inputWS.Rows.count, DM_SNo_Column).End(xlUp).Row
''
''    ' Generate the TIME FILE
''For i = 6 To lrow
''    If inputWS.Cells(i, DM_ActiveQty_Column) > 0 Then
''        On Error GoTo CancelHandler
''        customerAbb = inputWS.Cells(i, DM_Customer_Column)
''
''        Dim rfqNumber As String, boardName As String
''        rfqNumber = inputWS.Cells(i, DM_Status_Column)
''        boardName = inputWS.Cells(i, DM_GlobalMFRPackage_Column)
''
''        ' update the rfq status to "In Time File"
''        Dim cell As Range, firstAddress As String
''        With QuoteLogWS.Columns("G:G")
''            Set cell = .Find(What:=rfqNumber, LookAt:=xlWhole, MatchCase:=False)
''            If Not cell Is Nothing Then
''                firstAddress = cell.Address
''                Do
''                    ' Check if board name in column B of same row matches
''                    If QuoteLogWS.Cells(cell.Row, "B").value = boardName Then
''                        QuoteLogWS.Cells(cell.Row, "J").value = "In Time File" ' Or whatever new status
''                    End If
''                    Set cell = .FindNext(cell)
''                Loop While Not cell Is Nothing And cell.Address <> firstAddress
''            End If
''        End With
''
''
''
''        ' Call the subroutine to handle the user form
''        CheckAndInitializeUserForm customerAbb, jobQueueSh
''
''        ' Check if user cancelled
''        If isCancelled Then Exit Sub
''
''        prodPath = parentPath & "1. CUSTOMERS\" & customerAbb & "\" & "1. PROD FILES AND QUOTES\"
''        timeProjectPath = parentPath & "6. BACKEND\TIME FILE\"
''
''        ' Proceed with the rest of your logic, using the cx1 variable
''            'Debug.Print "Selected Requisitioner: " & cx1
''
''        On Error Resume Next
''        cxRow = jobQueueSh.Columns("B").Find(What:=customerAbb, LookIn:=xlValues, LookAt:=xlWhole).Row
''        On Error GoTo 0
''
''        If cxRow = 0 Then
''            'MsgBox ("Customer Name in DM File Name is not matching with the name on Job Queue Admin Sheet Column ""B""")
''            MsgBox """" & (inputWS.Cells(i, DM_Customer_Column) & """" & " Customer Name in DM File is not matching with the name on Job Queue Admin Sheet Column ""B""")
''            Exit Sub
''        End If
''
'''        cx1 = jobQueueSh.Cells(cxRow, "D")                                                  ' Requisitioner name
'''        cx2 = jobQueueSh.Cells(cxRow, "A")                                                  ' Company Name
'''        cx3 = jobQueueSh.Cells(cxRow, "F")                                                  ' Street Address
'''        cx4 = jobQueueSh.Cells(cxRow, "G") & ", " & jobQueueSh.Cells(cxRow, "H") & ", " & jobQueueSh.Cells(cxRow, "I") & ", " & jobQueueSh.Cells(cxRow, "J")            ' City & Province, Postal Code & Country Code
'''        cx5 = jobQueueSh.Cells(cxRow, "K")                                                  ' email ID
'''        cx6 = jobQueueSh.Cells(cxRow, "L")                                                  ' Contact Number
''        payTerms = jobQueueSh.Cells(cxRow, "C")                                             ' Payment Terms
''
''        'generate Global Quote Number
''        Dim globalQuoteNumber As String
''        If inputWS.Cells(i, DM_GlobalQTE_Column) = "" Then
''            Dim quoteabb As String
''            Dim quoteInt As Integer
''
''            quoteabb = jobQueueSh.Cells(cxRow, "W")
''
''            globalQuoteNumber = GetNextQuoteNumber(lrow, inputWS, quoteabb)
''            inputWS.Cells(i, DM_GlobalQTE_Column) = globalQuoteNumber
''
''        End If
''
''    Dim TIMEfile As String
''    TIMEfile = Dir(timeProjectPath & "TIME*.xlsm")
''    'Debug.Print TIMEfile
''
''    ' extract the file name and extension
''    fileName = Left(TIMEfile, InStrRev(TIMEfile, ".") - 1)
''    fileExtension = Mid(TIMEfile, InStrRev(TIMEfile, "."), Len(TIMEfile) - InStrRev(TIMEfile, ".") + 1)
''
''    ' define the path of new TIME FILE. Code V3
''    Dim NewFileName As String
''    NewFileName = prodPath & inputWS.Cells(i, DM_GlobalMFRPackage_Column) & "\" & fileName & " " & inputWS.Cells(i, DM_GlobalMFRPackage_Column) & fileExtension
''    'Debug.Print NewFileName
''
''
''
'''    ' Check if NEW TIME File name already exists in Production folder. If yes then add Revision # in file name
'''    Dim counter As Integer
'''    Do While Dir(NewFileName) <> ""
'''        counter = counter + 1
'''        NewFileName = prodPath & inputWS.Cells(i, DM_GlobalMFRPackage_Column) & "\" & fileName & " " & "R" & counter & " " & inputWS.Cells(i, DM_BomName_Column) & fileExtension
'''        'Debug.Print NewFileName
'''    Loop
''
''    ' Check if Original TIME File path exists. If yes then copy the TIME FILE
''    If Dir(parentPath & "6. BACKEND\TIME FILE\" & fileName & fileExtension) <> "" Then
''        ' check if the time file already exists. If not, then create the new time file otherwise update the parameters in the existing time file
''        Do While Dir(NewFileName) = ""
''            FileCopy parentPath & "6. BACKEND\TIME FILE\" & fileName & fileExtension, NewFileName
''        Loop
''
''        'FileCopy parentPath & "6. BACKEND\TIME FILE\" & fileName & fileExtension, NewFileName
''
''        ' Open the copied file
''        Set copiedWorkbook = Workbooks.Open(NewFileName)
''        Set summaryWS = copiedWorkbook.Sheets("Summary")
''        initialiseHeaders , , , , , , , , , , , summaryWS
''        Set TimeWS = copiedWorkbook.Sheets("final")
''        TimeWS.Activate
''
''        Dim setWS As Worksheet
''        Dim finWS As Worksheet
''
''
''
''        Set setWS = copiedWorkbook.Sheets("Settings")
''        Set finWS = copiedWorkbook.Sheets("final-Design1")
''
''
''        LoadGlobalRanges setWS, finWS
''
''
''        Dim q1 As Integer, q2 As Integer, q3 As Integer, q4 As Integer
''
''        q1 = inputWS.Cells(i, DM_QTY1_Column)
''        q2 = inputWS.Cells(i, DM_QTY2_Column)
''        q3 = inputWS.Cells(i, DM_QTY3_Column)
''        q4 = inputWS.Cells(i, DM_QTY4_Column)
''
''
''        'Global Manufacturing package name
''        Dim GMP As String
''        Dim bom As String
''        Dim BRev As String
''        Dim PCB As String
''        Dim PRev As String
''        GMP = inputWS.Cells(i, DM_GlobalMFRPackage_Column)
''        bom = inputWS.Cells(i, DM_BomName_Column)
''        BRev = inputWS.Cells(i, DM_BOMRev_Column)
''        PCB = inputWS.Cells(i, DM_PCBName_Column)
''        PRev = inputWS.Cells(i, DM_PCBRev_Column)
''
''
''        ' add the details in time file
''        Set_Mfg_Package_Rng.NumberFormat = "@"
''        Set_Mfg_Package_Rng.value = GMP
''        Set_Bom_Name_Rng.NumberFormat = "@"
''        Set_Bom_Name_Rng.value = bom
''        Set_Rev_Rng.NumberFormat = "@"
''        Set_Rev_Rng.value = BRev
''        Set_PCB_Name_Rng.NumberFormat = "@"
''        Set_PCB_Name_Rng.value = PCB
''        Set_Rev0_Rng.NumberFormat = "@"
''        Set_Rev0_Rng.value = PRev
''
''
'''        TimeWS.Range("B32:B36").NumberFormat = "@"
'''        TimeWS.Range("B32") = GMP
'''        TimeWS.Range("B33") = bom
'''        TimeWS.Range("B34") = BRev
'''        TimeWS.Range("B35") = PCB
'''        TimeWS.Range("B36") = PRev
''
''        Set_Boards_In_Panel_Rng.value = inputWS.Cells(i, DM_brdpnl_Column)
''        Set_Double_Side_Rng.value = inputWS.Cells(i, DM_doubleside_Column)
''
'''        TimeWS.Range("B40") = inputWS.Cells(i, DM_brdpnl_Column)
'''        TimeWS.Range("B41") = inputWS.Cells(i, DM_doubleside_Column)
''
'''        TimeWS.Range("B38").NumberFormat = "@"
'''        TimeWS.Range("B38") = GMP
''        Set_Board_Name_Rng.NumberFormat = "@"
''        Set_Board_Name_Rng = GMP
''
''
'''        TimeWS.Range("B15") = q1
'''        TimeWS.Range("B16") = q2
'''        TimeWS.Range("B17") = q3
'''        TimeWS.Range("B18") = q4
''
''        Set_Quantities_Rng.Offset(1, 0).value = q1
''        Set_Quantities_Rng.Offset(2, 0).value = q2
''        Set_Quantities_Rng.Offset(3, 0).value = q3
''        Set_Quantities_Rng.Offset(4, 0).value = q4
''
''        ' add the standard pricing to Time File
'''        TimeWS.Range("C15:C18") = 130           ' standard labour
'''        TimeWS.Range("D15:D18") = 165           ' standard SMT
''        Dim m As Integer
''
''        For m = 1 To 4
''            Set_Labour_Rate_Rng.Offset(m, 0).value = 130
''
''            Set_SMT_Rate_Rng.Offset(m, 0).value = 165
''        Next m
''        'TimeWS.Range("F15:F18") = 0.3           ' standard PCB Markup
''        'TimeWS.Range("H15:H18") = 0.3           ' standard components markup
''
''
''        copiedWorkbook.Sheets("Quotation Temp").Range("C11:C16").NumberFormat = "@"
''        copiedWorkbook.Sheets("Quotation Temp").Range("C11") = "'" & cx1
''        copiedWorkbook.Sheets("Quotation Temp").Range("C12") = "'" & cx2
''        copiedWorkbook.Sheets("Quotation Temp").Range("C13") = "'" & cx3
''        copiedWorkbook.Sheets("Quotation Temp").Range("C14") = "'" & cx4
''        copiedWorkbook.Sheets("Quotation Temp").Range("C15") = "'" & cx5
''        copiedWorkbook.Sheets("Quotation Temp").Range("C16") = "'" & "Tél.:" & cx6
''
''        copiedWorkbook.Sheets("Quotation Temp").Range("AK19") = payTerms        'Send Payment Terms from DM to TIME
''        copiedWorkbook.Sheets("Quotation Temp").Range("S19") = inputWS.Cells(i, DM_solderType_Column)
''        copiedWorkbook.Sheets("Quotation Temp").Range("X19") = "IPC Class " & inputWS.Cells(i, DM_ipcClass_Column)
''
'''        TimeWS.Range("B28").NumberFormat = "@"
'''        TimeWS.Range("B28") = inputWS.Cells(i, DM_GlobalQTE_Column)      'send quote number from DM to TIME
''        Set_Quote_Number_Rng.NumberFormat = "@"
''        Set_Quote_Number_Rng.value = inputWS.Cells(i, DM_GlobalQTE_Column)
''
''        For m = 1 To 4
''            Set_PCB_Cost_Rng.Offset(m, 0).NumberFormat = "#,##0.00 $"
''        Next m
''            Set_PCB_Cost_Rng.Offset(1, 0).value = inputWS.Cells(i, DM_PCB1_Column)
''            Set_PCB_Cost_Rng.Offset(2, 0).value = inputWS.Cells(i, DM_PCB2_Column)
''            Set_PCB_Cost_Rng.Offset(3, 0).value = inputWS.Cells(i, DM_PCB3_Column)
''            Set_PCB_Cost_Rng.Offset(4, 0).value = inputWS.Cells(i, DM_PCB4_Column)
''
'''            TimeWS.Range("E15:E18").NumberFormat = "#,##0.00 $"
'''            TimeWS.Range("E15") = inputWS.Cells(i, DM_PCB1_Column)      'send PCB Price 1 from DM to TIME
'''            TimeWS.Range("E16") = inputWS.Cells(i, DM_PCB2_Column)      'send PCB Price 2 from DM to TIME
'''            TimeWS.Range("E17") = inputWS.Cells(i, DM_PCB3_Column)      'send PCB Price 3 from DM to TIME
'''            TimeWS.Range("E18") = inputWS.Cells(i, DM_PCB4_Column)      'send PCB Price 4 from DM to TIME
''
''        ' insert rfq number
''        'TimeWS.Range("A54") = "RFQ Number"
''        Set_Quote_Number_With_Rev_Rng.value = rfqNumber
''
''        'TimeWS.Range("B54") = rfqNumber
''
'''        TimeWS.Range("P19") = ThisWorkbook.Name         'DM FILE NAME
''
''        ' get the component cost from dm
''
''        Dim s As Worksheet
''        Dim targetCell As String
''        targetCell = inputWS.Cells(i, DM_GlobalMFRPackage_Column)
''        Set ws = ThisWorkbook.Sheets(targetCell)
''
''
''        Dim lr As Long
''        lr = ws.Cells(ws.Rows.count, "G").End(xlUp).Row
''        lr = lr + 5
''
''        Dim CompCost1 As Double, CompCost2 As Double, CompCost3 As Double, CompCost4 As Double
''
''        On Error Resume Next
''        If ws.Cells(lr - 4, "Y") <> 0 Then
''        CompCost1 = ws.Cells(lr - 4, "Y").value
''        End If
''
''        If ws.Cells(lr - 4, "AD") <> 0 Then
''        CompCost2 = ws.Cells(lr - 4, "AD").value
''        End If
''
''        If ws.Cells(lr - 4, "AI") <> 0 Then
''        CompCost3 = ws.Cells(lr - 4, "AI").value
''        End If
''
''        If ws.Cells(lr - 4, "AN") <> 0 Then
''        CompCost4 = ws.Cells(lr - 4, "AN").value
''        End If
''        On Error GoTo 0
''
''        For m = 1 To 4
''            Set_Component_Cost_Rng.Offset(m, 0).NumberFormat = "#,##0.00 $"
''        Next m
''        ' add component cost to final sheet
''        'TimeWS.Range("G15:G18").NumberFormat = "#,##0.00 $"
''        Set_Component_Cost_Rng.Offset(1, 0).value = CompCost1
''        Set_Component_Cost_Rng.Offset(2, 0).value = CompCost2
''        Set_Component_Cost_Rng.Offset(3, 0).value = CompCost3
''        Set_Component_Cost_Rng.Offset(4, 0).value = CompCost4
''
'''        TimeWS.Range("G15") = CompCost1
'''        TimeWS.Range("G16") = CompCost2
'''        TimeWS.Range("G17") = CompCost3
'''        TimeWS.Range("G18") = CompCost4
'''
''
''        ' add who is working to TIME File
''        'TimeWS.Range("O26") = inputWS.Cells(3, "L")
''
''
''        ' send NRE1, NRE2, NRE3, NRE4 from DM to TIME file
''        'uppercase the NRE Status
''        inputWS.Cells(i, DM_NRE1Status_Column) = Trim(UCase(inputWS.Cells(i, DM_NRE1Status_Column)))
''        inputWS.Cells(i, DM_NRE2Status_Column) = Trim(UCase(inputWS.Cells(i, DM_NRE2Status_Column)))
''        inputWS.Cells(i, DM_NRE3Status_Column) = Trim(UCase(inputWS.Cells(i, DM_NRE3Status_Column)))
''        inputWS.Cells(i, DM_NRE4Status_Column) = Trim(UCase(inputWS.Cells(i, DM_NRE4Status_Column)))
''
''        'TimeWS.Range("B21:B24").NumberFormat = "#,##0.00 $"
''        Set_Programming_Rng.NumberFormat = "#,##0.00 $"
''        Set_Stencil_Rng.NumberFormat = "#,##0.00 $"
''        Set_PCB_FAB_Rng.NumberFormat = "#,##0.00 $"
''        Set_Misc_NRE_Rng.NumberFormat = "#,##0.00 $"
''
''        Dim Note() As String
''        Dim n As Long
''        n = 0
''
''        If inputWS.Cells(i, DM_NRE1Status_Column) <> "PAID" Then
''
''        Set_Programming_Rng.value = inputWS.Cells(i, DM_NRE1_Column)      'Programming Fees
''        Else
''        Set_Programming_Rng.value = 0
''        n = n + 1
''        ReDim Preserve Note(1 To n)
''        Note(n) = "Programming"
''        End If
''
''        If inputWS.Cells(i, DM_NRE2Status_Column) <> "PAID" Then
''        'TimeWS.Range("B22") = inputWS.Cells(i, DM_NRE2_Column)     'Stencil Fees
''        Set_Stencil_Rng.value = inputWS.Cells(i, DM_NRE2_Column)
''        Else
''         Set_Stencil_Rng.value = 0
''        n = n + 1
''        ReDim Preserve Note(1 To n)
''        Note(n) = "Stencil"
''        End If
''
''        If inputWS.Cells(i, DM_NRE3Status_Column) <> "PAID" Then
''        'TimeWS.Range("B23") = inputWS.Cells(i, DM_NRE3_Column)     'PCB FAB
''        Set_PCB_FAB_Rng.value = inputWS.Cells(i, DM_NRE3_Column)
''        Else
''        Set_PCB_FAB_Rng.value = 0
''        n = n + 1
''        ReDim Preserve Note(1 To n)
''        Note(n) = "PCB FAB"
''        End If
''
''        If inputWS.Cells(i, DM_NRE4Status_Column) <> "PAID" Then
''        'TimeWS.Range("B24") = inputWS.Cells(i, DM_NRE4_Column)     'Misc NRE on whole order
''        Set_Misc_NRE_Rng.value = inputWS.Cells(i, DM_NRE4_Column)
''        Else
''        Set_Misc_NRE_Rng.value = 0
''        n = n + 1
''        ReDim Preserve Note(1 To n)
''        Note(n) = "Misc. NRE on Whole Order"
''        End If
''
''        ' note NREs paid note in NOTE1 of TIME FILE
''        Dim Note1 As String
''
''        If n = 0 Then
''        Note1 = ""
''        ElseIf n = 1 Then
''        Note1 = "NRE's for " & Note(1) & " have already been paid."
''        ElseIf n = 2 Then
''        Note1 = "NRE's for " & Note(1) & ", " & Note(2) & " have already been paid."
''        ElseIf n = 3 Then
''        Note1 = "NRE's for " & Note(1) & ", " & Note(2) & ", " & Note(3) & " have already been paid."
''        ElseIf n = 4 Then
''        Note1 = "NRE's for " & Note(1) & ", " & Note(2) & ", " & Note(3) & ", " & Note(4) & " have already been paid."
''        End If
''
''        'TimeWS.Range("K1") = Note1
''        Set_Notes_Start_First6_Rng.value = Note1
''
''
''                        ' vba to count mcodes
''
''
''                        Dim lastRow As Long
''                        Dim rowCount As Long
''                        Dim currentRow As Long
''                        Dim countCP As Long
''                        Dim sumCP As Double
''                        Dim ipCount As Long
''                        Dim sumIP As Double
''                        Dim smtCount As Long
''                        Dim THsum As Double
''
''                        ' Get the last row in column A with data
''                        lastRow = ws.Cells(ws.Rows.count, "E").End(xlUp).Row
''
''                        ' Count the number of rows with data in column A, starting from cell A1
''                        'rowCount = lastRow - 3
''                        Dim r As Long
''                        rowCount = 0
''                        For r = 4 To lastRow
''                            If IsNumeric(ws.Cells(r, "E").value) Then
''                                If ws.Cells(r, "E").value > 0 Then
''                                    rowCount = rowCount + 1
''                                End If
''                            End If
''                        Next r
''
''                        'rowCount = Application.WorksheetFunction.CountA(ws.Range(ws.Cells(4, "E"), ws.Cells(lastRow, "E")))
''
''                        'TimeWS.Range("B43") = rowCount
''                        Set_Total_BOM_Lines_Rng.value = rowCount
''
''                        ' Count the number of cells with "CP" or "CPEXP" or "0402" in column G
''                        countCP = 0
''
''                        For currentRow = 4 To lastRow
''                            If ws.Cells(currentRow, "K").value = "CP" Or ws.Cells(currentRow, "K").value = "CPEXP" Or ws.Cells(currentRow, "K").value = "0402" Or ws.Cells(currentRow, "K").value = "402" Or ws.Cells(currentRow, "K").value = "0201" Or ws.Cells(currentRow, "K").value = "201" Then
''                                countCP = countCP + 1
''                            End If
''                        Next currentRow
''
''                        ' Output the count to cell K8
''                        'TimeWS.Range("B45") = countCP
''                        Set_CP_Feeders_Rng.value = countCP
''
''
''                        ' Calculate the sum of column A for each row that is using an SMT part (mcodes:CP,0402,402,CPEXP,IP,mansmt) in column G
''                        sumCP = 0
''                        For currentRow = 4 To lastRow
''                            If ws.Range("K" & currentRow).value = "CP" Or ws.Range("K" & currentRow).value = "CPEXP" Or ws.Range("K" & currentRow).value = "IP" Or ws.Range("K" & currentRow).value = "0402" Or ws.Range("K" & currentRow).value = "402" Or ws.Range("K" & currentRow).value = "MANSMT" Then
''                                sumCP = sumCP + ws.Range("E" & currentRow).value
''                            End If
''                        Next currentRow
''
''                        ' Output the sum to cell K9
''                        ' Range("K9").Value = sumCP
''                        'TimeWS.Range("B44") = "" & sumCP
''                        Set_SMT_Placement_Rng.value = "" & sumCP
''
''                        Dim smtPlacement As Variant
''                        smtPlacement = sumCP
''
''                        ' Calculate the sum of column A for each row that has "CP", "CPEXP" & "0402" in column G
''                        sumCP = 0
''                        For currentRow = 4 To lastRow
''                            If ws.Range("K" & currentRow).value = "CP" Or ws.Range("K" & currentRow).value = "CPEXP" Or ws.Range("K" & currentRow).value = "0402" Or ws.Range("K" & currentRow).value = "402" Then
''                                sumCP = sumCP + ws.Range("E" & currentRow).value
''                            End If
''                        Next currentRow
''
''                        ' Output the sum to cell K9
''                       ' TimeWS.Range("B46") = sumCP
''                        Set_CP_Parts_Rng = sumCP
''
''                        ' Count the number of cells with "IP" in column G
''                        ipCount = 0
''
''                        For currentRow = 4 To lastRow
''                            If ws.Cells(currentRow, "K").value = "IP" Then
''                                ipCount = ipCount + 1
''                            End If
''                        Next currentRow
''
''                        ' Output the count to cell K10
''                        'TimeWS.Range("B47") = ipCount
''                        Set_IP_Feeders_Count_Rng.value = ipCount
''
''                        ' Calculate the sum of column A for each row that has "IP" in column G
''                        sumIP = 0
''                        For currentRow = 4 To lastRow
''                            If ws.Range("K" & currentRow).value = "IP" Then
''                                sumIP = sumIP + ws.Range("E" & currentRow).value
''                            End If
''                        Next currentRow
''
''                        ' Output the sum to cell K11
''                        'TimeWS.Range("B48") = sumIP
''                        Set_IP_Parts_Per_PCB_Rng.value = sumIP
''
''                        ' Count the number of cells with "MANSMT" in column G
''                        smtCount = 0
''
''                        For currentRow = 4 To lastRow
''                            If ws.Cells(currentRow, "K").value = "MANSMT" Then
''                                smtCount = smtCount + ws.Cells(currentRow, "E").value
''                            End If
''                        Next currentRow
''
''                        ' Output the count to cell K12
''                        'TimeWS.Range("B49") = smtCount
''                        Set_SMT_Parts_Top_Bottom_Rng.value = smtCount
''
''                        ' Calculate the sum of Quantity for each row that has "TH" in column G
''                        sumTH = 0
''                        For currentRow = 4 To lastRow
''                            If ws.Range("K" & currentRow).value = "TH" Then
''                                sumTH = sumTH + ws.Range("E" & currentRow).value
''                            End If
''                        Next currentRow
''
''                        ' Output the sum to cell K13
''                        'TimeWS.Range("B50") = sumTH
''                        Set_TH_Parts_Per_Board_Rng.value = sumTH
''
''
''                        'Update || Adding "zzCX Supplies" customer supplies to Notes Table
''                        Dim TimeValueTableCurrentIndex As Double
''                        Dim h As Integer
''                        h = 1
''                        TimeValueTableCurrentIndex = 7
''                        For currentRow = 4 To lastRow
''                            If UCase(Trim(ws.Range("P" & currentRow).value)) Like UCase(Trim("*Supplies")) Then
''
''                               If TimeValueTableCurrentIndex > 16 Then
''                                  MsgBox "TIME FILE CX Supplies Table Row Limit Reached max. Please Recheck", vbExclamation, "Macro"
''                               End If
''
'''                               ws.Range(ws.Cells(currentRow, "E"), ws.Cells(currentRow, "E")).Copy
'''                               TimeWS.Cells(TimeValueTableCurrentIndex, "J").PasteSpecial xlPasteValuesAndNumberFormats
''                                Set_Qty_Per_Board_Rng.value = ws.Cells(currentRow, "E").value
''
''                                Set_Customer_PN_Rng.Offset(h, 0).value = ws.Cells(currentRow, "G").value
''                                Set_Description_Rng.Offset(h, 0).value = ws.cellls(currentRow, "H").value
''                                Set_MFR_PN_Rng.Offset(h, 0).value = ws.Cells(currentRow, "I").value
''                                Set_MFR_Name_Rng.Offset(h, 0).value = ws.Cells(currentRow, "J").value
''                                Set_Status_Rng.Offset(h, 0).value = "CX Supplies"
''                                Set_Cost_In_Quote_Rng.Offset(h, 0).value = "No"
''
''                                h = h + 1
''
'''                               ws.Range(ws.Cells(currentRow, "G"), ws.Cells(currentRow, "J")).Copy
'''                               TimeWS.Cells(TimeValueTableCurrentIndex, "K").PasteSpecial xlPasteValuesAndNumberFormats
''
'''                               TimeWS.Cells(TimeValueTableCurrentIndex, "O").value = "CX Supplies"
'''                               TimeWS.Cells(TimeValueTableCurrentIndex, "P").value = "NO"
'''                               TimeValueTableCurrentIndex = TimeValueTableCurrentIndex + 1
''                            End If
''                        Next currentRow
''                        ''/
''
''
''                        ''/
''                        ' # of TH Pins from individual sheet to Time File
''                        'TimeWS.Range("B51") = ws.Range("K2")
''                        Set_Pins_Per_PCB_Rng.value = ws.Range("K2")
''
''        Dim mcodeSummary As String
''        mcodeSummary = "#Lines: " & rowCount & ", " & "#Ttl prts: " & smtPlacement & ", " & "Cpfd: " & countCP & ", " & "IP Fd: " & ipCount & ", " & "TH: " & sumTH & ", " & ws.Range("K2")
''        inputWS.Cells(i, DM_MCODESSummary_Column) = mcodeSummary
''
''    'export the BOM to production folder
''
''    Call BOM_export(inputWS.Cells(i, DM_GlobalMFRPackage_Column), inputWS.Cells(i, DM_BomName_Column), prodPath & inputWS.Cells(i, DM_GlobalMFRPackage_Column), copiedWorkbook, summaryWS)
''
''    ' update the summary sheet with other details
''    Dim summaryLR As Long
''    summaryLR = summaryWS.Cells(summaryWS.Rows.count, timeWBsummaryWS_sheet_name_column).End(xlUp).Row
''    If summaryLR < 5 Then summaryLR = 5
''
''    summaryWS.Cells(summaryLR, timeWBsummaryWS_bom_name_column) = bom
''    summaryWS.Cells(summaryLR, timeWBsummaryWS_gerber_name_column) = PCB
''    summaryWS.Cells(summaryLR, timeWBsummaryWS_qty1_qty_column) = q1
''    summaryWS.Cells(summaryLR, timeWBsummaryWS_qty2_qty_column) = q2
''    summaryWS.Cells(summaryLR, timeWBsummaryWS_qty3_qty_column) = q3
''    summaryWS.Cells(summaryLR, timeWBsummaryWS_qty4_qty_column) = q4
''    summaryWS.Cells(summaryLR, timeWBsummaryWS_mcode_summary_column) = mcodeSummary
''
''    TimeWS.Activate
''
''    timeFileGenerated = True
''    'MsgBox "File copied and renamed successfully!", vbInformation
''    copiedWorkbook.Save
''    Else
''        MsgBox "Source file not found or destination folder does not exists", vbExclamation
''    End If
''Exit For
''End If
''Next i
''
''
''
''' check if quote folder exists. If not then create a Quotation folder
''If Dir(prodPath & inputWS.Cells(i, DM_GlobalMFRPackage_Column) & " QTE " & inputWS.Cells(i, DM_GlobalQTE_Column), vbDirectory) = "" Then
''MkDir prodPath & inputWS.Cells(i, DM_GlobalMFRPackage_Column) & " QTE " & inputWS.Cells(i, DM_GlobalQTE_Column)
''End If
''
''
''If wbOpened Then
''    'jobQueueWB.Close SaveChanges:=True
''End If
''
''turnonscreenUpdate
''
''If timeFileGenerated = True Then
''    MsgBox "File copied and renamed successfully!", vbInformation
''End If
''
''Exit Sub
''CancelHandler:
''    ' Handle cancellation gracefully
''    If Err.Number = vbObjectError + 1 Then
''        ' User cancelled the operation
''        MsgBox Err.Description, vbExclamation, "Operation Aborted"
''        turnonscreenUpdate
''    Else
''        ' Handle other unexpected errors
''        MsgBox "An unexpected error occurred: " & Err.Description, vbCritical, "Error"
''        turnonscreenUpdate
''    End If
''End Sub




Function GetNextQuoteNumber(ByVal lRow As Long, inputWS As Worksheet, quoteabb As String) As String
    Dim maxNumber As Long
    Dim cellValue As String
    Dim currentNumber As Integer
    maxNumber = 0
    Dim j As Long
    
    For j = 6 To lRow
        If inputWS.Cells(j, DM_GlobalQTE_Column) <> "" Then
            Dim digits As Integer
            Dim customDigits As Integer
            digits = CountDigits(inputWS.Cells(j, DM_GlobalQTE_Column))
            
            If Left(inputWS.Cells(j, DM_GlobalQTE_Column), Len(inputWS.Cells(j, DM_GlobalQTE_Column)) - digits) = quoteabb Then
                currentNumber = Right(inputWS.Cells(j, DM_GlobalQTE_Column), 3)
                If currentNumber > maxNumber Then
                    maxNumber = currentNumber
                    customDigits = digits
                End If
            End If
        End If
    Next j
    
    If customDigits = 3 Then
        GetNextQuoteNumber = quoteabb & Format(maxNumber + 1, "000")
    ElseIf customDigits = 4 Then
        GetNextQuoteNumber = quoteabb & Format(maxNumber + 1, "0000")
    ElseIf customDigits = 0 Then
        GetNextQuoteNumber = quoteabb & Format(maxNumber + 1, "000")
    End If

End Function

Function CountDigits(str As String) As Integer
    Dim i As Integer
    Dim digitCount As Integer
    
    digitCount = 0
    
    For i = 1 To Len(str)
        If IsNumeric(Mid(str, i, 1)) Then
            digitCount = digitCount + 1
        End If
    Next i
    
    CountDigits = digitCount
End Function

Function BOM_export(SheetName As String, BOM_Name As String, savePath As String, copiedWorkbook As Workbook, summaryWS As Worksheet) As String

    initialiseHeaders , , , , , , , , , , , summaryWS
    
    Dim dateTime As Date
    Dim newSheetName As String
    dateTime = FillDateTimeInCanada
    newSheetName = "RS Pricing_" & Format(dateTime, "yymmddhhmmss")

    ' Copy the sheet to the copiedWorkbook
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets(SheetName)
    ws.Copy After:=copiedWorkbook.Sheets(copiedWorkbook.Sheets.count)
    Dim newSheet As Worksheet
    Set newSheet = copiedWorkbook.Sheets(copiedWorkbook.Sheets.count)
    newSheet.Name = newSheetName
    newSheet.Range("A1").Resize(ws.UsedRange.Rows.count, ws.UsedRange.Columns.count).value = ws.UsedRange.value
    
    ' Add the button to the newly created sheet
    AddSummaryButtonToSheets newSheet, copiedWorkbook
    
    ' update the sheet name entry in Summary Sheet
    Dim summaryLR As Long
    summaryLR = summaryWS.Cells(summaryWS.Rows.count, "A").End(xlUp).Row + 1
    If summaryLR < 5 Then summaryLR = 5
    
    summaryWS.Cells(summaryLR, timeWBsummaryWS_rs_pricing_sheet_name_column) = newSheetName
    summaryWS.Cells(summaryLR, timeWBsummaryWS_sheet_name_column) = Format(dateTime, "mmddyy-hhmmss")
    summaryWS.Cells(summaryLR, timeWBsummaryWS_status_column) = "Pending"
    
    ' hyperlink the cell
    summaryWS.Cells(summaryLR, timeWBsummaryWS_rs_pricing_sheet_name_column).Hyperlinks.Add Anchor:=summaryWS.Cells(summaryLR, timeWBsummaryWS_rs_pricing_sheet_name_column), Address:="", SubAddress:="'" & newSheetName & "'!A1", TextToDisplay:=newSheetName
End Function

Sub AddSummaryButtonToSheets(pricingWS As Worksheet, copiedWorkbook As Workbook)
    Dim ws As Worksheet
    Dim btn As Object
    Dim btnName As String
    Dim summarySheet As Worksheet
    
    ' Name of the Summary Sheet
    On Error Resume Next
    Set summarySheet = copiedWorkbook.Sheets("Summary")
    On Error GoTo 0
    
    If summarySheet Is Nothing Then
        MsgBox "Summary sheet not found. Please ensure it exists.", vbExclamation
        Exit Sub
    End If

    btnName = "GoToSummaryBtn"
    On Error Resume Next
    pricingWS.Shapes(btnName).Delete
    On Error GoTo 0
    
    ' Add a button
    Set btn = pricingWS.Shapes.AddFormControl(xlButtonControl, 200, 5, 100, 20)
    With btn
        .Name = btnName
        .OnAction = "'" & copiedWorkbook.Name & "'!GoToSummary"
        .TextFrame.Characters.Text = "Go to Summary"
        .Placement = xlFreeFloating
    End With
End Sub


Public Function ExtractFolderName(ByVal fullPath As String) As String
    Dim folders() As String
    Dim folderName As String
    
    ' Split the path string using backslash as delimiter
    folders = Split(fullPath, "\")
    
    ' Check if there are at least three elements in the array
    If UBound(folders) >= 2 Then
        ' Get the third element which corresponds to the folder name
        folderName = folders(UBound(folders) - 2)
    Else
        ' If the path is invalid, return empty string
        folderName = ""
    End If
    
    ' Return the folder name
    ExtractFolderName = folderName
End Function
