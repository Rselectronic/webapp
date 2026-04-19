Attribute VB_Name = "LCSC_API_V2"
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

    ' Define LCSC API credentials
    LCSC_KEY = "7Fu3OUGZ4KlEfU5l0QzGXAEG7b"
    LCSC_SECRET = "Le8WX2RgLQvYpia9xSQLJRxeUztbm7xoUex"
    
    
    ' Initialize UserForm and ProgressBar (Label)
    Dim UserForm As Object
    UserForm1.Show vbModeless
    UserForm1.Caption = "LCSC API"
    UserForm1.Width = 246
    UserForm1.Height = 187.4
    
    ' Create and format the Label to simulate a progress bar
    Dim progressBar1 As Object
    Set progressBar1 = UserForm1.Controls.Add("Forms.Label.1", , True)
    progressBar1.Name = "ProgressBar1" '
    UserForm1.ProgressFrame.Caption = "Progress Status"
    UserForm1.lblmainProgCaption.Caption = "Getting Data"
    UserForm1.lblsubProgCaption.Caption = "Part Number"
    UserForm1.lblmainProgPerc.Width = 0
    UserForm1.lblmainProgPercDisp.Caption = 0 & "%"
    UserForm1.lblsubProgPerc.Width = 0
    UserForm1.lblsubProgPercDisp.Caption = 0 & "%"
    progressBar1.Caption = ""
    
    UserForm1.Show vbModeless
    
    Dim ProcWS As Worksheet
    Dim wsNames() As String
    Dim count As Integer
    Dim ProcSheetLR As Long
    Dim priceCalcWS As Worksheet
    
    Set ProcWS = ThisWorkbook.Sheets("Proc")
    Set priceCalcWS = ThisWorkbook.Sheets("Price Calc")
    
    initialiseHeaders , , , ProcWS
    ProcSheetLR = ProcWS.Cells(ProcWS.Rows.count, Procsheet_CPC_Column).End(xlUp).Row
            
    Dim j As Long
    
        For j = 5 To ProcSheetLR
            Dim LCSCpn As String
            LCSCpn = ProcWS.Cells(j, Procsheet_LCSCPN_Column)
            UserForm1.lblsubProgCaption.Caption = "LCSC PN " & """" & LCSCpn & """"
            
            
            
            If Left(LCSCpn, 1) = "C" Then
            
                ' Define API endpoint
                url = "https://ips.lcsc.com/rest/wmsc2agent/product/info/" & LCSCpn
                
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
                    ' Parse JSON string
                    Dim JsonObject As Object
                    Set JsonObject = JsonConverter.ParseJson(response)
                
                    ' Extract data
                    Dim manufacturerName As String
                    Dim mpn As String
                    Dim Stockquantity As Long
                    Dim description As String
                    Dim prices As Object
                    Dim price As Double
                    Dim qty1 As Long, qty2 As Long, qty3 As Long, qty4 As Long
                    
                    manufacturerName = JsonObject("result")("manufacturer")("name")
                    mpn = JsonObject("result")("mpn")
                    Stockquantity = JsonObject("result")("quantity")
                    description = JsonObject("result")("description")
                
                    ProcWS.Cells(j, Procsheet_LCSCstock_Column) = Stockquantity
                    
                    Set prices = JsonObject("result")("prices")
                    Dim p As Integer
                    Dim priceCalcLR As Long
                    priceCalcLR = priceCalcWS.Cells(priceCalcWS.Rows.count, "A").End(xlUp).Row
                    For p = 1 To prices.count
                        priceCalcWS.Cells(priceCalcLR, "A") = prices(p)("max_qty")
                        priceCalcWS.Cells(priceCalcLR, "B") = prices(p)("price") * 1.4
                        priceCalcLR = priceCalcLR + 1
                    Next p
                    
                    qty1 = ProcWS.Cells(j, Procsheet_ORDERQTY_Column)
                    
                    Dim t As Integer
                    Dim priceQty1 As Long, priceQty2 As Long
                    priceCalcLR = priceCalcWS.Cells(priceCalcWS.Rows.count, "A").End(xlUp).Row
                    
                    
                    For t = 1 To priceCalcLR
                        priceQty1 = priceCalcWS.Cells(t, "A")
                        priceQty2 = priceCalcWS.Cells(t + 1, "A")
                            
                            'get price for qty1
                            
                            If qty1 > priceQty1 And qty1 <= priceQty2 Then
                                ProcWS.Cells(j, Procsheet_LCSCUnitPrice_Column) = priceCalcWS.Cells(t + 1, "B")
                            ElseIf qty1 > priceCalcWS.Cells(prices.count, "A") Then
                                ProcWS.Cells(j, Procsheet_LCSCUnitPrice_Column) = priceCalcWS.Cells(prices.count, "B")
                            ElseIf qty1 <= priceCalcWS.Cells(1, "A") Then
                                ProcWS.Cells(j, Procsheet_LCSCUnitPrice_Column) = priceCalcWS.Cells(1, "B")
                            End If
                            
                    Next t
                    
                    ' get the ext price
                    ProcWS.Cells(j, Procsheet_LCSCExtPrice_Column) = ProcWS.Cells(j, Procsheet_LCSCUnitPrice_Column) * ProcWS.Cells(j, Procsheet_ORDERQTY_Column)
                    
                    ' get preferred dist ext price
                    If ProcWS.Cells(j, Procsheet_LCSCUnitPrice_Column) < ProcWS.Cells(j, Procsheet_OrderQtyUnitPrice_Column) And ProcWS.Cells(j, Procsheet_ORDERQTY_Column) <= ProcWS.Cells(j, Procsheet_LCSCstock_Column) Then
                        ProcWS.Cells(j, Procsheet_PreferredDistExtPrice_Column) = ProcWS.Cells(j, Procsheet_LCSCExtPrice_Column)
                        ProcWS.Cells(j, Procsheet_BestPlacetoBuy_Column) = "LCSC"
                    Else
                        ProcWS.Cells(j, Procsheet_PreferredDistExtPrice_Column) = ProcWS.Cells(j, Procsheet_OrderQtyExtPrice_Column)
                        ProcWS.Cells(j, Procsheet_BestPlacetoBuy_Column) = ProcWS.Cells(j, Procsheet_DistName_Column)
                    End If
                    
                    ' remove data from price calc sheet
                    priceCalcWS.Range(priceCalcWS.Cells(1, 1), priceCalcWS.Cells(priceCalcLR, "B")).ClearContents
                
                
                Else
                    'Debug.Print response
                    ProcWS.Cells(j, Procsheet_PreferredDistExtPrice_Column) = ProcWS.Cells(j, Procsheet_OrderQtyExtPrice_Column)
                    ProcWS.Cells(j, Procsheet_BestPlacetoBuy_Column) = ProcWS.Cells(j, Procsheet_DistName_Column)
                End If
            Else
                ProcWS.Cells(j, Procsheet_PreferredDistExtPrice_Column) = ProcWS.Cells(j, Procsheet_OrderQtyExtPrice_Column)
                ProcWS.Cells(j, Procsheet_BestPlacetoBuy_Column) = ProcWS.Cells(j, Procsheet_DistName_Column)
            End If
            
            ' Update progress bar by changing Label's width
            UserForm1.Caption = "LCSC API"
            UserForm1.lblsubProgPercDisp.Caption = Format((j - 3) / (ProcSheetLR - 3), "0.00%")
            UserForm1.lblsubProgPerc.Width = ((j - 3) / (ProcSheetLR - 3)) * 180
            DoEvents ' Allow the UserForm to update
            
            
            ' format the cell
            ProcWS.Cells(j, Procsheet_LCSCUnitPrice_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* ""-""??_);_(@_)"
            ProcWS.Cells(j, Procsheet_LCSCExtPrice_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* ""-""??_);_(@_)"
            ProcWS.Cells(j, Procsheet_PreferredDistExtPrice_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* ""-""??_);_(@_)"
        
        Next j
        
        ' Update progress bar by changing Label's width
        UserForm1.Caption = "LCSC API"
        UserForm1.lblmainProgPercDisp.Caption = Format(1 / 1, "0.00%")
        UserForm1.lblmainProgPerc.Width = (1 / 1) * 180
        DoEvents ' Allow the UserForm to update
            

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
    xmlhttp.Send
    SendRequest = xmlhttp.responseText
End Function

