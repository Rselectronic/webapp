Attribute VB_Name = "procFolder_jobCard_V3"
Option Explicit

Sub JobCard()
'On Error GoTo Errhandler

Application.ScreenUpdating = False
Application.Calculation = xlCalculationManual
Application.DisplayAlerts = False

Dim jobQueue As Worksheet
Dim procBatchCode As String
Dim fullPath As String
Dim folders() As String
Dim masterfolderName As String
Dim masterfolderPath As String
Dim jobCardFolder As String
Dim jobCardfile As String

''Updated
Set jobQueue = ThisWorkbook.Sheets("Job Queue")
initialiseHeaders jobQueue
UnHideColumns_Jobqueue jobQueue

Dim procBatchCodeColumnNo As Integer
procBatchCodeColumnNo = wsJobQueue_ProcBatchCode_Column

Dim selectedCell As Range
On Error Resume Next
Set selectedCell = Application.InputBox("Select the Proc Batch Code from Column " & procBatchCodeColumnNo, "JOB CARD", Type:=8)
On Error GoTo 0

If Not selectedCell Is Nothing Then
    If selectedCell.Column = procBatchCodeColumnNo Then ' Column F = 6
        procBatchCode = selectedCell.Value
    Else
        Application.ScreenUpdating = True
        Application.Calculation = xlCalculationAutomatic
        Application.DisplayAlerts = True
        MsgBox "Please select a cell from Column " & procBatchCodeColumnNo & " only.", vbExclamation
        Exit Sub
    End If
Else
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    Application.DisplayAlerts = True
    MsgBox "Selection cancelled.", vbInformation
    Exit Sub
End If

