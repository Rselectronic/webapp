Attribute VB_Name = "Module9"
Option Explicit
Sub sendPricingtoDM()

Dim wb As Workbook
Dim dis As Worksheet, inputSheet As Worksheet, QuoteLogWS As Worksheet
Dim Qty1, Qty2, Qty3, Qty4 As Worksheet

Set dis = ThisWorkbook.Sheets("final")
Set Qty1 = ThisWorkbook.Sheets("QTY 1")
Set Qty2 = ThisWorkbook.Sheets("QTY 2")
Set Qty3 = ThisWorkbook.Sheets("QTY 3")
Set Qty4 = ThisWorkbook.Sheets("QTY 4")


Dim price1, price2, price3, price4, nre1, nre2, nre3, nre4 As Double
Dim pcbP1 As Double, pcbP2 As Double, pcbP3 As Double, pcbP4 As Double

price1 = dis.Range("D2")
price2 = dis.Range("D3")
price3 = dis.Range("D4")
price4 = dis.Range("D5")

nre1 = dis.Range("B21")
nre2 = dis.Range("B22")
nre3 = dis.Range("B23")
nre4 = dis.Range("B24")

pcbP1 = dis.Range("E15")
pcbP2 = dis.Range("E16")
pcbP3 = dis.Range("E17")
pcbP4 = dis.Range("E18")

