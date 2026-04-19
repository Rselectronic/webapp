Attribute VB_Name = "Module1_V3"
Option Explicit

'High resolution timer using Windows performance counter
#If VBA7 Then
    Private Declare PtrSafe Function QueryPerformanceCounter Lib "kernel32" (ByRef lpPerformanceCount As Currency) As Long
    Private Declare PtrSafe Function QueryPerformanceFrequency Lib "kernel32" (ByRef lpFrequency As Currency) As Long
#Else
    Private Declare Function QueryPerformanceCounter Lib "kernel32" (ByRef lpPerformanceCount As Currency) As Long
    Private Declare Function QueryPerformanceFrequency Lib "kernel32" (ByRef lpFrequency As Currency) As Long
#End If

Private gFreq As Currency
Private gT0 As Currency

Public Sub PerfStart()
    QueryPerformanceFrequency gFreq
    QueryPerformanceCounter gT0
End Sub

Public Function PerfMs() As Double
    Dim t As Currency
    QueryPerformanceCounter t
    PerfMs = (t - gT0) * 1000# / gFreq
End Function

Public Sub PerfMark(ByVal label As String, Optional ByVal resetStart As Boolean = False)
    Debug.Print Format(PerfMs(), "0.0") & " ms  |  " & label
    If resetStart Then PerfStart
End Sub



Sub MergingData()
Dim ms As Worksheet, ws As Worksheet, ts As Worksheet, atemplateWS As Worksheet
Dim tLastRow, mLastRow, lr, fRow, LoopCounter, wsLastRow As Long
Dim rng, rng1, rng2, f As Range, cnt As Long
Dim prodWs As Worksheet
Dim x As Integer
Dim DupRemoveFromRow As Long
Dim j As Long
Dim prodName As String
Dim cusName As String


turnoffscreenUpdate

''
Dim dataInputWS As Worksheet
Set dataInputWS = Worksheets("DataInputSheets")

''

Set ms = ThisWorkbook.Worksheets("MasterSheet")
Set atemplateWS = ThisWorkbook.Worksheets("ATEMPLATE")
Set ts = Worksheets("Temp")
Dim tStartRow, tmpLastRow As String
Dim msLastCol As Long
Dim msLastRow As Long

'Initliazing headers
initialiseHeaders dataInputWS, , ms, , , , , , , , , , , , , , , atemplateWS

Dim arr As Variant
' Return Customer defaults to True
arr = GetActiveProductsAndCustomer()
If IsEmpty(arr) Then Exit Sub


Dim clearContentrng As Range
msLastCol = ms.Cells(3, ms.Columns.count).End(xlToLeft).Column
msLastRow = ms.Cells(ms.Rows.count, Master_CPC_Column).End(xlUp).Row ' add dynamic column/headers

If msLastRow < 4 Then
    msLastRow = 4
End If

Set clearContentrng = ms.Range("A4:" & ms.Cells(msLastRow, msLastCol).Address)

ts.Range("A2:AF10000").ClearContents
clearContentrng.ClearContents
clearContentrng.Interior.Color = xlNone
clearContentrng.Borders.LineStyle = xlNone

'ms.Range("r4:l10000").ClearContents
'Adding Serial Numbers to all Sheets
AddingSerialNumberOnEachSheetFirstColumn
'Macro to paste all data to Temp Sheet

'Loop through active sheets if sheets exists of active products
For j = 1 To UBound(arr)
        prodName = arr(j, 2)
        cusName = arr(j, 1)
        
            Set ws = ThisWorkbook.Sheets(prodName)

    tLastRow = 0
    tStartRow = 0

    
        ''Putting Customer Name in Mastersheet One time activity
         Dim BooleanCustomerFill As Boolean
            
           If BooleanCustomerFill = False Then
     
                    ms.Range("Customer_Name").value = arr(1, 1) 'getting customer name from first element
                    BooleanCustomerFill = True
                
           End If
                
        Dim wsLR As Long
                
        'Getting last row of mcode column
        wsLR = ws.Cells(ws.Rows.count, ATEMPLATE_CPC_Number_Column).End(xlUp).Row
        
        ' collapse the lines first
        colapseLines_GetUniqueMPN wsLR, ws
            
        tLastRow = ts.Range("B100000").End(xlUp).Row + 1 'Temp file
        
        wsLastRow = ws.Cells(10000, ATEMPLATE_CPC_Number_Column).End(xlUp).Row


        Dim i As Long, pasteRow As Long
        pasteRow = tLastRow ' Starting row in destination sheet
        
        For i = 4 To wsLastRow
            If ws.Cells(i, Master_ORDERQTY_Column).value <> 0 Then  ' Column  Master_ORDERQTY_Column
                'ws.Range("G" & i & ":K" & i).Copy ts.Range("A" & pasteRow)
                
                With ts.Range("A" & pasteRow & ":E" & pasteRow)
                   .NumberFormat = "@"
                   .value = .value
                End With
                           'Debug.Print ws.Range("G" & i & ":K" & i).Formula
               ' ts.Range("A" & pasteRow & ":E" & pasteRow).Formula = ws.Range("G" & i & ":K" & i).Formula
                
                ts.Cells(pasteRow, 1).Formula = ws.Cells(i, ATEMPLATE_CPC_Number_Column).Formula
                ts.Cells(pasteRow, 2).Formula = ws.Cells(i, ATEMPLATE_Description_Column).Formula
                ts.Cells(pasteRow, 3).Formula = ws.Cells(i, ATEMPLATE_Disrtib_Part_Number_Column).Formula
                ts.Cells(pasteRow, 4).Formula = ws.Cells(i, ATEMPLATE_MFR_Name_Column).Formula
                ts.Cells(pasteRow, 5).Formula = ws.Cells(i, ATEMPLATE_M_CODES_Column).Formula
                pasteRow = pasteRow + 1
            End If
        Next i

        tStartRow = ts.Range("E100000").End(xlUp).Row + 1
        tLastRow = ts.Range("B100000").End(xlUp).Row
        
        'Copying the sheet name to Temp sheet
        If tStartRow > tLastRow Then
        Else
            ts.Range("f" & tStartRow & ":f" & tLastRow).value = ws.Name
            
        End If
        Application.CutCopyMode = False
   

Next j


tLastRow = ts.Range("B2").End(xlDown).Row
'ts.Range("B2", ts.Range("C" & tLastRow)).ClearContents 'clearning the qty and x_qty
'Sorting the Values by Machine Code

DupRemoveFromRow = ts.Range("b100000").End(xlUp).Row + 1
ts.Range("a2:g" & tLastRow).RemoveDuplicates Columns:=1, Header:=xlNo ' removing duplicates

tLastRow = ts.Cells(Rows.count, 1).End(xlUp).Row
If tLastRow = 1 Then
Else


With ms.Range(ms.Cells(4, Master_CPC_Column), ms.Cells(tLastRow + 2, Master_CPC_Column))
    .NumberFormat = "@"
    .value = .value
End With



With ms.Range(ms.Cells(4, Master_Description_Column), ms.Cells(tLastRow + 2, Master_Description_Column))
    .NumberFormat = "@"
    .value = .value
End With



With ms.Range(ms.Cells(4, Master_MFRHas_Column), ms.Cells(tLastRow + 2, Master_MFRHas_Column))
    .NumberFormat = "@"
    .value = .value
End With



With ms.Range(ms.Cells(4, Master_ManufacturerName_Column), ms.Cells(tLastRow + 2, Master_ManufacturerName_Column))
    .NumberFormat = "@"
    .value = .value
End With

ms.Range(ms.Cells(4, Master_CPC_Column), ms.Cells(tLastRow + 2, Master_CPC_Column)).Formula = ts.Range("A2:a" & tLastRow).Formula
ms.Range(ms.Cells(4, Master_Description_Column), ms.Cells(tLastRow + 2, Master_Description_Column)).Formula = ts.Range("b2:b" & tLastRow).Formula
ms.Range(ms.Cells(4, Master_MFRHas_Column), ms.Cells(tLastRow + 2, Master_MFRHas_Column)).Formula = ts.Range("C2:C" & tLastRow).Formula
ms.Range(ms.Cells(4, Master_ManufacturerName_Column), ms.Cells(tLastRow + 2, Master_ManufacturerName_Column)).Formula = ts.Range("D2:D" & tLastRow).Formula

'Assigning serial numbers to master sheet
'loop to fill numbering in MasterSheet
mLastRow = ms.Cells(100000, Master_Description_Column).End(xlUp).Row
'mLastRow = ms.Range("F10000").End(xlUp).Row
End If

For x = 4 To mLastRow
    ms.Cells(x, Master_SNO_Column).value = x - 3
Next x

    
On Error Resume Next
'Set rng1 = ms.Range("A4:AH" & mLastRow)
Dim lastCol As Long
lastCol = ms.Cells(3, ms.Columns.count).End(xlToLeft).Column
Set rng1 = ms.Range(ms.Cells(3, 1), ms.Cells(mLastRow, lastCol))

'Set rng1 = ms.Range(ms.Cells(3, 1), ms.Cells(mLastRow, ms.Cells(4, ms.Columns.count).End(xlToLeft).Column))
rng1.Font.Color = vbBlack
    With rng1.Borders
        .LineStyle = xlContinuous
        .Color = vbRed
        .Weight = xlThin
    End With
On Error GoTo 0

' Clean up - Release memory

Erase arr
Set ws = Nothing
Set rng2 = Nothing
Set dataInputWS = Nothing
Set ms = Nothing

turnonscreenUpdate

End Sub





Public Sub MergingData_NoTemp_TIMED()

    PerfStart
    PerfMark "START", True

    Dim ms As Worksheet, ws As Worksheet, atemplateWS As Worksheet
    Dim dataInputWS As Worksheet
    Dim msLastCol As Long, msLastRow As Long, mLastRow As Long
    Dim clearContentrng As Range

    Dim arr As Variant
    Dim j As Long
    Dim prodName As String

    'Performance toggles
    Dim oldCalc As XlCalculation
    Dim oldScreen As Boolean, oldEvents As Boolean, oldStatus As Boolean

    oldCalc = Application.Calculation
    oldScreen = Application.ScreenUpdating
    oldEvents = Application.EnableEvents
    oldStatus = Application.DisplayStatusBar

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.DisplayStatusBar = True
    Application.Calculation = xlCalculationManual

    PerfMark "App settings disabled"

    Set dataInputWS = Worksheets("DataInputSheets")
    Set ms = ThisWorkbook.Worksheets("MasterSheet")
    Set atemplateWS = ThisWorkbook.Worksheets("ATEMPLATE")

    PerfMark "Sheets assigned"

    initialiseHeaders dataInputWS, , ms, , , , , , , , , , , , , , , atemplateWS
    PerfMark "initialiseHeaders done"

    arr = GetActiveProductsAndCustomer()
    If IsEmpty(arr) Then GoTo CleanExit
    PerfMark "GetActiveProductsAndCustomer done, products=" & UBound(arr)

    'Clear Master
    msLastCol = ms.Cells(3, ms.Columns.count).End(xlToLeft).Column
    msLastRow = ms.Cells(ms.Rows.count, Master_CPC_Column).End(xlUp).Row
    If msLastRow < 4 Then msLastRow = 4

    Set clearContentrng = ms.Range("A4:" & ms.Cells(msLastRow, msLastCol).Address)

    clearContentrng.ClearContents
    clearContentrng.Interior.Color = xlNone
    clearContentrng.Borders.LineStyle = xlNone

    PerfMark "Master cleared"

    ms.Range("Customer_Name").value = arr(1, 1)
    PerfMark "Customer name set"

    AddingSerialNumberOnEachSheetFirstColumn
    PerfMark "AddingSerialNumberOnEachSheetFirstColumn done"

    '----- Dictionary Build -----
    Dim dict As Object
    Set dict = CreateObject("Scripting.Dictionary")
    dict.CompareMode = vbTextCompare

    Dim keyOrder As Collection
    Set keyOrder = New Collection

    Dim sheetStart As Double

    For j = 1 To UBound(arr)

        sheetStart = PerfMs()

        prodName = arr(j, 2)
        Set ws = ThisWorkbook.Worksheets(prodName)

        Dim wsLR As Long
        wsLR = ws.Cells(ws.Rows.count, ATEMPLATE_CPC_Number_Column).End(xlUp).Row

        Dim tCollapse As Double
        tCollapse = PerfMs()
        colapseLines_SendDataToBOM_FAST wsLR, ws
        PerfMark "Sheet=" & ws.Name & " collapse took " & Format(PerfMs() - tCollapse, "0.0") & " ms"

        wsLR = ws.Cells(ws.Rows.count, ATEMPLATE_CPC_Number_Column).End(xlUp).Row
        If wsLR < 4 Then GoTo NextSheet
        
        ' Clear U:BG for data rows on this product sheet
        ws.Range("U4:BG" & wsLR).ClearContents

        Dim rCount As Long
        rCount = wsLR - 4 + 1

        Dim tRead As Double
        tRead = PerfMs()

        Dim aOrd As Variant, aCPC As Variant, aDesc As Variant
        Dim aDPN As Variant, aMFR As Variant, aMC As Variant

        aOrd = ws.Range(ws.Cells(4, Master_ORDERQTY_Column), ws.Cells(wsLR, Master_ORDERQTY_Column)).Value2
        aCPC = ws.Range(ws.Cells(4, ATEMPLATE_CPC_Number_Column), ws.Cells(wsLR, ATEMPLATE_CPC_Number_Column)).Formula
        aDesc = ws.Range(ws.Cells(4, ATEMPLATE_Description_Column), ws.Cells(wsLR, ATEMPLATE_Description_Column)).Formula
        aDPN = ws.Range(ws.Cells(4, ATEMPLATE_Disrtib_Part_Number_Column), ws.Cells(wsLR, ATEMPLATE_Disrtib_Part_Number_Column)).Formula
        aMFR = ws.Range(ws.Cells(4, ATEMPLATE_MFR_Name_Column), ws.Cells(wsLR, ATEMPLATE_MFR_Name_Column)).Formula
        aMC = ws.Range(ws.Cells(4, ATEMPLATE_M_CODES_Column), ws.Cells(wsLR, ATEMPLATE_M_CODES_Column)).Formula

        PerfMark "Sheet=" & ws.Name & " array read took " & Format(PerfMs() - tRead, "0.0") & " ms"

        Dim tDict As Double
        tDict = PerfMs()

        Dim i As Long, key As String
        For i = 1 To rCount
            If Val(aOrd(i, 1)) <> 0 Then
                key = Trim$(CStr(aCPC(i, 1)))
                If LenB(key) > 0 Then
                    If Not dict.Exists(key) Then
                        dict.Add key, Array(aCPC(i, 1), aDesc(i, 1), aDPN(i, 1), aMFR(i, 1), aMC(i, 1))
                        keyOrder.Add key
                    End If
                End If
            End If
        Next i

        PerfMark "Sheet=" & ws.Name & " dictionary build took " & Format(PerfMs() - tDict, "0.0") & " ms"

        PerfMark "Sheet=" & ws.Name & " TOTAL " & Format(PerfMs() - sheetStart, "0.0") & " ms"

NextSheet:
    Next j

    PerfMark "All sheets processed, total keys=" & dict.count

    '----- Write to Master -----
    Dim writeStart As Double
    writeStart = PerfMs()

    Dim outCount As Long
    outCount = dict.count
    If outCount = 0 Then GoTo CleanExit

    Dim outCPC(), outDesc(), outDPN(), outMFR()
    ReDim outCPC(1 To outCount, 1 To 1)
    ReDim outDesc(1 To outCount, 1 To 1)
    ReDim outDPN(1 To outCount, 1 To 1)
    ReDim outMFR(1 To outCount, 1 To 1)

    Dim idx As Long, v As Variant
    For idx = 1 To outCount
        v = dict(keyOrder(idx))
        outCPC(idx, 1) = v(0)
        outDesc(idx, 1) = v(1)
        outDPN(idx, 1) = v(2)
        outMFR(idx, 1) = v(3)
    Next idx

    mLastRow = 3 + outCount

    ms.Range(ms.Cells(4, Master_CPC_Column), ms.Cells(mLastRow, Master_CPC_Column)).Formula = outCPC
    ms.Range(ms.Cells(4, Master_Description_Column), ms.Cells(mLastRow, Master_Description_Column)).Formula = outDesc
    ms.Range(ms.Cells(4, Master_MFRHas_Column), ms.Cells(mLastRow, Master_MFRHas_Column)).Formula = outDPN
    ms.Range(ms.Cells(4, Master_ManufacturerName_Column), ms.Cells(mLastRow, Master_ManufacturerName_Column)).Formula = outMFR

    PerfMark "Master write took " & Format(PerfMs() - writeStart, "0.0") & " ms"

    '----- Serial numbers -----
    Dim serStart As Double
    serStart = PerfMs()

    Dim serArr()
    ReDim serArr(1 To outCount, 1 To 1)
    For idx = 1 To outCount
        serArr(idx, 1) = idx
    Next idx

    ms.Range(ms.Cells(4, Master_SNO_Column), ms.Cells(mLastRow, Master_SNO_Column)).Value2 = serArr

    PerfMark "Serial numbers took " & Format(PerfMs() - serStart, "0.0") & " ms"

    '----- Borders -----
    Dim borderStart As Double
    borderStart = PerfMs()

    Dim lastCol As Long
    lastCol = ms.Cells(3, ms.Columns.count).End(xlToLeft).Column

    Dim rng1 As Range
    Set rng1 = ms.Range(ms.Cells(3, 1), ms.Cells(mLastRow, lastCol))

    rng1.Font.Color = vbBlack
    With rng1.Borders
        .LineStyle = xlContinuous
        .Color = vbRed
        .Weight = xlThin
    End With

    PerfMark "Borders took " & Format(PerfMs() - borderStart, "0.0") & " ms"

    PerfMark "DONE"

CleanExit:
    Application.Calculation = oldCalc
    Application.ScreenUpdating = oldScreen
    Application.EnableEvents = oldEvents
    Application.DisplayStatusBar = oldStatus
End Sub



