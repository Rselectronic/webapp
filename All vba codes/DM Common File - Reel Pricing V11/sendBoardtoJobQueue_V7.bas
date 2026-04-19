Attribute VB_Name = "sendBoardtoJobQueue_V7"
Option Explicit

Public Hiddencolumnnamesarray() As Double

Sub sendtoJOBQUEUE()
On Error GoTo ErrHandler

turnoffscreenUpdate
    
    Dim wsStencilsPositions As Worksheet
    Dim JOB_QUEUE As Worksheet
    Dim inputWS As Worksheet
    Dim jobQueue_Workbook As Workbook, cxDetails As Worksheet
    Dim fullPath As String
    Dim masterFolderName As String
    Dim masterFolderPath As String
    Dim jobQueuePath As String
    Dim folders() As String
    Dim jobQueueFileName As String
    Dim lRow As Long
    Dim i As Long
    Dim jobQueue_Admin As Worksheet
    Dim col As Integer
    Dim wbNCRLog As Workbook, wsNCRLog As Worksheet
    Dim ncrLogFilePath As String
    
    Dim cxRow As Integer
    Dim customerAbb As String, customerName As String
    Dim payTerms As String
    
    ''New Variables added
    Dim findrng As Range

    Set inputWS = ThisWorkbook.Sheets("DataInputSheets")
    
    'Define paths
    fullPath = GetLocalPath(ThisWorkbook.fullName)
    
    'Split the path string using backslash as delimiter
    folders = Split(fullPath, "\")
    masterFolderName = folders(UBound(folders) - 2)
    masterFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName, vbTextCompare) + Len(masterFolderName))
    jobQueuePath = masterFolderPath & "3. JOB QUEUE\"
    jobQueueFileName = Dir(jobQueuePath & "Job*.xlsm")
    jobQueuePath = jobQueuePath & jobQueueFileName
    
    ' Open JOB QUEUE File
    Set jobQueue_Workbook = Workbooks.Open(jobQueuePath)
    Set JOB_QUEUE = jobQueue_Workbook.Sheets("Job Queue")
    Set jobQueue_Admin = jobQueue_Workbook.Sheets("Admin")
    
    ' set NCR Log workbook
    ncrLogFilePath = masterFolderPath & "8. QUALITY CONTROL\NCR\"
    ncrLogFilePath = ncrLogFilePath & Dir(ncrLogFilePath & "NCR LOGS.xlsx", vbDirectory)
    Set wbNCRLog = Workbooks.Open(ncrLogFilePath)
    Set wsNCRLog = wbNCRLog.Sheets("NCR Received")
    
    ''Update
    'unhide all the columns in Job Queue
     UnHideColumns_Jobqueue JOB_QUEUE
     Set wsStencilsPositions = ThisWorkbook.Sheets("Stencils Positions")
     initialiseHeaders inputWS, JOB_QUEUE, , , , , , , , , jobQueue_Admin, , , , , wsStencilsPositions
     inputWS.Activate
     lRow = inputWS.Cells(inputWS.Rows.count, DM_SNo_Column).End(xlUp).Row
     
''Main Loop for Putting data in Job Queue
Dim jobLastrow As Long
Dim jobLastColumn As Long
Dim jobLastColumnLetter As String
Dim GMP As String
Dim bom As String
Dim gerber As String
Dim activeQty As Integer
Dim UnitPrice As Double
Dim DueDateformula As String

For i = 6 To lRow

