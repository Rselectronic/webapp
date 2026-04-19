Attribute VB_Name = "PrintLabels_V2"
Option Explicit
Sub generateLabels()

    Application.ScreenUpdating = False
    Application.DisplayAlerts = False
    Application.Calculation = xlCalculationManual
    
    
    Dim wbProc As Workbook, wsProc As Worksheet, procBatchCode As String, receptionwb As Workbook, xLabel As Boolean, stickerTemplatePath As String
    
    Set wbProc = ThisWorkbook
    Set wsProc = wbProc.Sheets("Proc")
    initialiseHeaders , , , wsProc
    
    procBatchCode = Split(Mid(wbProc.Name, 6), ".")(0)
    
    Dim lastRow As Long
    Dim uniqueLabels_key1 As Object, uniqueLabels_key2 As Object
    Dim i As Long
    Dim boardNames As Variant
    Dim mcode As String
    Dim board As Variant
    Dim key1 As Variant
    Dim key2 As Variant
    Dim boardLetter As String
    Dim wsBoardRef As Worksheet
    Dim j As Long
    Dim labelSheet As Worksheet
    Dim outputRow As Long
    Dim sortedKeys_key1 As Variant, sortedKeys_key2 As Variant
    Dim k As Long
    Dim shelfOrganiserLabelFileName As String, stickerLabelsFileName As String

    shelfOrganiserLabelFileName = GetLocalPath(ThisWorkbook.Path) & "\" & procBatchCode & " Labels - Shelf Organiser.pdf"
    stickerLabelsFileName = GetLocalPath(ThisWorkbook.Path) & "\" & procBatchCode & " Labels - Stickers"
    
    stickerTemplatePath = Left(GetLocalPath(ThisWorkbook.Path), InStr(1, GetLocalPath(ThisWorkbook.Path), "RS Master") - 1) & "RS Master\6. BACKEND\STICKER LABEL TEMPLATE\Avery5159AddressLabels-blank template.doc"

    Set uniqueLabels_key1 = CreateObject("Scripting.Dictionary")
    Set uniqueLabels_key2 = CreateObject("Scripting.Dictionary")
    Set wsBoardRef = wbProc.Sheets("PCB + Stencils Orders")
    
    initialiseHeaders , , , , , , wsBoardRef

    Dim wbLabel As Workbook
    Set wbLabel = Workbooks.Add
    Set labelSheet = wbLabel.Sheets(1)
    wbLabel.Windows(1).Visible = False

    lastRow = wsProc.Cells(wsProc.Rows.count, Procsheet_CPC_Column).End(xlUp).Row

    For i = 5 To lastRow
        mcode = Trim(wsProc.Cells(i, Procsheet_Mcodes_Column).Value)
        
        ' check if xLabel exits
        If xLabel = False Then
            If InStr(1, wsProc.Cells(i, Procsheet_BoardName_Column), "+") > 0 Then xLabel = True
        End If
        
        ' Normalize Mcode
        Select Case UCase(mcode)
            Case "CP", "0402", "402"
                mcode = "CP/0402"
        End Select

        boardNames = Split(wsProc.Cells(i, Procsheet_BoardName_Column).Value, "+")

        For Each board In boardNames
            board = Trim(board)
            If Len(board) > 0 Then
                ' Lookup board letter
                boardLetter = ""
                With wsBoardRef
                    For j = 2 To .Cells(.Rows.count, PCB_ProcSheet_GMP__Column).End(xlUp).Row
                        If Trim(.Cells(j, PCB_ProcSheet_GMP__Column).Value) = board Then
                            boardLetter = Trim(.Cells(j, PCB_ProcSheet_Letter__Column).Value)
                            Exit For
                        End If
                    Next j
                End With

                key1 = boardLetter & vbCrLf & board & vbCrLf & mcode & vbCrLf & procBatchCode
                key2 = boardLetter & vbCrLf & board & vbCrLf & procBatchCode

                If Not uniqueLabels_key1.Exists(key1) Then
                    uniqueLabels_key1.Add key1, key1
                End If
                
                If Not uniqueLabels_key2.Exists(key2) Then
                    uniqueLabels_key2.Add key2, key2
                End If
                
            End If
        Next board
    Next i

    ' Extract dictionary keys into an array
    sortedKeys_key1 = uniqueLabels_key1.Keys
    sortedKeys_key2 = uniqueLabels_key2.Keys

    ' Sort the keys alphabetically
    Call BubbleSort(sortedKeys_key1)
    Call BubbleSort(sortedKeys_key2)

    
    
    labelSheet.Range("A:AQ").ColumnWidth = 1.67
    
    ' make shelve organiser in page 1
    labelSheet.Rows("2:11").RowHeight = 36
    labelSheet.Range("B2:K11").Merge
    
    Dim m As Long
    For m = 2 To 11
        With labelSheet.Range("M" & m & ":N" & m)
            .Merge
            .Font.Bold = True
            .Font.size = 36
        End With
        With labelSheet.Range("P" & m & ":AJ" & m)
            .Merge
            .Font.Bold = True
            .Font.size = 36
        End With
        With labelSheet.Range("AK" & m & ":AP" & m)
            .Merge
            .Font.Bold = True
            .Font.size = 32
        End With
    Next m
    
    ' fill shelve organiser
    labelSheet.Range("B2") = procBatchCode
    labelSheet.Range("B2").Font.Bold = True
    labelSheet.Range("B2").Font.size = 36
    labelSheet.Range("B2").WrapText = True
    labelSheet.Range("B2").VerticalAlignment = xlTop
    
    For i = 2 To wsBoardRef.Cells(wsBoardRef.Rows.count, PCB_ProcSheet_GMP__Column).End(xlUp).Row
        If wsBoardRef.Cells(i, PCB_ProcSheet_Type__Column) = "PCB" Or wsBoardRef.Cells(i, PCB_ProcSheet_Type__Column) = "" Then
            labelSheet.Cells(i, "M") = wsBoardRef.Cells(i, PCB_ProcSheet_Letter__Column)
            labelSheet.Cells(i, "P") = wsBoardRef.Cells(i, PCB_ProcSheet_GMP__Column)
            labelSheet.Cells(i, "AK") = wsBoardRef.Cells(i, PCB_ProcSheet_Qty__Column)
        End If
    Next i
    
    ' print selve orgniser and close the file.
    With labelSheet.PageSetup
        .TopMargin = Application.CentimetersToPoints(0.25)
        .BottomMargin = Application.CentimetersToPoints(0.25)
        .LeftMargin = Application.CentimetersToPoints(0.25)
        .RightMargin = Application.CentimetersToPoints(0.25)
        .FitToPagesWide = 1
        .FitToPagesTall = False ' or use 9999 if you don’t want to limit height
        .Zoom = False ' This is required when using FitToPages
    End With
    
    labelSheet.Columns("A:AQ").ColumnWidth = 1.67
    
    
    ' generate the pdf and close the temp label workbook
    wbLabel.ExportAsFixedFormat xlTypePDF, shelfOrganiserLabelFileName
    wbLabel.Windows(1).Visible = True
    wbLabel.Close SaveChanges:=False
    
    ' inset page break
    'labelSheet.HPageBreaks.Add Before:=labelSheet.Cells(13, 1)
    ' Write to the new worksheet
    'outputRow = 13
    
    
    ' create sticker labels
    FillAveryLabelsAndSavePDF stickerTemplatePath, sortedKeys_key2, xLabel, sortedKeys_key1, procBatchCode, stickerLabelsFileName
    