Function colapseLines_GetUniqueMPN(wsLR As Long, ws As Worksheet)

            Dim outputRow As Long
            Dim dict As Object
            Set dict = CreateObject("Scripting.Dictionary")

            ' Define the columns to sum (e.g., Column I = 9, J = 10, etc.)
            Dim sumCols As Variant
            Dim col As Variant
           'sumCols = Array(25, 23, 30, 28, 35, 33, 40, 38) ' W, Y, AB, AD, AG, AI, AL, AN
           sumCols = Array(ATEMPLATE_Ext_price_Units1_Column, ATEMPLATE_QTY_to_order1_Column, ATEMPLATE_Ext_price_Units2_Column, ATEMPLATE_QTY_to_order2_Column, ATEMPLATE_Ext_price_Units3_Column, ATEMPLATE_QTY_to_order3_Column, ATEMPLATE_Ext_price_Units4_Column, ATEMPLATE_QTY_to_order4_Column) ' W, Y, AB, AD, AG, AI, AL, AN

            outputRow = wsLR + 1
                
            'ws.Range("A" & outputRow & ":BG" & outputRow + 5).ClearContents             '' Clear any previous output area
            ws.Range(ws.Cells(outputRow, 1), ws.Cells(outputRow + 5, ws.Cells(outputRow, ws.Columns.count).End(xlToLeft).Column)).ClearContents

    
            Dim x As Long
            For x = 4 To wsLR
                
                Dim CPC As String
                CPC = Trim(ws.Cells(x, ATEMPLATE_CPC_Number_Column))
                
                If CPC <> "" Then
                    If Not dict.Exists(CPC) Then
                        dict.Add CPC, outputRow
                                           
                        'ws.Range("E" & outputRow & ":T" & outputRow).Formula = ws.Range("E" & x & ":T" & x).Formula
                        ' Example: copying formulas from row x to outputRow using  column variables
                        ws.Cells(outputRow, ATEMPLATE_QTY_Column).Formula = ws.Cells(x, ATEMPLATE_QTY_Column).Formula
                        ws.Cells(outputRow, ATEMPLATE_R_DES_Column).Formula = ws.Cells(x, ATEMPLATE_R_DES_Column).Formula
                        ws.Cells(outputRow, ATEMPLATE_CPC_Number_Column).Formula = ws.Cells(x, ATEMPLATE_CPC_Number_Column).Formula
                        ws.Cells(outputRow, ATEMPLATE_Description_Column).Formula = ws.Cells(x, ATEMPLATE_Description_Column).Formula
                        ws.Cells(outputRow, ATEMPLATE_Disrtib_Part_Number_Column).Formula = ws.Cells(x, ATEMPLATE_Disrtib_Part_Number_Column).Formula
                        ws.Cells(outputRow, ATEMPLATE_MFR_Name_Column).Formula = ws.Cells(x, ATEMPLATE_MFR_Name_Column).Formula
                        ws.Cells(outputRow, ATEMPLATE_M_CODES_Column).Formula = ws.Cells(x, ATEMPLATE_M_CODES_Column).Formula
                        ws.Cells(outputRow, ATEMPLATE_MFR_Column).Formula = ws.Cells(x, ATEMPLATE_MFR_Column).Formula
                        ws.Cells(outputRow, ATEMPLATE_PN_to_USE_Column).Formula = ws.Cells(x, ATEMPLATE_PN_to_USE_Column).Formula
                        ws.Cells(outputRow, ATEMPLATE_Unit_Price_Column).Formula = ws.Cells(x, ATEMPLATE_Unit_Price_Column).Formula
                        ws.Cells(outputRow, ATEMPLATE_Qty_Available_Column).Formula = ws.Cells(x, ATEMPLATE_Qty_Available_Column).Formula
                        ws.Cells(outputRow, ATEMPLATE_Distrib_1_Column).Formula = ws.Cells(x, ATEMPLATE_Distrib_1_Column).Formula
                        ws.Cells(outputRow, ATEMPLATE_Distributor_Part_number_Column).Formula = ws.Cells(x, ATEMPLATE_Distributor_Part_number_Column).Formula
                        ws.Cells(outputRow, ATEMPLATE_Notes_Column).Formula = ws.Cells(x, ATEMPLATE_Notes_Column).Formula
                        ws.Cells(outputRow, ATEMPLATE_Stock_Status_Column).Formula = ws.Cells(x, ATEMPLATE_Stock_Status_Column).Formula
                        ws.Cells(outputRow, ATEMPLATE_TH_Pins_Column).Formula = ws.Cells(x, ATEMPLATE_TH_Pins_Column).Formula

                        
                        outputRow = outputRow + 1
                    Else
                        Dim existingRow As Long
                        existingRow = dict(CPC)
                        
                        ' Sum numeric columns
                        On Error Resume Next
                        For Each col In sumCols
                            ws.Cells(existingRow, col).Formula = ws.Cells(existingRow, col).value + ws.Cells(x, col).Formula
                        Next col
                        On Error GoTo 0
                    End If
                End If
                
            Next x
            
            ' delete the unmerged rows
            Dim lrowws As Double
            'lrowws = ws.Cells(Rows.count, "E").End(xlUp).Row
            lrowws = ws.Cells(Rows.count, ATEMPLATE_QTY_Column).End(xlUp).Row
            
            If lrowws > 4 Then
                ws.Rows("4:4").Copy
                ws.Range(ws.Cells(4, 1), ws.Cells(lrowws, 1)).EntireRow.PasteSpecial xlPasteFormats
            End If
            
            ws.Rows("4:" & wsLR).Delete Shift:=xlUp

End Function
Sub UpdateMachineCodes()
Dim ws, tws, mcWS As Worksheet
Dim rng, rngCell, rng2 As Range
Dim sLastRow, tLastRow, LoopCounter, fRow, tRow As Long
Dim findVal As String
Dim valCounter, MCounter As Integer
Set tws = Sheets("Temp")
Set mcWS = Sheets("MachineCodeSummary")
tLastRow = tws.Range("B100000").End(xlUp).Row
Set rng = tws.Range("B2:B" & tLastRow)
mcWS.Range("A2:f10000").ClearContents
'For LoopCounter = 2 To tLastRow
    For Each rngCell In rng
        findVal = rngCell.value
        valCounter = 0
        MCounter = 1
            For Each ws In ThisWorkbook.Worksheets
        If ws.Name = "Temp" Or ws.Name = "Quote Log" Or ws.Name = "Procurement Log" Or ws.Name = "MasterSheet" Or ws.Name = "MachineCodes" Or ws.Name = "ExtraOrder" Or ws.Name = "ManualMachineCode" Or ws.Name = "MachineCodeSummary" Or ws.Name = "Procurement" Or ws.Name = "DataInputSheets" Or ws.Name = "Stencils Positions" Then
                    
            Else
            
                       If ws.Range("B2") = 0 Then 'Ignore the sheet if zero Board
                       
                       Else
                           Set rng2 = ws.Range("h:h").Find(What:=findVal, LookAt:=xlWhole)
                               If Not rng2 Is Nothing Then
                                   fRow = rng2.Row
                                        'Getting Machine Code
                                        If ws.Range("k" & fRow).value <> "" Then
                                            'rngCell.Offset(0, 2) = ws.Range("I" & fRow).Value
                                            valCounter = valCounter + 1
                                                
                                                If valCounter > 1 Then
                                                    MCounter = MCounter + 1
                                                    sLastRow = mcWS.Range("A100000").End(xlUp).Row + 1
                                                    mcWS.Range("A" & sLastRow) = ws.Range("g" & fRow)
                                                    mcWS.Range("b" & sLastRow) = ws.Range("h" & fRow)
                                                    mcWS.Range("c" & sLastRow) = ws.Range("i" & fRow)
                                                    mcWS.Range("d" & sLastRow) = ws.Range("j" & fRow)
                                                    mcWS.Range("e" & sLastRow) = ws.Range("k" & fRow)
                                                    
                                                    mcWS.Range("f" & sLastRow) = ws.Name
                                                        'When Machine code found more than one time
                                                        If MCounter = 2 Then
                                                            rngCell.Offset(0, 2).Font.Color = vbRed
                                                            tRow = rngCell.Row
                                                            sLastRow = mcWS.Range("A100000").End(xlUp).Row + 1
                                                            mcWS.Range("A" & sLastRow) = tws.Range("a" & tRow)
                                                            mcWS.Range("b" & sLastRow) = tws.Range("b" & tRow)
                                                            mcWS.Range("c" & sLastRow) = tws.Range("c" & tRow)
                                                            mcWS.Range("d" & sLastRow) = tws.Range("d" & tRow)
                                                            mcWS.Range("e" & sLastRow) = tws.Range("e" & tRow)
                                                            mcWS.Range("f" & sLastRow) = tws.Range("f" & tRow)
                                                         End If
                                               Else
                                               
                                                rngCell.Offset(0, 3) = ws.Range("k" & fRow).value
                                                 
                                                        
                                                End If
                                        End If
                                        'Getting DPN
                                        If ws.Range("I" & fRow) <> "" Then
                                            rngCell.Offset(0, 1) = ws.Range("i" & fRow)
                                        End If
                       
                               End If
                       End If
                End If
            'end of worksheets to through loop
            Next ws
    'end of inner For Loop
    Next rngCell


'End of For Loop
'Next LoopCounter



End Sub
'updating serial number on each sheet
Sub AddingSerialNumberOnEachSheetFirstColumn()
Dim ws As Worksheet, atemplateWS As Worksheet
Dim lastRow, j, i As Integer
Dim arr As Variant
Dim prodName As String
Dim k As Long

Set atemplateWS = ThisWorkbook.Worksheets("ATEMPLATE")
initialiseHeaders , , , , , , , , , , , , , , , , , atemplateWS


' Return Customer defaults to True
arr = GetActiveProductsAndCustomer(False)
If IsEmpty(arr) Then Exit Sub

'Loop through active sheets if sheets exists of active products
For k = 1 To UBound(arr)
        prodName = arr(k)
        
        
            Set ws = ThisWorkbook.Sheets(prodName)


       
        j = 1
           'lastRow = ws.Range("G100000").End(xlUp).Row
           lastRow = ws.Cells(100000, ATEMPLATE_CPC_Number_Column).End(xlUp).Row
           For i = 4 To lastRow
               'ws.Range("A" & i) = j
               ws.Cells(i, ATEMPLATE_Serial_NO_Column) = j
               j = j + 1
           Next i
        

Next k


End Sub
'Remove Duplicates Description with same machine code
Sub RemoveDuplicateDescriptionAndMachineCode()
Dim lastRow, tLastRow, i, j As Long
Dim rng, r As Range
Dim ws, tws As Worksheet
Dim findVal As String

Set ws = Sheets("MachineCodeSummary")
Set tws = Sheets("Temp")

lastRow = ws.Range("b100000").End(xlUp).Row
For i = lastRow To 2 Step -1

    If ws.Range("G" & i) = "Del" Then
        ws.Cells(i, i).EntireRow.Delete
        
    End If
    

Next i
'ws.Range("a2:f" & lastRow).RemoveDuplicates Columns:=6, Header:=xlNo ' removing duplicates
'tLastRow = tws.Range("B100000").End(xlUp).Row

'Set rng = ws.Range("B2:B" & lastRow)
'For Each r In rng
'    findVal = r.Value
'        For j = 2 To tLastRow
'            If findVal = tws.Range("B" & j) Then
'                tws.Range("d" & j) = ""
'
'            End If
'        Next j
'Next r
End Sub
'Sub to get the Distributor part no (DPN) on Temp sheet from all sheets
Sub FindAndAddDPNToTempSheet()
Dim ws, tws As Worksheet
Dim findVal, FindData As String
Dim rng As Range
Dim wsLastRow, fRow, tLastRow, OuterLoop, InnerLoop, OutRows As Integer
Set tws = Sheets("Temp")
OutRows = tws.Range("b100000").End(xlUp).Row
For OuterLoop = 2 To OutRows

    For Each ws In ThisWorkbook.Worksheets
        FindData = tws.Range("B" & OuterLoop)
        If ws.Name = "Temp" Or ws.Name = "Quote Log" Or ws.Name = "Procurement Log" Or ws.Name = "MasterSheet" Or ws.Name = "MachineCodes" Or ws.Name = "ExtraOrder" Or ws.Name = "ManualMachineCode" Or ws.Name = "MachineCodeSummary" Or ws.Name = "Procurement" Or ws.Name = "DataInputSheets" Or ws.Name = "Stencils Positions" Then
        Else
             If ws.Range("B2") = 0 Then
             Else
             Set rng = ws.Range("G:G").Find(What:=FindData, LookAt:=xlWhole)
                If Not rng Is Nothing Then
                    fRow = rng.Row
                        If rng.Offset(0, 1) <> "" Then
                            tws.Range("c" & OuterLoop) = ws.Range("i" & fRow)
                            Exit For
                        End If
                        
            
                End If
            End If
        End If
    Next ws
Next OuterLoop
End Sub
'This sub to find duplicates and adding to summary sheet where description with machine code for more than one of same description
Sub FindDuplicatedDescriptionInTempSheet()
Dim ts, shSummary As Worksheet
Dim outerRng, innerRng, r, j As Range
Dim lastRow, SumLastRow As Long
Dim findVal, SearchVal As String
Set ts = Sheets("Temp")
Set shSummary = Sheets("MachineCodeSummary")
lastRow = ts.Range("B100000").End(xlUp).Row
Set outerRng = ts.Range("B2:B" & lastRow)
Set innerRng = ts.Range("B2:B" & lastRow)

For Each r In outerRng
    findVal = r.value
    
    For Each j In innerRng
        SearchVal = j.value
        If ((findVal = SearchVal) And (r.Offset(0, 3).value <> "") And (j.Offset(0, 3).value <> "")) Then
            If (r.Row <> j.Row) And (j.Offset(0, 3).value <> "") Then
               SumLastRow = shSummary.Range("A10000").End(xlUp).Row + 1
               shSummary.Range("A" & SumLastRow).value = r.Offset(0, -1).value
               shSummary.Range("b" & SumLastRow).value = r.value
               shSummary.Range("c" & SumLastRow).value = r.Offset(0, 1).value
               shSummary.Range("d" & SumLastRow).value = r.Offset(0, 2).value
               shSummary.Range("e" & SumLastRow).value = r.Offset(0, 3).value
               shSummary.Range("f" & SumLastRow).value = r.Offset(0, 4).value
            End If
            
        End If
    
    Next j
        
        
  

Next r

End Sub
'This code to check same description with Machine code and remove duplicate
Sub RemoveDuplicates()
Dim tLastRow, x As Long
Dim rng, r As Range
Dim workRng, colorCell As Range
Dim ts As Worksheet
Set ts = Sheets("Temp")
Sheets("Temp").Select
tLastRow = ts.Range("B100000").End(xlUp).Row
Set workRng = ts.Range("B2:B" & tLastRow)


'highlight cells that contain duplicate values in the selected range
For Each colorCell In workRng
If WorksheetFunction.CountIf(workRng, colorCell.value) > 1 Then
    colorCell.Interior.ColorIndex = 8
Else
    colorCell.Interior.ColorIndex = xlNone
End If
Next
'Removing the colored rows with criteria
tLastRow = ts.Range("B100000").End(xlUp).Row

For x = tLastRow To 2 Step -1
    If (Cells(x, 2).Interior.ColorIndex = 8) And (Cells(x, 4) = "") Then
        Rows(x).EntireRow.Delete
    Else
        
    End If
Next x
''Removing  Formatting
ts.Range("B2:B10000").Interior.ColorIndex = xlNone
End Sub
Sub GetQtyAndBoard()
Dim ms As Worksheet, ws As Worksheet, ts As Worksheet
Dim dataInputWS As Worksheet
Dim FindData, tmpResult As String
Dim rng As Range
Dim tmpQty, tmpXQty, tmpQty1, tmpXQty1, tmpQty2, tmpXQty2, tmpQty3, tmpXQty3, tmpQty4, tmpXQty4 As Long
Dim j As Long
Dim prodName As String

turnoffscreenUpdate


tmpQty = 0
tmpXQty = 0
tmpQty1 = 0
tmpXQty1 = 0
tmpQty2 = 0
tmpXQty2 = 0
tmpQty3 = 0
tmpXQty3 = 0
tmpQty4 = 0
tmpXQty4 = 0

Dim mLastRow, lr, LoopCounter, fRow As Long
Set ms = Worksheets("MasterSheet")
Set dataInputWS = ThisWorkbook.Worksheets("DataInputSheets")
Set ts = Worksheets("Temp")

'Initializing headers
initialiseHeaders dataInputWS, , ms


Dim arr As Variant
' Return Customer defaults to True
arr = GetActiveProductsAndCustomer(False)
If IsEmpty(arr) Then Exit Sub



'ms.Range("B4:B10000").ClearContents
'ms.Range("C4:c10000").ClearContents
'ms.Range("BA4:BA10000").ClearContents
'ms.Range("BF4:BF10000").ClearContents
'ms.Range("BK4:BK10000").ClearContents
'ms.Range("BP4:BP10000").ClearContents

With ms
    .Range(.Cells(4, Master_Quantity_Column), .Cells(10000, Master_Quantity_Column)).ClearContents
    .Range(.Cells(4, Master_XQuant_Column), .Cells(10000, Master_XQuant_Column)).ClearContents
    
End With

Dim w As String

mLastRow = ms.Cells(ms.Rows.count, Master_SNO_Column).End(xlUp).Row
'Loop to iterate through each sheet and finding data

For LoopCounter = 4 To mLastRow
   
    FindData = ms.Cells(LoopCounter, Master_CPC_Column).value

           
        For j = 1 To UBound(arr)
                prodName = arr(j)
       
        Set ws = ThisWorkbook.Sheets(prodName)

                Set rng = ws.Range("g4:g" & ws.Cells(ws.Rows.count, "E").End(xlUp).Row).Find(What:=FindData, LookAt:=xlWhole)
                    If Not rng Is Nothing Then
                        fRow = rng.Row
                        If ws.Range("E" & fRow).value > 0 Then
                            tmpQty = tmpQty + ws.Cells(fRow, ATEMPLATE_QTY_Column).value
                            tmpXQty = tmpXQty + ws.Cells(fRow, ATEMPLATE_X_Quant_Column).value
                            tmpXQty1 = tmpXQty1 + ws.Cells(fRow, ATEMPLATE_X_Quant1_Column).value
                            tmpXQty2 = tmpXQty2 + ws.Cells(fRow, ATEMPLATE_X_Quant2_Column).value
                            tmpXQty3 = tmpXQty3 + ws.Cells(fRow, ATEMPLATE_X_Quant3_Column).value
                            tmpXQty4 = tmpXQty4 + ws.Cells(fRow, ATEMPLATE_X_Quant4_Column).value
                            tmpResult = ws.Name & "+" & tmpResult
                            w = ws.Name
                        End If
                    End If
         
        Next j
        'Asssingin value to MasterSheet after iteration from each sheet
        ms.Cells(LoopCounter, Master_Quantity_Column).value = tmpQty
        ms.Cells(LoopCounter, Master_XQuant_Column).value = tmpXQty
        ms.Cells(LoopCounter, Master_Result_Column).NumberFormat = "@"
        ms.Cells(LoopCounter, Master_Result_Column).value = tmpResult
        
        ms.Cells(LoopCounter, Master_Result_Column).value = Left(ms.Cells(LoopCounter, Master_Result_Column).value, Len(ms.Cells(LoopCounter, Master_Result_Column).value) - 1)

       
        'Set tmpQty and tmpXQty to zero for next calculations
        tmpQty = 0
        tmpXQty = 0
        tmpQty1 = 0
        tmpXQty1 = 0
        tmpQty2 = 0
        tmpXQty2 = 0
        tmpQty3 = 0
        tmpXQty3 = 0
        tmpQty4 = 0
        tmpXQty4 = 0
        tmpResult = ""

Next LoopCounter

turnonscreenUpdate


End Sub

Sub CalculateQty()
Dim dataInputWS As Worksheet, ts As Worksheet
Dim ms As Worksheet, ws As Worksheet, atemplateWS As Worksheet
Dim tLastRow, mLastRow, lr, fRow, LoopCounter As Long
Dim rng As Range
Dim x As Integer
Dim prodName As String
Dim j As Long
   

turnoffscreenUpdate


Set dataInputWS = ThisWorkbook.Worksheets("DataInputSheets")
Set ms = ThisWorkbook.Worksheets("MasterSheet")
Set atemplateWS = ThisWorkbook.Worksheets("ATEMPLATE")

ms.Range("B4:B10000").ClearContents
ms.Range("C4:c10000").ClearContents
'ms.Range("M4:M10000").ClearContents

Set ts = ThisWorkbook.Worksheets("Temp")

'Initializing headers
initialiseHeaders dataInputWS, , ms, , , , , , , , , , , , , , , atemplateWS


Dim arr As Variant
' Return Customer defaults to True
arr = GetActiveProductsAndCustomer(False)
If IsEmpty(arr) Then Exit Sub

       
For j = 1 To UBound(arr)
        prodName = arr(j)
                
        Set ws = ThisWorkbook.Sheets(prodName)
'adding Qty and X_Qty

            'ws.Activate
            lr = ws.Cells(100000, ATEMPLATE_CPC_Number_Column).End(xlUp).Row
                For LoopCounter = 4 To lr
                        
                        ws.Cells(10000, ATEMPLATE_Extra1_Column).ClearContents
                        ws.Cells(10000, ATEMPLATE_Extra2_Column).ClearContents
                        ws.Cells(10000, ATEMPLATE_Extra3_Column).ClearContents
                        ws.Cells(100000, ATEMPLATE_Extra4_Column).ClearContents
                        
                        'ws.Cells(LoopCounter, ATEMPLATE_X_Quant_Column).Value = ws.Range("b2") * ws.Cells(LoopCounter, 5).Value
                        ws.Cells(LoopCounter, ATEMPLATE_X_Quant_Column).value = ws.Cells(2, ATEMPLATE_X_Quant_Column) * ws.Cells(LoopCounter, ATEMPLATE_QTY_Column).value
                        
                        ws.Cells(LoopCounter, ATEMPLATE_Order_Qty_Column).value = ws.Cells(LoopCounter, ATEMPLATE_X_Quant_Column) + ws.Cells(LoopCounter, ATEMPLATE_Extras_Column)
                        
                        ws.Cells(LoopCounter, ATEMPLATE_X_Quant1_Column).value = ws.Cells(2, ATEMPLATE_Unit_Price1_Column) * ws.Cells(LoopCounter, ATEMPLATE_QTY_Column).value
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order1_Column).value = ws.Cells(LoopCounter, ATEMPLATE_X_Quant1_Column) + ws.Cells(LoopCounter, ATEMPLATE_Extra1_Column)
                        
                        
                        ws.Cells(LoopCounter, ATEMPLATE_X_Quant2_Column).value = ws.Cells(2, ATEMPLATE_Unit_Price2_Column) * ws.Cells(LoopCounter, ATEMPLATE_QTY_Column).value
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order2_Column).value = ws.Cells(LoopCounter, ATEMPLATE_X_Quant2_Column) + ws.Cells(LoopCounter, ATEMPLATE_Extra2_Column)
                        
                        
                        ws.Cells(LoopCounter, ATEMPLATE_X_Quant3_Column).value = ws.Cells(2, ATEMPLATE_Unit_Price3_Column) * ws.Cells(LoopCounter, ATEMPLATE_QTY_Column).value
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order3_Column).value = ws.Cells(LoopCounter, ATEMPLATE_X_Quant3_Column) + ws.Cells(LoopCounter, ATEMPLATE_Extra3_Column)
                        
                        ws.Cells(LoopCounter, ATEMPLATE_X_Quant4_Column).value = ws.Cells(2, ATEMPLATE_Unit_Price4_Column) * ws.Cells(LoopCounter, ATEMPLATE_QTY_Column).value
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order4_Column).value = ws.Cells(LoopCounter, ATEMPLATE_X_Quant4_Column) + ws.Cells(LoopCounter, ATEMPLATE_Extra4_Column)
                  Next LoopCounter
        
    