If inputWS.Cells(i, DM_ActiveQty_Column) > 0 Then
    
    'customer Details
    customerAbb = inputWS.Cells(i, DM_Customer_Column)
        
    ''Update
    Set findrng = jobQueue_Admin.Columns(Jobqueue_adminSheet_CustomerAbbreviation_Column).Find(What:=customerAbb, LookIn:=xlValues, LookAt:=xlWhole)
        
    If Not findrng Is Nothing Then
           cxRow = findrng.Row
    Else
           cxRow = 0
    End If
    ''/
        
    If cxRow = 0 Then
            'MsgBox ("Customer Name in DM File Name is not matching with the name on Job Queue Admin Sheet Column ""B""")
            MsgBox """" & (inputWS.Cells(i, DM_Customer_Column) & """" & " Customer Name in DM File is not matching with the name on Job Queue Admin Sheet Column ""B""")
            Exit Sub
    End If
    
    payTerms = jobQueue_Admin.Cells(cxRow, Jobqueue_adminSheet_cxTerms_Column) ' Payment Terms
    
    ''Updated
    jobLastrow = JOB_QUEUE.Cells(JOB_QUEUE.Rows.count, Product_Name).End(xlUp).Row
    jobLastColumn = JOB_QUEUE.Cells(3, JOB_QUEUE.Columns.count).End(xlToLeft).Column
    jobLastColumnLetter = ColumnToLetter(jobLastColumn)
    
    GMP = inputWS.Cells(i, DM_GlobalMFRPackage_Column)
    bom = inputWS.Cells(i, DM_BomName_Column)
    gerber = inputWS.Cells(i, DM_PCBName_Column)
    
    'UserForm2.ShowForm JOB_QUEUE, jobLastrow, GMP, inputWS, i
    'jobQueue_Workbook.Save
    
    ''Updated
    JOB_QUEUE.Cells(jobLastrow + 1, Year_Column).FormulaR1C1 = "=IF(RC" & Invoice_Date & "<>"""",IF(VALUE(TEXT(RC" & Invoice_Date & ",""m""))<11,VALUE(TEXT(RC" & Invoice_Date & ",""yyyy"")),VALUE((TEXT(RC" & Invoice_Date & ",""yyyy"")+1))),"""")"
    
    JOB_QUEUE.Cells(jobLastrow + 1, Customer) = customerAbb            'Customer Name
    JOB_QUEUE.Cells(jobLastrow + 1, PO_Date) = Date
    JOB_QUEUE.Cells(jobLastrow + 1, Product_Name) = GMP                           'Board Name
    JOB_QUEUE.Cells(jobLastrow + 1, BOM_Name) = bom                               'BOM Name
    JOB_QUEUE.Cells(jobLastrow + 1, Gerber_Name) = gerber                         'Gerber Name
    JOB_QUEUE.Cells(jobLastrow + 1, Order_Type) = ""                       'Order Type
    
    JOB_QUEUE.Cells(jobLastrow + 1, jobQueue_SolderType_Column) = inputWS.Cells(i, DM_solderType_Column)
    JOB_QUEUE.Cells(jobLastrow + 1, jobQueue_IPCclass_Column) = inputWS.Cells(i, DM_ipcClass_Column)
    
    JOB_QUEUE.Cells(jobLastrow + 1, QTE) = inputWS.Cells(i, DM_QTEwithRevisions_Column)                 'Quote #
    JOB_QUEUE.Cells(jobLastrow + 1, qty) = inputWS.Cells(i, DM_ActiveQty_Column)                  'Qty
        
    ''Updated
    JOB_QUEUE.Cells(jobLastrow + 1, MCODES_Summary) = inputWS.Cells(i, DM_MCODESSummary_Column) 'MCODES Summary
    JOB_QUEUE.Cells(jobLastrow + 1, Order_Status) = "7. PO Received"  'Order Status
    
    ''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
    
            'JOB_QUEUE.Cells(jobLastrow + 1, Stencil_Name) = inputWS.Cells(i, DM_StencilName_Column) 'Stencil Name
            Dim wsStencilsPositionslrow As Double, jj As Double
            Dim wsStencilsPositions_Gmp As String, wsStencilsPositions_Stencil As String
            Dim wsStencilsPositions_ArrayGmp() As String, Arrayloop As Double
            Dim wsStencilsPositions_ConcateStencil As String
            
            wsStencilsPositionslrow = wsStencilsPositions.Cells(Rows.count, wsStencilsPositions_StencilName_Column).End(xlUp).Row
            wsStencilsPositions_ConcateStencil = ""
            
            For jj = 2 To wsStencilsPositionslrow
                wsStencilsPositions_Gmp = wsStencilsPositions.Cells(jj, wsStencilsPositions_GMPName_Column).value
                wsStencilsPositions_Stencil = wsStencilsPositions.Cells(jj, wsStencilsPositions_StencilName_Column).value
                
                If wsStencilsPositions_Gmp = "" Or wsStencilsPositions_Stencil = "" Then GoTo skipthis
                wsStencilsPositions_ArrayGmp = Split(wsStencilsPositions_Gmp, ";")
                
                For Arrayloop = LBound(wsStencilsPositions_ArrayGmp) To UBound(wsStencilsPositions_ArrayGmp)
                    If Trim(UCase(wsStencilsPositions_ArrayGmp(Arrayloop))) = Trim(UCase(GMP)) Then
                       wsStencilsPositions_ConcateStencil = wsStencilsPositions_ConcateStencil & wsStencilsPositions.Cells(jj, wsStencilsPositions_PositionNo_Column).value & ", " & wsStencilsPositions.Cells(jj, wsStencilsPositions_StencilName_Column).value & " and "
                    End If
                Next Arrayloop
skipthis:
            Next jj
            
            If wsStencilsPositions_ConcateStencil <> "" Then
              JOB_QUEUE.Cells(jobLastrow + 1, Stencil_Name) = Mid(wsStencilsPositions_ConcateStencil, 1, Len(wsStencilsPositions_ConcateStencil) - 5)
            End If
            
    '''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
       
    ''Updated
    JOB_QUEUE.Cells(jobLastrow + 1, Pricing_Status).FormulaR1C1 = "=IF(RC" & Unit_Price_in_PO & "="""","""",IF(RC" & Unit_Price_in_PO & "=RC" & Unit_Price_in_Quote & ",""Good to go"",""Need to Fix""))"

    JOB_QUEUE.Cells(jobLastrow + 1, cx_Terms) = payTerms
    ' calculate the Payment due date based on CX Terms
    
    ''Updated
    If payTerms = "COD" Then
    DueDateformula = "=If(RC" & Invoice_Date & "="""","""",RC" & Invoice_Date & "+0)"
    ElseIf payTerms = "NET 45" Then
    DueDateformula = "=If(RC" & Invoice_Date & "="""","""",RC" & Invoice_Date & "+45)"
    ElseIf payTerms = "NET 30" Then
    DueDateformula = "=If(RC" & Invoice_Date & "="""","""",RC" & Invoice_Date & "+30)"
    End If

    JOB_QUEUE.Cells(jobLastrow + 1, Payment_DueDate).FormulaR1C1 = DueDateformula ' Payment Due Date
    JOB_QUEUE.Cells(jobLastrow + 1, Payment_DueDate).NumberFormat = "m/d/yyyy"
    
    inputWS.Cells(i, DM_LastOrderDate_Column) = Now()
    inputWS.Cells(i, DM_LastOrderDate_Column).NumberFormat = "mm/dd/yyyy"
    
    'get the unit price based on Active Quantity (Order Quantity)

    activeQty = inputWS.Cells(i, DM_ActiveQty_Column)
    
    If activeQty <= inputWS.Cells(i, DM_QTY1_Column) Then
       UnitPrice = inputWS.Cells(i, DM_UnitPrice1_Column)
    ElseIf activeQty >= inputWS.Cells(i, DM_QTY1_Column) And activeQty < inputWS.Cells(i, DM_QTY2_Column) Then
       UnitPrice = inputWS.Cells(i, DM_UnitPrice1_Column)
    ElseIf activeQty >= inputWS.Cells(i, DM_QTY2_Column) And activeQty < inputWS.Cells(i, DM_QTY3_Column) Then
       UnitPrice = inputWS.Cells(i, DM_UnitPrice2_Column)
    ElseIf activeQty >= inputWS.Cells(i, DM_QTY3_Column) And activeQty < inputWS.Cells(i, DM_QTY4_Column) Then
       UnitPrice = inputWS.Cells(i, DM_UnitPrice3_Column)
    ElseIf activeQty >= inputWS.Cells(i, DM_QTY4_Column) Then
       UnitPrice = inputWS.Cells(i, DM_UnitPrice4_Column)
    End If
    
    JOB_QUEUE.Cells(jobLastrow + 1, Unit_Price_in_Quote) = UnitPrice  'Unit Price in Quote
    JOB_QUEUE.Cells(jobLastrow + 1, Unit_Price_in_Quote).NumberFormat = "_-$* #,##0.00_-;-$* #,##0.00_-;_-$* "" - ""??_-;_-@_-"
    
    ''Updated
    JOB_QUEUE.Cells(jobLastrow + 1, Gross_Amount).FormulaR1C1 = "=RC" & Unit_Price_in_PO & "*RC" & qty & ""
    JOB_QUEUE.Cells(jobLastrow + 1, Gross_Amount).NumberFormat = "_-$* #,##0.00_-;-$* #,##0.00_-;_-$* "" - ""??_-;_-@_-"
    
    ''Update New Column Values

    Dim CalculateDeliveryDateStatus As String, inputWSrng As Range
    
    If activeQty <= inputWS.Cells(i, DM_QTY1_Column) Then
       Set inputWSrng = inputWS.Cells(i, DM_L1MinLeadTime_Column)
    ElseIf activeQty >= inputWS.Cells(i, DM_QTY1_Column) And activeQty < inputWS.Cells(i, DM_QTY2_Column) Then
       Set inputWSrng = inputWS.Cells(i, DM_L1MinLeadTime_Column)
    ElseIf activeQty >= inputWS.Cells(i, DM_QTY2_Column) And activeQty < inputWS.Cells(i, DM_QTY3_Column) Then
       Set inputWSrng = inputWS.Cells(i, DM_L2MinLeadTime_Column)
    ElseIf activeQty >= inputWS.Cells(i, DM_QTY3_Column) And activeQty < inputWS.Cells(i, DM_QTY4_Column) Then
       Set inputWSrng = inputWS.Cells(i, DM_L2MinLeadTime_Column)
    ElseIf activeQty >= inputWS.Cells(i, DM_QTY4_Column) Then
       Set inputWSrng = inputWS.Cells(i, DM_L2MinLeadTime_Column)
    End If
    
    If inputWSrng.value <> vbNullString And IsNumeric(inputWSrng.value) <> False Then
       JOB_QUEUE.Cells(jobLastrow + 1, MinDeliveryDate_Column).Formula = _
         "=IF(TEXT(" & JOB_QUEUE.Cells(jobLastrow + 1, PO_Date).Address(False, False) _
         & " + (" & inputWSrng.value & "*7),""DDDD"") = ""Saturday"", " _
         & JOB_QUEUE.Cells(jobLastrow + 1, PO_Date).Address(False, False) _
         & " + (" & inputWSrng.value & "*7) +2,IF(TEXT(" & JOB_QUEUE.Cells(jobLastrow + 1, PO_Date).Address(False, False) _
         & " + (" & inputWSrng.value & "*7),""DDDD"") = ""Sunday"", " & JOB_QUEUE.Cells(jobLastrow + 1, PO_Date).Address(False, False) _
         & " + (" & inputWSrng.value & "*7) +1," & JOB_QUEUE.Cells(jobLastrow + 1, PO_Date).Address(False, False) _
         & " + (" & inputWSrng.value & "*7)))"
    End If
    
    If activeQty <= inputWS.Cells(i, DM_QTY1_Column) Then
       Set inputWSrng = inputWS.Cells(i, DM_L1MaxLeadTime_Column)
    ElseIf activeQty >= inputWS.Cells(i, DM_QTY1_Column) And activeQty < inputWS.Cells(i, DM_QTY2_Column) Then
       Set inputWSrng = inputWS.Cells(i, DM_L1MaxLeadTime_Column)
    ElseIf activeQty >= inputWS.Cells(i, DM_QTY2_Column) And activeQty < inputWS.Cells(i, DM_QTY3_Column) Then
       Set inputWSrng = inputWS.Cells(i, DM_L2MaxLeadTime_Column)
    ElseIf activeQty >= inputWS.Cells(i, DM_QTY3_Column) And activeQty < inputWS.Cells(i, DM_QTY4_Column) Then
       Set inputWSrng = inputWS.Cells(i, DM_L2MaxLeadTime_Column)
    ElseIf activeQty >= inputWS.Cells(i, DM_QTY4_Column) Then
       Set inputWSrng = inputWS.Cells(i, DM_L2MaxLeadTime_Column)
    End If

    If inputWSrng.value <> vbNullString And IsNumeric(inputWSrng.value) <> False Then
      JOB_QUEUE.Cells(jobLastrow + 1, MaxDeliveryDate_Column).Formula = _
         "=IF(TEXT(" & JOB_QUEUE.Cells(jobLastrow + 1, PO_Date).Address(False, False) _
         & " + (" & inputWSrng.value & "*7),""DDDD"") = ""Saturday"", " _
         & JOB_QUEUE.Cells(jobLastrow + 1, PO_Date).Address(False, False) _
         & " + (" & inputWSrng.value & "*7) +2,IF(TEXT(" & JOB_QUEUE.Cells(jobLastrow + 1, PO_Date).Address(False, False) _
         & " + (" & inputWSrng.value & "*7),""DDDD"") = ""Sunday"", " & JOB_QUEUE.Cells(jobLastrow + 1, PO_Date).Address(False, False) _
         & " + (" & inputWSrng.value & "*7) +1," & JOB_QUEUE.Cells(jobLastrow + 1, PO_Date).Address(False, False) _
         & " + (" & inputWSrng.value & "*7)))"
    End If
         
    Dim AddressInvoiceDate As String
    
    AddressInvoiceDate = ""
    AddressInvoiceDate = JOB_QUEUE.Cells(jobLastrow + 1, Invoice_Date).Address(False, False)
    JOB_QUEUE.Cells(jobLastrow + 1, Quarter_Column).Formula = _
    "=IF(" & AddressInvoiceDate & " = """","""",IF(TEXT(" & AddressInvoiceDate _
    & ",""MMMM"") = ""November"",""Q1"",IF(TEXT(" & AddressInvoiceDate _
    & ",""MMMM"") = ""December"",""Q1"",IF(TEXT(" & AddressInvoiceDate _
    & ",""MMMM"") = ""January"",""Q1"",IF(TEXT(" & AddressInvoiceDate _
    & ",""MMMM"") = ""February"",""Q2"",IF(TEXT(" & AddressInvoiceDate _
    & ",""MMMM"") = ""March"",""Q2"",IF(TEXT(" & AddressInvoiceDate _
    & ",""MMMM"") = ""April"",""Q2"",IF(TEXT(" & AddressInvoiceDate _
    & ",""MMMM"") = ""May"",""Q3"",IF(TEXT(" & AddressInvoiceDate _
    & ",""MMMM"") = ""June"",""Q3"",IF(TEXT(" & AddressInvoiceDate _
    & ",""MMMM"") = ""July"",""Q3"",IF(TEXT(" & AddressInvoiceDate _
    & ",""MMMM"") = ""August"",""Q4"",IF(TEXT(" & AddressInvoiceDate _
    & ",""MMMM"") = ""September"",""Q4"",IF(TEXT(" & AddressInvoiceDate _
    & ",""MMMM"") = ""October"",""Q4"","""")))))))))))))"
            
    'create a data validation also
    With JOB_QUEUE.Range(JOB_QUEUE.Cells(jobLastrow + 1, jobQueue_billingAddress_Column), JOB_QUEUE.Cells(jobLastrow + 1, jobQueue_billingAddress_Column)).Validation
        .Delete
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:= _
        xlBetween, Formula1:="=BillingAddress"
        .IgnoreBlank = True
        .InCellDropdown = True
        .ShowInput = True
        .ShowError = True
    End With
    
    With JOB_QUEUE.Range(JOB_QUEUE.Cells(jobLastrow + 1, jobQueue_shippingAddress_Column), JOB_QUEUE.Cells(jobLastrow + 1, jobQueue_shippingAddress_Column)).Validation
        .Delete
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:= _
        xlBetween, Formula1:="=ShippingAddress"
        .IgnoreBlank = True
        .InCellDropdown = True
        .ShowInput = True
        .ShowError = True
    End With
    
    With JOB_QUEUE.Range(JOB_QUEUE.Cells(jobLastrow + 1, jobQueue_SerialNumberRequired_Column), JOB_QUEUE.Cells(jobLastrow + 1, jobQueue_SerialNumberRequired_Column)).Validation
        .Delete ' Clear any existing validation
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, Formula1:="Yes,No"
    End With
    
    ' Order Status dropdown in Job Queue. Code V3
    Dim orderStatusList As Range
    On Error Resume Next
    Set orderStatusList = jobQueue_Admin.Range("Order_Status")
    On Error GoTo 0
    
    If orderStatusList Is Nothing Then
    Else
        ' create the dropdown list
        With JOB_QUEUE.Range(JOB_QUEUE.Cells(jobLastrow + 1, Order_Status), JOB_QUEUE.Cells(jobLastrow + 1, Order_Status)).Validation
            .Delete
            .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:= _
            xlBetween, Formula1:="=" & orderStatusList.Address(External:=True)
            .IgnoreBlank = True
            .InCellDropdown = True
            .ShowInput = True
            .ShowError = True
        End With
    End If
    
    ' Pricing status dropdown in Job Queue. Code V3
    Dim pricingStatusList As Range
    On Error Resume Next
    Set pricingStatusList = jobQueue_Admin.Range("PO_Status")
    On Error GoTo 0
    
    If pricingStatusList Is Nothing Then
    Else
        'create dropdown
        With JOB_QUEUE.Range(JOB_QUEUE.Cells(jobLastrow + 1, Pricing_Status), JOB_QUEUE.Cells(jobLastrow + 1, Pricing_Status)).Validation
            .Delete
            .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:= _
            xlBetween, Formula1:="=" & pricingStatusList.Address(External:=True)
            .IgnoreBlank = True
            .InCellDropdown = True
            .ShowInput = True
            .ShowError = True
        End With
    End If
    
    ' Order Type dropdown in Job Queue. Code V3
    Dim orderTypeList As Range
    On Error Resume Next
    Set orderTypeList = jobQueue_Admin.Range("Order_Type")
    On Error GoTo 0
    
    If orderTypeList Is Nothing Then
    Else
        'create dropdown
        With JOB_QUEUE.Range(JOB_QUEUE.Cells(jobLastrow + 1, Order_Type), JOB_QUEUE.Cells(jobLastrow + 1, Order_Type)).Validation
            .Delete
            .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:= _
            xlBetween, Formula1:="=" & orderTypeList.Address(External:=True)
            .IgnoreBlank = True
            .InCellDropdown = True
            .ShowInput = True
            .ShowError = True
        End With
    End If

    
    ' send the default address labels for billing and shipping address
   
    JOB_QUEUE.Cells(jobLastrow + 1, jobQueue_billingAddress_Column) = customerAbb & " - Default"
    JOB_QUEUE.Cells(jobLastrow + 1, jobQueue_shippingAddress_Column) = customerAbb & " - Default"
   
            
            
    ' Apply font
    JOB_QUEUE.Rows(jobLastrow + 1).Font.Name = "Calibri"
    JOB_QUEUE.Rows(jobLastrow + 1).Font.size = 12
    
    
    ' check the NCR flag
    JOB_QUEUE.Cells(jobLastrow + 1, jobQueue_ncrFlag_Column) = getNcrFlag(GMP, wsNCRLog)
    
    
    
    ' Apply borders to Row 3 till column W
   With JOB_QUEUE.Range("A" & jobLastrow + 1 & ":" & jobLastColumnLetter & jobLastrow + 1).Borders
        .LineStyle = xlContinuous
        .Color = vbBlack
        .Weight = xlThin
    End With
        
    ' generate the Print Copy in the production folder
    GeneratePrintCopy masterFolderPath, customerAbb, GMP, bom
        
