Attribute VB_Name = "pdfExport_V2"
Sub PrintToPDF()
    Dim QT As Worksheet
    Dim FinalQty As Worksheet
    Dim timeWBsummaryWS As Worksheet
    Dim pdfPath As String
    
    Dim path As String
    
    Dim desktopPath As String
    Dim pdfName As String
    Dim counter As Integer
   
' Set the default printer to "Microsoft Print to PDF"
       
    Dim DefaultPrinter As String
    ' Store the current default printer
    DefaultPrinter = Application.ActivePrinter
    
    Dim Printers() As String
        Dim N As Long
        Dim s As String
        Printers = GetPrinterFullNames()
        For N = LBound(Printers) To UBound(Printers)
            If InStr(1, Printers(N), "Microsoft Print to PDF", vbTextCompare) > 0 Then
                Application.ActivePrinter = Printers(N)
                Exit For
            End If
            'S = S & Printers(N) & vbNewLine
        Next N
        'MsgBox S, vbOKOnly, "Printers"
    
    
    
    
    ' Replace "Sheet1" with the name of the sheet you want to print
    Set QT = ThisWorkbook.Sheets("Quotation Temp")
    Set FinalQty = ThisWorkbook.Sheets("final")
    Set timeWBsummaryWS = ThisWorkbook.Sheets("Summary")
    
    initialiseHeaders , , , , , , , , timeWBsummaryWS
    
     'save original qoute name to use later
    Dim originalQuote As String
    originalQuote = QT.Range("G19").Value
    
    ' check if Quote number is mentioned in Quotation Template
    If QT.Range("G19") = "" Then
    MsgBox "Please enter Quote Number"
    QT.Activate
    QT.Range("G19").Select
    Exit Sub
    End If
    
    ' extract local paths
    Dim fullPath As String
    Dim customerName As String
    Dim masterFolderName As String
    Dim prodPath As String
    Dim timeProjectPath As String
    
    fullPath = GetLocalPath(ThisWorkbook.FullName)
    'Debug.Print fullpath
    
    
    ' get the Master Folder Name
    Dim folders() As String
    
    ' Split the path string using backslash as delimiter
    folders = Split(fullPath, "\")
    
    customerName = folders(UBound(folders) - 3)
    masterFolderName = folders(UBound(folders) - 5)
    
    ' path to time project
    timeProjectPath = Left(fullPath, InStr(1, fullPath, masterFolderName, vbTextCompare) + Len(masterFolderName)) & "6. BACKEND\TIME PROJECT\"
    
    ' path to Production and Quotation folder
    prodPath = Left(fullPath, InStr(1, fullPath, customerName, vbTextCompare) + Len(customerName)) & "1. PROD FILES AND QUOTES\"
    
    
    path = prodPath
    
    
    ' check if Quote folder exists or not. if not then create a quote folder
    
    If Dir(path & FinalQty.Range("B32") & " QTE " & QT.Range("G19"), vbDirectory) = "" Then
        MkDir path & FinalQty.Range("B32") & " QTE " & QT.Range("G19")
    End If
    
    ' Set the PDF path and name
    pdfName = FinalQty.Range("B32") & " QTE " & QT.Range("G19") & ".pdf"
    'pdfPath = ThisWorkbook.Path & "\" & pdfName
    pdfPath = path & FinalQty.Range("B32") & " QTE " & QT.Range("G19") & "\" & pdfName
    'Debug.Print pdfPath
    
    ' Check if a file with the same name already exists on the desktop
    Do While Dir(pdfPath) <> ""
        counter = counter + 1
        pdfName = FinalQty.Range("B32") & " QTE " & QT.Range("G19") & "R" & counter & ".pdf"
        pdfPath = path & FinalQty.Range("B32") & " QTE " & QT.Range("G19") & "\" & pdfName
        'QT.Range("G19") = QT.Range("G19") & "R" & counter
        'Debug.Print pdfPath
    Loop
    
    If counter <> 0 Then
    QT.Range("G19") = QT.Range("G19") & "R" & counter
    FinalQty.Range("B53") = QT.Range("G19")
    Else
    FinalQty.Range("B53") = QT.Range("G19")
    End If
    
    pdfPath = path & FinalQty.Range("B32") & " QTE " & FinalQty.Range("B28") & "\" & pdfName
    'Debug.Print pdfPath
    
    ' page setup before print
    NormalizePdfPageSetup QT
    
    ' define lastpage
    Dim lastPagetoPrint As Long
    lastPagetoPrint = getLastPagetoPrint(FinalQty)
    
    ' Print the specified sheet to PDF
    QT.ExportAsFixedFormat Type:=xlTypePDF, fileName:=pdfPath, Quality:=xlQualityStandard, IncludeDocProperties:=True, IgnorePrintAreas:=False, From:=1, To:=lastPagetoPrint
    
    ' export the final sheet as a new sheet in the same workbook
    Dim newsheetName As String
    Dim newWorksheet As Worksheet
    Dim timeWBsummaryWSLR As Long
    Dim sheetExists As Boolean
    timeWBsummaryWSLR = timeWBsummaryWS.Cells(timeWBsummaryWS.Rows.Count, timeWBsummaryWS_sheet_name_column).End(xlUp).Row
    newsheetName = timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_sheet_name_column)
    
    'check if the sheet already exists
    On Error Resume Next
    Set newWorksheet = ThisWorkbook.Sheets(newsheetName)
    On Error GoTo 0
    If Not newWorksheet Is Nothing Then
        sheetExists = True
    Else
        FinalQty.Copy After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count)
        Set newWorksheet = ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count)
        newWorksheet.UsedRange.Copy
        newWorksheet.Range("A1").PasteSpecial Paste:=xlPasteValues
        newWorksheet.Name = newsheetName
        
        
        Dim shp As Shape
        For Each shp In newWorksheet.Shapes
            shp.Delete
        Next shp
    End If
    
    ' add a command button in the sheet to goto Summary sheet
    On Error Resume Next
    newWorksheet.Shapes("GoToSummaryBtn").Delete
    On Error GoTo 0
    
    With newWorksheet.Shapes.AddFormControl(xlButtonControl, 817, 6, 100, 30)
        .Name = "GoToSummaryBtn"
        .OnAction = "'" & ThisWorkbook.Name & "'!GoToSummary"
        .TextFrame.Characters.Text = "Go to Summary"
        .Placement = xlFreeFloating ' Ensures it doesn’t move or resize with cells
    End With
    
    'update the summary sheet after printing quote
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_status_column) = "Done"
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_date_quoted_column) = Format(FillDateTimeInCanada, "mm/dd/yy hh:mm:ss")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_quote_no_column) = FinalQty.Range("B53")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_quote_category_column) = ""
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty1_labour_column) = FinalQty.Range("C15")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty1_smt_column) = FinalQty.Range("D15")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty1_unitprice_column) = "_-$* #,##0.00_-;-$* #,##0.00_-;_-$* ""-""??_-;_-@_-"
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty1_unitprice_column) = FinalQty.Range("D2")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty1_pcbMarkup_column).NumberFormat = "0%"
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty1_pcbMarkup_column) = FinalQty.Range("F15")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty1_componentMarkup_column).NumberFormat = "0%"
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty1_componentMarkup_column) = FinalQty.Range("H15")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty2_labour_column) = FinalQty.Range("C16")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty2_smt_column) = FinalQty.Range("D16")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty2_unitprice_column) = "_-$* #,##0.00_-;-$* #,##0.00_-;_-$* ""-""??_-;_-@_-"
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty2_unitprice_column) = FinalQty.Range("D3")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty2_pcbMarkup_column).NumberFormat = "0%"
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty2_pcbMarkup_column) = FinalQty.Range("F16")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty2_componentMarkup_column).NumberFormat = "0%"
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty2_componentMarkup_column) = FinalQty.Range("H16")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty3_labour_column) = FinalQty.Range("C17")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty3_smt_column) = FinalQty.Range("D17")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty3_unitprice_column) = "_-$* #,##0.00_-;-$* #,##0.00_-;_-$* ""-""??_-;_-@_-"
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty3_unitprice_column) = FinalQty.Range("D4")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty3_pcbMarkup_column).NumberFormat = "0%"
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty3_pcbMarkup_column) = FinalQty.Range("F17")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty3_componentMarkup_column).NumberFormat = "0%"
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty3_componentMarkup_column) = FinalQty.Range("H17")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty4_labour_column) = FinalQty.Range("C18")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty4_smt_column) = FinalQty.Range("D18")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty4_unitprice_column) = "_-$* #,##0.00_-;-$* #,##0.00_-;_-$* ""-""??_-;_-@_-"
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty4_unitprice_column) = FinalQty.Range("D5")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty4_pcbMarkup_column).NumberFormat = "0%"
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty4_pcbMarkup_column) = FinalQty.Range("F18")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty4_componentMarkup_column).NumberFormat = "0%"
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_qty4_componentMarkup_column) = FinalQty.Range("H18")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_note1_column) = FinalQty.Range("K1")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_note2_column) = FinalQty.Range("K2")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_note3_column) = FinalQty.Range("K3")
    timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_cx_supplies_column) = "No"
    
    'link the copy of final worksheet
    Dim linkCell As Range
    Set linkCell = timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_sheet_name_column)
    linkCell.Hyperlinks.Add Anchor:=linkCell, Address:="", SubAddress:="'" & newsheetName & "'!A1", TextToDisplay:=newsheetName

    
    
    Dim p As Long
    For p = 7 To 15
        If FinalQty.Cells(p, "P") = "NO" Then
           timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_cx_supplies_column) = "Yes"
           Exit For
        End If
    Next p

    ' Move the PDF to the recipient's desktop using FileCopy and Kill statements
    'FileCopy pdfPath, desktopPath & "\" & pdfName
    'Debug.Print pdfPath
    'Kill pdfPath
    
    ' update the pricing sheet with markup % and proc fees
    Dim pricingWS As Worksheet
    Dim pricingWSLR As Long
    Set pricingWS = ThisWorkbook.Sheets(Trim(CStr(timeWBsummaryWS.Cells(timeWBsummaryWSLR, timeWBsummaryWS_rs_pricing_sheet_name_column).Value)))
    pricingWSLR = pricingWS.Cells(pricingWS.Rows.Count, "G").End(xlUp).Row
    
    pricingWS.Cells(pricingWSLR + 4, "X").NumberFormat = "0%"
    pricingWS.Cells(pricingWSLR + 4, "AC").NumberFormat = "0%"
    pricingWS.Cells(pricingWSLR + 4, "AH").NumberFormat = "0%"
    pricingWS.Cells(pricingWSLR + 4, "AM").NumberFormat = "0%"
    pricingWS.Cells(pricingWSLR + 4, "X").Interior.Color = RGB(255, 255, 0)
    pricingWS.Cells(pricingWSLR + 4, "AC").Interior.Color = RGB(255, 255, 0)
    pricingWS.Cells(pricingWSLR + 4, "AH").Interior.Color = RGB(255, 255, 0)
    pricingWS.Cells(pricingWSLR + 4, "AM").Interior.Color = RGB(255, 255, 0)
    pricingWS.Cells(pricingWSLR + 4, "Y").NumberFormat = "#,##0.00 $"
    pricingWS.Cells(pricingWSLR + 4, "AD").NumberFormat = "#,##0.00 $"
    pricingWS.Cells(pricingWSLR + 4, "AI").NumberFormat = "#,##0.00 $"
    pricingWS.Cells(pricingWSLR + 4, "AN").NumberFormat = "#,##0.00 $"
    pricingWS.Cells(pricingWSLR + 5, "Y").NumberFormat = "#,##0.00 $"
    pricingWS.Cells(pricingWSLR + 5, "AD").NumberFormat = "#,##0.00 $"
    pricingWS.Cells(pricingWSLR + 5, "AI").NumberFormat = "#,##0.00 $"
    pricingWS.Cells(pricingWSLR + 5, "AN").NumberFormat = "#,##0.00 $"
    pricingWS.Cells(pricingWSLR + 6, "Y").NumberFormat = "#,##0.00 $"
    pricingWS.Cells(pricingWSLR + 6, "AD").NumberFormat = "#,##0.00 $"
    pricingWS.Cells(pricingWSLR + 6, "AI").NumberFormat = "#,##0.00 $"
    pricingWS.Cells(pricingWSLR + 6, "AN").NumberFormat = "#,##0.00 $"
    
    pricingWS.Cells(pricingWSLR + 2, "Y") = ThisWorkbook.Sheets("QTY 1").Range("D207")       ' shipping
    pricingWS.Cells(pricingWSLR + 2, "AD") = ThisWorkbook.Sheets("QTY 1").Range("D207")       ' shipping
    pricingWS.Cells(pricingWSLR + 2, "AI") = ThisWorkbook.Sheets("QTY 1").Range("D207")       ' shipping
    pricingWS.Cells(pricingWSLR + 2, "AN") = ThisWorkbook.Sheets("QTY 1").Range("D207")       ' shipping
    
    pricingWS.Cells(pricingWSLR + 3, "Y").FormulaR1C1 = "=R[-1]C+R[-2]C"
    pricingWS.Cells(pricingWSLR + 3, "AD").FormulaR1C1 = "=R[-1]C+R[-2]C"
    pricingWS.Cells(pricingWSLR + 3, "AI").FormulaR1C1 = "=R[-1]C+R[-2]C"
    pricingWS.Cells(pricingWSLR + 3, "AN").FormulaR1C1 = "=R[-1]C+R[-2]C"
    
    
    pricingWS.Cells(pricingWSLR + 4, "X") = FinalQty.Range("F15")       'comp markup
    pricingWS.Cells(pricingWSLR + 4, "AC") = FinalQty.Range("F16")      'comp markup
    pricingWS.Cells(pricingWSLR + 4, "AH") = FinalQty.Range("F17")      'comp markup
    pricingWS.Cells(pricingWSLR + 4, "AM") = FinalQty.Range("F18")      'comp markup
    pricingWS.Cells(pricingWSLR + 4, "Y").FormulaR1C1 = "=R[-1]C*RC[-1]"
    pricingWS.Cells(pricingWSLR + 4, "AD").FormulaR1C1 = "=R[-1]C*RC[-1]"
    pricingWS.Cells(pricingWSLR + 4, "AI").FormulaR1C1 = "=R[-1]C*RC[-1]"
    pricingWS.Cells(pricingWSLR + 4, "AN").FormulaR1C1 = "=R[-1]C*RC[-1]"
    
    pricingWS.Cells(pricingWSLR + 5, "X") = "Proc Fee"
    pricingWS.Cells(pricingWSLR + 5, "AC") = "Proc Fee"
    pricingWS.Cells(pricingWSLR + 5, "AH") = "Proc Fee"
    pricingWS.Cells(pricingWSLR + 5, "AM") = "Proc Fee"
    pricingWS.Cells(pricingWSLR + 5, "Y") = ThisWorkbook.Sheets("QTY 1").Range("B208")      'proc fees
    pricingWS.Cells(pricingWSLR + 5, "AD") = ThisWorkbook.Sheets("QTY 2").Range("B208")     'proc fees
    pricingWS.Cells(pricingWSLR + 5, "AI") = ThisWorkbook.Sheets("QTY 3").Range("B208")     'proc fees
    pricingWS.Cells(pricingWSLR + 5, "AN") = ThisWorkbook.Sheets("QTY 4").Range("B208")     'proc fees
    pricingWS.Cells(pricingWSLR + 6, "Y").FormulaR1C1 = "=SUM(R[-3]C:R[-1]C)"
    pricingWS.Cells(pricingWSLR + 6, "AD").FormulaR1C1 = "=SUM(R[-3]C:R[-1]C)"
    pricingWS.Cells(pricingWSLR + 6, "AI").FormulaR1C1 = "=SUM(R[-3]C:R[-1]C)"
    pricingWS.Cells(pricingWSLR + 6, "AN").FormulaR1C1 = "=SUM(R[-3]C:R[-1]C)"
    
        'borders
        pricingWS.Range(pricingWS.Cells(pricingWSLR + 4, "X"), pricingWS.Cells(pricingWSLR + 6, "Y")).Borders.LineStyle = xlContinuous
        pricingWS.Range(pricingWS.Cells(pricingWSLR + 4, "AC"), pricingWS.Cells(pricingWSLR + 6, "AD")).Borders.LineStyle = xlContinuous
        pricingWS.Range(pricingWS.Cells(pricingWSLR + 4, "AH"), pricingWS.Cells(pricingWSLR + 6, "AI")).Borders.LineStyle = xlContinuous
        pricingWS.Range(pricingWS.Cells(pricingWSLR + 4, "AM"), pricingWS.Cells(pricingWSLR + 6, "AN")).Borders.LineStyle = xlContinuous
    
    
    QT.Range("G19") = originalQuote
    
    'reset the default printer
    Application.ActivePrinter = DefaultPrinter
    
    ' Display a message
    If sheetExists Then
        MsgBox "PDF has been generated and saved to: " & vbNewLine & vbNewLine & pdfPath & "." & vbNewLine & vbNewLine & "A copy of Final Sheet (" & newsheetName & ") already exists and updated the data in the same", vbInformation, "PDF Generated"
    Else
        MsgBox "PDF has been generated and saved to: " & pdfPath, vbInformation, "PDF Generated"
    End If

End Sub

Private Sub NormalizePdfPageSetup(ByVal ws As Worksheet)
    With ws.PageSetup
        ' Lock paper + orientation (pick what you need)
        .PaperSize = xlPaperLetter          ' or xlPaperA4
        .Orientation = xlPortrait       ' or xlLandscape

        ' Lock margins (inches -> points)
        .LeftMargin = Application.CentimetersToPoints(0)
        .RightMargin = Application.CentimetersToPoints(0)
        .TopMargin = Application.CentimetersToPoints(1.3)
        .BottomMargin = Application.CentimetersToPoints(1.4)
        .HeaderMargin = Application.CentimetersToPoints(0)
        .FooterMargin = Application.CentimetersToPoints(0)

        ' Choose ONE scaling method and lock it
        .Zoom = False
        .FitToPagesWide = 1
        .FitToPagesTall = False

        ' Optional but helpful
        .CenterHorizontally = True
        .CenterVertically = False

    End With
End Sub

Function getLastPagetoPrint(ws As Worksheet) As Long
    
    getLastPagetoPrint = 5

    Dim i As Long
    For i = 2 To 5
        If ws.Cells(i, "D") = "" Then
            getLastPagetoPrint = i - 2 + 1
            Exit For
        End If
    Next i

End Function