Next j

turnonscreenUpdate

    

End Sub
Sub DelSameMCode()
'This piece of code check the description and machine code. if same description showing different Machine code then keep them else remove
Dim ws As Worksheet
Dim rng, r As Range
Dim lastRow, i As Integer
Dim Descrip, mcode As String
Set ws = Sheets("MachineCodeSummary")
lastRow = ws.Range("B100000").End(xlUp).Row
Set rng = ws.Range("B2:B" & lastRow)
i = 1

For Each r In rng
    Descrip = r.value
    mcode = r.Offset(0, 3).value
        For i = 2 To lastRow
                If r.Row = i Then
                    Else
                        If Descrip = ws.Range("B" & i) And mcode = ws.Range("E" & i) Then 'Description and machine code
                            ws.Range("G" & i) = "Del"
                            'r.Offset(0, 4) = "Del"
                        
                        
                        End If
                        
                End If
        Next i
Next r


End Sub
Sub UpdateMachineCode()
Dim mcw, ms As Worksheet
Dim mLastRow, wsLastRow, mStRow, r, OuterLoop As Long
Dim rng As Range
Dim foundVal As Variant
Dim findString, keywd As String

turnoffscreenUpdate

'set the sheet object
Set mcw = ThisWorkbook.Worksheets("MachineCodes")
Set ms = ThisWorkbook.Worksheets("MasterSheet")

'initializing headers
initialiseHeaders , , ms

mStRow = 4
mLastRow = ms.Cells(Rows.count, Master_SNO_Column).End(xlUp).Row
wsLastRow = mcw.Cells(Rows.count, 1).End(xlUp).Row

With ms
    .Range(.Cells(4, Master_Mcodes_Column), .Cells(mLastRow, Master_Mcodes_Column)).ClearContents
    .Range(.Cells(4, Master_EXTRA_Column), .Cells(mLastRow, Master_ORDERQTY_Column)).ClearContents
End With


Set rng = mcw.Range("A2:a" & wsLastRow)
    For OuterLoop = 4 To mLastRow
        findString = ms.Cells(OuterLoop, Master_Description_Column).value
            For Each r In rng
                keywd = r.value
                foundVal = InStr(1, findString, keywd)
                If foundVal > 0 Then
                                      
                     ms.Cells(OuterLoop, Master_Mcodes_Column).value = r.Offset(0, 1).value
                     ' Highlight matched text in column F (or any other)
                        ms.Cells(OuterLoop, Master_Description_Column).Characters(Start:=InStr(1, findString, keywd), _
                            length:=Len(keywd)).Font.Color = RGB(255, 0, 0)
                     ms.Cells(OuterLoop, Master_KeywordsUsed_Column).value = keywd
                    ms.Cells(OuterLoop, Master_Description_Column).Characters(Start:=InStr(1, findString, keywd), length:=Len(keywd)).Font.Color = RGB(255, 0, 0)
                Exit For
                End If
            Next r
    Next OuterLoop
'manual machine code
UpdateManualMachineCode
'Blank the machine code column where it found more than once with different machine code
'EmptyMachineCodesMoreThanOnce

turnonscreenUpdate

End Sub
'code to check Machine Code Summary Sheet and cross check with master sheet for description
' if description matched then empty the machine code in master sheet and set background color
Sub EmptyMachineCodesMoreThanOnce()
Dim mws, ms As Worksheet
Dim rng, r As Range
Dim Descrip As String
Dim lastRow, mLastRow, i As Long
'Set mws = Sheets("MachineCodeSummary")
Set ms = Sheets("MasterSheet")
mLastRow = ms.Range("G100000").End(xlUp).Row
lastRow = mws.Range("B10000").End(xlUp).Row

Set rng = ms.Range("G4:g" & mLastRow)
For Each r In rng
    Descrip = r.value
        For i = 2 To lastRow
            If mws.Range("B" & i) = Descrip Then
                r.Offset(0, 1) = ""
                r.Offset(0, 1).Interior.ColorIndex = 4
            End If
        Next i
Next r




End Sub
Sub UpdateManualMachineCode()
Dim mcw, ms As Worksheet
Dim mLastRow, wsLastRow, mStRow, r, OuterLoop As Long
Dim rng As Range
Dim foundVal As Variant
Dim findString, keywd As String
Dim mMPN, mDes, mDPN, mMCode As String 'for master sheet code checking
Dim mmMPN, mmDes, mmDPN, mmMCode As String 'for manual machine code checking
'set the sheet object
Set mcw = ThisWorkbook.Worksheets("ManualMachineCode")
Set ms = ThisWorkbook.Worksheets("MasterSheet")

'Initializing headers
initialiseHeaders , , ms


mStRow = 4
mLastRow = ms.Cells(Rows.count, Master_SNO_Column).End(xlUp).Row
wsLastRow = mcw.Cells(Rows.count, 1).End(xlUp).Row

Set rng = mcw.Range("A2:A" & wsLastRow)
    For OuterLoop = 4 To mLastRow
        findString = ms.Cells(OuterLoop, Master_CPC_Column).value ' ms.Range("I" & OuterLoop).Value
            For Each r In rng
                keywd = r.value
                If (keywd = findString) Then
                    'checking adjacent cells
                    ms.Cells(OuterLoop, Master_Mcodes_Column) = r.Offset(0, 1)
                    
                    
                Exit For
                End If
            Next r
    Next OuterLoop
End Sub


Sub UpdateMachineCodeMasterToOther()
Dim ms As Worksheet, ws As Worksheet, ts As Worksheet, templateWS As Worksheet
Dim tLastRow As Long, stRow As Long, mLastRow As Long, lr As Long, fRow As Long, LoopCounter As Long, OuterLoop As Long
Dim fText As String 'will contain each cell value for comparision
Dim rng, rng2 As Range
Dim mPrice, machineCode, Distrib, MOQ, pn, qtAvailable, com2, com3, MRF As Variant
Dim x, foundRow, extPrice As Integer
Dim THpins As String
Dim lcscPN As String
Dim colapseDone As Boolean
Dim Description As String
Dim j As Long
Dim prodName As String

colapseDone = False

turnoffscreenUpdate

Set ms = Worksheets("MasterSheet")
Set templateWS = ThisWorkbook.Worksheets("ATEMPLATE")
'Initializing headers
initialiseHeaders , , ms, , , , , , , , , , , , , , , templateWS


' validate if TH lines have TH pins
If THpinsExists(ms) = False Then
    turnonscreenUpdate
    MsgBox "Please confirm all THs have TH pins!", , "TH pin validation failed"
    Exit Sub
End If

Set ts = Worksheets("Temp")
'OuterLoop to get each cell value for comparing
mLastRow = ms.Cells(Rows.count, Master_SNO_Column).End(xlUp).Row

' copy description to individual sheet
Dim response1 As VbMsgBoxResult
response1 = MsgBox("Do you want to copy description to BOM?", vbYesNo + vbQuestion, "Description Copy Confirmation")

For OuterLoop = 4 To mLastRow
    'fText = ms.Range("I" & OuterLoop).Value
    fText = ms.Cells(OuterLoop, Master_CPC_Column).value
    'pn = ms.Range("Q" & OuterLoop).Value
    pn = ms.Cells(OuterLoop, Master_PNTOUSE_Column).value
    'MachineCode = ms.Range("G" & OuterLoop).Value
    machineCode = ms.Cells(OuterLoop, Master_Mcodes_Column).value
    'MRF = ms.Range("P" & OuterLoop).Value
    MRF = ms.Cells(OuterLoop, Master_MFR_Column).value
    'Distrib = ms.Range("S" & OuterLoop).Value
    Distrib = ms.Cells(OuterLoop, Master_Distrib1_Column).value
    'MOQ = ms.Range("T" & OuterLoop).Value
     MOQ = ms.Cells(OuterLoop, Master_DistributorPartnumber_Column).value
    'com2 = ms.Range("U" & OuterLoop).Value
    com2 = ms.Cells(OuterLoop, Master_Notes_Column).value
    'com3 = ms.Range("V" & OuterLoop).Value
    com3 = ms.Cells(OuterLoop, Master_StockStatus_Column).value
    'THpins = ms.Range("N" & OuterLoop).Value
    THpins = ms.Cells(OuterLoop, Master_THPins_Column).value
    'lcscPN = ms.Range("AB" & OuterLoop).Value  Master_LCSCPN_Column
    lcscPN = ms.Cells(OuterLoop, Master_LCSCPN_Column).value
    'description = ms.Range("F" & OuterLoop).Value  Master_Description_Column
    Description = ms.Cells(OuterLoop, Master_Description_Column).value
    
    'E4xM
    ' Excluded below two lines to get Ext Price as client wants manually
    'extPrice = ms.Range("E" & OuterLoop) * ms.Range("M" & OuterLoop)
    'ms.Range("M" & OuterLoop) = extPrice
    
    qtAvailable = ms.Cells(OuterLoop, Master_QTYAvlble_Column).value
    
    Dim arr As Variant
    arr = GetActiveProductsAndCustomer(False)
    If IsEmpty(arr) Then Exit Sub
    
  For j = 1 To UBound(arr)
        prodName = arr(j)
                
        Set ws = ThisWorkbook.Sheets(prodName)
    
'    'Macro add Qty and X_Qty
'    For Each ws In Worksheets
'    If ws.Name = "Price Calc" Or ws.Name = "Temp" Or ws.Name = "Quote Log" Or ws.Name = "Authorization" Or ws.Name = "Programming" Or ws.Name = "ATEMPLATE" Or ws.Name = "Procurement Log" Or ws.Name = "MasterSheet" Or ws.Name = "MachineCodes" Or ws.Name = "ExtraOrder" Or ws.Name = "ManualMachineCode" Or ws.Name = "MachineCodeSummary" Or ws.Name = "Procurement" Or ws.Name = "DataInputSheets" Or ws.Name = "Stencils Positions" Then
'            Else
'        If ws.Range("B2") = 0 Then
'        Else
            'getting last row of each sheet
            lr = ws.Cells(ws.Rows.count, ATEMPLATE_CPC_Number_Column).End(xlUp).Row
            
            ' colapse lines for the first time
            If colapseDone = False Then
                colapseLines_SendDataToBOM lr, ws
                colapseDone = True
            End If
            
                    'Set rng2 = ws.Range("g:g").Find(What:=fText, lookat:=xlWhole)
                    'Set rng2 = ws.Range("g4:g" & ws.Cells(ws.Rows.count, "E").End(xlUp).Row).Find(What:=fText, LookAt:=xlWhole)
                    Set rng2 = ws.Range(ws.Cells(4, ATEMPLATE_CPC_Number_Column), ws.Cells(ws.Rows.count, ATEMPLATE_QTY_Column).End(xlUp)).Find(fText, LookAt:=xlWhole)



                    If Not rng2 Is Nothing Then
                       foundRow = rng2.Row
                       
                        'ws.Range("K" & foundRow).Value = MachineCode
                        ws.Cells(foundRow, ATEMPLATE_M_CODES_Column).value = machineCode
                        
                        'ws.Range("L" & foundRow).Value = MRF
                        ws.Cells(foundRow, ATEMPLATE_MFR_Column).value = MRF
                        
                        'ws.Range("P" & foundRow).Value = Distrib
                        ws.Cells(foundRow, ATEMPLATE_Distrib_1_Column).value = Distrib
                        
                        
                        'ws.Range("Q" & foundRow).Value = MOQ
                        ws.Cells(foundRow, ATEMPLATE_Distributor_Part_number_Column).value = MOQ
                        
                        'ws.Range("M" & foundRow).Value = pn
                        ws.Cells(foundRow, ATEMPLATE_PN_to_USE_Column).value = pn
                        
                        'ws.Range("O" & foundRow).Value = qtAvailable
                        ws.Cells(foundRow, ATEMPLATE_Qty_Available_Column).value = qtAvailable
                        
                        'ws.Range("R" & foundRow).Value = com2
                        ws.Cells(foundRow, ATEMPLATE_Notes_Column).value = com2
                        
                       ' ws.Range("S" & foundRow).Value = com3
                        ws.Cells(foundRow, ATEMPLATE_Stock_Status_Column).value = com3
                        
                        'ws.Range("T" & foundRow).Value = THpins
                        ws.Cells(foundRow, ATEMPLATE_TH_Pins_Column).value = THpins
                        
                        'ws.Range("AO" & foundRow).Value = lcscPN
                        ws.Cells(foundRow, ATEMPLATE_LCSC_PN1_Column).value = lcscPN
                        
                        
                        If response1 = vbYes Then
                            'ws.Range("H" & foundRow).Value = description
                            ws.Cells(foundRow, ATEMPLATE_Description_Column).value = Description
                        End If
                    End If
                
'           End If 'end of if statement for board check on B2 of each sheet
'                'inner loop to set the prices
'
'
'        End If
'    Next ws
    Next j
Next OuterLoop
'Getting Extras and putting into individual sheet
AddingExtraQtyToIndividualSheet
'As Unit Price Button Removed and macro call added here
UpdatePriceMasterToOther  'update unit price to individual sheets from master sheet

turnonscreenUpdate


End Sub
Function THpinsExists(ms As Worksheet) As Boolean

    ' set default value as true
    THpinsExists = True
    
    Dim lr As Long, i As Long
    lr = ms.Cells(ms.Rows.count, Master_CPC_Column).End(xlUp).Row
    
    For i = 4 To lr
        If ms.Cells(i, Master_Mcodes_Column) = "TH" Then
            If ms.Cells(i, Master_THPins_Column) = "" Or ms.Cells(i, Master_THPins_Column) < 0 Then
                THpinsExists = False
                Exit Function
            End If
        End If
    Next i
    
End Function


Function colapseLines_SendDataToBOM(wsLR As Long, ws As Worksheet)
            
            Application.ScreenUpdating = False
            
            Dim outputRow As Long
            Dim dict As Object
            Set dict = CreateObject("Scripting.Dictionary")

            ' Define the columns to sum (e.g., Column I = 9, J = 10, etc.)
            Dim sumCols As Variant, eraseCols As Variant
            Dim col As Variant
            sumCols = Array(23, 28, 33, 38)                         ' Sum Columns W, AB, AG, AL
            eraseCols = Array(24, 25, 29, 30, 34, 35, 39, 40)       ' Erase columns X, Y, AC, AD, AH, AI, AM, AN
            outputRow = wsLR + 1
                
            ws.Range("A" & outputRow & ":BG" & outputRow + 5).ClearContents             '' Clear any previous output area
                
            Dim x As Long
            For x = 4 To wsLR
                
                Dim CPC As String
                CPC = Trim(ws.Cells(x, "G"))
                
                If CPC <> "" Then
                    If Not dict.Exists(CPC) Then
                        dict.Add CPC, outputRow
                        
                        ' Copy entire row to output
                        ws.Rows(x).Copy Destination:=ws.Rows(outputRow)                                ' this copies entire row
                        'ws.Range("E" & x & ":T" & x).Copy Destination:=ws.Range("E" & outputRow)        ' this copies only column E to T
                        
                        For Each col In eraseCols
                            ws.Cells(outputRow, col).ClearContents
                        Next col
                        
                        outputRow = outputRow + 1
                    Else
                        Dim existingRow As Long
                        existingRow = dict(CPC)
                        
                        ' Sum numeric columns
                        On Error Resume Next
                        For Each col In sumCols
                            ws.Cells(existingRow, col).value = ws.Cells(existingRow, col).value + ws.Cells(x, col).value
                        Next col
                        
                        For Each col In eraseCols
                            ws.Cells(existingRow, col).ClearContents
                        Next col
                        
                        On Error GoTo 0
                    End If
                End If
                
            Next x
            
            ' delete the unmerged rows
            ws.Rows("4:" & wsLR).Delete Shift:=xlUp

End Function


Sub UpdatePriceMasterToOther()
Dim ms As Worksheet, ws As Worksheet, ts As Worksheet
Dim tLastRow, stRow, mLastRow, lr, fRow, LoopCounter, OuterLoop As Long
Dim fText As String 'will contain each cell value for comparision
Dim rng, rng2 As Range
Dim mPrice, machineCode As Variant
Dim x, foundRow As Integer

Dim j As Long
Dim prodName As String

Set ts = Worksheets("Temp")



Set ms = Worksheets("MasterSheet")
'OuterLoop to get each cell value for comparing
mLastRow = ms.Cells(Rows.count, 1).End(xlUp).Row

For OuterLoop = 4 To mLastRow
    'fText = ms.Range("I" & OuterLoop).Value
    fText = ms.Cells(OuterLoop, Master_CPC_Column).value
    
    'mPrice = ms.Range("O" & OuterLoop).Value
    mPrice = ms.Cells(OuterLoop, Master_UnitPrice_Column).value
    
    Dim arr As Variant
    ' Return Customer defaults to True
    arr = GetActiveProductsAndCustomer(False)
    If IsEmpty(arr) Then Exit Sub
    
           
    For j = 1 To UBound(arr)
            prodName = arr(j)
            Set ws = ThisWorkbook.Sheets(prodName)
        
    'MachineCode = ms.Range("I" & OuterLoop).Value
    'Macto add Qty and X_Qty

            'getting last row of each sheet
            lr = ws.Cells(Rows.count, ATEMPLATE_Serial_NO_Column).End(xlUp).Row
'            Set rng = ws.Range("A:A").Find(What:="#")
'            If Not rng Is Nothing Then
'                stRow = rng.Row 'the row where # found
                    'Set rng2 = ws.Range("g:g").Find(What:=fText, LookAt:=xlWhole)
                    Set rng2 = ws.Columns(ATEMPLATE_CPC_Number_Column).Find(What:=fText, LookAt:=xlWhole)
                    If Not rng2 Is Nothing Then
                       foundRow = rng2.Row
                       ws.Cells(foundRow, ATEMPLATE_Unit_Price_Column).value = mPrice
                       'ws.Range("j" & foundRow).Value = MachineCode
                    
                    End If
                
            
    Next j
Next OuterLoop
End Sub
Sub ExtraToOrder()
Dim ms As Worksheet, eos As Worksheet
Dim fExtra, chkVal1, chkVal2 As Long
'machine codes variables of string type
Dim m1, m2, m3, m4, m5, m6, machineVal As String
Dim mLastRow, oLastRow, LoopCounter, InnerLoop, InnerLoop1, InnerLoop2, InnerLoop3, InnerLoop4, xQty, xQty1, xQty2, xQty3, xQty4 As Long
Set ms = ThisWorkbook.Worksheets("MasterSheet")
Set eos = ThisWorkbook.Worksheets("ExtraOrder")

turnoffscreenUpdate

'initializing headers
initialiseHeaders , , ms


m1 = eos.Range("A1")
m2 = eos.Range("D1")
m3 = eos.Range("G1")
m4 = eos.Range("J1")
m5 = eos.Range("M1")
m6 = eos.Range("P1")
mLastRow = ms.Cells(Rows.count, Master_SNO_Column).End(xlUp).Row 'getting last row of master sheet for loopcounter
'ms.Range("D4:E" & mLastRow).ClearContents
ms.Range(ms.Cells(4, Master_EXTRA_Column), ms.Cells(mLastRow, Master_ORDERQTY_Column)).ClearContents


'ms.Range("BB4:BC" & mLastRow).ClearContents
'ms.Range("BG4:BH" & mLastRow).ClearContents
'ms.Range("BL4:BM" & mLastRow).ClearContents
'ms.Range("BQ4:BR" & mLastRow).ClearContents