End If

Next i

''Update
'code to hide the columns again
ReHideColumns_Jobqueue JOB_QUEUE
''/

turnonscreenUpdate
Exit Sub
ErrHandler:
turnonscreenUpdate
MsgBox Err.Description, vbExclamation, "Macro"
End Sub

Function ColumnToLetter(col As Long) As String
    Dim columnLetter As String
    columnLetter = Split(Cells(1, col).Address, "$")(1)
    ColumnToLetter = columnLetter
End Function

Public Function UnHideColumns_Jobqueue(JOB_QUEUE As Worksheet) As String
On Error GoTo Errhh

''Update
'unhide all the columns in Job Queue
    
    Dim JOB_QUEUE_LCol As Double, i As Double
    
    JOB_QUEUE_LCol = JOB_QUEUE.UsedRange.Columns.count
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




'========================
'   FILE SAVE HELPERS
'========================

Private Function SanitizeFileName(ByVal s As String, Optional ByVal maxLen As Long = 180) As String
    Dim bad As Variant, i As Long

    bad = Array("\", "/", ":", "*", "?", """", "<", ">", "|", "[", "]")
    For i = LBound(bad) To UBound(bad)
        s = Replace$(s, bad(i), "_")
    Next i

    s = Trim$(s)

    ' Windows doesn't like trailing dots/spaces in file names
    Do While Len(s) > 0 And (Right$(s, 1) = "." Or Right$(s, 1) = " ")
        s = Left$(s, Len(s) - 1)
    Loop

    ' avoid extremely long names
    If Len(s) > maxLen Then s = Left$(s, maxLen)

    SanitizeFileName = s
End Function

Private Sub EnsureFolderExists(ByVal folderPath As String)
    ' Creates nested folders if needed
    Dim parts() As String, p As String, i As Long

    folderPath = Replace(folderPath, "/", "\")
    If Right$(folderPath, 1) <> "\" Then folderPath = folderPath & "\"

    parts = Split(folderPath, "\")
    p = parts(0) & "\"

    For i = 1 To UBound(parts)
        If parts(i) <> vbNullString Then
            p = p & parts(i) & "\"
            If Len(Dir(p, vbDirectory)) = 0 Then
                MkDir p
            End If
        End If
    Next i
End Sub

Private Function IsWorkbookOpenByName(ByVal fullName As String) As Boolean
    Dim wb As Workbook
    For Each wb In Application.Workbooks
        If StrComp(wb.fullName, fullName, vbTextCompare) = 0 Then
            IsWorkbookOpenByName = True
            Exit Function
        End If
    Next wb
    IsWorkbookOpenByName = False
End Function

Private Sub SaveAsWithRetry(ByVal wb As Workbook, _
                            ByVal fullName As String, _
                            Optional ByVal attempts As Long = 6, _
                            Optional ByVal waitSeconds As Long = 1, _
                            Optional ByVal deleteIfExists As Boolean = True)

    Dim n As Long
    Dim saveErrNumber As Long
    Dim saveErrDesc As String

    ' Basic guards
    If Len(fullName) = 0 Then Err.Raise 5, "SaveAsWithRetry", "Empty file path."
    If IsWorkbookOpenByName(fullName) Then
        Err.Raise 70, "SaveAsWithRetry", "Target workbook is already open: " & fullName
    End If

    ' Optionally delete existing file first
    If deleteIfExists Then
        On Error Resume Next
        If Len(Dir(fullName)) > 0 Then Kill fullName
        On Error GoTo 0
    End If

    For n = 1 To attempts
        On Error Resume Next
        wb.SaveAs fileName:=fullName, FileFormat:=xlOpenXMLWorkbook
        If Err.Number = 0 Then
            On Error GoTo 0
            Exit Sub
        End If

        saveErrNumber = Err.Number
        saveErrDesc = Err.Description
        Err.Clear
        On Error GoTo 0

        DoEvents
        If waitSeconds < 1 Then waitSeconds = 1
        Application.Wait Now + TimeSerial(0, 0, waitSeconds)

        If n = attempts Then
            Err.Raise saveErrNumber, "SaveAsWithRetry", saveErrDesc & " (path: " & fullName & ")"
        End If
    Next n
End Sub

'========================
'   YOUR FUNCTION
'========================

Public Function GeneratePrintCopy(masterFolderPath As String, customerAbb As String, GMP As String, bom As String)

    Dim productionFolderPath As String
    Dim wsBOM As Worksheet
    Dim printCopyFileName As String
    Dim targetFullName As String

    Dim fName As String
    Dim wbNew As Workbook
    Dim wsNew As Worksheet
    Dim lastRow As Long, newRow As Long
    Dim colMap As Object, seenCPC As Object
    Dim colHeaders As Variant
    Dim i As Long, j As Long
    Dim cpcVal As String

    Set wsBOM = ThisWorkbook.Sheets(GMP)

    productionFolderPath = masterFolderPath & "1. CUSTOMERS\" & customerAbb & "\1. PROD FILES AND QUOTES\" & GMP & "\"
    EnsureFolderExists productionFolderPath

    printCopyFileName = "Print Copy DMF - " & SanitizeFileName(bom) & ".xlsx"
    targetFullName = productionFolderPath & printCopyFileName

    ' Delete existing Print Copies (your original behavior)
    fName = Dir(productionFolderPath & "*.xlsx")
    Do While fName <> ""
        If LCase$(Left$(fName, 10)) = "print copy" Then
            On Error Resume Next
            Kill productionFolderPath & fName
            On Error GoTo 0
        End If
        fName = Dir
    Loop

    ' Create new workbook
    Set wbNew = Workbooks.Add(xlWBATWorksheet)
    Set wsNew = wbNew.Sheets(1)
    wsNew.Name = "Print Copy"

    ' Title
    With wsNew.Cells(1, 1)
        .value = GMP
        .Font.Bold = True
        .Font.size = 24
    End With

    ' Headers to extract
    colHeaders = Array("QTY", "R DES.", "CPC #", "Description", "Disrtib Part#", "MFR Name", "M CODES")

    Set colMap = CreateObject("Scripting.Dictionary")
    Set seenCPC = CreateObject("Scripting.Dictionary")

    ' Map headers to columns
    For i = 1 To wsBOM.Cells(3, wsBOM.Columns.count).End(xlToLeft).Column
        If Not IsEmpty(wsBOM.Cells(3, i).value) Then
            colMap(Trim$(wsBOM.Cells(3, i).value)) = i
        End If
    Next i

    ' Write headers
    For i = 0 To UBound(colHeaders)
        wsNew.Cells(3, i + 1).value = colHeaders(i)
    Next i
    wsNew.Range("A3:G3").Font.Bold = True

    lastRow = wsBOM.Cells(wsBOM.Rows.count, "G").End(xlUp).Row
    newRow = 4

    ' Unique CPC rows
    For i = 4 To lastRow
        If colMap.Exists("CPC #") Then
            cpcVal = Trim$(wsBOM.Cells(i, colMap("CPC #")).value)
        Else
            cpcVal = vbNullString
        End If

        If Len(cpcVal) > 0 And Not seenCPC.Exists(cpcVal) Then
            seenCPC.Add cpcVal, True

            For j = 0 To UBound(colHeaders)
                If colMap.Exists(colHeaders(j)) Then
                    wsNew.Cells(newRow, j + 1).value = wsBOM.Cells(i, colMap(colHeaders(j))).value
                End If
            Next j

            newRow = newRow + 1
        End If
    Next i
    
    ' Apply column widths
    With wsNew
        .Range("A4:G" & wsNew.Cells(wsNew.Rows.count, 1).End(xlUp).Row).Font.size = 14
        .Range("A4:A" & wsNew.Cells(wsNew.Rows.count, 1).End(xlUp).Row).Columns.AutoFit
        .Columns(2).ColumnWidth = 46.44  ' R DES.
        .Columns(2).WrapText = True
        .Range("A7:A" & wsNew.Cells(wsNew.Rows.count, 2).End(xlUp).Row).EntireRow.AutoFit
        .Columns(3).AutoFit              ' CPC #
        .Columns(4).ColumnWidth = 43.44  ' Description
        .Columns(5).ColumnWidth = 25  ' Disrtib Part#
        .Columns(6).ColumnWidth = 9.22   ' MFR Name
        '.Columns(7).ColumnWidth = 3.89   ' mCode
        .Range("G:G").Columns.AutoFit
    End With
    
    ' Apply page setup
    With wsNew.PageSetup
        .Zoom = False ' ? Required to activate FitToPagesWide
        .PaperSize = xlPaperLetter
        .Orientation = xlLandscape
        .TopMargin = Application.CentimetersToPoints(0.5) ' sets top margin to 1 cm
        .BottomMargin = Application.CentimetersToPoints(0.5)
        .LeftMargin = Application.CentimetersToPoints(0.5)
        .RightMargin = Application.CentimetersToPoints(0.2)
        .HeaderMargin = Application.CentimetersToPoints(0)
        .FooterMargin = Application.CentimetersToPoints(0)
        
        ' Scale to fit width
        .FitToPagesWide = 1
        .FitToPagesTall = False ' Or set to 1 if you also want to limit height to one page
    End With
    
    ' Apply Boarders
    Dim dataRange As Range
    Set dataRange = wsNew.Range(wsNew.Cells(3, 1), wsNew.Cells(wsNew.Cells(wsNew.Rows.count, 1).End(xlUp).Row, UBound(colHeaders) + 1))
    
    With dataRange.Borders
        .LineStyle = xlContinuous
        .Color = vbBlack
        .Weight = xlThin
    End With
    
    ' alignment
    dataRange.HorizontalAlignment = xlLeft
    dataRange.VerticalAlignment = xlTop
    

    ' (Keep your formatting / sorting / textbox calls here if you want)
    Call SortPrintCopy(wsNew, colHeaders)
    createTextBox wsNew

    ' Save and close (ROBUST)
    DoEvents
    SaveAsWithRetry wbNew, targetFullName, 6, 1, True
    wbNew.Close SaveChanges:=False

End Function


Sub SortPrintCopy(wsNew As Worksheet, colHeaders As Variant)
    
    Dim dataLastRow As Long, lastCol As Long, c As Long
    Dim tempData As Variant, outputRow As Long
    Dim r As Long
    Dim qtyCol As Long, desCol As Long, mcodeCol As Long
    Dim keepList() As String, mecThList() As String, zeroQtyList() As String, pcbList() As String, otherMcodeList() As String
    Dim keepCount As Long, mecThCount As Long, zeroQtyCount As Long, pcbCount As Long, otherMcodeCount As Long
    Dim lRow As Long
    
    lastCol = UBound(colHeaders) + 1
    dataLastRow = wsNew.Cells(wsNew.Rows.count, 1).End(xlUp).Row
    outputRow = 4 ' Data starts at Row 4

    ' Find the index of required columns
    qtyCol = Application.match("QTY", colHeaders, 0)
    desCol = Application.match("R DES.", colHeaders, 0)
    mcodeCol = Application.match("M CODES", colHeaders, 0)

    ' Read all data into array
    tempData = wsNew.Range(wsNew.Cells(outputRow, 1), wsNew.Cells(dataLastRow, lastCol)).value

    ' Split into 4 lists
    ReDim pcbList(1 To UBound(tempData), 1 To lastCol)
    ReDim keepList(1 To UBound(tempData), 1 To lastCol)
    ReDim mecThList(1 To UBound(tempData), 1 To lastCol)
    ReDim zeroQtyList(1 To UBound(tempData), 1 To lastCol)
    ReDim otherMcodeList(1 To UBound(tempData), 1 To lastCol)

    For r = 1 To UBound(tempData)
        If Val(tempData(r, qtyCol)) = 0 Then
            zeroQtyCount = zeroQtyCount + 1
            For c = 1 To lastCol: zeroQtyList(zeroQtyCount, c) = tempData(r, c): Next c
        ElseIf UCase(tempData(r, mcodeCol)) = "MEC" Or UCase(tempData(r, mcodeCol)) = "TH" Then
            mecThCount = mecThCount + 1
            For c = 1 To lastCol: mecThList(mecThCount, c) = tempData(r, c): Next c
        ElseIf UCase(tempData(r, mcodeCol)) = "APCB" Or UCase(tempData(r, mcodeCol)) = "PCB" Then
            pcbCount = pcbCount + 1
            For c = 1 To lastCol: pcbList(pcbCount, c) = tempData(r, c): Next c
        ElseIf UCase(tempData(r, mcodeCol)) <> "APCB" And UCase(tempData(r, mcodeCol)) <> "CP" And UCase(tempData(r, mcodeCol)) <> "IP" And UCase(tempData(r, mcodeCol)) <> "MANSMT" And UCase(tempData(r, mcodeCol)) <> "CPEXP" And UCase(tempData(r, mcodeCol)) <> "TH" And UCase(tempData(r, mcodeCol)) <> "MEC" And UCase(tempData(r, mcodeCol)) <> "0402" And UCase(tempData(r, mcodeCol)) <> "402" Then
            otherMcodeCount = otherMcodeCount + 1
            For c = 1 To lastCol: otherMcodeList(otherMcodeCount, c) = tempData(r, c): Next c
        Else
            keepCount = keepCount + 1
            For c = 1 To lastCol: keepList(keepCount, c) = tempData(r, c): Next c
        End If
    Next r

    ' Sort keepList by R DES. (column desCol)
    If keepCount > 1 Then
        Dim tempRow() As Variant
        Dim i As Long, j As Long
        For i = 1 To keepCount - 1
            For j = i + 1 To keepCount
                If keepList(i, desCol) > keepList(j, desCol) Then
                    Dim tempValue As Variant
                    For c = 1 To lastCol
                        tempValue = keepList(i, c)
                        keepList(i, c) = keepList(j, c)
                        keepList(j, c) = tempValue
                    Next c
                End If
            Next j
        Next i
    End If

    ' Clear old data
    wsNew.Range(wsNew.Cells(outputRow, 1), wsNew.Cells(dataLastRow, lastCol)).ClearContents

    ' Write sorted data back
    Dim rOut As Long
    rOut = 4
    
    If pcbCount > 0 Then
        wsNew.Range(wsNew.Cells(rOut, 1), wsNew.Cells(rOut + pcbCount - 1, lastCol)).value = pcbList
        rOut = rOut + pcbCount
    End If
    
    If keepCount > 0 Then
        wsNew.Range(wsNew.Cells(rOut, 1), wsNew.Cells(rOut + keepCount - 1, lastCol)).value = keepList
        rOut = rOut + keepCount
    End If

    If mecThCount > 0 Then
        wsNew.Range(wsNew.Cells(rOut, 1), wsNew.Cells(rOut + mecThCount - 1, lastCol)).value = mecThList
        rOut = rOut + mecThCount
    End If
    
    If otherMcodeCount > 0 Then
        wsNew.Range(wsNew.Cells(rOut, 1), wsNew.Cells(rOut + otherMcodeCount - 1, lastCol)).value = otherMcodeList
        rOut = rOut + otherMcodeCount
    End If

    If zeroQtyCount > 0 Then
        wsNew.Range(wsNew.Cells(rOut, 1), wsNew.Cells(rOut + zeroQtyCount - 1, lastCol)).value = zeroQtyList
    End If
    
    
    ' --- M CODE SUMMARY COUNT ---
    Dim mcodeDict As Object
    Set mcodeDict = CreateObject("Scripting.Dictionary")
    
    ' Loop again through all used rows to count M CODES
    Dim mcodeVal As String
    For r = 4 To wsNew.Cells(wsNew.Rows.count, 1).End(xlUp).Row
        mcodeVal = Trim(UCase(wsNew.Cells(r, mcodeCol).value))
        If Len(mcodeVal) > 0 Then
            If Not mcodeDict.Exists(mcodeVal) Then
                mcodeDict.Add mcodeVal, 1
            Else
                mcodeDict(mcodeVal) = mcodeDict(mcodeVal) + 1
            End If
        End If
    Next r
    
    ' Write title
    rOut = wsNew.Cells(wsNew.Rows.count, 2).End(xlUp).Row + 2
    lRow = rOut - 2
    
    With wsNew.Cells(rOut, 2)
        .value = "M CODES SUMMARY"
        .Font.Bold = True
        .Font.size = 14
        .HorizontalAlignment = xlLeft
    End With
    
    ' Write headers
    rOut = rOut + 1
    wsNew.Cells(rOut, 2).value = "MCODE"
    wsNew.Cells(rOut, 3).value = "COUNT"
    With wsNew.Range(wsNew.Cells(rOut, 2), wsNew.Cells(rOut, 3))
        .Font.Bold = True
        .Font.size = 14
        .HorizontalAlignment = xlLeft
    End With

    ' Write data
    Dim startSummaryRow As Long
    startSummaryRow = rOut + 1

    Dim key As Variant
    For Each key In mcodeDict.Keys
        wsNew.Cells(rOut + 1, 2).value = key
        wsNew.Cells(rOut + 1, 3).value = mcodeDict(key)
        rOut = rOut + 1
    Next key

    ' Format the whole summary table
    With wsNew.Range(wsNew.Cells(startSummaryRow - 1, 2), wsNew.Cells(rOut, 3))
        .Font.size = 14
        .HorizontalAlignment = xlLeft
        .Borders.LineStyle = xlContinuous
    End With
    
    '==== Getting the hash tags======

    Dim tagsArray As Variant
    tagsArray = GetSortedUniqueTags(wsNew, 2, 4, lRow)
    
    If IsEmpty(tagsArray) Then
    Else
        Dim groupedArray As Variant
        groupedArray = GetTagsGroupedByLetter(tagsArray)
        
        
        Dim combined As String
        Dim toWrite As Long
        toWrite = rOut + 2
        combined = Join(groupedArray, vbCrLf)
        wsNew.Cells(toWrite, 2).value = combined
        wsNew.Cells(toWrite, 2).WrapText = True
        
        'Merge B to G horizontally
        With wsNew.Range(wsNew.Cells(toWrite, 2), wsNew.Cells(toWrite, 7))
            .Merge
            .value = combined
            .WrapText = True
            .VerticalAlignment = xlTop      '  align to top
            .HorizontalAlignment = xlLeft   ' align to left
        End With
    End If
    
    

End Sub



Function createTextBox(ws As Worksheet)

Dim TextBox1 As Shape, TextBox2 As Shape, TextBox3 As Shape, TextBox4 As Shape, TextBox5 As Shape, TextBox6 As Shape

    Set TextBox1 = ws.Shapes.AddTextbox(Orientation:=msoTextOrientationHorizontal, Left:=333, Top:=0, width:=200, Height:=60)
    Set TextBox2 = ws.Shapes.AddTextbox(Orientation:=msoTextOrientationHorizontal, Left:=375, Top:=0, width:=200, Height:=60)
    Set TextBox3 = ws.Shapes.AddTextbox(Orientation:=msoTextOrientationHorizontal, Left:=517, Top:=0, width:=200, Height:=60)
    Set TextBox4 = ws.Shapes.AddTextbox(Orientation:=msoTextOrientationHorizontal, Left:=571, Top:=0, width:=200, Height:=60)
    Set TextBox5 = ws.Shapes.AddTextbox(Orientation:=msoTextOrientationHorizontal, Left:=650, Top:=0, width:=200, Height:=60)
    Set TextBox6 = ws.Shapes.AddTextbox(Orientation:=msoTextOrientationHorizontal, Left:=679, Top:=0, width:=200, Height:=60)
    
    TextBox1.TextFrame.Characters.Text = "Proc BC" & vbNewLine & "PO #" & vbNewLine & "Serial #"
    TextBox3.TextFrame.Characters.Text = "Qty" & vbNewLine & "Solder Type" & vbNewLine & "IPC Class"
    TextBox5.TextFrame.Characters.Text = "GMP" & vbNewLine & "BOM" & vbNewLine & "Gerber"
    
    TextBox1.Name = "TextBox1"
    TextBox2.Name = "TextBox2"
    TextBox3.Name = "TextBox3"
    TextBox4.Name = "TextBox4"
    TextBox5.Name = "TextBox5"
    TextBox6.Name = "TextBox6"
    
    
    Dim i As Long, shp As Shape
    
    For Each shp In ws.Shapes
        If shp.Type = msoTextBox Then
            
            With shp
                .Fill.Visible = msoFalse
                .Line.Visible = msoFalse
                
                With .TextFrame.Characters.Font
                    .Name = "Aptos Narrow"
                    .size = 10
                    .Bold = False
                    .Color = RGB(0, 0, 0)
                End With
                
                With .TextFrame
                    .HorizontalAlignment = xlHAlignLeft
                    .VerticalAlignment = xlVAlignTop
                    .AutoSize = msoTrue
                End With
            End With
        End If
    Next shp
    
    TextBox1.TextFrame.Characters(1, 8).Font.size = 12
    
    
End Function

Function getNcrFlag(boardName As String, wsNCRLogs As Worksheet)

    Dim findBoardRange As Range
    On Error Resume Next
    Set findBoardRange = wsNCRLogs.Columns.Find(What:=boardName, LookAt:=xlWhole, MatchCase:=False)
    On Error GoTo 0
    
    If Not findBoardRange Is Nothing Then
        getNcrFlag = "Y"
    Else
        getNcrFlag = "N"
    End If
    
End Function










' ========================================
' Function: GetSortedUniqueTags
' Purpose: Extract unique #tags from a column and return them sorted
' Parameters:
'   - ws: Worksheet object to search
'   - colNum: Column number to search (e.g., 2 for column B)
'   - startRow: First row to start searching
'   - endRow: Last row to search
' Returns: 0-based array of sorted unique #tags (or Empty if none found)
' ========================================
Function GetSortedUniqueTags(ws As Worksheet, colNum As Long, startRow As Long, endRow As Long) As Variant
    
    Dim tagDict As Object
    Set tagDict = CreateObject("Scripting.Dictionary")
    
    Dim cellValue As String, tagArray As Variant, tagItem As String
    Dim r As Long, m As Long, i As Long, pos As Long
    Dim hashPos As Long, spacePos As Long, numStart As Long
    Dim letter As String, numStr As String, numVal As Long
    Dim sortKey As String, fullTag As String, normalizedTag As String
    Dim valueStr As String, parts As Variant
    
    ' ========================================
    ' STEP 1: Extract all unique #tags in ONE pass
    ' ========================================
    For r = startRow To endRow
        cellValue = Trim(ws.Cells(r, colNum).value)
        
        If Len(cellValue) > 0 Then
            ' Split by comma to handle multiple tags
            tagArray = Split(cellValue, ",")
            
            For m = LBound(tagArray) To UBound(tagArray)
                tagItem = Trim(tagArray(m))
                
                ' Check if it starts with #
                If Left(tagItem, 1) = "#" Then
                    fullTag = tagItem
                    
                    ' Normalize tag for duplicate checking (uppercase + trim)
                    normalizedTag = UCase(Trim(fullTag))
                    
                    ' Only process if this normalized tag hasn't been seen before
                    If Not tagDict.Exists(normalizedTag) Then
                        ' Find space position (to ignore text after space for sorting)
                        spacePos = InStr(tagItem, " ")
                        If spacePos > 0 Then
                            sortKey = Trim(Left(tagItem, spacePos - 1)) ' e.g., "#C12" from "#C12 (34)"
                        Else
                            sortKey = tagItem ' No space, use full tag
                        End If
                        
                        ' Parse sortKey to extract letter and number
                        ' Remove # symbol
                        sortKey = Mid(sortKey, 2) ' Remove first character (#)
                        
                        ' Find where numbers start
                        letter = ""
                        numStr = ""
                        numVal = 0
                        numStart = 0
                        
                        For i = 1 To Len(sortKey)
                            If IsNumeric(Mid(sortKey, i, 1)) Then
                                numStart = i
                                Exit For
                            End If
                        Next i
                        
                        If numStart > 0 Then
                            letter = UCase(Left(sortKey, numStart - 1))
                            numStr = Mid(sortKey, numStart)
                            On Error Resume Next
                            numVal = CLng(numStr)
                            On Error GoTo 0
                        Else
                            letter = UCase(sortKey)
                            numVal = 0
                        End If
                        
                        ' Store: Key=normalizedTag (for duplicate check), Value=sortKey|originalTag
                        ' This keeps first occurrence and prevents duplicates
                        tagDict.Add normalizedTag, letter & "|" & Format(numVal, "0000000000") & "|" & fullTag
                    End If
                End If
            Next m
        End If
    Next r
    
    ' ========================================
    ' STEP 2: Check if any tags were found
    ' ========================================
    If tagDict.count = 0 Then
        GetSortedUniqueTags = Empty
        Exit Function
    End If
    
    ' ========================================
    ' STEP 3: Convert dictionary to array for sorting
    ' ========================================
    Dim tempArray() As Variant
    ReDim tempArray(0 To tagDict.count - 1, 0 To 1)
    
    Dim key As Variant
    i = 0
    For Each key In tagDict.Keys
        valueStr = tagDict(key)
        parts = Split(valueStr, "|")
        
        ' parts(0) = letter
        ' parts(1) = padded number
        ' parts(2) = original full tag
        tempArray(i, 0) = parts(2)                          ' Original full tag for display
        tempArray(i, 1) = parts(0) & "|" & parts(1)         ' Sort key (LETTER|NUMBER)
        i = i + 1
    Next key
    
    ' ========================================
    ' STEP 4: Sort array using QuickSort (much faster than bubble sort)
    ' ========================================
    If tagDict.count > 1 Then
        Call QuickSortTags(tempArray, 0, tagDict.count - 1)
    End If
    
    ' ========================================
    ' STEP 5: Extract sorted tags to result array (0-based)
    ' ========================================
    Dim resultArray() As String
    ReDim resultArray(0 To tagDict.count - 1)
    
    For i = 0 To tagDict.count - 1
        resultArray(i) = tempArray(i, 0)
    Next i
    
    GetSortedUniqueTags = resultArray
    
End Function

' ========================================
' Helper Function: GetTagsGroupedByLetter
' Purpose: Group tags by their first letter and return as sorted array
' Parameters:
'   - tagsArray: Array returned from GetSortedUniqueTags
' Returns: 0-based array where each element contains tags for one letter (sorted by letter)
'   Example: Array(0) = "#C12, #C123, #C45"     (all C tags)
'           Array(1) = "#D1, #D23"              (all D tags)
'           Array(2) = "#H12 (test), #H56"      (all H tags)
' ========================================
Function GetTagsGroupedByLetter(tagsArray As Variant) As Variant
    
    ' Check if input is empty
    If IsEmpty(tagsArray) Then
        GetTagsGroupedByLetter = Empty
        Exit Function
    End If
    
    Dim letterDict As Object
    Set letterDict = CreateObject("Scripting.Dictionary")
    
    Dim i As Long, firstLetter As String
    
    ' ========================================
    ' STEP 1: Group tags by first letter
    ' ========================================
    For i = LBound(tagsArray) To UBound(tagsArray)
        ' Extract first letter after # symbol
        firstLetter = UCase(Mid(tagsArray(i), 2, 1))
        
        ' Add to dictionary (grouped by letter)
        If Not letterDict.Exists(firstLetter) Then
            letterDict.Add firstLetter, tagsArray(i)
        Else
            letterDict(firstLetter) = letterDict(firstLetter) & ", " & tagsArray(i)
        End If
    Next i
    
    ' ========================================
    ' STEP 2: Sort letters alphabetically
    ' ========================================
    Dim sortedLetters() As String
    ReDim sortedLetters(0 To letterDict.count - 1)
    
    Dim key As Variant, j As Long
    j = 0
    For Each key In letterDict.Keys
        sortedLetters(j) = key
        j = j + 1
    Next key
    
    ' Simple bubble sort for letters (small dataset)
    Dim temp As String
    For i = 0 To UBound(sortedLetters) - 1
        For j = i + 1 To UBound(sortedLetters)
            If sortedLetters(i) > sortedLetters(j) Then
                temp = sortedLetters(i)
                sortedLetters(i) = sortedLetters(j)
                sortedLetters(j) = temp
            End If
        Next j
    Next i
    
    ' ========================================
    ' STEP 3: Build result array with just tags (no letter prefix)
    ' ========================================
    Dim resultArray() As String
    ReDim resultArray(0 To letterDict.count - 1)
    
    For i = 0 To UBound(sortedLetters)
        resultArray(i) = letterDict(sortedLetters(i))
    Next i
    
    GetTagsGroupedByLetter = resultArray
    
End Function

' ========================================
' QuickSort Algorithm for Tag Sorting
' Much faster than bubble sort: O(n log n) vs O(n )
' ========================================
Private Sub QuickSortTags(ByRef arr() As Variant, ByVal leftIdx As Long, ByVal rightIdx As Long)
    Dim i As Long, j As Long
    Dim pivot As String, temp0 As Variant, temp1 As Variant
    
    If leftIdx < rightIdx Then
        i = leftIdx
        j = rightIdx
        pivot = arr((leftIdx + rightIdx) \ 2, 1) ' Use sort key for comparison
        
        Do While i <= j
            ' Find element on left that should be on right
            Do While arr(i, 1) < pivot
                i = i + 1
            Loop
            
            ' Find element on right that should be on left
            Do While arr(j, 1) > pivot
                j = j - 1
            Loop
            
            ' Swap elements
            If i <= j Then
                ' Swap full tag
                temp0 = arr(i, 0)
                arr(i, 0) = arr(j, 0)
                arr(j, 0) = temp0
                
                ' Swap sort key
                temp1 = arr(i, 1)
                arr(i, 1) = arr(j, 1)
                arr(j, 1) = temp1
                
                i = i + 1
                j = j - 1
            End If
        Loop
        
        ' Recursively sort left and right partitions
        If leftIdx < j Then Call QuickSortTags(arr, leftIdx, j)
        If i < rightIdx Then Call QuickSortTags(arr, i, rightIdx)
    End If
End Sub






