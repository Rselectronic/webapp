Attribute VB_Name = "LCSC_API_V5"
Option Explicit

Sub MakeLcscRequest()
    Dim LCSC_KEY As String
    Dim LCSC_SECRET As String
    Dim url As String
    Dim payload As String
    Dim nonce As String
    Dim timestamp As String
    Dim signature As String
    Dim i As Long
    Dim newPayload As String
    Dim payloadStr As String
    Dim xmlhttp As Object
    Dim response As String
    Dim exchangeRate As String
    Dim defaultRate As Double
    
    ' define location to save json data
    Dim JsonFolderPath As String
    Dim fullPath As String
    Dim parentFolderName As String
    
    fullPath = GetLocalPath(ThisWorkbook.fullName)
    parentFolderName = ExtractFolderName(fullPath)
    JsonFolderPath = Left(fullPath, InStr(1, fullPath, parentFolderName, vbTextCompare) + Len(parentFolderName)) & "6. BACKEND\JSON DATA\"

    ' Define LCSC API credentials
    LCSC_KEY = "7Fu3OUGZ4KlEfU5l0QzGXAEG7b"
    LCSC_SECRET = "Le8WX2RgLQvYpia9xSQLJRxeUztbm7xoUex"


    Dim response1 As VbMsgBoxResult
    response1 = MsgBox("Access data from API?", vbYesNo + vbQuestion, "Confirmation")

    
    ' Initialize UserForm and ProgressBar (Label)
    Dim UserForm As Object
    UserForm1.Show vbModeless
    UserForm1.Caption = "LCSC API"
    UserForm1.width = 246
    UserForm1.Height = 187.4
    
    ' Create and format the Label to simulate a progress bar
    Dim ProgressBar1 As Object
    Set ProgressBar1 = UserForm1.Controls.Add("Forms.Label.1", , True)
    ProgressBar1.Name = "ProgressBar1" '
    UserForm1.ProgressFrame.Caption = "Progress Status"
    UserForm1.lblmainProgCaption.Caption = "Getting Data"
    UserForm1.lblsubProgCaption.Caption = "Part Number"
    UserForm1.lblmainProgPerc.width = 0
    UserForm1.lblmainProgPercDisp.Caption = 0 & "%"
    UserForm1.lblsubProgPerc.width = 0
    UserForm1.lblsubProgPercDisp.Caption = 0 & "%"
    ProgressBar1.Caption = ""
    'ProgressBar1.BackColor = RGB(0, 0, 255) ' Blue color
    'ProgressBar1.Height = 40 ' Adjust height as needed
    'ProgressBar1.Width = 0 ' Initialize the width to 0

    
    UserForm1.Show vbModeless
    
    Dim inputWS As Worksheet, ws As Worksheet
    Dim wsNames() As String
    Dim count As Integer
    Dim inputSheetLR As Long
    Dim priceCalcWS As Worksheet
    
    Set inputWS = ThisWorkbook.Sheets("DataInputSheets")
    Set priceCalcWS = ThisWorkbook.Sheets("Price Calc")
    
    initialiseHeaders inputWS
    inputSheetLR = inputWS.Cells(inputWS.Rows.count, DM_GlobalMFRPackage_Column).End(xlUp).Row
    
    For i = 6 To inputSheetLR
        ' Check if the value in column Active Qty of the current row is 1
        If inputWS.Cells(i, DM_ActiveQty_Column).value > 0 Then
            ' Increase the count and add the worksheet name to the array
            count = count + 1
            ReDim Preserve wsNames(1 To count)
            wsNames(count) = inputWS.Cells(i, DM_GlobalMFRPackage_Column).value
        End If
    Next i

    If count > 0 Then
        For i = 1 To count
        
            ' set the exchange rate. Code V2
            defaultRate = 1.5
            exchangeRate = Application.InputBox(Prompt:="Enter the exchange rate:", _
                                                Title:="Exchange Rate Input", _
                                                Default:=defaultRate, _
                                                Type:=1) ' Type:=1 ensures only numeric input is accepted
            
            If exchangeRate = "False" Then
                MsgBox "No value entered. Operation canceled.", vbInformation
                Unload UserForm1
                Exit Sub
            End If

            
            Set ws = ThisWorkbook.Sheets(wsNames(i))
            Dim wsLR As Long, j As Long
            wsLR = ws.Cells(ws.Rows.count, "P").End(xlUp).Row
            
            Dim lcscPN_Column As Integer, lcscStock_Column As Integer, lcscUnitPriceQty1_Column As Integer, lcscExtPriceQty1_Column As Integer
            Dim PreferredDistExtPrice1_Column As Integer, bestPlacetoBuyQty1_Column As Integer
            
            Dim lcscUnitPriceQty2_Column As Integer, lcscUnitPriceQty3_Column As Integer, lcscUnitPriceQty4_Column As Integer
            Dim lcscExtPriceQty2_Column As Integer, lcscExtPriceQty3_Column As Integer, lcscExtPriceQty4_Column As Integer
            Dim PreferredDistExtPrice2_Column As Integer, PreferredDistExtPrice3_Column As Integer, PreferredDistExtPrice4_Column As Integer
            Dim bestPlacetoBuyQty2_Column As Integer, bestPlacetoBuyQty3_Column As Integer, bestPlacetoBuyQty4_Column As Integer
            
            ' collapse the lines first
            
            Dim outputRow As Long
            Dim dict As Object
            Set dict = CreateObject("Scripting.Dictionary")

            ' Define the columns to sum (e.g., Column I = 9, J = 10, etc.)
            Dim sumCols As Variant, unitPriceCol As Variant
            Dim col As Variant
            sumCols = Array(25, 23, 30, 28, 35, 33, 40, 38) ' W, Y, AB, AD, AG, AI, AL, AN
            unitPriceCol = Array(24, 29, 34, 39) ' X, AC, AH, AM
            

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
                        ws.Rows(x).Copy Destination:=ws.Rows(outputRow)
                        outputRow = outputRow + 1
                    Else
                        Dim existingRow As Long
                        existingRow = dict(CPC)
                        
                        ' Sum numeric columns
                        For Each col In sumCols
                            ws.Cells(existingRow, col).value = ws.Cells(existingRow, col).value + ws.Cells(x, col).value
                        Next col
                        ' Average unit price
                        For Each col In unitPriceCol
                            On Error Resume Next
                            ws.Cells(existingRow, col).value = ws.Cells(existingRow, col + 1).value / ws.Cells(existingRow, col - 1).value
                            On Error GoTo 0
                        Next col
                    End If
                End If
                
            Next x
            
            ' delete the unmerged rows
            ws.Rows("4:" & wsLR).Delete Shift:=xlUp

            
            
            lcscPN_Column = ws.Rows(3).Find(What:="LCSC PN1", LookIn:=xlValues, LookAt:=xlWhole).Column
            lcscStock_Column = ws.Rows(3).Find(What:="LCSC stock1", LookIn:=xlValues, LookAt:=xlWhole).Column
            lcscUnitPriceQty1_Column = ws.Rows(3).Find(What:="LCSC Unit price1", LookIn:=xlValues, LookAt:=xlWhole).Column
            lcscExtPriceQty1_Column = ws.Rows(3).Find(What:="LCSC Ext Price1", LookIn:=xlValues, LookAt:=xlWhole).Column
            PreferredDistExtPrice1_Column = ws.Rows(3).Find(What:="Preferred Dist Ext Price1", LookIn:=xlValues, LookAt:=xlWhole).Column
            bestPlacetoBuyQty1_Column = ws.Rows(3).Find(What:="Best Place to Buy1", LookIn:=xlValues, LookAt:=xlWhole).Column
            
            lcscUnitPriceQty2_Column = lcscUnitPriceQty1_Column + 4
            lcscUnitPriceQty3_Column = lcscUnitPriceQty1_Column + 8
            lcscUnitPriceQty4_Column = lcscUnitPriceQty1_Column + 12
            
            lcscExtPriceQty2_Column = lcscExtPriceQty1_Column + 4
            lcscExtPriceQty3_Column = lcscExtPriceQty1_Column + 8
            lcscExtPriceQty4_Column = lcscExtPriceQty1_Column + 12
            
            PreferredDistExtPrice2_Column = PreferredDistExtPrice1_Column + 4
            PreferredDistExtPrice3_Column = PreferredDistExtPrice1_Column + 8
            PreferredDistExtPrice4_Column = PreferredDistExtPrice1_Column + 12
            
            bestPlacetoBuyQty2_Column = bestPlacetoBuyQty1_Column + 4
            bestPlacetoBuyQty3_Column = bestPlacetoBuyQty1_Column + 8
            bestPlacetoBuyQty4_Column = bestPlacetoBuyQty1_Column + 12
            
            
            For j = 4 To wsLR
                Dim lcscPN As String
                lcscPN = ws.Cells(j, lcscPN_Column)
                UserForm1.lblsubProgCaption.Caption = "LCSC PN " & """" & lcscPN & """"
                
                
                
                If Left(lcscPN, 1) = "C" Then
                
                    ' get the json data from storage if exixts
                    response = ReadJSONFromFile(JsonFolderPath & lcscPN & ".json", response1)
                    
                    If response <> "" Then
                        GoTo skipAPIcall_LCSC
                    End If


                
                    ' Define API endpoint
                    url = "https://ips.lcsc.com/rest/wmsc2agent/product/info/" & lcscPN
                    ' keyword search URL
                    'url = https://ips.lcsc.com/rest/wmsc2agent/search/product?keyword=CR2010F127RE04Z
                    
                    ' Generate nonce
                    Randomize
                    nonce = ""
                    Dim y As Integer
                    For y = 1 To 16
                        nonce = nonce & Chr(asc("a") + Int((asc("z") - asc("a") + 1) * Rnd))
                    Next y
                    
                    ' Generate timestamp
                    timestamp = Round(DateDiff("s", DateSerial(1970, 1, 1), ConvertToUtc(Now)))
                    
                    ' Generate signature
                    newPayload = "key=" & LCSC_KEY & "&nonce=" & nonce & "&secret=" & LCSC_SECRET & "&timestamp=" & timestamp
                    signature = SHA1(newPayload)
                    newPayload = "key=" & LCSC_KEY & "&nonce=" & nonce & "&timestamp=" & timestamp
                    
                    ' Make request
                    response = SendRequest(url, newPayload, signature)
                    
                    ' Check response code
                    Dim jsonResponse As Object
                    Set jsonResponse = JsonConverter.ParseJson(response)
                    Dim responseCode As Integer
                    responseCode = jsonResponse("code")
                    Dim retryCount As Integer
                    retryCount = 0
                    
                    ' If response code is not 200, resend request
                    Do While responseCode <> 200 And retryCount < 3
                        response = SendRequest(url, newPayload, signature)
                        Set jsonResponse = JsonConverter.ParseJson(response)
                        responseCode = jsonResponse("code")
                        retryCount = retryCount + 1
                    Loop
                    
                    
                    If responseCode = 200 Then
                        ' save the json data
                        SaveJSONToFile response, JsonFolderPath, lcscPN & ".json"
    