'check if all the cells in column G are filled. if not then end the Sub and return msgbox "Fill all the Values in Column G"
Dim emptyCellAddresses As String
Dim i As Long
For i = 4 To mLastRow
            If ms.Cells(i, Master_Mcodes_Column).value = "" Then
           If emptyCellAddresses = "" Then
                emptyCellAddresses = ms.Cells(i, Master_Mcodes_Column).Address
            Else
                emptyCellAddresses = emptyCellAddresses & ", " & ms.Cells(i, Master_Mcodes_Column).Address
            End If
        End If
    Next i
    
    If emptyCellAddresses <> "" Then
        MsgBox "Please add values to the following cells: " & vbCrLf & emptyCellAddresses, vbExclamation, "Empty Cells Found in Column M Codes"
        Exit Sub
    Else
        'MsgBox "All cells in Column G are filled!", vbInformation, "Check Complete"
    End If
    


For LoopCounter = 4 To mLastRow
    'machineVal = ms.Range("G" & LoopCounter).Value
     machineVal = ms.Cells(LoopCounter, Master_Mcodes_Column).value
    
    If machineVal = "0201" Or machineVal = "201" Then machineVal = "402"
    'xQty = ms.Range("C" & LoopCounter).Value
    xQty = ms.Cells(LoopCounter, Master_XQuant_Column).value
    
'    xQty1 = ms.Range("BA" & LoopCounter).Value
'    xQty2 = ms.Range("BF" & LoopCounter).Value
'    xQty3 = ms.Range("BK" & LoopCounter).Value
'    xQty4 = ms.Range("BP" & LoopCounter).Value
'
    'If CP Found
        If machineVal = m1 Then
           oLastRow = eos.Cells(Rows.count, 1).End(xlUp).Row
                For InnerLoop = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop, 1).value
                    chkVal2 = eos.Cells(InnerLoop + 1, 1).value
                    If (xQty >= chkVal1) And (xQty < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop, 2).value
                        ms.Cells(LoopCounter, Master_EXTRA_Column).value = fExtra
                        ms.Cells(LoopCounter, Master_ORDERQTY_Column).value = ms.Cells(LoopCounter, Master_EXTRA_Column).value + ms.Cells(LoopCounter, Master_XQuant_Column).value
                        
                    Exit For
                    End If
                    Next InnerLoop
                

                
        'If machine value 2
        ElseIf machineVal = m2 Then
           oLastRow = eos.Cells(Rows.count, 4).End(xlUp).Row
                For InnerLoop = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop, 4).value
                    chkVal2 = eos.Cells(InnerLoop + 1, 4).value
                    If (xQty >= chkVal1) And (xQty < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop, 5).value
                        ms.Cells(LoopCounter, Master_EXTRA_Column).value = fExtra
                        ms.Cells(LoopCounter, Master_ORDERQTY_Column).value = ms.Cells(LoopCounter, Master_EXTRA_Column).value + ms.Cells(LoopCounter, Master_XQuant_Column).value
                    Exit For
                    End If
                Next InnerLoop
                

                
        ElseIf machineVal = m3 Then
           oLastRow = eos.Cells(Rows.count, 7).End(xlUp).Row
                For InnerLoop = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop, 7).value
                    chkVal2 = eos.Cells(InnerLoop + 1, 7).value
                    If (xQty >= chkVal1) And (xQty < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop, 8).value
                        ms.Cells(LoopCounter, Master_EXTRA_Column).value = fExtra
                        ms.Cells(LoopCounter, Master_ORDERQTY_Column).value = ms.Cells(LoopCounter, Master_EXTRA_Column).value + ms.Cells(LoopCounter, Master_XQuant_Column).value
                    Exit For
                    End If
                Next InnerLoop
                
'
                
        ElseIf machineVal = m4 Then
           oLastRow = eos.Cells(Rows.count, 10).End(xlUp).Row
                For InnerLoop = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop, 10).value
                    chkVal2 = eos.Cells(InnerLoop + 1, 10).value
                    If (xQty >= chkVal1) And (xQty < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop, 11).value
                        ms.Cells(LoopCounter, Master_EXTRA_Column).value = fExtra
                        ms.Cells(LoopCounter, Master_ORDERQTY_Column).value = ms.Cells(LoopCounter, Master_EXTRA_Column).value + ms.Cells(LoopCounter, Master_XQuant_Column).value
                       
                    Exit For
                    End If
                Next InnerLoop
                
'
                
        ElseIf machineVal = m5 Then
           oLastRow = eos.Cells(Rows.count, 13).End(xlUp).Row
                For InnerLoop = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop, 13).value
                    chkVal2 = eos.Cells(InnerLoop + 1, 13).value
                    If (xQty >= chkVal1) And (xQty < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop, 14).value
                        ms.Cells(LoopCounter, Master_EXTRA_Column).value = fExtra
                        ms.Cells(LoopCounter, Master_ORDERQTY_Column).value = ms.Cells(LoopCounter, Master_EXTRA_Column).value + ms.Cells(LoopCounter, Master_XQuant_Column).value
                    Exit For
                    End If
                Next InnerLoop
                
'
                
        ElseIf machineVal = m6 Then
           oLastRow = eos.Cells(Rows.count, 16).End(xlUp).Row
                For InnerLoop = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop, 16).value
                    chkVal2 = eos.Cells(InnerLoop + 1, 16).value
                    If (xQty >= chkVal1) And (xQty < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop, 17).value
                        ms.Cells(LoopCounter, Master_EXTRA_Column).value = fExtra
                        ms.Cells(LoopCounter, Master_ORDERQTY_Column).value = ms.Cells(LoopCounter, Master_EXTRA_Column).value + ms.Cells(LoopCounter, Master_XQuant_Column).value
                    Exit For
                    End If
                Next InnerLoop
                
'
                
        Else
                ms.Cells(LoopCounter, Master_ORDERQTY_Column).value = ms.Cells(LoopCounter, Master_EXTRA_Column).value + ms.Cells(LoopCounter, Master_XQuant_Column).value
        
        End If
Next LoopCounter
AddingExtraQtyToIndividualSheet

turnonscreenUpdate

End Sub
Sub AddingExtraQtyToIndividualSheet()
Dim ms As Worksheet, eos As Worksheet, ws As Worksheet, atemplateWS As Worksheet
Dim fExtra, chkVal1, chkVal2 As Long
Dim j As Long
Dim prodName As String
'machine codes variables of string type
Dim m1, m2, m3, m4, m5, m6, machineVal As String
Dim mLastRow, oLastRow, LoopCounter, InnerLoop, InnerLoop1, InnerLoop2, InnerLoop3, InnerLoop4, xQty, xQty1, xQty2, xQty3, xQty4 As Long
Set eos = Sheets("ExtraOrder")
m1 = eos.Range("A1")
m2 = eos.Range("D1")
m3 = eos.Range("G1")
m4 = eos.Range("J1")
m5 = eos.Range("M1")
m6 = eos.Range("P1")




Dim arr As Variant
' Return Customer defaults to True
arr = GetActiveProductsAndCustomer(False)
If IsEmpty(arr) Then Exit Sub

Set atemplateWS = ThisWorkbook.Worksheets("ATEMPLATE")

initialiseHeaders , , , , , , , , , , , , , , , , , atemplateWS

For j = 1 To UBound(arr)
        prodName = arr(j)
        Set ws = ThisWorkbook.Sheets(prodName)
        
'Loop to go through from each sheet contains raw data /boards/bom

                'Getting the last row of sheet
                'mLastRow = ws.Range("G10000").End(xlUp).Row
                mLastRow = ws.Cells(10000, ATEMPLATE_CPC_Number_Column).End(xlUp).Row
                    'Outer Loop to go through from each item in individual sheet
                    For LoopCounter = 4 To mLastRow 'mLastRow will change for each sheet
                        'machineVal = ws.Range("K" & LoopCounter).Value
                        machineVal = ws.Cells(LoopCounter, ATEMPLATE_M_CODES_Column).value
                        If machineVal = "0201" Or machineVal = "201" Then machineVal = "402"
                        
                        xQty = ws.Cells(LoopCounter, ATEMPLATE_X_Quant_Column).value
                        xQty1 = ws.Cells(LoopCounter, ATEMPLATE_X_Quant1_Column).value
                        xQty2 = ws.Cells(LoopCounter, ATEMPLATE_X_Quant2_Column).value
                        xQty3 = ws.Cells(LoopCounter, ATEMPLATE_X_Quant3_Column).value
                        xQty4 = ws.Cells(LoopCounter, ATEMPLATE_X_Quant4_Column).value
                        
                        'machineVal = ws.Range("L" & LoopCounter).Value
    'xQty = ws.Range("C" & LoopCounter).Value
    
    'If CP Found
        If machineVal = m1 Then
           oLastRow = eos.Cells(Rows.count, 1).End(xlUp).Row
                For InnerLoop = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop, 1).value
                    chkVal2 = eos.Cells(InnerLoop + 1, 1).value
                    If (xQty >= chkVal1) And (xQty < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop, 2).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extras_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_Order_Qty_Column).value = ws.Cells(LoopCounter, ATEMPLATE_X_Quant_Column).value + ws.Cells(LoopCounter, ATEMPLATE_Extras_Column).value
                    Exit For
                    End If
                Next InnerLoop
                
                 For InnerLoop1 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop1, 1).value
                    chkVal2 = eos.Cells(InnerLoop1 + 1, 1).value
                    If (xQty1 >= chkVal1) And (xQty1 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop1, 2).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra1_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order1_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra1_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant1_Column).value
                    Exit For
                    End If
                    Next InnerLoop1
                    
                For InnerLoop2 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop2, 1).value
                    chkVal2 = eos.Cells(InnerLoop2 + 1, 1).value
                    If (xQty2 >= chkVal1) And (xQty2 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop2, 2).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra2_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order2_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra2_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant2_Column).value
                    Exit For
                    End If
                    Next InnerLoop2
                    
                For InnerLoop3 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop3, 1).value
                    chkVal2 = eos.Cells(InnerLoop3 + 1, 1).value
                    If (xQty3 >= chkVal1) And (xQty3 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop3, 2).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra3_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order3_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra3_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant3_Column).value
                    Exit For
                    End If
                    Next InnerLoop3
                    
                For InnerLoop4 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop4, 1).value
                    chkVal2 = eos.Cells(InnerLoop4 + 1, 1).value
                    If (xQty4 >= chkVal1) And (xQty4 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop4, 2).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra4_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order4_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra4_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant4_Column).value
                    Exit For
                    End If
                Next InnerLoop4
                
                
        'If machine value 2
        ElseIf machineVal = m2 Then
           oLastRow = eos.Cells(Rows.count, 4).End(xlUp).Row
                For InnerLoop = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop, 4).value
                    chkVal2 = eos.Cells(InnerLoop + 1, 4).value
                    If (xQty >= chkVal1) And (xQty < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop, 5).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extras_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_Order_Qty_Column).value = ws.Cells(LoopCounter, ATEMPLATE_X_Quant_Column).value + ws.Cells(LoopCounter, ATEMPLATE_Extras_Column).value
                    Exit For
                    End If
                Next InnerLoop
                
                For InnerLoop1 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop1, 4).value
                    chkVal2 = eos.Cells(InnerLoop1 + 1, 4).value
                    If (xQty1 >= chkVal1) And (xQty1 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop1, 5).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra1_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order1_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra1_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant1_Column).value
                    Exit For
                    End If
                    Next InnerLoop1
                    
                For InnerLoop2 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop2, 4).value
                    chkVal2 = eos.Cells(InnerLoop2 + 1, 4).value
                    If (xQty2 >= chkVal1) And (xQty2 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop2, 5).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra2_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order2_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra2_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant2_Column).value
                    Exit For
                    End If
                    Next InnerLoop2
                    
                For InnerLoop3 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop3, 4).value
                    chkVal2 = eos.Cells(InnerLoop3 + 1, 4).value
                    If (xQty3 >= chkVal1) And (xQty3 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop3, 5).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra3_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order3_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra3_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant3_Column).value
                    Exit For
                    End If
                    Next InnerLoop3
                    
                For InnerLoop4 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop4, 4).value
                    chkVal2 = eos.Cells(InnerLoop4 + 1, 4).value
                    If (xQty4 >= chkVal1) And (xQty4 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop4, 5).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra4_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order4_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra4_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant4_Column).value
                    Exit For
                    End If
                Next InnerLoop4
                
                
        ElseIf machineVal = m3 Then
           oLastRow = eos.Cells(Rows.count, 7).End(xlUp).Row
                For InnerLoop = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop, 7).value
                    chkVal2 = eos.Cells(InnerLoop + 1, 7).value
                    If (xQty >= chkVal1) And (xQty < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop, 8).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extras_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_Order_Qty_Column).value = ws.Cells(LoopCounter, ATEMPLATE_X_Quant_Column).value + ws.Cells(LoopCounter, ATEMPLATE_Extras_Column).value
                    Exit For
                    End If
                Next InnerLoop
                
                For InnerLoop1 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop1, 7).value
                    chkVal2 = eos.Cells(InnerLoop1 + 1, 7).value
                    If (xQty1 >= chkVal1) And (xQty1 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop1, 8).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra1_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order1_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra1_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant1_Column).value
                    Exit For
                    End If
                    Next InnerLoop1
                    
                For InnerLoop2 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop2, 7).value
                    chkVal2 = eos.Cells(InnerLoop2 + 1, 7).value
                    If (xQty2 >= chkVal1) And (xQty2 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop2, 8).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra2_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order2_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra2_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant2_Column).value
                    Exit For
                    End If
                    Next InnerLoop2
                    
                For InnerLoop3 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop3, 7).value
                    chkVal2 = eos.Cells(InnerLoop3 + 1, 7).value
                    If (xQty3 >= chkVal1) And (xQty3 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop3, 8).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra3_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order3_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra3_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant3_Column).value
                    Exit For
                    End If
                    Next InnerLoop3
                    
                For InnerLoop4 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop4, 7).value
                    chkVal2 = eos.Cells(InnerLoop4 + 1, 7).value
                    If (xQty4 >= chkVal1) And (xQty4 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop4, 8).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra4_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order4_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra4_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant4_Column).value
                    Exit For
                    End If
                Next InnerLoop4
                
                
        ElseIf machineVal = m4 Then
           oLastRow = eos.Cells(Rows.count, 10).End(xlUp).Row
                For InnerLoop = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop, 10).value
                    chkVal2 = eos.Cells(InnerLoop + 1, 10).value
                    If (xQty >= chkVal1) And (xQty < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop, 11).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extras_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_Order_Qty_Column).value = ws.Cells(LoopCounter, ATEMPLATE_X_Quant_Column).value + ws.Cells(LoopCounter, ATEMPLATE_Extras_Column).value
                    Exit For
                    End If
                Next InnerLoop
                
                For InnerLoop1 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop1, 10).value
                    chkVal2 = eos.Cells(InnerLoop1 + 1, 10).value
                    If (xQty1 >= chkVal1) And (xQty1 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop1, 11).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra1_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order1_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra1_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant1_Column).value
                    Exit For
                    End If
                    Next InnerLoop1
                    
                For InnerLoop2 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop2, 10).value
                    chkVal2 = eos.Cells(InnerLoop2 + 1, 10).value
                    If (xQty2 >= chkVal1) And (xQty2 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop2, 11).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra2_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order2_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra2_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant2_Column).value
                    Exit For
                    End If
                    Next InnerLoop2
                    
                For InnerLoop3 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop3, 10).value
                    chkVal2 = eos.Cells(InnerLoop3 + 1, 10).value
                    If (xQty3 >= chkVal1) And (xQty3 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop3, 11).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra3_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order3_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra3_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant3_Column).value
                    Exit For
                    End If
                    Next InnerLoop3
                    
                For InnerLoop4 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop4, 10).value
                    chkVal2 = eos.Cells(InnerLoop4 + 1, 10).value
                    If (xQty4 >= chkVal1) And (xQty4 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop4, 11).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra4_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order4_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra4_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant4_Column).value
                    Exit For
                    End If
                Next InnerLoop4
                
                
        ElseIf machineVal = m5 Then
           oLastRow = eos.Cells(Rows.count, 13).End(xlUp).Row
                For InnerLoop = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop, 13).value
                    chkVal2 = eos.Cells(InnerLoop + 1, 13).value
                    If (xQty >= chkVal1) And (xQty < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop, 14).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extras_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_Order_Qty_Column).value = ws.Cells(LoopCounter, ATEMPLATE_X_Quant_Column).value + ws.Cells(LoopCounter, ATEMPLATE_Extras_Column).value
                    Exit For
                    End If
                Next InnerLoop
                
                For InnerLoop1 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop1, 13).value
                    chkVal2 = eos.Cells(InnerLoop1 + 1, 13).value
                    If (xQty1 >= chkVal1) And (xQty1 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop1, 14).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra1_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order1_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra1_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant1_Column).value
                    Exit For
                    End If
                    Next InnerLoop1
                    
                For InnerLoop2 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop2, 13).value
                    chkVal2 = eos.Cells(InnerLoop2 + 1, 13).value
                    If (xQty2 >= chkVal1) And (xQty2 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop2, 14).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra2_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order2_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra2_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant2_Column).value
                    Exit For
                    End If
                    Next InnerLoop2
                    
                For InnerLoop3 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop3, 13).value
                    chkVal2 = eos.Cells(InnerLoop3 + 1, 13).value
                    If (xQty3 >= chkVal1) And (xQty3 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop3, 14).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra3_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order3_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra3_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant3_Column).value
                    Exit For
                    End If
                    Next InnerLoop3
                    
                For InnerLoop4 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop4, 13).value
                    chkVal2 = eos.Cells(InnerLoop4 + 1, 13).value
                    If (xQty4 >= chkVal1) And (xQty4 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop4, 14).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra4_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order4_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra4_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant4_Column).value
                    Exit For
                    End If
                Next InnerLoop4
                
                
        ElseIf machineVal = m6 Then
           oLastRow = eos.Cells(Rows.count, 16).End(xlUp).Row
                For InnerLoop = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop, 16).value
                    chkVal2 = eos.Cells(InnerLoop + 1, 16).value
                    If (xQty >= chkVal1) And (xQty < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop, 17).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extras_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_Order_Qty_Column).value = ws.Cells(LoopCounter, ATEMPLATE_X_Quant_Column).value + ws.Cells(LoopCounter, ATEMPLATE_Extras_Column).value
                    Exit For
                    End If
                Next InnerLoop
                
                For InnerLoop1 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop1, 16).value
                    chkVal2 = eos.Cells(InnerLoop1 + 1, 16).value
                    If (xQty1 >= chkVal1) And (xQty1 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop1, 17).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra1_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order1_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra1_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant1_Column).value
                    Exit For
                    End If
                    Next InnerLoop1
                    
                For InnerLoop2 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop2, 16).value
                    chkVal2 = eos.Cells(InnerLoop2 + 1, 16).value
                    If (xQty2 >= chkVal1) And (xQty2 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop2, 17).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra2_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order2_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra2_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant2_Column).value
                    Exit For
                    End If
                    Next InnerLoop2
                    
                For InnerLoop3 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop3, 16).value
                    chkVal2 = eos.Cells(InnerLoop3 + 1, 16).value
                    If (xQty3 >= chkVal1) And (xQty3 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop3, 17).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra3_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order3_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra3_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant3_Column).value
                    Exit For
                    End If
                    Next InnerLoop3
                    
                For InnerLoop4 = 4 To oLastRow
                    chkVal1 = eos.Cells(InnerLoop4, 16).value
                    chkVal2 = eos.Cells(InnerLoop4 + 1, 16).value
                    If (xQty4 >= chkVal1) And (xQty4 < chkVal2) Then
                        fExtra = eos.Cells(InnerLoop4, 17).value
                        ws.Cells(LoopCounter, ATEMPLATE_Extra4_Column).value = fExtra
                        ws.Cells(LoopCounter, ATEMPLATE_QTY_to_order4_Column).value = ws.Cells(LoopCounter, ATEMPLATE_Extra4_Column).value + ws.Cells(LoopCounter, ATEMPLATE_X_Quant4_Column).value
                    Exit For
                    End If
                Next InnerLoop4
                
                
        ElseIf machineVal = "" Then
                        ws.Cells(LoopCounter, ATEMPLATE_Order_Qty_Column).value = ws.Cells(LoopCounter, ATEMPLATE_X_Quant_Column).value + ws.Cells(LoopCounter, ATEMPLATE_Extras_Column).value
        
        End If
                    Next LoopCounter 'End of LoopCounter
'        End If 'end-if of if board 0 on each sheet
        'End If

'Next ws
Next j


End Sub