'procBatchCode = InputBox("Enter the Proc Batch Code", "JOB CARD")
procBatchCode = UCase(procBatchCode)
fullPath = GetLocalPath(ThisWorkbook.FullName)
folders() = Split(fullPath, "\")
masterfolderName = folders(UBound(folders) - 2)
masterfolderPath = Left(fullPath, InStr(1, fullPath, masterfolderName, vbTextCompare) + Len(masterfolderName))
jobCardFolder = masterfolderPath & "6. BACKEND\JOB CARD\"
jobCardfile = jobCardFolder & "Job Card.xlsx"

' set the pdf path and file name
Dim procFolder As String
Dim customerName As String
Dim jobCardFilePath As String

''Update
CallInputcustomerNameFromUser customerName, jobQueue, procBatchCode
If customerName = "" Then
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    Application.DisplayAlerts = True
    MsgBox ("Please enter the correct Proc Batch Code")
    Exit Sub
End If

' send proc batch code in Proc Log File
            Dim procLogFilePath As String, procLogFileName As String
            procLogFilePath = masterfolderPath & "6. BACKEND\PROC LOG\"
            procLogFileName = Dir(procLogFilePath & "*PROC LOG*")
            
            Dim wbProcLogFile As Workbook, wsProcLogFile As Worksheet
            Set wbProcLogFile = Workbooks.Open(procLogFilePath & procLogFileName)
            wbProcLogFile.Windows(1).Visible = False
            Set wsProcLogFile = wbProcLogFile.Sheets("Log")
            Dim wsProcLogFileLR As Long
            wsProcLogFileLR = wsProcLogFile.Cells(wsProcLogFile.Rows.Count, "A").End(xlUp).row
            
            wsProcLogFile.Cells(wsProcLogFileLR + 1, "A") = procBatchCode
            wbProcLogFile.Windows(1).Visible = True
            wbProcLogFile.Close SaveChanges:=True
' send proc batch code in Proc Log File

'procFolder = masterfolderPath & "CUSTOMERS\" & customerName & "\" & "2. PROC FILES" & "\" & procBatchCode
procFolder = masterfolderPath & "4. PROC FILE\" & procBatchCode

'loop through all the folders in the directory
Dim folderName As String
Dim folderExists As Boolean
folderExists = False

folderName = Dir(masterfolderPath & "4. PROC FILE\", vbDirectory)
Do While folderName <> ""
    ' Check if it is a valid folder
     If (GetAttr(masterfolderPath & "4. PROC FILE\" & folderName) And vbDirectory) = vbDirectory Then
        ' Extract and compare the batch code part
        If InStr(folderName, " ") > 0 Then
            If Trim(Mid(folderName, InStr(folderName, " ") + 1)) = procBatchCode Then
                folderExists = True
                Exit Do
            End If
        End If
    End If
    folderName = Dir
Loop

' check if the proc folder exists. If not then create one
If Not folderExists Then
    MkDir procFolder
    MkDir procFolder & "\" & "1. PO for PCB's"
    MkDir procFolder & "\" & "2. PO for Stencils"
    MkDir procFolder & "\" & "3. PO for Components"
    
    Dim message As String
    message = "New Proc Folder " & """" & procBatchCode & """" & " was created."
End If
procFolder = procFolder & "\"

jobCardFilePath = procFolder & "JOB CARD " & procBatchCode & ".pdf"

' check if job card pdf already exists
If Dir(jobCardFilePath) <> "" Then
    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    Application.DisplayAlerts = True
    MsgBox "Job Card already exists", , "JOB CARD"
    Exit Sub
End If

Dim jobCardWB As Workbook
Dim jobCardSh As Worksheet

Set jobCardWB = Workbooks.Open(jobCardfile, ReadOnly:=True)
Set jobCardSh = jobCardWB.Sheets("Job Card")

Dim jobQueueLR As Long
''Updated

jobQueueLR = jobQueue.Cells(jobQueue.Rows.Count, wsJobQueue_ProductName_Column).End(xlUp).row

Dim i As Long, j As Long
initialiseHeaders , , , jobCardSh

j = 9
For i = 4 To jobQueueLR
    
    Dim poNumber As String, productName As String, serialNo As String, bomName As String, gerbername As String, stencilName As String, POqty As String, solderType As String, ipcClass As String, mcodeSummary As String, boardLetter As String, serialNumber As String
    
    If jobQueue.Cells(i, wsJobQueue_ProcBatchCode_Column) = procBatchCode And jobQueue.Cells(i, wsJobQueue_OrderType_Column) <> "NREs" Then
        ''Update
        poNumber = jobQueue.Cells(i, wsJobQueue_POnumber_Column)
        productName = jobQueue.Cells(i, wsJobQueue_ProductName_Column)
        customerName = jobQueue.Cells(i, wsJobQueue_customerName_Column)
        bomName = jobQueue.Cells(i, wsJobQueue_BOMName_Column)
        gerbername = jobQueue.Cells(i, wsJobQueue_GerberName_Column)
        stencilName = jobQueue.Cells(i, wsJobQueue_StencilName_Column)
        POqty = jobQueue.Cells(i, wsJobQueue_POQty_Column)
        solderType = jobQueue.Cells(i, wsJobQueue_SolderType_Column)
        ipcClass = jobQueue.Cells(i, wsJobQueue_IPCclass_Column)
        mcodeSummary = jobQueue.Cells(i, wsJobQueue_MCODESSummary_Column)
        boardLetter = jobQueue.Cells(i, wsJobQueue_BoardLetter_Column)
        
        jobCardSh.Cells(j, wsJobCard_poNumber_Column) = poNumber                              'adding po number to job card
        jobCardSh.Cells(j, wsJobCard_boardName_Column) = productName                           'adding product name to job card
        jobCardSh.Cells(j, wsJobCard_Qty_Column) = POqty                                 'adding Qty to job card
        jobCardSh.Cells(j, wsJobCard_bomName_Column) = bomName                               'adding BOM Name to job card
        jobCardSh.Cells(j, wsJobCard_gerberName_Column) = gerbername                            'adding Gerber Name to job card
        jobCardSh.Cells(j, wsJobCard_stencilName_Column) = stencilName                           'adding Stencil Name to job card
        jobCardSh.Cells(j, wsJobCard_mcodeSummary_Column) = mcodeSummary                          'adding MCODES Summary to job card
        jobCardSh.Cells(j, wsJobCard_boardLetter_Column) = boardLetter
        generateProductionTraveller masterfolderPath, poNumber, productName, POqty, bomName, gerbername, stencilName, solderType, ipcClass, customerName, procBatchCode, procFolder
        getPrintCopiesfromProduction masterfolderPath, productName, customerName, procBatchCode, procFolder, bomName, poNumber, boardLetter, POqty, solderType, ipcClass, gerbername, productName, serialNumber
        j = j + 1
    End If
Next i

' add proc batch code in Job card Heading
jobCardSh.Range("B5") = procBatchCode

' apply borders to job card
Dim rng As Range
Set rng = jobCardSh.Range("B9:H" & j - 1)

    With rng.Borders
        .LineStyle = xlContinuous
        .Weight = xlThin
        .ColorIndex = xlAutomatic
    End With

' auto adjust columns width
jobCardSh.Range("B:H").Columns.AutoFit

' adjust the alignment of the columns
rng.Columns.HorizontalAlignment = xlLeft


' Export the worksheet as PDF
jobCardSh.ExportAsFixedFormat Type:=xlTypePDF, fileName:=jobCardFilePath, Quality:=xlQualityStandard
    
' reset the job card excel file
jobCardSh.Range("B5") = "Proc Batch Code"
rng.ClearContents
    
    'clear borders
    With rng.Borders
        .LineStyle = xlNone
    End With

jobCardWB.Close SaveChanges:=False




If message <> "" Then
    MsgBox (message)
End If

ReHideColumns_Jobqueue jobQueue
Exit Sub
Errhandler:
MsgBox Err.Description, vbExclamation, "Macro"

Application.ScreenUpdating = True
Application.Calculation = xlCalculationAutomatic
Application.DisplayAlerts = True

End Sub

Private Function CallInputcustomerNameFromUser(ByRef customerName As String, ByRef jobQueue As Worksheet, ByRef procBatchCode As String) As String
On Error GoTo leaveit

customerName = _
   jobQueue.Cells(jobQueue.Columns("" & Replace(jobQueue.Cells(1, wsJobQueue_ProcBatchCode_Column).Address(False, False), "1", "") & "").Find(what:=procBatchCode, _
   LookIn:=xlValues, LookAt:=xlWhole).row, wsJobQueue_customerName_Column)
   
   
leaveit:
End Function


Function generateProductionTraveller(masterfolderPath As String, poNumber As String, productName As String, _
                                     POqty As String, bomName As String, gerbername As String, stencilName As String, _
                                     solderType As String, ipcClass As String, customerName As String, procBatchCode As String, _
                                     procFolder As String)

    Dim wbProductionTraveller As Workbook
    Dim wsProductionTraveller As Worksheet
    Dim productionTravellerTemplatePath As String
    
    productionTravellerTemplatePath = masterfolderPath & "6. BACKEND\JOB CARD\Production_Traveller V1.xlsx"
    
    Set wbProductionTraveller = Workbooks.Open(productionTravellerTemplatePath, ReadOnly:=True)
    Set wsProductionTraveller = wbProductionTraveller.Sheets("Production Traveller")
    
    wsProductionTraveller.Range("C7") = customerName
    wsProductionTraveller.Range("I9") = "'" & poNumber
    wsProductionTraveller.Range("I10") = procBatchCode
    wsProductionTraveller.Range("AM6") = productName
    wsProductionTraveller.Range("AM7") = bomName
    wsProductionTraveller.Range("AM8") = gerbername
    wsProductionTraveller.Range("AM9") = stencilName
    wsProductionTraveller.Range("AM10") = "'" & POqty
    wsProductionTraveller.Range("AM11") = solderType
    wsProductionTraveller.Range("AM12") = ipcClass
    
    Dim productionTravellerFileName As String
    productionTravellerFileName = procFolder & "PT " & procBatchCode & " " & poNumber & " " & productName & ".pdf"
    
    wsProductionTraveller.ExportAsFixedFormat Type:=xlTypePDF, fileName:=productionTravellerFileName, Quality:=xlQualityStandard
    
    wbProductionTraveller.Close SaveChanges:=False
    
End Function

Function getPrintCopiesfromProduction(masterfolderPath As String, productName As String, customerName As String, procBatchCode As String, _
                                    procFolder As String, BOM As String, poNumber As String, boardLetter As String, QtyToBuild As String, _
                                    solderType As String, ipcClass As String, gerbername As String, gmpName As String, serialNumber As String)

    ' check if print copy exists in production folder
    Dim productionFolderPath As String
    Dim printCopyFileName As String
    Dim fullSourcePath As String
    Dim fullDestPath As String
    
    productionFolderPath = masterfolderPath & "1. CUSTOMERS\" & customerName & "\" & "1. PROD FILES AND QUOTES\" & productName & "\"
    printCopyFileName = "Print Copy DMF - " & BOM & ".xlsx"
    
    ' Full source and destination paths
    fullSourcePath = productionFolderPath & printCopyFileName
    fullDestPath = procFolder & "\" & printCopyFileName
    
    ' Check if file exists
    If Dir(fullSourcePath) <> "" Then
    
        ' open the file and add order details
        Dim wsPrintCopy As Worksheet, wbPrintCopy As Workbook
        Set wbPrintCopy = Workbooks.Open(fullSourcePath)
        Set wsPrintCopy = wbPrintCopy.Sheets(1)
        wbPrintCopy.Windows(1).Visible = False
        
        wsPrintCopy.Shapes("TextBox2").TextFrame.Characters.Text = procBatchCode & "(" & boardLetter & ")" & vbNewLine & poNumber & vbNewLine & serialNumber
        wsPrintCopy.Shapes("TextBox4").TextFrame.Characters.Text = QtyToBuild & vbNewLine & solderType & vbNewLine & ipcClass
        wsPrintCopy.Shapes("TextBox6").TextFrame.Characters.Text = gmpName & vbNewLine & BOM & vbNewLine & gerbername
        
        ' Make proc batch code bold
        Dim lenOfProcBatchCode As Long
        lenOfProcBatchCode = Len(procBatchCode & "(" & boardLetter & ")")
        wsPrintCopy.Shapes("TextBox2").TextFrame.Characters(1, lenOfProcBatchCode).Font.size = 12
        wsPrintCopy.Shapes("TextBox2").TextFrame.Characters(1, lenOfProcBatchCode).Font.Bold = True
        
        Dim outlineBox1 As Shape, outlinebox2 As Shape, outlineBox3 As Shape
        Set outlineBox1 = wsPrintCopy.Shapes.AddShape(msoShapeRectangle, wsPrintCopy.Shapes("TextBox1").Left, wsPrintCopy.Shapes("TextBox1").Top, wsPrintCopy.Shapes("TextBox2").Left + wsPrintCopy.Shapes("TextBox2").Width - wsPrintCopy.Shapes("TextBox1").Left, 44.52)
        Set outlinebox2 = wsPrintCopy.Shapes.AddShape(msoShapeRectangle, wsPrintCopy.Shapes("TextBox3").Left, wsPrintCopy.Shapes("TextBox3").Top, wsPrintCopy.Shapes("TextBox4").Left + wsPrintCopy.Shapes("TextBox4").Width - wsPrintCopy.Shapes("TextBox3").Left, 44.52)
        Set outlineBox3 = wsPrintCopy.Shapes.AddShape(msoShapeRectangle, wsPrintCopy.Shapes("TextBox5").Left, wsPrintCopy.Shapes("TextBox5").Top, wsPrintCopy.Shapes("TextBox6").Left + wsPrintCopy.Shapes("TextBox6").Width - wsPrintCopy.Shapes("TextBox5").Left, 44.52)
        
        With outlineBox1
            .Fill.Visible = msoFalse
            .Line.ForeColor.RGB = RGB(0, 0, 0)
            .Line.Weight = 0.5
            .Name = "TextBoxOutline1"
            .ZOrder msoSendToBack ' Send behind the textboxes
        End With
        
        With outlinebox2
            .Fill.Visible = msoFalse
            .Line.ForeColor.RGB = RGB(0, 0, 0)
            .Line.Weight = 0.5
            .Name = "TextBoxOutline2"
            .ZOrder msoSendToBack ' Send behind the textboxes
        End With
        
        With outlineBox3
            .Fill.Visible = msoFalse
            .Line.ForeColor.RGB = RGB(0, 0, 0)
            .Line.Weight = 0.5
            .Name = "TextBoxOutline3"
            .ZOrder msoSendToBack ' Send behind the textboxes
        End With
    
        wbPrintCopy.Windows(1).Visible = True
        wbPrintCopy.Save
        
        wbPrintCopy.Close
        
        ' now copy the file to Proc Folder
        FileCopy fullSourcePath, fullDestPath
        'MsgBox "Print Copy copied to: " & vbCrLf & fullDestPath, vbInformation
    Else
        'MsgBox "Print Copy not found in: " & vbCrLf & fullSourcePath, vbExclamation
    End If
    

End Function

Private Function CallInputRangeFromUser(ByRef selectedRange As Range, ByRef jobQueue As Worksheet) As String
On Error GoTo leaveit

Set selectedRange = _
       Application.InputBox("Select the cells with Proc Batch Code in Column " & Replace(jobQueue.Cells(1, wsJobQueue_ProcBatchCode_Column).Address(False, False), "1", "") & "", Type:=8)

leaveit:
turnOnUpdates_Calculation
End Function