skipAPIcall_LCSC:
                        ' Parse JSON string
                        Dim jsonObject As Object
                        Set jsonObject = JsonConverter.ParseJson(response)
                    
                        ' Extract data
                        Dim manufacturerName As String
                        Dim mPN As String
                        Dim Stockquantity As Long
                        Dim Description As String
                        Dim prices As Object
                        Dim price As Double
                        Dim qty1 As Long, qty2 As Long, qty3 As Long, qty4 As Long
                        
                        manufacturerName = jsonObject("result")("manufacturer")("name")
                        mPN = jsonObject("result")("mpn")
                        Stockquantity = jsonObject("result")("quantity")
                        Description = jsonObject("result")("description")
                    
                        ws.Cells(j, lcscStock_Column) = Stockquantity
                        'ws.Cells(j, "H") = description
                        
                        Set prices = jsonObject("result")("prices")
                        Dim p As Integer
                        Dim pricecalcLR As Long
                        Dim priceJson As String
                        pricecalcLR = priceCalcWS.Cells(priceCalcWS.Rows.count, "A").End(xlUp).Row
                        For p = 1 To prices.count
                            priceCalcWS.Cells(pricecalcLR, "A") = prices(p)("max_qty")
                            priceCalcWS.Cells(pricecalcLR, "B") = prices(p)("price") * 1.5
                            pricecalcLR = pricecalcLR + 1
                            
                            priceJson = priceJson & "{" & """" & "BreakQuantity" & """" & ":" & prices(p)("min_qty") & "," & """" & "UnitPrice" & """" & ":" & prices(p)("price") * 1.5 & "},"
                            
                        Next p
                        
                        ' correct the json string
                        priceJson = "[" & Mid(priceJson, 1, Len(priceJson) - 1) & "]"
                        ws.Cells(j, "BH") = priceJson
                        
                        priceJson = ""
                        
                        qty1 = ws.Cells(j, "W")
                        qty2 = ws.Cells(j, "AB")
                        qty3 = ws.Cells(j, "AG")
                        qty4 = ws.Cells(j, "AL")
                        
                        Dim t As Integer
                        Dim priceQty1 As Long, priceQty2 As Long
                        pricecalcLR = priceCalcWS.Cells(priceCalcWS.Rows.count, "A").End(xlUp).Row
                        
                        
                        For t = 1 To pricecalcLR
                            priceQty1 = priceCalcWS.Cells(t, "A")
                            priceQty2 = priceCalcWS.Cells(t + 1, "A")
                                
                                'get price for qty1
                                
                                If qty1 > priceQty1 And qty1 <= priceQty2 Then
                                    ws.Cells(j, lcscUnitPriceQty1_Column) = priceCalcWS.Cells(t + 1, "B")
                                ElseIf qty1 > priceCalcWS.Cells(prices.count, "A") Then
                                    ws.Cells(j, lcscUnitPriceQty1_Column) = priceCalcWS.Cells(prices.count, "B")
                                ElseIf qty1 <= priceCalcWS.Cells(1, "A") Then
                                    ws.Cells(j, lcscUnitPriceQty1_Column) = priceCalcWS.Cells(1, "B")
                                End If
                                
                                'get price for qty2
                                If qty2 >= priceQty1 And qty2 <= priceQty2 Then
                                    ws.Cells(j, lcscUnitPriceQty2_Column) = priceCalcWS.Cells(t + 1, "B")
                                ElseIf qty2 > priceCalcWS.Cells(prices.count, "A") Then
                                    ws.Cells(j, lcscUnitPriceQty2_Column) = priceCalcWS.Cells(prices.count, "B")
                                ElseIf qty2 <= priceCalcWS.Cells(1, "A") Then
                                    ws.Cells(j, lcscUnitPriceQty2_Column) = priceCalcWS.Cells(1, "B")
                                End If
                                
                                'get price for qty3
                                If qty3 >= priceQty1 And qty3 <= priceQty2 Then
                                    ws.Cells(j, lcscUnitPriceQty3_Column) = priceCalcWS.Cells(t + 1, "B")
                                ElseIf qty3 > priceCalcWS.Cells(prices.count, "A") Then
                                    ws.Cells(j, lcscUnitPriceQty3_Column) = priceCalcWS.Cells(prices.count, "B")
                                ElseIf qty3 <= priceCalcWS.Cells(1, "A") Then
                                    ws.Cells(j, lcscUnitPriceQty3_Column) = priceCalcWS.Cells(1, "B")
                                End If
                                
                                'get price for qty4
                                If qty4 >= priceQty1 And qty4 <= priceQty2 Then
                                    ws.Cells(j, lcscUnitPriceQty4_Column) = priceCalcWS.Cells(t + 1, "B")
                                ElseIf qty4 > priceCalcWS.Cells(prices.count, "A") Then
                                    ws.Cells(j, lcscUnitPriceQty4_Column) = priceCalcWS.Cells(prices.count, "B")
                                ElseIf qty4 <= priceCalcWS.Cells(1, "A") Then
                                    ws.Cells(j, lcscUnitPriceQty4_Column) = priceCalcWS.Cells(1, "B")
                                End If
                        Next t
                        
                        ' get the ext price
                        ws.Cells(j, lcscExtPriceQty1_Column) = ws.Cells(j, lcscUnitPriceQty1_Column) * ws.Cells(j, "W")
                        ws.Cells(j, lcscExtPriceQty2_Column) = ws.Cells(j, lcscUnitPriceQty2_Column) * ws.Cells(j, "AB")
                        ws.Cells(j, lcscExtPriceQty3_Column) = ws.Cells(j, lcscUnitPriceQty3_Column) * ws.Cells(j, "AG")
                        ws.Cells(j, lcscExtPriceQty4_Column) = ws.Cells(j, lcscUnitPriceQty4_Column) * ws.Cells(j, "AL")
                        
                        ' get ext price if in stock and unit price less than Digikey
                        If ws.Cells(j, lcscUnitPriceQty1_Column) < ws.Cells(j, "X") And ws.Cells(j, lcscStock_Column) >= ws.Cells(j, "W") Then
                            ws.Cells(j, PreferredDistExtPrice1_Column) = ws.Cells(j, lcscUnitPriceQty1_Column) * ws.Cells(j, "W")
                            ws.Cells(j, bestPlacetoBuyQty1_Column) = "LCSC"
                        Else
                            ws.Cells(j, PreferredDistExtPrice1_Column) = ws.Cells(j, "Y")
                            ws.Cells(j, bestPlacetoBuyQty1_Column) = ws.Cells(j, "P")
                        End If
                        
                        If ws.Cells(j, lcscUnitPriceQty2_Column) < ws.Cells(j, "AC") And ws.Cells(j, lcscStock_Column) >= ws.Cells(j, "AB") Then
                            ws.Cells(j, PreferredDistExtPrice2_Column) = ws.Cells(j, lcscUnitPriceQty2_Column) * ws.Cells(j, "AB")
                            ws.Cells(j, bestPlacetoBuyQty2_Column) = "LCSC"
                        Else
                            ws.Cells(j, PreferredDistExtPrice2_Column) = ws.Cells(j, "AD")
                            ws.Cells(j, bestPlacetoBuyQty2_Column) = ws.Cells(j, "P")
                        End If
                        
                        If ws.Cells(j, lcscUnitPriceQty3_Column) < ws.Cells(j, "AH") And ws.Cells(j, lcscStock_Column) >= ws.Cells(j, "AG") Then
                            ws.Cells(j, PreferredDistExtPrice3_Column) = ws.Cells(j, lcscUnitPriceQty3_Column) * ws.Cells(j, "AG")
                            ws.Cells(j, bestPlacetoBuyQty3_Column) = "LCSC"
                        Else
                            ws.Cells(j, PreferredDistExtPrice3_Column) = ws.Cells(j, "AI")
                            ws.Cells(j, bestPlacetoBuyQty3_Column) = ws.Cells(j, "P")
                        End If
                        
                        If ws.Cells(j, lcscUnitPriceQty4_Column) < ws.Cells(j, "AM") And ws.Cells(j, lcscStock_Column) >= ws.Cells(j, "AL") Then
                            ws.Cells(j, PreferredDistExtPrice4_Column) = ws.Cells(j, lcscUnitPriceQty4_Column) * ws.Cells(j, "AL")
                            ws.Cells(j, bestPlacetoBuyQty4_Column) = "LCSC"
                        Else
                            ws.Cells(j, PreferredDistExtPrice4_Column) = ws.Cells(j, "AN")
                            ws.Cells(j, bestPlacetoBuyQty4_Column) = ws.Cells(j, "P")
                        End If
                        
                        ' remove data from price calc sheet
                        priceCalcWS.Range(priceCalcWS.Cells(1, 1), priceCalcWS.Cells(pricecalcLR, "B")).ClearContents
                    
                    
                    Else
                        Debug.Print response
                        
                        ws.Cells(j, PreferredDistExtPrice1_Column) = ws.Cells(j, "Y")
                        ws.Cells(j, bestPlacetoBuyQty1_Column) = ws.Cells(j, "P")
                        
                        ws.Cells(j, PreferredDistExtPrice2_Column) = ws.Cells(j, "AD")
                        ws.Cells(j, bestPlacetoBuyQty2_Column) = ws.Cells(j, "P")
                        
                        ws.Cells(j, PreferredDistExtPrice3_Column) = ws.Cells(j, "AI")
                        ws.Cells(j, bestPlacetoBuyQty3_Column) = ws.Cells(j, "P")
                        
                        ws.Cells(j, PreferredDistExtPrice4_Column) = ws.Cells(j, "AN")
                        ws.Cells(j, bestPlacetoBuyQty4_Column) = ws.Cells(j, "P")
                        
                    End If
                Else
                    ws.Cells(j, PreferredDistExtPrice1_Column) = ws.Cells(j, "Y")
                    ws.Cells(j, bestPlacetoBuyQty1_Column) = ws.Cells(j, "P")
                    
                    ws.Cells(j, PreferredDistExtPrice2_Column) = ws.Cells(j, "AD")
                    ws.Cells(j, bestPlacetoBuyQty2_Column) = ws.Cells(j, "P")
                    
                    ws.Cells(j, PreferredDistExtPrice3_Column) = ws.Cells(j, "AI")
                    ws.Cells(j, bestPlacetoBuyQty3_Column) = ws.Cells(j, "P")
                    
                    ws.Cells(j, PreferredDistExtPrice4_Column) = ws.Cells(j, "AN")
                    ws.Cells(j, bestPlacetoBuyQty4_Column) = ws.Cells(j, "P")
                    
                End If
                
                ' Update progress bar by changing Label's width
                UserForm1.Caption = "LCSC API"
                'UserForm1.lblmainProgPercDisp.Caption = Format((r - 3) / (lr - 3), "0.00%")
                'UserForm1.lblmainProgPerc.Width = ((r - 3) / (lr - 3)) * 180
                UserForm1.lblsubProgPercDisp.Caption = Format((j - 3) / (wsLR - 3), "0.00%")
                UserForm1.lblsubProgPerc.width = ((j - 3) / (wsLR - 3)) * 180
                
                
                'UserForm1.Caption = "Progress (" & r - 3 & "/" & lr - 3 & ")....." & Format((r - 3) / (lr - 3), "0.00%")
                'ProgressBar1.Width = (r / lr) * (UserForm1.Width) ' Adjust the width calculation
                DoEvents ' Allow the UserForm to update
                
            
            
            ' numberformat each line
            
            ws.Range(ws.Cells(j, lcscUnitPriceQty1_Column), ws.Cells(j, PreferredDistExtPrice1_Column)).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
            ws.Range(ws.Cells(j, lcscUnitPriceQty2_Column), ws.Cells(j, PreferredDistExtPrice2_Column)).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
            ws.Range(ws.Cells(j, lcscUnitPriceQty3_Column), ws.Cells(j, PreferredDistExtPrice3_Column)).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
            ws.Range(ws.Cells(j, lcscUnitPriceQty4_Column), ws.Cells(j, PreferredDistExtPrice4_Column)).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
            
            ws.Cells(wsLR + 1, PreferredDistExtPrice1_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
            ws.Cells(wsLR + 1, PreferredDistExtPrice2_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
            ws.Cells(wsLR + 1, PreferredDistExtPrice3_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
            ws.Cells(wsLR + 1, PreferredDistExtPrice4_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* "" - ""??_);_(@_)"
            
            Next j
            
            ' Update progress bar by changing Label's width
            UserForm1.Caption = "LCSC API"
            UserForm1.lblmainProgPercDisp.Caption = Format(i / count, "0.00%")
            UserForm1.lblmainProgPerc.width = (i / count) * 180
            'UserForm1.lblsubProgPercDisp.Caption = Format((r - 3) / (lr - 3), "0.00%")
            'UserForm1.lblsubProgPerc.Width = ((r - 3) / (lr - 3)) * 180
            
            
            'UserForm1.Caption = "Progress (" & r - 3 & "/" & lr - 3 & ")....." & Format((r - 3) / (lr - 3), "0.00%")
            'ProgressBar1.Width = (r / lr) * (UserForm1.Width) ' Adjust the width calculation
            DoEvents ' Allow the UserForm to update
            
        Next i
    Else
        MsgBox "No matching worksheets found."
    End If
    
    ' add total at the bottom of each column "preferred dist ext prices"
    
    ws.Cells(wsLR + 1, PreferredDistExtPrice1_Column).FormulaR1C1 = "=sum(R4C" & PreferredDistExtPrice1_Column & ":R" & wsLR & "C" & PreferredDistExtPrice1_Column & ")"
    ws.Cells(wsLR + 1, PreferredDistExtPrice2_Column).FormulaR1C1 = "=sum(R4C" & PreferredDistExtPrice2_Column & ":R" & wsLR & "C" & PreferredDistExtPrice2_Column & ")"
    ws.Cells(wsLR + 1, PreferredDistExtPrice3_Column).FormulaR1C1 = "=sum(R4C" & PreferredDistExtPrice3_Column & ":R" & wsLR & "C" & PreferredDistExtPrice3_Column & ")"
    ws.Cells(wsLR + 1, PreferredDistExtPrice4_Column).FormulaR1C1 = "=sum(R4C" & PreferredDistExtPrice4_Column & ":R" & wsLR & "C" & PreferredDistExtPrice4_Column & ")"
    
    
    
    Unload UserForm1
    
    End Sub



Function URLEncode(StringVal As String) As String
    Dim StringLen As Long
    Dim i As Long
    Dim charCode As Integer
    Dim outStr As String
    
    StringLen = Len(StringVal)
    
    For i = 1 To StringLen
        charCode = asc(Mid(StringVal, i, 1))
        Select Case charCode
            Case 48 To 57, 65 To 90, 97 To 122
                outStr = outStr & Chr(charCode)
            Case 32
                outStr = outStr & "+"
            Case Else
                outStr = outStr & "%" & Right("0" & Hex(charCode), 2)
        End Select
    Next i
    
    URLEncode = outStr
End Function

Function SHA1(ByVal str As String) As String
    Dim asc As Object
    Dim enc As Object
    Dim bytes() As Byte
    Dim bstr() As Byte
    
    Set asc = CreateObject("System.Text.UTF8Encoding")
    Set enc = CreateObject("System.Security.Cryptography.SHA1CryptoServiceProvider")
    
    bytes = asc.GetBytes_4(str)
    bytes = enc.ComputeHash_2(bytes)
    
    Dim hexString As String
    Dim i As Long
    
    For i = LBound(bytes) To UBound(bytes)
        hexString = hexString & Right("0" & Hex(bytes(i)), 2)
    Next i
    
    SHA1 = hexString
End Function

Function ConvToBase64String(arrData() As Byte) As String
    Dim objXML As Object
    Dim objNode As Object
    
    Set objXML = CreateObject("MSXML2.DOMDocument")
    Set objNode = objXML.createElement("b64")
    
    objNode.DataType = "bin.base64"
    objNode.nodeTypedValue = arrData
    ConvToBase64String = objNode.Text
    
    Set objNode = Nothing
    Set objXML = Nothing
End Function

' Function to send request and handle response
Function SendRequest(ByVal url As String, ByVal newPayload As String, ByVal signature As String) As String
    Dim xmlhttp As Object
    Dim url_full As String
    Set xmlhttp = CreateObject("MSXML2.XMLHTTP")
    url_full = url & "?" & newPayload & "&signature=" & signature
    'Debug.Print url_full
    xmlhttp.Open "GET", url_full, False
    xmlhttp.setRequestHeader "Content-Type", "application/json"
    xmlhttp.send
    SendRequest = xmlhttp.responseText
End Function

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