Sub UpdateProcurement(Optional bypassQuestion As Boolean = False)
'this piece of code save and update the data procurement sheet
Dim mLastRow, pLastRow, OutLoopCounter, InLoopCounter, foundRow, pLR As Long
Dim ms As Worksheet, ps As Worksheet
Dim mPN, DPN As String 'Manufacture Part No and Distributor Part No
Dim rng, rng1 As Range
Dim i As Integer
Dim findValue As String
Dim logTime As Date, wsProcurementLog As Worksheet, procurementLogLR As Long
Dim f As New frmTaskEntry



    ' Display a message box with Yes/No buttons
    Dim response As VbMsgBoxResult
    
    If Not bypassQuestion Then
        response = MsgBox("Proceed to save Data to Procurement?", vbQuestion + vbYesNo, "Confirmation")
    Else
        response = vbYes
    End If
    
    ' Check the user's response
    If response = vbYes Then
    

    
    Dim projectName As String
    Dim projectNotes As String
    
    projectName = ThisWorkbook.Sheets("MasterSheet").Range("W1")
    projectNotes = ThisWorkbook.Sheets("MasterSheet").Range("X1")
      
      
turnoffscreenUpdate


Set ms = ThisWorkbook.Sheets("MasterSheet")
Set ps = ThisWorkbook.Sheets("Procurement")
Set wsProcurementLog = ThisWorkbook.Sheets("Procurement Log")


'Initializing headers
initialiseHeaders , , ms, , , , , , , , , , , , , , ps, , wsProcurementLog


' Check if AutoFilter is on and remove it
    If ps.AutoFilterMode Then
        ps.AutoFilterMode = False
    End If
Dim isBlank As Variant
Dim c As Integer
isBlank = ""
OutLoopCounter = 0
InLoopCounter = 0
'getting the last row in master sheet
mLastRow = ms.Cells(ms.Rows.count, Master_SNO_Column).End(xlUp).Row
'Getting the last Row in Procurement Sheet
'plastRow = ps.Range("A100000").End(xlUp).Row
pLastRow = ps.Cells(ps.Rows.count, ProcureSheet_CPC_Column).End(xlUp).Row

'If procurement sheet contains no record then to paste all records from MasterSheet
    If pLastRow = 1 Then
        'ms.Range("I4:J" & mLastRow).Copy ps.Range("A2")
        ' This copies from row 4 to mLastRow
        'column i to CPC column of PS sheet
        ms.Range(ms.Cells(4, Master_CPC_Column), ms.Cells(mLastRow, Master_CPC_Column)).Copy ps.Cells(2, ProcureSheet_CPC_Column)
        'column j to column Distributor Part Number of ps sheet
        ms.Range(ms.Cells(4, Master_MFRHas_Column), ms.Cells(mLastRow, Master_MFRHas_Column)).Copy ps.Cells(2, ProcureSheet_DistributorPartNumber_Column)
        
        'here need to copy and paste the data
        'ms.Range("M4:T" & mLastRow).Copy ps.Range("c2") 'splitted to invidual columns due to dynamic columns
        'copy column M
        'ms.Range(ms.Cells(4, Master_ncrFlag_Column), ms.Cells(mLastRow, Master_ncrFlag_Column)).Copy ps.Cells(2, ProcureSheet_UnitPrice_Column)
        
        'Copy each column M:T
        ms.Range(ms.Cells(4, Master_ncrFlag_Column), ms.Cells(mLastRow, Master_ncrFlag_Column)).Copy ps.Cells(2, ProcureSheet_UnitPrice_Column)
        ms.Range(ms.Cells(4, Master_THPins_Column), ms.Cells(mLastRow, Master_THPins_Column)).Copy ps.Cells(2, ProcureSheet_MFRNAME_Column)
        ms.Range(ms.Cells(4, Master_UnitPrice_Column), ms.Cells(mLastRow, Master_UnitPrice_Column)).Copy ps.Cells(2, ProcureSheet_PNTOUSE_Column)
        ms.Range(ms.Cells(4, Master_MFR_Column), ms.Cells(mLastRow, Master_MFR_Column)).Copy ps.Cells(2, ProcureSheet_QTYAvlble_Column)
        ms.Range(ms.Cells(4, Master_PNTOUSE_Column), ms.Cells(mLastRow, Master_PNTOUSE_Column)).Copy ps.Cells(2, ProcureSheet_Distrib_Column)
        ms.Range(ms.Cells(4, Master_QTYAvlble_Column), ms.Cells(mLastRow, Master_QTYAvlble_Column)).Copy ps.Cells(2, ProcureSheet_DistributorPN_Column)
        ms.Range(ms.Cells(4, Master_Distrib1_Column), ms.Cells(mLastRow, Master_Distrib1_Column)).Copy ps.Cells(2, ProcureSheet_Notes_Column)
        ms.Range(ms.Cells(4, Master_DistributorPartnumber_Column), ms.Cells(mLastRow, -Master_DistributorPartnumber_Column)).Copy ps.Cells(2, ProcureSheet_StoctStatus_Column)
        
        'ms.Range(MasterSheetCustomerNameAddress).Copy: ps.Range("V2:V" & mLastRow - 2).PasteSpecial xlPasteValues
        
        ps.Range(ps.Cells(2, ProcureSheet_Customer_Column), ps.Cells(mLastRow - 2, ProcureSheet_Customer_Column)).value = Range("Customer_Name").value
        
        Exit Sub
    End If
'Concatenating MPN and DPN for easy search purpose
'    For i = 2 To pLastRow
'        ps.Range("K" & i) = "'" & ps.Range("A" & i) & ps.Range("B" & i)
'    Next i
'Add new Records if not in Procurement Sheet

logTime = Format(FillDateTimeInCanada, "mm/dd/yyyy hh:mm:ss")

    For OutLoopCounter = 4 To mLastRow
        'MPN = ms.Range("I" & OutLoopCounter)
        mPN = ms.Cells(OutLoopCounter, Master_CPC_Column)
        'DPN = ms.Range("J" & OutLoopCounter)
        findValue = mPN
        'c = Application.CountA(ms.Range("N" & OutLoopCounter & ":T" & OutLoopCounter))
        
        'Dont overwrite data if rows are blank
'        On Error Resume Next
'        isBlank = ms.Range("M" & OutLoopCounter) & ms.Range("N" & OutLoopCounter) & _
'        ms.Range("O" & OutLoopCounter) & ms.Range("P" & OutLoopCounter) & ms.Range("Q" & OutLoopCounter) & ms.Range("R" & OutLoopCounter) & _
'        ms.Range("S" & OutLoopCounter) & ms.Range("T" & OutLoopCounter)
'        If Err.Number = 13 Then
'            isBlank = 2
'        End If
            'For InLoopCounter = 2 To pLastRow
                
                procurementLogLR = wsProcurementLog.Cells(wsProcurementLog.Rows.count, ProcurementLog_Log_Time_Column).End(xlUp).Row
                
                'Set rng = ps.Range("A:A").Find(What:=findValue, LookAt:=xlWhole, LookIn:=xlValues) 'Finding the MPN on procurement Sheet
                Set rng = ps.Columns(ProcureSheet_CPC_Column).Find(What:=findValue, LookAt:=xlWhole, LookIn:=xlValues)
                
                    If Not rng Is Nothing Then
                       'do when record match found
                        foundRow = rng.Row
                        
                                'ps.Range("V" & foundRow) = ms.Range(MasterSheetCustomerNameAddress)
                                
                                ps.Cells(foundRow, ProcureSheet_Customer_Column) = ms.Range("Customer_Name").value
                            'If MPN = ps.Range("A" & InLoopCounter) And DPN = ps.Range("B" & InLoopCounter) Then 'Checking for DPN number on same row
                                'When match found then update the contents on Procurement Sheet
                                'If c = 0 Then
                                    'Else
                                    'check if rows are blank
'                                    Dim concateRng As Range
'                                    Dim concatenatedString As String
'                                    Dim cell As Range
'                                    concatenatedString = ""
'
'                                    Set concateRng = Range(Cells(OutLoopCounter, "M"), Cells(OutLoopCounter, "AD"))
'                                    For Each cell In concateRng
'                                        concatenatedString = concatenatedString & cell.Value
'                                    Next cell
'
                                                                    
                            'checking Master_Distrib1_Column and Master_DistributorPartnumber_Column
                               If ms.Cells(OutLoopCounter, Master_Distrib1_Column) <> "" Then
                                            
                                    
'                                    If concatenatedString <> "" Then
                                    
                                        ' check if any value is changing and update the log
                                        Dim valueChange As Boolean
                                        valueChange = False
                                        
                                        If ps.Cells(foundRow, ProcureSheet_PNTOUSE_Column) <> ms.Cells(OutLoopCounter, Master_PNTOUSE_Column) Then
                                            wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_PN_to_Use_Column) = ms.Cells(OutLoopCounter, Master_PNTOUSE_Column)
                                            wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Other_Comments_Column) = wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Other_Comments_Column) & "Old PN to Use: " & ps.Cells(foundRow, ProcureSheet_PNTOUSE_Column) & "; "
                                            valueChange = True
                                        End If
                                        
                                        If ps.Cells(foundRow, ProcureSheet_Distrib_Column) <> ms.Cells(OutLoopCounter, Master_Distrib1_Column) Then
                                            wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Distributor_Name_Column) = ms.Cells(OutLoopCounter, Master_Distrib1_Column)
                                            wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Other_Comments_Column) = wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Other_Comments_Column) & "Old DistName: " & ps.Cells(foundRow, ProcureSheet_Distrib_Column) & "; "
                                            valueChange = True
                                        End If
                                        
                                        If ps.Cells(foundRow, ProcureSheet_DistributorPN_Column) <> ms.Cells(OutLoopCounter, Master_DistributorPartnumber_Column) Then
                                            wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Distributor_PN_Column) = ms.Cells(OutLoopCounter, Master_DistributorPartnumber_Column)
                                            wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Other_Comments_Column) = wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Other_Comments_Column) & "Old DistPN: " & ps.Cells(foundRow, ProcureSheet_DistributorPN_Column) & "; "
                                            valueChange = True
                                        End If
                                        
                                        If ps.Cells(foundRow, ProcureSheet_LCSCPN_Column) <> ms.Cells(OutLoopCounter, Master_LCSCPN_Column) Then
                                            wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_LCSC_PN_Column) = ms.Cells(OutLoopCounter, Master_LCSCPN_Column)
                                            wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Other_Comments_Column) = wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Other_Comments_Column) & "Old LCSC PN: " & ps.Cells(foundRow, ProcureSheet_LCSCPN_Column) & "; "
                                            valueChange = True
                                        End If
                                        
                                        If ps.Cells(foundRow, ProcureSheet_Notes_Column) <> ms.Cells(OutLoopCounter, Master_Notes_Column) Then
                                            wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Notes_Column) = ms.Cells(OutLoopCounter, Master_Notes_Column)
                                            wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Other_Comments_Column) = wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Other_Comments_Column) & "Old Note: " & ps.Cells(foundRow, ProcureSheet_Notes_Column) & "; "
                                            valueChange = True
                                        End If
                                        
                                        
                                        If valueChange Then
                                            wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Log_Time_Column).NumberFormat = "mm/dd/yyyy hh:mm:ss"
                                            wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Log_Time_Column) = logTime
                                            wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_CPC_Column) = mPN
                                            wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Proc_Batch_Code_Column) = projectName
                                            wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Entry_From_MasterSheet_or_Proc_Column) = "MasterSheet"
                                            wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Other_Comments_Column) = Left(wsProcurementLog.Cells(procurementLogLR + 1, "J"), Len(wsProcurementLog.Cells(procurementLogLR + 1, "J")) - 2)
                                            procurementLogLR = procurementLogLR + 1
                                        End If
                                        
                                        
                                        ps.Cells(foundRow, ProcureSheet_UnitPrice_Column) = ms.Cells(OutLoopCounter, Master_UnitPrice_Column)
                                        ps.Cells(foundRow, ProcureSheet_MFRNAME_Column) = ms.Cells(OutLoopCounter, Master_MFR_Column)
                                        ps.Cells(foundRow, ProcureSheet_PNTOUSE_Column) = ms.Cells(OutLoopCounter, Master_PNTOUSE_Column)
                                        ps.Cells(foundRow, ProcureSheet_QTYAvlble_Column) = ms.Cells(OutLoopCounter, Master_QTYAvlble_Column)
                                        ps.Cells(foundRow, ProcureSheet_Distrib_Column) = ms.Cells(OutLoopCounter, Master_Distrib1_Column)
                                        ps.Cells(foundRow, ProcureSheet_DistributorPN_Column) = ms.Cells(OutLoopCounter, Master_DistributorPartnumber_Column)
                                        ps.Cells(foundRow, ProcureSheet_Notes_Column) = ms.Cells(OutLoopCounter, Master_Notes_Column)
                                        ps.Cells(foundRow, ProcureSheet_StoctStatus_Column) = ms.Cells(OutLoopCounter, Master_StockStatus_Column)
                                        ps.Cells(foundRow, ProcureSheet_THPins_Column) = ms.Cells(OutLoopCounter, Master_THPins_Column)
                                        ps.Cells(foundRow, ProcureSheet_Distrbutor2name_Column) = ms.Cells(OutLoopCounter, Master_Distrbutor2name_Column)
                                        ps.Cells(foundRow, ProcureSheet_Distrbutor2stock_Column) = ms.Cells(OutLoopCounter, Master_Distrbutor2stock_Column)
                                        ps.Cells(foundRow, ProcureSheet_Distrbutor2price_Column) = ms.Cells(OutLoopCounter, Master_Distrbutor2price_Column)
                                        ps.Cells(foundRow, ProcureSheet_Distributor2leadtime_Column) = ms.Cells(OutLoopCounter, Master_Distributor2leadtime_Column)
                                        ps.Cells(foundRow, ProcureSheet_LCSCPN_Column) = ms.Cells(OutLoopCounter, Master_LCSCPN_Column)
                                        ps.Cells(foundRow, ProcureSheet_SafetyStock_Column) = ms.Cells(OutLoopCounter, Master_SafetyStock_Column)
                                        ps.Cells(foundRow, ProcureSheet_StockatCustomer_Column) = ms.Cells(OutLoopCounter, Master_StockatCustomer_Column)
                                        ps.Cells(foundRow, ProcureSheet_StockatRS_Column) = ms.Cells(OutLoopCounter, Master_StockatRS_Column)
                                        ps.Cells(foundRow, ProcureSheet_FeederType_Column) = ms.Cells(OutLoopCounter, Master_FeederType_Column)
                                        ps.Cells(foundRow, ProcureSheet_NCRFlag_Column) = ms.Cells(OutLoopCounter, Master_ncrFlag_Column)
                                    
                                        
                                End If
                                'End If
                            'do when MPN is matched but DPN Not matched
                    Else
                                    
                                    
                                    'Getting the last Empty Row
                                    'pLR = ps.Range("A100000").End(xlUp).Row + 1
                                    pLR = ps.Cells(100000, ProcureSheet_CPC_Column).End(xlUp).Row + 1
                                    
                                    ps.Cells(pLR, ProcureSheet_Customer_Column) = Range("Customer_Name").value
                                    
                                    'Adding Records to PS Sheet if no MPN found
                                    ps.Cells(pLR, ProcureSheet_CPC_Column) = ms.Cells(OutLoopCounter, Master_CPC_Column)
                                    ps.Cells(pLR, ProcureSheet_DistributorPartNumber_Column) = ms.Cells(OutLoopCounter, Master_MFRHas_Column)
                                    ps.Cells(pLR, ProcureSheet_UnitPrice_Column) = ms.Cells(OutLoopCounter, Master_UnitPrice_Column)
                                    ps.Cells(pLR, ProcureSheet_MFRNAME_Column) = ms.Cells(OutLoopCounter, Master_MFR_Column)
                                    ps.Cells(pLR, ProcureSheet_PNTOUSE_Column) = ms.Cells(OutLoopCounter, Master_PNTOUSE_Column)
                                    ps.Cells(pLR, ProcureSheet_QTYAvlble_Column) = ms.Cells(OutLoopCounter, Master_QTYAvlble_Column)
                                    ps.Cells(pLR, ProcureSheet_Distrib_Column) = ms.Cells(OutLoopCounter, Master_Distrib1_Column)
                                    ps.Cells(pLR, ProcureSheet_DistributorPN_Column) = ms.Cells(OutLoopCounter, Master_DistributorPartnumber_Column)
                                    ps.Cells(pLR, ProcureSheet_Notes_Column) = ms.Cells(OutLoopCounter, Master_Notes_Column)
                                    ps.Cells(pLR, ProcureSheet_StoctStatus_Column) = ms.Cells(OutLoopCounter, Master_StockStatus_Column)
                                    ps.Cells(pLR, ProcureSheet_THPins_Column) = ms.Cells(OutLoopCounter, Master_THPins_Column)
                                    ps.Cells(pLR, ProcureSheet_Distrbutor2name_Column) = ms.Cells(OutLoopCounter, Master_Distrbutor2name_Column)
                                    ps.Cells(pLR, ProcureSheet_Distrbutor2stock_Column) = ms.Cells(OutLoopCounter, Master_Distrbutor2stock_Column)
                                    ps.Cells(pLR, ProcureSheet_Distrbutor2price_Column) = ms.Cells(OutLoopCounter, Master_Distrbutor2price_Column)
                                    ps.Cells(pLR, ProcureSheet_Distributor2leadtime_Column) = ms.Cells(OutLoopCounter, Master_Distributor2leadtime_Column)
                                    ps.Cells(pLR, ProcureSheet_LCSCPN_Column) = ms.Cells(OutLoopCounter, Master_LCSCPN_Column)
                                    ps.Cells(pLR, ProcureSheet_SafetyStock_Column) = ms.Cells(OutLoopCounter, Master_SafetyStock_Column)
                                    
                                    'Adding Records to PS Sheet if no MPN found
                                    ps.Cells(pLR, ProcureSheet_CPC_Column) = ms.Cells(OutLoopCounter, Master_CPC_Column)
                                    ps.Cells(pLR, ProcureSheet_DistributorPartNumber_Column) = ms.Cells(OutLoopCounter, Master_MFRHas_Column)
                                    ps.Cells(pLR, ProcureSheet_UnitPrice_Column) = ms.Cells(OutLoopCounter, Master_UnitPrice_Column)
                                    ps.Cells(pLR, ProcureSheet_MFRNAME_Column) = ms.Cells(OutLoopCounter, Master_MFR_Column)
                                    ps.Cells(pLR, ProcureSheet_PNTOUSE_Column) = ms.Cells(OutLoopCounter, Master_PNTOUSE_Column)
                                    ps.Cells(pLR, ProcureSheet_QTYAvlble_Column) = ms.Cells(OutLoopCounter, Master_QTYAvlble_Column)
                                    ps.Cells(pLR, ProcureSheet_Distrib_Column) = ms.Cells(OutLoopCounter, Master_Distrib1_Column)
                                    ps.Cells(pLR, ProcureSheet_DistributorPN_Column) = ms.Cells(OutLoopCounter, Master_DistributorPartnumber_Column)
                                    ps.Cells(pLR, ProcureSheet_Notes_Column) = ms.Cells(OutLoopCounter, Master_Notes_Column)
                                    ps.Cells(pLR, ProcureSheet_StoctStatus_Column) = ms.Cells(OutLoopCounter, Master_StockStatus_Column)
                                    ps.Cells(pLR, ProcureSheet_THPins_Column) = ms.Cells(OutLoopCounter, Master_THPins_Column)
                                    ps.Cells(pLR, ProcureSheet_Distrbutor2name_Column) = ms.Cells(OutLoopCounter, Master_Distrbutor2name_Column)
                                    ps.Cells(pLR, ProcureSheet_Distrbutor2stock_Column) = ms.Cells(OutLoopCounter, Master_Distrbutor2stock_Column)
                                    ps.Cells(pLR, ProcureSheet_Distrbutor2price_Column) = ms.Cells(OutLoopCounter, Master_Distrbutor2price_Column)
                                    ps.Cells(pLR, ProcureSheet_Distributor2leadtime_Column) = ms.Cells(OutLoopCounter, Master_Distributor2leadtime_Column)
                                    ps.Cells(pLR, ProcureSheet_LCSCPN_Column) = ms.Cells(OutLoopCounter, Master_LCSCPN_Column)
                                    ps.Cells(pLR, ProcureSheet_SafetyStock_Column) = ms.Cells(OutLoopCounter, Master_SafetyStock_Column)
                                    
                                    ' update the logs
                                    wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Log_Time_Column).NumberFormat = "mm/dd/yyyy hh:mm:ss"
                                    wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Log_Time_Column) = logTime
                                    wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_CPC_Column) = mPN
                                    wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Proc_Batch_Code_Column) = projectName
                                    wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_PN_to_Use_Column) = ms.Cells(OutLoopCounter, Master_PNTOUSE_Column)
                                    wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Distributor_PN_Column) = ms.Cells(OutLoopCounter, Master_DistributorPartnumber_Column)
                                    wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Distributor_Name_Column) = ms.Cells(OutLoopCounter, Master_Distrib1_Column)
                                    wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_LCSC_PN_Column) = ms.Cells(OutLoopCounter, Master_LCSCPN_Column)
                                    wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Entry_From_MasterSheet_or_Proc_Column) = "MasterSheet"
                                    wsProcurementLog.Cells(procurementLogLR + 1, ProcurementLog_Other_Comments_Column) = "New Line"
                                    procurementLogLR = procurementLogLR + 1
                                    
                    End If
                      
            'Next InLoopCounter
    
    Next OutLoopCounter