'    For k = LBound(sortedKeys_key2) To UBound(sortedKeys_key2)
'        With labelSheet.Range(labelSheet.Cells(outputRow, "A"), labelSheet.Cells(outputRow, "AQ"))
'            .Merge
'            .Value = sortedKeys_key2(k)
'            .WrapText = True
'            .Font.Bold = True
'            .Font.size = 34
'            .HorizontalAlignment = xlCenter
'            .VerticalAlignment = xlVAlignCenter
'        End With
'        outputRow = outputRow + 1
'    Next k
'
'
'    If xLabel Then
'        With labelSheet.Range(labelSheet.Cells(outputRow, "A"), labelSheet.Cells(outputRow, "AQ"))
'            .Merge
'            .Value = "X" & vbCrLf & procBatchCode
'            .WrapText = True
'            .Font.Bold = True
'            .Font.size = 34
'            .HorizontalAlignment = xlCenter
'            .VerticalAlignment = xlVAlignCenter
'        End With
'        outputRow = outputRow + 1
'    End If
'
'    For k = LBound(sortedKeys_key1) To UBound(sortedKeys_key1)
'        With labelSheet.Range(labelSheet.Cells(outputRow, "A"), labelSheet.Cells(outputRow, "AQ"))
'            .Merge
'            .Value = sortedKeys_key1(k)
'            .WrapText = True
'            .Font.Bold = True
'            .Font.size = 34
'            .HorizontalAlignment = xlCenter
'            .VerticalAlignment = xlVAlignCenter
'        End With
'        outputRow = outputRow + 1
'    Next k
    
    
    
    
    Application.ScreenUpdating = True
    Application.DisplayAlerts = True
    Application.Calculation = xlCalculationAutomatic
    
    
End Sub
' Simple bubble sort for array of strings
Sub BubbleSort(arr As Variant)
    Dim i As Long, j As Long
    Dim temp As String
    Dim n As Long

    n = UBound(arr)
    For i = 0 To n - 1
        For j = i + 1 To n
            If arr(i) > arr(j) Then
                temp = arr(i)
                arr(i) = arr(j)
                arr(j) = temp
            End If
        Next j
    Next i
End Sub

