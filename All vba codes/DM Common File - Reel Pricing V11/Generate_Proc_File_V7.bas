Attribute VB_Name = "Generate_Proc_File_V7"
Option Explicit

Sub GenerateProcFile()

    turnoffscreenUpdate
    
    getRdesignation
    
    Dim fullPath As String
    Dim folders() As String
    Dim masterFolderName As String, masterFolderPath As String
    Dim procFolderPath As String
    Dim procFileName As String
    Dim procfilePath As String
    Dim customerName As String
    
    Dim wsProcurement As Worksheet
    Set wsProcurement = ThisWorkbook.Sheets("Procurement")
    
    customerName = ThisWorkbook.Sheets("MasterSheet").Range("Customer_Name").value
    fullPath = GetLocalPath(ThisWorkbook.fullName)
    folders = Split(fullPath, "\")
    masterFolderName = folders(UBound(folders) - 2)
    masterFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName) + Len(masterFolderName))
    procFolderPath = masterFolderPath & "6. BACKEND\Proc File Template\"

    procFileName = Dir(procFolderPath & "PROC TEMPLATE*.xlsm")
    procfilePath = procFolderPath & procFileName

    Dim procBatchCode As String
    If ThisWorkbook.Sheets("Mastersheet").Range("Project_Name") <> "" Then
        procBatchCode = ThisWorkbook.Sheets("Mastersheet").Range("Project_Name")
        ThisWorkbook.Sheets("Mastersheet").Range("Project_Name") = "" ' after generating the proc file, clear the project name
    Else
        procBatchCode = UCase(InputBox("Please enter the PROC Batch Code", "PROC BATCH CODE"))
    End If
    
    If procBatchCode = "" Then
        MsgBox "PROC Batch Code invalid.", , "PROC BATCH CODE"
        turnonscreenUpdate
        Exit Sub
    End If

    Dim customerFolderpath As String
    Dim procFolderDPath As String
    
    customerName = folders(UBound(folders) - 2)
    customerFolderpath = Left(fullPath, InStr(1, fullPath, customerName) + Len(customerName))
    procFolderDPath = customerFolderpath & "4. PROC FILE\"

    ' Loop through all folders in the base directory
    Dim folderName As String
    Dim FolderExists As Boolean
    Dim datePrefix As String
    
    'datePrefix = Format(FillDateTimeInCanada, "yymmdd")
    FolderExists = False
    
    folderName = Dir(procFolderDPath, vbDirectory)
    Do While folderName <> ""
        ' Check if it is a valid folder
        If (GetAttr(procFolderDPath & folderName) And vbDirectory) = vbDirectory Then
        ' Extract and compare the batch code part
            'If InStr(folderName, " ") > 0 Then
                'If Trim(Mid(folderName, InStr(folderName, " ") + 1)) = procBatchCode Then
                If folderName = procBatchCode Then
                    FolderExists = True
                    
                    Exit Do
                End If
            'End If
        End If
        folderName = Dir
    Loop

    ' Check if proc folder exists, if not create it
    If Not FolderExists Then
        MsgBox "Proc Folder does not exists. Please create a Proc Folder and try again", , "Abort"
        Exit Sub
    End If
    
    ' subtract BG stock
    subtractBGstock (procBatchCode)

    Dim NewprocFileName As String
    Dim newprocFilePath As String

    NewprocFileName = "PROC " & procBatchCode & ".xlsm"

    ' Check if the proc file already exists
    Dim fileName As String
    fileName = Dir(procFolderDPath & folderName & "\")
    Do While fileName <> ""
        If fileName = NewprocFileName Then
            MsgBox "PROC File " & NewprocFileName & " already exists"
            turnonscreenUpdate
            Exit Sub
        End If
        fileName = Dir
    Loop

    newprocFilePath = procFolderDPath & folderName & "\" & NewprocFileName

    ' Copy the proc template to customer folder
    CopyFile procfilePath, newprocFilePath

    Dim procfile As Workbook
    Dim procSh As Worksheet
    Dim pcbOrdersSh As Worksheet
    Dim dmSh As Worksheet

    Set procfile = Workbooks.Open(newprocFilePath)
    Set procSh = procfile.Sheets("PROC")
    Set pcbOrdersSh = procfile.Sheets("PCB + Stencils Orders")
    Set dmSh = ThisWorkbook.Sheets("MasterSheet")

    ' Open the Job Queue workbook
    Dim jobQueueFileName As String
    Dim jobQueuePath As String
    Dim isJobQueueOpen As Boolean
    Dim wb As Workbook
    
    isJobQueueOpen = False
    
    For Each wb In Application.Workbooks
        If Left(wb.Name, 9) = "Job Queue" And Right(wb.Name, 5) = ".xlsm" Then
            isJobQueueOpen = True
        End If
    Next wb
    
    jobQueuePath = masterFolderPath & "3. JOB QUEUE\" ' Update this with the actual path
    jobQueueFileName = Dir(jobQueuePath & "Job Queue*.xlsm")
    jobQueuePath = jobQueuePath & jobQueueFileName

    Dim jobQueueWB As Workbook
    Dim jobQueueSh As Worksheet

    Set jobQueueWB = Workbooks.Open(jobQueuePath)
    Set jobQueueSh = jobQueueWB.Sheets("Job Queue")

    ' Find rows matching the procBatchCode and column E <> "NREs"
    Dim jobLR As Long
    Dim i As Long
    Dim pcbRow As Long

    initialiseHeaders , jobQueueSh, dmSh, procSh, , , , , , , , , , wsProcurement, pcbOrdersSh

    jobLR = jobQueueSh.Cells(jobQueueSh.Rows.count, Product_Name).End(xlUp).Row
    pcbRow = 2 ' Starting row in "PCB + Stencils Orders" sheet

    For i = 2 To jobLR  ' Assuming headers are in row 1
        If jobQueueSh.Cells(i, Proc_Batch_Code).value = procBatchCode And jobQueueSh.Cells(i, Order_Type).value <> "NREs" Then
            ' Write value to PCB + Stencils Orders sheet
            pcbOrdersSh.Cells(pcbRow, ProcFile_PCBorderSheet_GMPname_Column).value = jobQueueSh.Cells(i, Product_Name).value
            pcbOrdersSh.Cells(pcbRow, ProcFile_PCBorderSheet_BOMname_Column).value = jobQueueSh.Cells(i, BOM_Name).value
            pcbOrdersSh.Cells(pcbRow, ProcFile_PCBorderSheet_GerberName_Column).value = jobQueueSh.Cells(i, Gerber_Name).value
            pcbOrdersSh.Cells(pcbRow, ProcFile_PCBorderSheet_StencilNumber_Column).value = jobQueueSh.Cells(i, Stencil_Name).value
            pcbOrdersSh.Cells(pcbRow, ProcFile_PCBorderSheet_BoardLetter_Column).value = jobQueueSh.Cells(i, jobQueue_BoardLetter_Column).value
            pcbOrdersSh.Cells(pcbRow, ProcFile_PCBorderSheet_Qty_Column).value = jobQueueSh.Cells(i, qty).value
            pcbRow = pcbRow + 1
        End If
    Next i
    
    ' Save job Queue
    jobQueueWB.Save

    ' Close the Job Queue workbook
    If isJobQueueOpen Then
    Else
        jobQueueWB.Close SaveChanges:=False
    End If
    

    Dim j As Long
    Dim dmLR As Long
    
    dmLR = dmSh.Cells(dmSh.Rows.count, Master_CPC_Column).End(xlUp).Row
    j = 5
    
    turnoffscreenUpdate
    
    For i = 4 To dmLR
        procSh.Cells(j, Procsheet_QtyPerBoard_Column) = dmSh.Cells(i, Master_Quantity_Column)
        procSh.Cells(j, Procsheet_CPC_Column) = dmSh.Cells(i, Master_CPC_Column)
        procSh.Cells(j, Procsheet_CustomerDescription_Column) = dmSh.Cells(i, Master_Description_Column)
        procSh.Cells(j, Procsheet_CustomerMPN_Column) = dmSh.Cells(i, Master_MFRHas_Column)
        procSh.Cells(j, Procsheet_CustomerMFR_Column) = dmSh.Cells(i, Master_ManufacturerName_Column)
        procSh.Cells(j, Procsheet_Mcodes_Column) = dmSh.Cells(i, Master_Mcodes_Column)
        procSh.Cells(j, Procsheet_MFRtoUse_Column) = dmSh.Cells(i, Master_MFR_Column)
        procSh.Cells(j, Procsheet_PNTOUSE_Column) = dmSh.Cells(i, Master_PNTOUSE_Column)
        procSh.Cells(j, Procsheet_DistUnitPrice_Column) = dmSh.Cells(i, Master_UnitPrice_Column)
        procSh.Cells(j, Procsheet_DistStock_Column) = dmSh.Cells(i, Master_QTYAvlble_Column)
        procSh.Cells(j, Procsheet_DistName_Column) = dmSh.Cells(i, Master_Distrib1_Column)
        procSh.Cells(j, Procsheet_DistPN_Column) = dmSh.Cells(i, Master_DistributorPartnumber_Column)
        procSh.Cells(j, Procsheet_Notes_Column) = dmSh.Cells(i, Master_Notes_Column)
        procSh.Cells(j, Procsheet_BoardName_Column) = dmSh.Cells(i, Master_Result_Column)
        procSh.Cells(j, Procsheet_XQty_Column) = dmSh.Cells(i, Master_XQuant_Column)
        procSh.Cells(j, Procsheet_EXTRA_Column) = dmSh.Cells(i, Master_EXTRA_Column)
        procSh.Cells(j, Procsheet_ORDERQTY_Column) = dmSh.Cells(i, Master_ORDERQTY_Column)
        procSh.Cells(j, Procsheet_StockAtRS_Column) = dmSh.Cells(i, Master_StockatRS_Column)
        procSh.Cells(j, Procsheet_BGorSS_Column) = dmSh.Cells(i, Master_FeederType_Column)
        procSh.Cells(j, Procsheet_ncrFlag_Column) = dmSh.Cells(i, Master_ncrFlag_Column)
        
        If dmSh.Cells(i, Master_BGStockStatus_Column) = "IN STOCK" And dmSh.Cells(i, Master_FeederType_Column) = "BG" Then
            procSh.Cells(j, Procsheet_Placetobuy_Column) = "zzBGstock"
            procSh.Cells(j, Procsheet_OrderStatus_Column) = "Complete"
        ElseIf dmSh.Cells(i, Master_BGStockStatus_Column) = "RESTOCK" And dmSh.Cells(i, Master_FeederType_Column) = "BG" Then
            procSh.Cells(j, Procsheet_Placetobuy_Column) = "zzBGneedtobuy"
        ElseIf dmSh.Cells(i, Master_BGStockStatus_Column) = "IN STOCK" And dmSh.Cells(i, Master_FeederType_Column) = "SS" Then
            procSh.Cells(j, Procsheet_Placetobuy_Column) = "zzSafetyStock"
            procSh.Cells(j, Procsheet_OrderStatus_Column) = "Complete"
        ElseIf dmSh.Cells(i, Master_BGStockStatus_Column) = "RESTOCK" And dmSh.Cells(i, Master_FeederType_Column) = "SS" Then
            procSh.Cells(j, Procsheet_Placetobuy_Column) = "zzSSneedtobuy"
        End If
        procSh.Cells(j, Procsheet_LCSCPN_Column) = dmSh.Cells(i, Master_LCSCPN_Column)
        procSh.Cells(j, Procsheet_RDesignation_Column) = dmSh.Cells(i, Master_RDesignation_Column)
        
        ' Dropdown list for order status
        
        With procSh.Cells(j, Procsheet_OrderStatus_Column)
            .Validation.Delete
            .Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, Formula1:="Complete,Ask Manager,RFQ sent waiting for Price"
            .Validation.IgnoreBlank = True
            .Validation.InCellDropdown = True
            .Validation.ShowInput = True
            .Validation.ShowError = False
            
        End With
        
        ' update the proc batch code in Procurement sheet
        On Error Resume Next
        wsProcurement.Cells(wsProcurement.Columns(wsProcurement_cpc_column).Find(What:=dmSh.Cells(i, Master_CPC_Column), LookAt:=xlWhole, MatchCase:=False).Row, wsProcurement_procsUsed_column) = wsProcurement.Cells(wsProcurement.Columns(wsProcurement_cpc_column).Find(What:=dmSh.Cells(i, Master_CPC_Column), LookAt:=xlWhole, MatchCase:=False).Row, wsProcurement_procsUsed_column) & procBatchCode & ", "
        On Error GoTo 0
        
        j = j + 1
    Next i
    
    Dim procLR As Integer
    procLR = procSh.Cells(procSh.Rows.count, Procsheet_CPC_Column).End(xlUp).Row
    
    procSh.Range(procSh.Cells(4, 1), procSh.Cells(procLR, procSh.UsedRange.Columns.count)).Borders.LineStyle = xlContinuous
    
    ' generate labels
    ' Call the macro from the newly opened workbook
    Application.Run "'" & procfile.Name & "'!generateLabels"
    
    
    turnonscreenUpdate
    
    MsgBox "Proc file generation completed.", vbInformation

End Sub