Dim GMP As String
GMP = dis.Range("B32")


    ' get the local paths
    Dim fullPath As String
    Dim localPath As String
    Dim parentPath As String
    Dim parentFolderName As String
    Dim customerFolderName As String
    Dim customerFolderPath As String
    Dim prodPath As String
    Dim timeProjectPath As String
    Dim DMfilePath As String
    
    fullPath = GetLocalPath(ThisWorkbook.FullName)
    Dim folders() As String
    
    ' Split the path string using backslash as delimiter
    folders = Split(fullPath, "\")
    customerFolderName = folders(UBound(folders) - 3)
    
    customerFolderPath = Left(fullPath, InStr(1, fullPath, customerFolderName, vbTextCompare) + Len(customerFolderName))
    'customerFolderPath = Left(localPath, InStrRev(localPath, "\", Len(localPath) - 1))
    
    
    'DMfilePath = customerFolderPath & "3. DM PROGRAM\"
    'DMfilePath = Split(fullpath, "\CUSTOMERS\")(0) & "\DM File\"
    
    DMfilePath = Split(fullPath, "\1. CUSTOMERS\")(0) & "\2. DM FILE\"
    
    'MsgBox fullpath
    'Debug.Print DMfilePath

Dim dmPATH As String
dmPATH = DMfilePath


Dim DMfileName As String
DMfileName = Dir(dmPATH & "DM*")


' Check if the workbook is already open
    On Error Resume Next
    Set wb = Workbooks(DMfileName)
    On Error GoTo 0
    
    
    If wb Is Nothing Then
        ' If the workbook is not open, then open it
        Set wb = Workbooks.Open(dmPATH & DMfileName)
    End If
    
    ' Set the input worksheet in the opened workbook
    Set inputSheet = wb.Sheets("DataInputSheets")
    Set QuoteLogWS = wb.Sheets("Quote Log")
    initialiseHeaders inputSheet

Dim i As Long, lr As Long
lr = inputSheet.Cells(inputSheet.Rows.Count, DM_GlobalMFRPackage_Column).End(xlUp).Row

For i = 6 To lr
    If inputSheet.Cells(i, DM_GlobalMFRPackage_Column) = GMP Then
        inputSheet.Cells(i, DM_UnitPrice1_Column) = price1
        inputSheet.Cells(i, DM_UnitPrice2_Column) = price2
        inputSheet.Cells(i, DM_UnitPrice3_Column) = price3
        inputSheet.Cells(i, DM_UnitPrice4_Column) = price4
        inputSheet.Range(inputSheet.Cells(i, DM_UnitPrice1_Column), inputSheet.Cells(i, DM_UnitPrice4_Column)).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* ""-""??_);_(@_)"
        
        inputSheet.Cells(i, DM_PCB1_Column) = pcbP1
        inputSheet.Cells(i, DM_PCB2_Column) = pcbP2
        inputSheet.Cells(i, DM_PCB3_Column) = pcbP3
        inputSheet.Cells(i, DM_PCB4_Column) = pcbP4
        
        ' Send the NREs in the DM file
        If inputSheet.Cells(i, DM_NRE1Status_Column) <> "PAID" Then
            inputSheet.Cells(i, DM_NRE1_Column) = nre1
        End If
        
        If inputSheet.Cells(i, DM_NRE2Status_Column) <> "PAID" Then
            inputSheet.Cells(i, DM_NRE2_Column) = nre2
        End If
        
        If inputSheet.Cells(i, DM_NRE3Status_Column) <> "PAID" Then
            inputSheet.Cells(i, DM_NRE3_Column) = nre3
        End If
        
        If inputSheet.Cells(i, DM_NRE4Status_Column) <> "PAID" Then
            inputSheet.Cells(i, DM_NRE4_Column) = nre4
        End If
        
        
        inputSheet.Cells(i, DM_NRE1_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* ""-""??_);_(@_)"
        inputSheet.Cells(i, DM_NRE2_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* ""-""??_);_(@_)"
        inputSheet.Cells(i, DM_NRE3_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* ""-""??_);_(@_)"
        inputSheet.Cells(i, DM_NRE4_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* ""-""??_);_(@_)"
        
        
        inputSheet.Cells(i, DM_LastQuoteDate_Column).NumberFormat = "mm/dd/yyyy"
        inputSheet.Cells(i, DM_LastQuoteDate_Column) = FillDateTimeInCanada
        inputSheet.Cells(i, DM_QTEwithRevisions_Column) = dis.Range("B53")    'Actual Quote Number (with Revisions)
        
        If dis.Range("C2") > 0 Then
            inputSheet.Cells(i, DM_Assembly1_Column) = Qty1.Range("H197")   'Get Qyt 1 Assembly unit price
            inputSheet.Cells(i, DM_Assembly1_Column + 1) = Qty1.Range("H209") 'Get Qyt 1 Component unit price
            inputSheet.Cells(i, DM_Assembly1_Column + 2) = Qty1.Range("H204") 'Get Qyt 1 PCB unit price
            inputSheet.Cells(i, DM_Assembly1_Column + 3) = Qty1.Range("H217") 'Get Qyt 1 Total unit price
        Else
            inputSheet.Cells(i, DM_Assembly1_Column) = 0
            inputSheet.Cells(i, DM_Assembly1_Column + 1) = 0
            inputSheet.Cells(i, DM_Assembly1_Column + 2) = 0
            inputSheet.Cells(i, DM_Assembly1_Column + 3) = 0
        End If
        
        If dis.Range("C3") > 0 Then
            inputSheet.Cells(i, DM_Assembly1_Column + 4) = Qty2.Range("H197") 'Get Qyt 2 Assembly unit price
            inputSheet.Cells(i, DM_Assembly1_Column + 5) = Qty2.Range("H209") 'Get Qyt 2 Component unit price
            inputSheet.Cells(i, DM_Assembly1_Column + 6) = Qty2.Range("H204") 'Get Qyt 2 PCB unit price
            inputSheet.Cells(i, DM_Assembly1_Column + 7) = Qty2.Range("H217") 'Get Qyt 2 Total unit price
        Else
            inputSheet.Cells(i, DM_Assembly1_Column + 4) = 0
            inputSheet.Cells(i, DM_Assembly1_Column + 5) = 0
            inputSheet.Cells(i, DM_Assembly1_Column + 6) = 0
            inputSheet.Cells(i, DM_Assembly1_Column + 7) = 0
        End If
        
        If dis.Range("C4") > 0 Then
            inputSheet.Cells(i, DM_Assembly1_Column + 8) = Qty3.Range("H197") 'Get Qyt 3 Assembly unit price
            inputSheet.Cells(i, DM_Assembly1_Column + 9) = Qty3.Range("H209") 'Get Qyt 3 Component unit price
            inputSheet.Cells(i, DM_Assembly1_Column + 10) = Qty3.Range("H204") 'Get Qyt 3 PCB unit price
            inputSheet.Cells(i, DM_Assembly1_Column + 11) = Qty3.Range("H217") 'Get Qyt 3 Total unit price
        Else
            inputSheet.Cells(i, DM_Assembly1_Column + 8) = 0
            inputSheet.Cells(i, DM_Assembly1_Column + 9) = 0
            inputSheet.Cells(i, DM_Assembly1_Column + 10) = 0
            inputSheet.Cells(i, DM_Assembly1_Column + 11) = 0
        End If
        
        If dis.Range("C5") > 0 Then
            inputSheet.Cells(i, DM_Assembly1_Column + 12) = Qty4.Range("H197") 'Get Qyt 4 Assembly unit price
            inputSheet.Cells(i, DM_Assembly1_Column + 13) = Qty4.Range("H209") 'Get Qyt 4 Component unit price
            inputSheet.Cells(i, DM_Assembly1_Column + 14) = Qty4.Range("H204") 'Get Qyt 4 PCB unit price
            inputSheet.Cells(i, DM_Assembly1_Column + 15) = Qty4.Range("H217") 'Get Qyt 4 Total unit price
        Else
            inputSheet.Cells(i, DM_Assembly1_Column + 12) = 0
            inputSheet.Cells(i, DM_Assembly1_Column + 13) = 0
            inputSheet.Cells(i, DM_Assembly1_Column + 14) = 0
            inputSheet.Cells(i, DM_Assembly1_Column + 15) = 0
        End If
        
        inputSheet.Range(inputSheet.Cells(i, DM_Assembly1_Column), inputSheet.Cells(i, DM_Assembly1_Column + 15)).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* ""-""??_);_(@_)"
    
        ''Update
        Dim StatusofLeadtimeFunction As String
        StatusofLeadtimeFunction = ""
        StatusofLeadtimeFunction = LeadtimeFunction(dis, inputSheet, i)
         
        If StatusofLeadtimeFunction <> "" Then
           MsgBox StatusofLeadtimeFunction, vbExclamation, "Macro"
           Exit Sub
        End If
        ''/
        
        '' update the status of RFQ in Quote Log
        Dim rfqNumber As String, boardName As String
        rfqNumber = dis.Range("B54")
        boardName = dis.Range("B32")
        
        ' update the rfq status to "In Time File"
        Dim cell As Range, firstAddress As String
        With QuoteLogWS.Columns("G:G")
            Set cell = .Find(What:=rfqNumber, LookAt:=xlWhole, MatchCase:=False)
            If Not cell Is Nothing Then
                firstAddress = cell.Address
                Do
                    ' Check if board name in column B of same row matches
                    If QuoteLogWS.Cells(cell.Row, "B").Value = boardName Then
                        QuoteLogWS.Cells(cell.Row, "J").Value = "Quote Generated" ' Or whatever new status
                        Exit Sub
                    End If
                    Set cell = .FindNext(cell)
                Loop While Not cell Is Nothing And cell.Address <> firstAddress
            End If
        End With
        
        Exit For
    End If
Next i

'Application.Run "'" & wb.Name & "'!SendQtytoBOM"

End Sub

''Update
Private Function LeadtimeFunction(dis As Worksheet, inputSheet As Worksheet, i As Long) As String
On Error Resume Next

    inputSheet.Cells(i, DM_L1MinLeadTime_Column) = ""
    inputSheet.Cells(i, DM_L1MaxLeadTime_Column) = ""
    inputSheet.Cells(i, DM_L2MinLeadTime_Column) = ""
    inputSheet.Cells(i, DM_L2MaxLeadTime_Column) = ""
    inputSheet.Cells(i, DM_L1MinLeadTime_Column) = Split(Split(dis.Range("B29").Value, ":")(1), "-")(0)
    inputSheet.Cells(i, DM_L1MaxLeadTime_Column) = Split(Split(Split(dis.Range("B29").Value, ":")(1), "-")(1), " ")(0)
    inputSheet.Cells(i, DM_L2MinLeadTime_Column) = Split(Split(dis.Range("B30").Value, ":")(1), "-")(0)
    inputSheet.Cells(i, DM_L2MaxLeadTime_Column) = Split(Split(Split(dis.Range("B30").Value, ":")(1), "-")(1), " ")(0)
       
On Error GoTo 0

End Function