'pLR = ps.Range("A100000").End(xlUp).Row
pLR = ps.Cells(100000, ProcureSheet_CPC_Column).End(xlUp).Row
Dim lastCol As Long 'used for last column

'Set rng1 = ps.Range("A2:W" & pLR)
lastCol = ps.Cells(2, ps.Columns.count).End(xlToLeft).Column
Set rng1 = ps.Range(ps.Cells(2, 1), ps.Cells(pLR, lastCol))
    With rng1.Borders
        .LineStyle = xlContinuous
        .Color = vbRed
        .Weight = xlThin
    End With

turnonscreenUpdate

    Else
        ' User clicked "No," do nothing or display a message
        MsgBox "Operation Cancelled."
        Exit Sub
    End If

End Sub

Function updateProcurementLog()
    Dim wsProcurementLog As Worksheet
    Dim wsProcurementLogLR As Long
    
    Set wsProcurementLog = ThisWorkbook.Sheets("Procurement Log")
    wsProcurementLogLR = wsProcurementLog.Cells(wsProcurementLog.Rows.count, "A").End(xlUp).Row
    
    

End Function
Sub LoadProcurementDataToMasterSheet()
Dim ms As Worksheet, ps As Worksheet
Dim OuterLoop, mLastRow, pLastRow As Integer
Dim mPN, DPN As String 'Manufacture Part No and Distributor Part No
Dim rng, rng1 As Range
Dim i As Integer
Dim findValue As String

turnoffscreenUpdate

Set ms = ThisWorkbook.Sheets("MasterSheet")
Set ps = ThisWorkbook.Sheets("Procurement")

'Initializing headers
initialiseHeaders , , ms, , , , , , , , , , , , , , ps

' Check if AutoFilter is on and remove it
    If ps.AutoFilterMode Then
        ps.AutoFilterMode = False
    End If
    
'mLastRow = ms.Range("A100000").End(xlUp).Row
mLastRow = ms.Cells(ms.Rows.count, Master_SNO_Column).End(xlUp).Row

'plastRow = ps.Range("A10000").End(xlUp).Row
pLastRow = ps.Cells(10000, ProcureSheet_CPC_Column).End(xlUp).Row


Dim OutLoopCounter As Integer

Dim foundRow As Integer
'concatenating MPN and DPN columns
'For i = 4 To mLastRow
'    ms.Range("U" & i) = "'" & ms.Range("I" & i) & ms.Range("J" & i)
'
'Next i

For OutLoopCounter = 4 To mLastRow
        findValue = ms.Cells(OutLoopCounter, Master_CPC_Column)
            
                'Set rng = ps.Range("a:a").Find(What:=findValue, LookAt:=xlWhole) 'Finding the MPN on procurement Sheet
                Set rng = ps.Columns(ProcureSheet_CPC_Column).Find(What:=findValue, LookAt:=xlWhole)
                    If Not rng Is Nothing Then
                       'do when record match found
                        foundRow = rng.Row
                            'If MPN = ps.Range("A" & InLoopCounter) And DPN = ps.Range("B" & InLoopCounter) Then 'Checking for DPN number on same row
                                'When match found then update the contents on MasterSheet
                                    ms.Cells(Master_ncrFlag_Column) = ps.Cells(foundRow, ProcureSheet_NCRFlag_Column) ' ps.Range("X" & foundRow)
                                    ms.Cells(OutLoopCounter, Master_THPins_Column) = ps.Cells(foundRow, ProcureSheet_THPins_Column) ' ps.Range("k" & foundRow)
                                    ms.Cells(OutLoopCounter, Master_UnitPrice_Column) = ps.Cells(foundRow, ProcureSheet_UnitPrice_Column) ' ps.Range("C" & foundRow)
                                    'ps.Range("C" & foundRow) = ms.Range("M" & OutLoopCounter)
                                    ms.Cells(OutLoopCounter, Master_MFR_Column) = ps.Cells(foundRow, ProcureSheet_MFRNAME_Column) 'ps.Range("d" & foundRow)
                                    
                                    ms.Cells(OutLoopCounter, Master_PNTOUSE_Column) = ps.Cells(foundRow, ProcureSheet_PNTOUSE_Column) 'ps.Range("e" & foundRow)
                                    ms.Cells(OutLoopCounter, Master_QTYAvlble_Column) = ps.Cells(foundRow, ProcureSheet_QTYAvlble_Column) 'ps.Range("f" & foundRow)
                                    ms.Cells(OutLoopCounter, Master_Distrib1_Column) = ps.Cells(foundRow, ProcureSheet_Distrib_Column) 'ps.Range("g" & foundRow)
                                    ms.Cells(OutLoopCounter, Master_DistributorPartnumber_Column) = ps.Cells(foundRow, ProcureSheet_DistributorPN_Column) 'ps.Range("h" & foundRow)
                                    ms.Cells(OutLoopCounter, Master_Notes_Column) = ps.Cells(foundRow, ProcureSheet_Notes_Column) 'ps.Range("i" & foundRow)
                                    ms.Cells(OutLoopCounter, Master_StockStatus_Column) = ps.Cells(foundRow, ProcureSheet_StoctStatus_Column)   'ps.Range("j" & foundRow)
                                    ms.Cells(OutLoopCounter, Master_Distrbutor2name_Column) = ps.Cells(foundRow, ProcureSheet_Distrbutor2name_Column)  'ps.Range("l" & foundRow)
                                    ms.Cells(OutLoopCounter, Master_Distrbutor2stock_Column) = ps.Cells(foundRow, ProcureSheet_Distrbutor2stock_Column) 'ps.Range("m" & foundRow)
                                    ms.Cells(OutLoopCounter, Master_Distrbutor2price_Column) = ps.Cells(foundRow, ProcureSheet_Distrbutor2price_Column)   'ps.Range("n" & foundRow)
                                    ms.Cells(OutLoopCounter, Master_Distributor2leadtime_Column) = ps.Cells(foundRow, ProcureSheet_Distributor2leadtime_Column)  'ps.Range("o" & foundRow)
                                    ms.Cells(OutLoopCounter, Master_LCSCPN_Column) = ps.Cells(foundRow, ProcureSheet_LCSCPN_Column) 'ps.Range("p" & foundRow)
                                    ms.Cells(OutLoopCounter, Master_SafetyStock_Column) = ps.Cells(foundRow, ProcureSheet_SafetyStock_Column)   'ps.Range("q" & foundRow)
                                    ms.Cells(OutLoopCounter, Master_StockatCustomer_Column) = ps.Cells(foundRow, ProcureSheet_StockatCustomer_Column)  'ps.Range("r" & foundRow)
                                    ms.Cells(OutLoopCounter, Master_StockatRS_Column) = ps.Cells(foundRow, ProcureSheet_StockatRS_Column) 'ps.Range("s" & foundRow)
                                    ms.Cells(OutLoopCounter, Master_FeederType_Column) = ps.Cells(foundRow, ProcureSheet_FeederType_Column)  'ps.Range("w" & foundRow)
                                    
                                     
                            'do when MPN is matched but DPN Not matched
                    End If
    
    Next OutLoopCounter

turnonscreenUpdate

End Sub
Sub GetSheetsNames()
'This piece of code to get the data input sheet names and list on DataInputSheets
Dim ws As Worksheet
Dim dis As Worksheet
Set dis = ThisWorkbook.Sheets("DataInputSheets")
Dim lastRow As Integer
Dim sr As Integer

turnoffscreenUpdate

initialiseHeaders dis

Dim lr As Long
lr = dis.Cells(dis.Rows.count, DM_GlobalMFRPackage_Column).End(xlUp).Row

    ' first check if the sheet exists that are available in data input sheet
    Dim i As Integer
    Dim SheetName As String
    Dim rowsToDelete As Collection
    Set rowsToDelete = New Collection

    ' Step 1: Identify rows to delete
    For i = lr To 6 Step -1
    SheetName = dis.Cells(i, DM_GlobalMFRPackage_Column)
    
    If WorksheetExists(SheetName) Then
        'MsgBox "The sheet '" & sheetName & "' exists in the workbook.", vbInformation
    Else
        'MsgBox "The sheet '" & sheetName & "' does not exist in the workbook.", vbExclamation
        rowsToDelete.Add i
        End If
    Next i

    ' Step 2: Delete rows after the loop
    Dim rowToDelete As Variant
    For Each rowToDelete In rowsToDelete
        dis.Rows(rowToDelete).Delete
    Next rowToDelete

sr = 1
'dis.Range("A6:AD" & lr).Delete Shift:=xlUp
For Each ws In ThisWorkbook.Worksheets
 If ws.Name = "ATEMPLATE" Or ws.Name = "Procurement Log" Or ws.Name = "Customer Details" Or ws.Name = "Programming" Or ws.Name = "Authorization" Or ws.Name = "Price Calc" Or ws.Name = "Temp" Or ws.Name = "Quote Log" Or ws.Name = "MasterSheet" Or ws.Name = "MachineCodes" Or ws.Name = "ExtraOrder" Or ws.Name = "ManualMachineCode" Or ws.Name = "MachineCodeSummary" Or ws.Name = "Procurement" Or ws.Name = "DataInputSheets" Or ws.Name = "Stencils Positions" Then
    Else
    
    lastRow = dis.Cells(Rows.count, DM_SNo_Column).End(xlUp).Row + 1
    
    Dim searchRange As Range
    Set searchRange = dis.Cells(1, DM_GlobalMFRPackage_Column).EntireColumn
    
    ' Use the Match function to find the cell with the value
    Dim foundCell As Range
    Set foundCell = searchRange.Find(What:=ws.Name, LookIn:=xlValues, LookAt:=xlWhole)
    
    ' Check if the value was found
    Dim rowNum As Long
    If Not foundCell Is Nothing Then
        ' Get the row number
        rowNum = foundCell.Row
        lastRow = rowNum
        
    'get the last row on data inptut sheets
    'dis.Cells(lastRow, DM_SNo_Column).Value = sr
    dis.Cells(lastRow, DM_GlobalMFRPackage_Column).NumberFormat = "@"
    dis.Cells(lastRow, DM_GlobalMFRPackage_Column) = ws.Name
    dis.Cells(lastRow, DM_ActiveQty_Column) = ws.Range("B2")   'Returns value of Active Qty
    dis.Cells(lastRow, DM_QTY1_Column) = ws.Range("X2")   'Returns value of QTY #1
    dis.Cells(lastRow, DM_QTY2_Column) = ws.Range("AC2")  'Returns value of QTY #2
    dis.Cells(lastRow, DM_QTY3_Column) = ws.Range("AH2")  'Returns value of QTY #3
    dis.Cells(lastRow, DM_QTY4_Column) = ws.Range("AM2")  'Returns value of QTY #4

'    dis.Range("H" & lastRow) = ws.Range("E2")   'Returns BOM Name
'    dis.Range("I" & lastRow) = ws.Range("F2")   'Returns BOM Rev
'    dis.Range("J" & lastRow) = ws.Range("G2")   'Returns PCB Name
'    dis.Range("K" & lastRow) = ws.Range("H2")   'Returns PCB Rev
'    dis.Range("L" & lastRow) = ws.Range("I2")   'Returns Number of boards in pannel
'    dis.Range("M" & lastRow) = ws.Range("J2")   'Returns double side Value
'    dis.Range("N" & lastRow) = ws.Range("A1")   'Returns the Status
'    dis.Range("O" & lastRow) = ws.Range("A2")   'returns the Quote Number
'    dis.Range("P" & lastRow) = ws.Range("W1")   'Returns PCB Price 1
'    dis.Range("Q" & lastRow) = ws.Range("AB1")  'Returns PCB Price 2
'    dis.Range("R" & lastRow) = ws.Range("AG1")  'Returns PCB Price 3
'    dis.Range("S" & lastRow) = ws.Range("AL1")  'Returns PCB Price 4
'    dis.Range("T" & lastRow) = ws.Range("L2")   'Returns Comment
'    dis.Range("U" & lastRow) = ws.Range("Y1")   'Returns Unit Price 1
'    dis.Range("V" & lastRow) = ws.Range("AD1")  'Returns Unit Price 2
'    dis.Range("W" & lastRow) = ws.Range("AI1")  'Returns Unit Price 3
'    dis.Range("X" & lastRow) = ws.Range("AN1")  'Returns Unit Price 4
'    dis.Range("Y" & lastRow) = ws.Range("P2")   'Returns NRE1
'    dis.Range("Z" & lastRow) = ws.Range("Q2")   'Returns NRE2
'    dis.Range("AA" & lastRow) = ws.Range("R2")  'Returns NRE3
'    dis.Range("AB" & lastRow) = ws.Range("S2")  'Returns NRE4
'    dis.Range("AC" & lastRow) = ws.Range("T2")  'Returns Last Quote Date
'    dis.Range("AD" & lastRow) = ws.Range("O2")  'Returns Last Quote Number (with Revisions)
    
    
    'sr = sr + 1
    
    Else
    
    ''Updated
    
    dis.Cells(6, DM_SNo_Column).EntireRow.Insert xlDown
    dis.Cells(6 + 1, DM_SNo_Column).EntireRow.Copy
    dis.Cells(6, DM_SNo_Column).EntireRow.PasteSpecial xlPasteFormats
    lastRow = 6
    
    ''Old code
'    If lastRow = 6 Then
'      dis.Cells(lastRow, DM_SNo_Column) = 1
'    Else
'      dis.Cells(lastRow, DM_SNo_Column) = dis.Cells(lastRow - 1, DM_SNo_Column).Value + 1
'    End If

''/
    
    dis.Cells(lastRow, DM_GlobalMFRPackage_Column).NumberFormat = "@"
    dis.Cells(lastRow, DM_GlobalMFRPackage_Column) = ws.Name
    dis.Cells(lastRow, DM_ActiveQty_Column) = ws.Range("B2")   'Returns value of Active Qty
    dis.Cells(lastRow, DM_QTY1_Column) = ws.Range("X2")   'Returns value of QTY #1
    dis.Cells(lastRow, DM_QTY2_Column) = ws.Range("AC2")  'Returns value of QTY #2
    dis.Cells(lastRow, DM_QTY3_Column) = ws.Range("AH2")  'Returns value of QTY #3
    dis.Cells(lastRow, DM_QTY4_Column) = ws.Range("AM2")  'Returns value of QTY #4


'    dis.Range("H" & lastRow) = ws.Range("E2")   'Returns BOM Name
'    dis.Range("I" & lastRow) = ws.Range("F2")   'Returns BOM Rev
'    dis.Range("J" & lastRow) = ws.Range("G2")   'Returns PCB Name
'    dis.Range("K" & lastRow) = ws.Range("H2")   'Returns PCB Rev
'    dis.Range("L" & lastRow) = ws.Range("I2")   'Returns Number of boards in pannel
'    dis.Range("M" & lastRow) = ws.Range("J2")   'Returns double side Value
'    dis.Range("N" & lastRow) = ws.Range("A1")   'Returns the Status
'    dis.Range("O" & lastRow) = ws.Range("A2")   'returns the Quote Number
'    dis.Range("P" & lastRow) = ws.Range("W1")   'Returns PCB Price 1
'    dis.Range("Q" & lastRow) = ws.Range("AB1")  'Returns PCB Price 2
'    dis.Range("R" & lastRow) = ws.Range("AG1")  'Returns PCB Price 3
'    dis.Range("S" & lastRow) = ws.Range("AL1")  'Returns PCB Price 4
'    dis.Range("T" & lastRow) = ws.Range("L2")   'Returns Comment
'    dis.Range("U" & lastRow) = ws.Range("Y1")   'Returns Unit Price 1
'    dis.Range("V" & lastRow) = ws.Range("AD1")  'Returns Unit Price 2
'    dis.Range("W" & lastRow) = ws.Range("AI1")  'Returns Unit Price 3
'    dis.Range("X" & lastRow) = ws.Range("AN1")  'Returns Unit Price 4
'    dis.Range("Y" & lastRow) = ws.Range("P2")   'Returns NRE1
'    dis.Range("Z" & lastRow) = ws.Range("Q2")   'Returns NRE2
'    dis.Range("AA" & lastRow) = ws.Range("R2")  'Returns NRE3
'    dis.Range("AB" & lastRow) = ws.Range("S2")  'Returns NRE4
'    dis.Range("AC" & lastRow) = ws.Range("T2")  'Returns Last Quote Date
'    dis.Range("AD" & lastRow) = ws.Range("O2")  'Returns Last Quote Number (with Revisions)
    
    End If
    
 End If
Next ws


Dim lastCol As Long
lastCol = dis.Cells(DM_Header_Row, dis.Columns.count).End(xlToLeft).Column

lr = dis.Cells(dis.Rows.count, DM_SNo_Column).End(xlUp).Row
' Apply borders to the used range
    With dis.Range(dis.Cells(DM_Header_Row, DM_SNo_Column), dis.Cells(lr, lastCol)).Borders
    
    
        .LineStyle = xlContinuous ' You can change this to xlDouble, xlDotted, etc.
        .Weight = xlThin ' You can change this to xlMedium, xlThick, etc.
        .ColorIndex = xlAutomatic ' You can specify a specific color index if needed
    End With
    
' apply serial number
    sr = 1
For i = 6 To lr
    dis.Cells(i, DM_SNo_Column) = sr
    sr = sr + 1
Next i

' now check if all the sheets mentioned are present. if not then delete the row

turnonscreenUpdate

End Sub

Function WorksheetExists(SheetName As String) As Boolean
    On Error Resume Next
    WorksheetExists = Not Sheets(SheetName) Is Nothing
    On Error GoTo 0
End Function

Public Sub UpdateMachineCodeMasterToOther_FAST()

    Const DATA_START_ROW As Long = 4

    Dim ms As Worksheet, ws As Worksheet, templateWS As Worksheet
    Dim mLastRow As Long, lr As Long
    Dim i As Long, j As Long, n As Long
    Dim response1 As VbMsgBoxResult
    Dim colapseDone As Boolean
    colapseDone = False

    'Performance toggles
    Dim oldCalc As XlCalculation
    Dim oldScreen As Boolean, oldEvents As Boolean, oldStatus As Boolean

    On Error GoTo CleanFail

    oldCalc = Application.Calculation
    oldScreen = Application.ScreenUpdating
    oldEvents = Application.EnableEvents
    oldStatus = Application.DisplayStatusBar

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.DisplayStatusBar = True
    Application.Calculation = xlCalculationManual

    Set ms = ThisWorkbook.Worksheets("MasterSheet")
    Set templateWS = ThisWorkbook.Worksheets("ATEMPLATE")

    initialiseHeaders , , ms, , , , , , , , , , , , , , , templateWS

    'validate TH pins
    If THpinsExists(ms) = False Then
        MsgBox "Please confirm all THs have TH pins!", , "TH pin validation failed"
        GoTo CleanExit
    End If

    mLastRow = ms.Cells(ms.Rows.count, Master_SNO_Column).End(xlUp).Row
    If mLastRow < DATA_START_ROW Then GoTo CleanExit
    n = mLastRow - DATA_START_ROW + 1

    response1 = MsgBox("Do you want to copy description to BOM?", vbYesNo + vbQuestion, "Description Copy Confirmation")

    'Get active products ONCE (not inside loop!)
    Dim prodArr As Variant
    prodArr = GetActiveProductsAndCustomer(False)
    If IsEmpty(prodArr) Then GoTo CleanExit

    '--- Read Master columns once into arrays
    Dim mCPC As Variant, mPN As Variant, mMCode As Variant, mMFR As Variant
    Dim mDistrib As Variant, mMOQ As Variant, mNotes As Variant, mStock As Variant
    Dim mTH As Variant, mLCSC As Variant, mDesc As Variant, mQtyAvail As Variant

    mCPC = ms.Range(ms.Cells(DATA_START_ROW, Master_CPC_Column), ms.Cells(mLastRow, Master_CPC_Column)).Value2
    mPN = ms.Range(ms.Cells(DATA_START_ROW, Master_PNTOUSE_Column), ms.Cells(mLastRow, Master_PNTOUSE_Column)).Value2
    mMCode = ms.Range(ms.Cells(DATA_START_ROW, Master_Mcodes_Column), ms.Cells(mLastRow, Master_Mcodes_Column)).Value2
    mMFR = ms.Range(ms.Cells(DATA_START_ROW, Master_MFR_Column), ms.Cells(mLastRow, Master_MFR_Column)).Value2
    mDistrib = ms.Range(ms.Cells(DATA_START_ROW, Master_Distrib1_Column), ms.Cells(mLastRow, Master_Distrib1_Column)).Value2
    mMOQ = ms.Range(ms.Cells(DATA_START_ROW, Master_DistributorPartnumber_Column), ms.Cells(mLastRow, Master_DistributorPartnumber_Column)).Value2
    mNotes = ms.Range(ms.Cells(DATA_START_ROW, Master_Notes_Column), ms.Cells(mLastRow, Master_Notes_Column)).Value2
    mStock = ms.Range(ms.Cells(DATA_START_ROW, Master_StockStatus_Column), ms.Cells(mLastRow, Master_StockStatus_Column)).Value2
    mTH = ms.Range(ms.Cells(DATA_START_ROW, Master_THPins_Column), ms.Cells(mLastRow, Master_THPins_Column)).Value2
    mLCSC = ms.Range(ms.Cells(DATA_START_ROW, Master_LCSCPN_Column), ms.Cells(mLastRow, Master_LCSCPN_Column)).Value2
    mDesc = ms.Range(ms.Cells(DATA_START_ROW, Master_Description_Column), ms.Cells(mLastRow, Master_Description_Column)).Value2
    mQtyAvail = ms.Range(ms.Cells(DATA_START_ROW, Master_QTYAvlble_Column), ms.Cells(mLastRow, Master_QTYAvlble_Column)).Value2

    '--- For each product sheet, build CPC->row lookup once, then update in bulk
    Dim dict As Object
    Dim key As String
    Dim targetRow As Long

    Dim wsLastRow As Long, k As Long
    Dim wsCPC As Variant

    'Output arrays per sheet (read existing, then overwrite only where match found)
    Dim outMCode As Variant, outMFR As Variant, outDistrib As Variant, outMOQ As Variant
    Dim outPN As Variant, outQtyAvail As Variant, outNotes As Variant, outStock As Variant
    Dim outTH As Variant, outLCSC As Variant, outDesc As Variant

    For j = 1 To UBound(prodArr)
        Set ws = ThisWorkbook.Worksheets(CStr(prodArr(j)))

        lr = ws.Cells(ws.Rows.count, ATEMPLATE_CPC_Number_Column).End(xlUp).Row
        If lr < DATA_START_ROW Then GoTo NextSheet

        If colapseDone = False Then
            colapseLines_SendDataToBOM lr, ws
            colapseDone = True
        End If

        'Read CPC column from this sheet once
        wsCPC = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_CPC_Number_Column), ws.Cells(lr, ATEMPLATE_CPC_Number_Column)).Value2

        'Build dictionary CPC -> row (sheet row)
        Set dict = CreateObject("Scripting.Dictionary")
        dict.CompareMode = vbTextCompare

        For k = 1 To UBound(wsCPC, 1)
            key = CStr(wsCPC(k, 1))
            If LenB(key) > 0 Then
                If Not dict.Exists(key) Then dict.Add key, (DATA_START_ROW + k - 1)
            End If
        Next k

        'Read destination columns once (so we can write back as arrays)
        outMCode = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_M_CODES_Column), ws.Cells(lr, ATEMPLATE_M_CODES_Column)).Value2
        outMFR = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_MFR_Column), ws.Cells(lr, ATEMPLATE_MFR_Column)).Value2
        outDistrib = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Distrib_1_Column), ws.Cells(lr, ATEMPLATE_Distrib_1_Column)).Value2
        outMOQ = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Distributor_Part_number_Column), ws.Cells(lr, ATEMPLATE_Distributor_Part_number_Column)).Value2
        outPN = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_PN_to_USE_Column), ws.Cells(lr, ATEMPLATE_PN_to_USE_Column)).Value2
        outQtyAvail = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Qty_Available_Column), ws.Cells(lr, ATEMPLATE_Qty_Available_Column)).Value2
        outNotes = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Notes_Column), ws.Cells(lr, ATEMPLATE_Notes_Column)).Value2
        outStock = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Stock_Status_Column), ws.Cells(lr, ATEMPLATE_Stock_Status_Column)).Value2
        outTH = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_TH_Pins_Column), ws.Cells(lr, ATEMPLATE_TH_Pins_Column)).Value2
        outLCSC = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_LCSC_PN1_Column), ws.Cells(lr, ATEMPLATE_LCSC_PN1_Column)).Value2

        If response1 = vbYes Then
            outDesc = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Description_Column), ws.Cells(lr, ATEMPLATE_Description_Column)).Value2
        End If

        'Loop Master (array) and update matching rows in outputs
        For i = 1 To n
            key = CStr(mCPC(i, 1))
            If LenB(key) > 0 Then
                If dict.Exists(key) Then
                    targetRow = CLng(dict(key)) 'actual sheet row
                    k = targetRow - DATA_START_ROW + 1 'array index

                    outMCode(k, 1) = mMCode(i, 1)
                    outMFR(k, 1) = mMFR(i, 1)
                    outDistrib(k, 1) = mDistrib(i, 1)
                    outMOQ(k, 1) = mMOQ(i, 1)
                    outPN(k, 1) = mPN(i, 1)
                    outQtyAvail(k, 1) = mQtyAvail(i, 1)
                    outNotes(k, 1) = mNotes(i, 1)
                    outStock(k, 1) = mStock(i, 1)
                    outTH(k, 1) = mTH(i, 1)
                    outLCSC(k, 1) = mLCSC(i, 1)

                    If response1 = vbYes Then
                        outDesc(k, 1) = mDesc(i, 1)
                    End If
                End If
            End If
        Next i

        'Write back in bulk
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_M_CODES_Column), ws.Cells(lr, ATEMPLATE_M_CODES_Column)).Value2 = outMCode
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_MFR_Column), ws.Cells(lr, ATEMPLATE_MFR_Column)).Value2 = outMFR
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Distrib_1_Column), ws.Cells(lr, ATEMPLATE_Distrib_1_Column)).Value2 = outDistrib
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Distributor_Part_number_Column), ws.Cells(lr, ATEMPLATE_Distributor_Part_number_Column)).Value2 = outMOQ
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_PN_to_USE_Column), ws.Cells(lr, ATEMPLATE_PN_to_USE_Column)).Value2 = outPN
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Qty_Available_Column), ws.Cells(lr, ATEMPLATE_Qty_Available_Column)).Value2 = outQtyAvail
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Notes_Column), ws.Cells(lr, ATEMPLATE_Notes_Column)).Value2 = outNotes
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Stock_Status_Column), ws.Cells(lr, ATEMPLATE_Stock_Status_Column)).Value2 = outStock
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_TH_Pins_Column), ws.Cells(lr, ATEMPLATE_TH_Pins_Column)).Value2 = outTH
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_LCSC_PN1_Column), ws.Cells(lr, ATEMPLATE_LCSC_PN1_Column)).Value2 = outLCSC

        If response1 = vbYes Then
            ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Description_Column), ws.Cells(lr, ATEMPLATE_Description_Column)).Value2 = outDesc
        End If

NextSheet:
        Set dict = Nothing
    Next j

    'Keep your post steps
    AddingExtraQtyToIndividualSheet
    UpdatePriceMasterToOther

CleanExit:
    Application.Calculation = oldCalc
    Application.ScreenUpdating = oldScreen
    Application.EnableEvents = oldEvents
    Application.DisplayStatusBar = oldStatus
    Exit Sub

CleanFail:
    Application.Calculation = oldCalc
    Application.ScreenUpdating = oldScreen
    Application.EnableEvents = oldEvents
    Application.DisplayStatusBar = oldStatus
    Err.Raise Err.Number, "UpdateMachineCodeMasterToOther_FAST", Err.Description
End Sub


Public Sub UpdateMachineCodeMasterToOther_FAST_TIMED()

    Const DATA_START_ROW As Long = 4

    Dim ms As Worksheet, ws As Worksheet, templateWS As Worksheet
    Dim mLastRow As Long, lr As Long
    Dim i As Long, j As Long, n As Long
    Dim response1 As VbMsgBoxResult
    Dim colapseDone As Boolean
    colapseDone = False

    'Performance toggles
    Dim oldCalc As XlCalculation
    Dim oldScreen As Boolean, oldEvents As Boolean, oldStatus As Boolean

    On Error GoTo CleanFail

    PerfStart
    PerfMark "START", True

    oldCalc = Application.Calculation
    oldScreen = Application.ScreenUpdating
    oldEvents = Application.EnableEvents
    oldStatus = Application.DisplayStatusBar

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.DisplayStatusBar = True
    Application.Calculation = xlCalculationManual

    PerfMark "App settings off"

    Set ms = ThisWorkbook.Worksheets("MasterSheet")
    Set templateWS = ThisWorkbook.Worksheets("ATEMPLATE")
    PerfMark "Set worksheets"

    initialiseHeaders , , ms, , , , , , , , , , , , , , , templateWS
    PerfMark "initialiseHeaders done"

    If THpinsExists(ms) = False Then
        PerfMark "THpinsExists FAILED"
        MsgBox "Please confirm all THs have TH pins!", , "TH pin validation failed"
        GoTo CleanExit
    End If
    PerfMark "THpinsExists passed"

    mLastRow = ms.Cells(ms.Rows.count, Master_SNO_Column).End(xlUp).Row
    If mLastRow < DATA_START_ROW Then
        PerfMark "Master has no data rows"
        GoTo CleanExit
    End If
    n = mLastRow - DATA_START_ROW + 1
    PerfMark "Master last row=" & mLastRow & ", n=" & n

    response1 = MsgBox("Do you want to copy description to BOM?", vbYesNo + vbQuestion, "Description Copy Confirmation")
    PerfMark "Description prompt answered"

    'Get active products ONCE
    Dim prodArr As Variant
    prodArr = GetActiveProductsAndCustomer(False)
    If IsEmpty(prodArr) Then
        PerfMark "GetActiveProductsAndCustomer returned empty"
        GoTo CleanExit
    End If
    PerfMark "GetActiveProductsAndCustomer done; products=" & UBound(prodArr)

    '--- Read Master columns once into arrays
    Dim mCPC As Variant, mPN As Variant, mMCode As Variant, mMFR As Variant
    Dim mDistrib As Variant, mMOQ As Variant, mNotes As Variant, mStock As Variant
    Dim mTH As Variant, mLCSC As Variant, mDesc As Variant, mQtyAvail As Variant

    Dim tRead0 As Double
    tRead0 = PerfMs()

    mCPC = ms.Range(ms.Cells(DATA_START_ROW, Master_CPC_Column), ms.Cells(mLastRow, Master_CPC_Column)).Value2
    mPN = ms.Range(ms.Cells(DATA_START_ROW, Master_PNTOUSE_Column), ms.Cells(mLastRow, Master_PNTOUSE_Column)).Value2
    mMCode = ms.Range(ms.Cells(DATA_START_ROW, Master_Mcodes_Column), ms.Cells(mLastRow, Master_Mcodes_Column)).Value2
    mMFR = ms.Range(ms.Cells(DATA_START_ROW, Master_MFR_Column), ms.Cells(mLastRow, Master_MFR_Column)).Value2
    mDistrib = ms.Range(ms.Cells(DATA_START_ROW, Master_Distrib1_Column), ms.Cells(mLastRow, Master_Distrib1_Column)).Value2
    mMOQ = ms.Range(ms.Cells(DATA_START_ROW, Master_DistributorPartnumber_Column), ms.Cells(mLastRow, Master_DistributorPartnumber_Column)).Value2
    mNotes = ms.Range(ms.Cells(DATA_START_ROW, Master_Notes_Column), ms.Cells(mLastRow, Master_Notes_Column)).Value2
    mStock = ms.Range(ms.Cells(DATA_START_ROW, Master_StockStatus_Column), ms.Cells(mLastRow, Master_StockStatus_Column)).Value2
    mTH = ms.Range(ms.Cells(DATA_START_ROW, Master_THPins_Column), ms.Cells(mLastRow, Master_THPins_Column)).Value2
    mLCSC = ms.Range(ms.Cells(DATA_START_ROW, Master_LCSCPN_Column), ms.Cells(mLastRow, Master_LCSCPN_Column)).Value2
    mQtyAvail = ms.Range(ms.Cells(DATA_START_ROW, Master_QTYAvlble_Column), ms.Cells(mLastRow, Master_QTYAvlble_Column)).Value2

    If response1 = vbYes Then
        mDesc = ms.Range(ms.Cells(DATA_START_ROW, Master_Description_Column), ms.Cells(mLastRow, Master_Description_Column)).Value2
    End If

    PerfMark "Read Master arrays done (" & Format(PerfMs() - tRead0, "0.0") & " ms)"

    '--- Per sheet work
    Dim dict As Object
    Dim key As String
    Dim targetRow As Long
    Dim k As Long

    Dim wsCPC As Variant

    Dim outMCode As Variant, outMFR As Variant, outDistrib As Variant, outMOQ As Variant
    Dim outPN As Variant, outQtyAvail As Variant, outNotes As Variant, outStock As Variant
    Dim outTH As Variant, outLCSC As Variant, outDesc As Variant

    For j = 1 To UBound(prodArr)
        Dim sheetStart As Double
        sheetStart = PerfMs()

        Set ws = ThisWorkbook.Worksheets(CStr(prodArr(j)))

        lr = ws.Cells(ws.Rows.count, ATEMPLATE_CPC_Number_Column).End(xlUp).Row
        If lr < DATA_START_ROW Then
            PerfMark "Sheet=" & ws.Name & " skipped (no rows)"
            GoTo NextSheet
        End If

        If colapseDone = False Then
            Dim tCol As Double: tCol = PerfMs()
            colapseLines_SendDataToBOM_FAST lr, ws
            PerfMark "colapseLines_SendDataToBOM (one-time) took " & Format(PerfMs() - tCol, "0.0") & " ms"
            colapseDone = True
        End If

        '1) Read CPC col
        Dim t1 As Double: t1 = PerfMs()
        wsCPC = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_CPC_Number_Column), ws.Cells(lr, ATEMPLATE_CPC_Number_Column)).Value2
        PerfMark "Sheet=" & ws.Name & " read CPC col (" & Format(PerfMs() - t1, "0.0") & " ms)"

        '2) Build dict
        Dim t2 As Double: t2 = PerfMs()
        Set dict = CreateObject("Scripting.Dictionary")
        dict.CompareMode = vbTextCompare

        For k = 1 To UBound(wsCPC, 1)
            key = CStr(wsCPC(k, 1))
            If LenB(key) > 0 Then
                If Not dict.Exists(key) Then dict.Add key, (DATA_START_ROW + k - 1)
            End If
        Next k
        PerfMark "Sheet=" & ws.Name & " build dict (" & Format(PerfMs() - t2, "0.0") & " ms), keys=" & dict.count

        '3) Read output cols
        Dim t3 As Double: t3 = PerfMs()
        outMCode = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_M_CODES_Column), ws.Cells(lr, ATEMPLATE_M_CODES_Column)).Value2
        outMFR = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_MFR_Column), ws.Cells(lr, ATEMPLATE_MFR_Column)).Value2
        outDistrib = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Distrib_1_Column), ws.Cells(lr, ATEMPLATE_Distrib_1_Column)).Value2
        outMOQ = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Distributor_Part_number_Column), ws.Cells(lr, ATEMPLATE_Distributor_Part_number_Column)).Value2
        outPN = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_PN_to_USE_Column), ws.Cells(lr, ATEMPLATE_PN_to_USE_Column)).Value2
        outQtyAvail = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Qty_Available_Column), ws.Cells(lr, ATEMPLATE_Qty_Available_Column)).Value2
        outNotes = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Notes_Column), ws.Cells(lr, ATEMPLATE_Notes_Column)).Value2
        outStock = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Stock_Status_Column), ws.Cells(lr, ATEMPLATE_Stock_Status_Column)).Value2
        outTH = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_TH_Pins_Column), ws.Cells(lr, ATEMPLATE_TH_Pins_Column)).Value2
        outLCSC = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_LCSC_PN1_Column), ws.Cells(lr, ATEMPLATE_LCSC_PN1_Column)).Value2

        If response1 = vbYes Then
            outDesc = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Description_Column), ws.Cells(lr, ATEMPLATE_Description_Column)).Value2
        End If
        PerfMark "Sheet=" & ws.Name & " read output cols (" & Format(PerfMs() - t3, "0.0") & " ms)"

        '4) Apply updates (this is usually the hotspot)
        Dim t4 As Double: t4 = PerfMs()
        Dim hitCount As Long: hitCount = 0

        For i = 1 To n
            key = CStr(mCPC(i, 1))
            If LenB(key) > 0 Then
                If dict.Exists(key) Then
                    targetRow = CLng(dict(key))
                    k = targetRow - DATA_START_ROW + 1

                    outMCode(k, 1) = mMCode(i, 1)
                    outMFR(k, 1) = mMFR(i, 1)
                    outDistrib(k, 1) = mDistrib(i, 1)
                    outMOQ(k, 1) = mMOQ(i, 1)
                    outPN(k, 1) = mPN(i, 1)
                    outQtyAvail(k, 1) = mQtyAvail(i, 1)
                    outNotes(k, 1) = mNotes(i, 1)
                    outStock(k, 1) = mStock(i, 1)
                    outTH(k, 1) = mTH(i, 1)
                    outLCSC(k, 1) = mLCSC(i, 1)

                    If response1 = vbYes Then
                        outDesc(k, 1) = mDesc(i, 1)
                    End If

                    hitCount = hitCount + 1
                End If
            End If
        Next i
        PerfMark "Sheet=" & ws.Name & " apply updates (" & Format(PerfMs() - t4, "0.0") & " ms), hits=" & hitCount

        '5) Write back (can be slow if sheet is huge / volatile formulas)
        Dim t5 As Double: t5 = PerfMs()
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_M_CODES_Column), ws.Cells(lr, ATEMPLATE_M_CODES_Column)).Value2 = outMCode
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_MFR_Column), ws.Cells(lr, ATEMPLATE_MFR_Column)).Value2 = outMFR
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Distrib_1_Column), ws.Cells(lr, ATEMPLATE_Distrib_1_Column)).Value2 = outDistrib
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Distributor_Part_number_Column), ws.Cells(lr, ATEMPLATE_Distributor_Part_number_Column)).Value2 = outMOQ
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_PN_to_USE_Column), ws.Cells(lr, ATEMPLATE_PN_to_USE_Column)).Value2 = outPN
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Qty_Available_Column), ws.Cells(lr, ATEMPLATE_Qty_Available_Column)).Value2 = outQtyAvail
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Notes_Column), ws.Cells(lr, ATEMPLATE_Notes_Column)).Value2 = outNotes
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Stock_Status_Column), ws.Cells(lr, ATEMPLATE_Stock_Status_Column)).Value2 = outStock
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_TH_Pins_Column), ws.Cells(lr, ATEMPLATE_TH_Pins_Column)).Value2 = outTH
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_LCSC_PN1_Column), ws.Cells(lr, ATEMPLATE_LCSC_PN1_Column)).Value2 = outLCSC

        If response1 = vbYes Then
            ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Description_Column), ws.Cells(lr, ATEMPLATE_Description_Column)).Value2 = outDesc
        End If
        PerfMark "Sheet=" & ws.Name & " write back (" & Format(PerfMs() - t5, "0.0") & " ms)"

        PerfMark "Sheet=" & ws.Name & " TOTAL (" & Format(PerfMs() - sheetStart, "0.0") & " ms)"

NextSheet:
        Set dict = Nothing
    Next j

    'Post steps timing
    Dim tPost As Double: tPost = PerfMs()
    AddingExtraQtyToIndividualSheet
    PerfMark "AddingExtraQtyToIndividualSheet (" & Format(PerfMs() - tPost, "0.0") & " ms)"

    tPost = PerfMs()
    UpdatePriceMasterToOther_FAST
    PerfMark "UpdatePriceMasterToOther (" & Format(PerfMs() - tPost, "0.0") & " ms)"

    PerfMark "DONE"

CleanExit:
    Application.Calculation = oldCalc
    Application.ScreenUpdating = oldScreen
    Application.EnableEvents = oldEvents
    Application.DisplayStatusBar = oldStatus
    Exit Sub

CleanFail:
    Application.Calculation = oldCalc
    Application.ScreenUpdating = oldScreen
    Application.EnableEvents = oldEvents
    Application.DisplayStatusBar = oldStatus
    Debug.Print "ERROR: " & Err.Number & " - " & Err.Description
    Err.Raise Err.Number, "UpdateMachineCodeMasterToOther_FAST_TIMED", Err.Description
End Sub



Public Sub colapseLines_SendDataToBOM_FAST(ByVal wsLR As Long, ByVal ws As Worksheet)

    Dim sumCols As Variant, eraseCols As Variant, keepCols As Variant
    sumCols = Array(23, 28, 33, 38)                         ' W, AB, AG, AL
    eraseCols = Array(24, 25, 29, 30, 34, 35, 39, 40)       ' X,Y, AC,AD, AH,AI, AM,AN

    'We will copy only these columns from the "base row" (first CPC hit).
    'Your old code copied the entire row; that’s slow. If you truly need extra columns,
    'add them here. (A:BG = 1..59)
    keepCols = BuildColList(1, 59) 'A..BG

    Dim rStart As Long: rStart = 4
    If wsLR < rStart Then Exit Sub

    'Huge speed win in many workbooks
    On Error Resume Next
    ws.DisplayPageBreaks = False
    On Error GoTo 0

    'Read data block A:BG into memory
    Dim src As Variant
    src = ws.Range(ws.Cells(rStart, 1), ws.Cells(wsLR, 59)).Value2  'A..BG

    Dim dict As Object: Set dict = CreateObject("Scripting.Dictionary")
    dict.CompareMode = vbTextCompare

    Dim out() As Variant
    ReDim out(1 To UBound(src, 1), 1 To UBound(src, 2))

    Dim outCount As Long: outCount = 0

    Dim i As Long, c As Long, key As String, outIdx As Long
    For i = 1 To UBound(src, 1)
        key = Trim$(CStr(src(i, 7))) 'CPC is column G => 7 in the A:BG block
        If LenB(key) > 0 Then
            If Not dict.Exists(key) Then
                outCount = outCount + 1
                dict.Add key, outCount

                'Copy base row values (A..BG) into out
                For c = 1 To UBound(src, 2)
                    out(outCount, c) = src(i, c)
                Next c

                'Erase specified columns in output row
                Dim ec As Variant
                For Each ec In eraseCols
                    out(outCount, ec) = vbNullString
                Next ec

            Else
                outIdx = dict(key)

                'Sum specified columns
                Dim sc As Variant
                For Each sc In sumCols
                    out(outIdx, sc) = NzNum(out(outIdx, sc)) + NzNum(src(i, sc))
                Next sc

                'Erase specified columns (same as your code)
                For Each ec In eraseCols
                    out(outIdx, ec) = vbNullString
                Next ec
            End If
        End If
    Next i

    Dim outputRow As Long
    outputRow = wsLR + 1

    'Clear old output zone
    ws.Range("A" & outputRow & ":BG" & outputRow + 5).ClearContents

    'Write merged result A:BG
    If outCount > 0 Then
        ws.Range(ws.Cells(outputRow, 1), ws.Cells(outputRow + outCount - 1, 59)).Value2 = outSlice(out, outCount, 59)
    End If

    'Delete original rows (still can be slow, but now everything else is fast)
    ws.Rows(rStart & ":" & wsLR).Delete Shift:=xlUp
End Sub

'--- Helpers

Private Function NzNum(ByVal v As Variant) As Double
    If IsError(v) Or IsEmpty(v) Or v = vbNullString Then
        NzNum = 0#
    Else
        NzNum = CDbl(v)
    End If
End Function

Private Function outSlice(ByRef a() As Variant, ByVal rCount As Long, ByVal cCount As Long) As Variant
    Dim t() As Variant
    ReDim t(1 To rCount, 1 To cCount)
    Dim r As Long, c As Long
    For r = 1 To rCount
        For c = 1 To cCount
            t(r, c) = a(r, c)
        Next c
    Next r
    outSlice = t
End Function

Private Function BuildColList(ByVal c1 As Long, ByVal c2 As Long) As Variant
    Dim a() As Long, i As Long, n As Long
    n = c2 - c1 + 1
    ReDim a(0 To n - 1)
    For i = 0 To n - 1
        a(i) = c1 + i
    Next i
    BuildColList = a
End Function

Public Sub UpdatePriceMasterToOther_FAST()

    Const DATA_START_ROW As Long = 4

    Dim ms As Worksheet, ws As Worksheet
    Dim mLastRow As Long, n As Long
    Dim arr As Variant
    Dim j As Long, i As Long, k As Long
    Dim prodName As String

    Set ms = ThisWorkbook.Worksheets("MasterSheet")

    mLastRow = ms.Cells(ms.Rows.count, 1).End(xlUp).Row
    If mLastRow < DATA_START_ROW Then Exit Sub
    n = mLastRow - DATA_START_ROW + 1

    'Get product list ONCE
    arr = GetActiveProductsAndCustomer(False)
    If IsEmpty(arr) Then Exit Sub

    'Read Master CPC + Price ONCE
    Dim mCPC As Variant, mPrice As Variant
    mCPC = ms.Range(ms.Cells(DATA_START_ROW, Master_CPC_Column), ms.Cells(mLastRow, Master_CPC_Column)).Value2
    mPrice = ms.Range(ms.Cells(DATA_START_ROW, Master_UnitPrice_Column), ms.Cells(mLastRow, Master_UnitPrice_Column)).Value2

    'For each product sheet: build CPC->row lookup, update UnitPrice array, write back
    Dim lr As Long
    Dim wsCPC As Variant, outPrice As Variant
    Dim dict As Object
    Dim key As String, targetRow As Long

    For j = 1 To UBound(arr)
        prodName = CStr(arr(j))
        Set ws = ThisWorkbook.Worksheets(prodName)

        lr = ws.Cells(ws.Rows.count, ATEMPLATE_Serial_NO_Column).End(xlUp).Row
        If lr < DATA_START_ROW Then GoTo NextSheet

        'Read CPC col on sheet
        wsCPC = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_CPC_Number_Column), ws.Cells(lr, ATEMPLATE_CPC_Number_Column)).Value2

        'Build dict CPC->sheet row
        Set dict = CreateObject("Scripting.Dictionary")
        dict.CompareMode = vbTextCompare

        For k = 1 To UBound(wsCPC, 1)
            key = CStr(wsCPC(k, 1))
            If LenB(key) > 0 Then
                If Not dict.Exists(key) Then dict.Add key, (DATA_START_ROW + k - 1)
            End If
        Next k

        'Read current unit price column so we can update and write back as one block
        outPrice = ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Unit_Price_Column), ws.Cells(lr, ATEMPLATE_Unit_Price_Column)).Value2

        'Apply updates from Master
        For i = 1 To n
            key = CStr(mCPC(i, 1))
            If LenB(key) > 0 Then
                If dict.Exists(key) Then
                    targetRow = CLng(dict(key))
                    k = targetRow - DATA_START_ROW + 1
                    outPrice(k, 1) = mPrice(i, 1)
                End If
            End If
        Next i

        'Write back once
        ws.Range(ws.Cells(DATA_START_ROW, ATEMPLATE_Unit_Price_Column), ws.Cells(lr, ATEMPLATE_Unit_Price_Column)).Value2 = outPrice

NextSheet:
        Set dict = Nothing
    Next j

End Sub

'|""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""|
'|                                                                |
'| CODE OPTIMISED USING CHAT GPT ON 11 FEB 2026 BY PIYUSH TAYAL   |
'|                                                                |
'|""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""|

Public Sub LoadProcurementDataToMasterSheet_FAST()

    Const DATA_START_ROW As Long = 4

    Dim ms As Worksheet, ps As Worksheet
    Dim mLastRow As Long, pLastRow As Long
    Dim n As Long, i As Long
    Dim dict As Object 'Scripting.Dictionary (late-bound)
    Dim key As Variant

    'Performance toggles (safe + restore)
    Dim oldCalc As XlCalculation
    Dim oldScreen As Boolean, oldEvents As Boolean, oldStatus As Boolean

    On Error GoTo CleanFail

    oldCalc = Application.Calculation
    oldScreen = Application.ScreenUpdating
    oldEvents = Application.EnableEvents
    oldStatus = Application.DisplayStatusBar

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.DisplayStatusBar = True
    Application.Calculation = xlCalculationManual

    Set ms = ThisWorkbook.Sheets("MasterSheet")
    Set ps = ThisWorkbook.Sheets("Procurement")

    'Keep your existing header init call
    initialiseHeaders , , ms, , , , , , , , , , , , , , ps

    'Remove filters if any
    If ps.AutoFilterMode Then ps.AutoFilterMode = False

    'Last rows (use full sheet, not fixed 10000)
    mLastRow = ms.Cells(ms.Rows.count, Master_SNO_Column).End(xlUp).Row
    pLastRow = ps.Cells(ps.Rows.count, ProcureSheet_CPC_Column).End(xlUp).Row

    If mLastRow < DATA_START_ROW Then GoTo CleanExit
    If pLastRow < DATA_START_ROW Then GoTo CleanExit

    n = mLastRow - DATA_START_ROW + 1

    '--- Build lookup: CPC -> Procurement Row (first occurrence from top)
    Set dict = CreateObject("Scripting.Dictionary")
    dict.CompareMode = vbTextCompare  'If CPC matching should be case-insensitive. If not, remove this line.

    Dim pCPC As Variant
    pCPC = ps.Range(ps.Cells(DATA_START_ROW, ProcureSheet_CPC_Column), ps.Cells(pLastRow, ProcureSheet_CPC_Column)).Value2

    For i = 1 To UBound(pCPC, 1)
        key = pCPC(i, 1)
        If LenB(CStr(key)) > 0 Then
            If Not dict.Exists(CStr(key)) Then
                dict.Add CStr(key), (DATA_START_ROW + i - 1) 'store real row number in Procurement
            End If
        End If
    Next i

    '--- Read Master CPCs once
    Dim mCPC As Variant
    mCPC = ms.Range(ms.Cells(DATA_START_ROW, Master_CPC_Column), ms.Cells(mLastRow, Master_CPC_Column)).Value2

    '--- Prepare output arrays for each Master column we update (read existing values first)
    Dim outNCR As Variant, outTH As Variant, outUnit As Variant, outMFR As Variant
    Dim outPN As Variant, outQty As Variant, outD1 As Variant, outDPN As Variant
    Dim outNotes As Variant, outStock As Variant, outD2Name As Variant, outD2Stock As Variant
    Dim outD2Price As Variant, outD2LT As Variant, outLCS As Variant, outSafety As Variant
    Dim outCust As Variant, outRS As Variant, outFeeder As Variant

    outNCR = ms.Range(ms.Cells(DATA_START_ROW, Master_ncrFlag_Column), ms.Cells(mLastRow, Master_ncrFlag_Column)).Value2
    outTH = ms.Range(ms.Cells(DATA_START_ROW, Master_THPins_Column), ms.Cells(mLastRow, Master_THPins_Column)).Value2
    outUnit = ms.Range(ms.Cells(DATA_START_ROW, Master_UnitPrice_Column), ms.Cells(mLastRow, Master_UnitPrice_Column)).Value2
    outMFR = ms.Range(ms.Cells(DATA_START_ROW, Master_MFR_Column), ms.Cells(mLastRow, Master_MFR_Column)).Value2

    outPN = ms.Range(ms.Cells(DATA_START_ROW, Master_PNTOUSE_Column), ms.Cells(mLastRow, Master_PNTOUSE_Column)).Value2
    outQty = ms.Range(ms.Cells(DATA_START_ROW, Master_QTYAvlble_Column), ms.Cells(mLastRow, Master_QTYAvlble_Column)).Value2
    outD1 = ms.Range(ms.Cells(DATA_START_ROW, Master_Distrib1_Column), ms.Cells(mLastRow, Master_Distrib1_Column)).Value2
    outDPN = ms.Range(ms.Cells(DATA_START_ROW, Master_DistributorPartnumber_Column), ms.Cells(mLastRow, Master_DistributorPartnumber_Column)).Value2

    outNotes = ms.Range(ms.Cells(DATA_START_ROW, Master_Notes_Column), ms.Cells(mLastRow, Master_Notes_Column)).Value2
    outStock = ms.Range(ms.Cells(DATA_START_ROW, Master_StockStatus_Column), ms.Cells(mLastRow, Master_StockStatus_Column)).Value2

    outD2Name = ms.Range(ms.Cells(DATA_START_ROW, Master_Distrbutor2name_Column), ms.Cells(mLastRow, Master_Distrbutor2name_Column)).Value2
    outD2Stock = ms.Range(ms.Cells(DATA_START_ROW, Master_Distrbutor2stock_Column), ms.Cells(mLastRow, Master_Distrbutor2stock_Column)).Value2
    outD2Price = ms.Range(ms.Cells(DATA_START_ROW, Master_Distrbutor2price_Column), ms.Cells(mLastRow, Master_Distrbutor2price_Column)).Value2
    outD2LT = ms.Range(ms.Cells(DATA_START_ROW, Master_Distributor2leadtime_Column), ms.Cells(mLastRow, Master_Distributor2leadtime_Column)).Value2

    outLCS = ms.Range(ms.Cells(DATA_START_ROW, Master_LCSCPN_Column), ms.Cells(mLastRow, Master_LCSCPN_Column)).Value2
    outSafety = ms.Range(ms.Cells(DATA_START_ROW, Master_SafetyStock_Column), ms.Cells(mLastRow, Master_SafetyStock_Column)).Value2
    outCust = ms.Range(ms.Cells(DATA_START_ROW, Master_StockatCustomer_Column), ms.Cells(mLastRow, Master_StockatCustomer_Column)).Value2
    outRS = ms.Range(ms.Cells(DATA_START_ROW, Master_StockatRS_Column), ms.Cells(mLastRow, Master_StockatRS_Column)).Value2

    outFeeder = ms.Range(ms.Cells(DATA_START_ROW, Master_FeederType_Column), ms.Cells(mLastRow, Master_FeederType_Column)).Value2

    '--- Main loop (fast dictionary lookups)
    Dim prow As Long
    For i = 1 To n
        key = mCPC(i, 1)
        If LenB(CStr(key)) > 0 Then
            If dict.Exists(CStr(key)) Then
                prow = CLng(dict(CStr(key)))

                outNCR(i, 1) = ps.Cells(prow, ProcureSheet_NCRFlag_Column).Value2
                outTH(i, 1) = ps.Cells(prow, ProcureSheet_THPins_Column).Value2
                outUnit(i, 1) = ps.Cells(prow, ProcureSheet_UnitPrice_Column).Value2
                outMFR(i, 1) = ps.Cells(prow, ProcureSheet_MFRNAME_Column).Value2

                outPN(i, 1) = ps.Cells(prow, ProcureSheet_PNTOUSE_Column).Value2
                outQty(i, 1) = ps.Cells(prow, ProcureSheet_QTYAvlble_Column).Value2
                outD1(i, 1) = ps.Cells(prow, ProcureSheet_Distrib_Column).Value2
                outDPN(i, 1) = ps.Cells(prow, ProcureSheet_DistributorPN_Column).Value2

                outNotes(i, 1) = ps.Cells(prow, ProcureSheet_Notes_Column).Value2
                outStock(i, 1) = ps.Cells(prow, ProcureSheet_StoctStatus_Column).Value2

                outD2Name(i, 1) = ps.Cells(prow, ProcureSheet_Distrbutor2name_Column).Value2
                outD2Stock(i, 1) = ps.Cells(prow, ProcureSheet_Distrbutor2stock_Column).Value2
                outD2Price(i, 1) = ps.Cells(prow, ProcureSheet_Distrbutor2price_Column).Value2
                outD2LT(i, 1) = ps.Cells(prow, ProcureSheet_Distributor2leadtime_Column).Value2

                outLCS(i, 1) = ps.Cells(prow, ProcureSheet_LCSCPN_Column).Value2
                outSafety(i, 1) = ps.Cells(prow, ProcureSheet_SafetyStock_Column).Value2
                outCust(i, 1) = ps.Cells(prow, ProcureSheet_StockatCustomer_Column).Value2
                outRS(i, 1) = ps.Cells(prow, ProcureSheet_StockatRS_Column).Value2

                outFeeder(i, 1) = ps.Cells(prow, ProcureSheet_FeederType_Column).Value2
            End If
        End If
    Next i

    '--- Write back in bulk (very fast)
    ms.Range(ms.Cells(DATA_START_ROW, Master_ncrFlag_Column), ms.Cells(mLastRow, Master_ncrFlag_Column)).Value2 = outNCR
    ms.Range(ms.Cells(DATA_START_ROW, Master_THPins_Column), ms.Cells(mLastRow, Master_THPins_Column)).Value2 = outTH
    ms.Range(ms.Cells(DATA_START_ROW, Master_UnitPrice_Column), ms.Cells(mLastRow, Master_UnitPrice_Column)).Value2 = outUnit
    ms.Range(ms.Cells(DATA_START_ROW, Master_MFR_Column), ms.Cells(mLastRow, Master_MFR_Column)).Value2 = outMFR

    ms.Range(ms.Cells(DATA_START_ROW, Master_PNTOUSE_Column), ms.Cells(mLastRow, Master_PNTOUSE_Column)).Value2 = outPN
    ms.Range(ms.Cells(DATA_START_ROW, Master_QTYAvlble_Column), ms.Cells(mLastRow, Master_QTYAvlble_Column)).Value2 = outQty
    ms.Range(ms.Cells(DATA_START_ROW, Master_Distrib1_Column), ms.Cells(mLastRow, Master_Distrib1_Column)).Value2 = outD1
    ms.Range(ms.Cells(DATA_START_ROW, Master_DistributorPartnumber_Column), ms.Cells(mLastRow, Master_DistributorPartnumber_Column)).Value2 = outDPN

    ms.Range(ms.Cells(DATA_START_ROW, Master_Notes_Column), ms.Cells(mLastRow, Master_Notes_Column)).Value2 = outNotes
    ms.Range(ms.Cells(DATA_START_ROW, Master_StockStatus_Column), ms.Cells(mLastRow, Master_StockStatus_Column)).Value2 = outStock

    ms.Range(ms.Cells(DATA_START_ROW, Master_Distrbutor2name_Column), ms.Cells(mLastRow, Master_Distrbutor2name_Column)).Value2 = outD2Name
    ms.Range(ms.Cells(DATA_START_ROW, Master_Distrbutor2stock_Column), ms.Cells(mLastRow, Master_Distrbutor2stock_Column)).Value2 = outD2Stock
    ms.Range(ms.Cells(DATA_START_ROW, Master_Distrbutor2price_Column), ms.Cells(mLastRow, Master_Distrbutor2price_Column)).Value2 = outD2Price
    ms.Range(ms.Cells(DATA_START_ROW, Master_Distributor2leadtime_Column), ms.Cells(mLastRow, Master_Distributor2leadtime_Column)).Value2 = outD2LT

    ms.Range(ms.Cells(DATA_START_ROW, Master_LCSCPN_Column), ms.Cells(mLastRow, Master_LCSCPN_Column)).Value2 = outLCS
    ms.Range(ms.Cells(DATA_START_ROW, Master_SafetyStock_Column), ms.Cells(mLastRow, Master_SafetyStock_Column)).Value2 = outSafety
    ms.Range(ms.Cells(DATA_START_ROW, Master_StockatCustomer_Column), ms.Cells(mLastRow, Master_StockatCustomer_Column)).Value2 = outCust
    ms.Range(ms.Cells(DATA_START_ROW, Master_StockatRS_Column), ms.Cells(mLastRow, Master_StockatRS_Column)).Value2 = outRS

    ms.Range(ms.Cells(DATA_START_ROW, Master_FeederType_Column), ms.Cells(mLastRow, Master_FeederType_Column)).Value2 = outFeeder

CleanExit:
    Application.Calculation = oldCalc
    Application.ScreenUpdating = oldScreen
    Application.EnableEvents = oldEvents
    Application.DisplayStatusBar = oldStatus
    Exit Sub

CleanFail:
    'Restore on error too
    Application.Calculation = oldCalc
    Application.ScreenUpdating = oldScreen
    Application.EnableEvents = oldEvents
    Application.DisplayStatusBar = oldStatus
    Err.Raise Err.Number, "LoadProcurementDataToMasterSheet_FAST", Err.Description
End Sub
