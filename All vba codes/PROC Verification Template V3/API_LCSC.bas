Attribute VB_Name = "API_LCSC"
Option Explicit

Sub MakeLcscRequest(ws As Worksheet, k As Long, LCSCpn As String, customerDescription As String, Optional PNtoUse As String)
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
    
    
        ' Define API endpoint
        url = "https://ips.lcsc.com/rest/wmsc2agent/product/info/" & LCSCpn
        
        ' Generate nonce
        Randomize
        nonce = ""
        For i = 1 To 16
            nonce = nonce & Chr(asc("a") + Int((asc("z") - asc("a") + 1) * Rnd))
        Next i
        'Debug.Print nonce
        
        ' Generate timestamp
        timestamp = Round(DateDiff("s", DateSerial(1970, 1, 1), ConvertToUtc(Now)))
        'Debug.Print timestamp
        
        ' Generate signature
        newPayload = "key=" & LCSC_KEY & "&nonce=" & nonce & "&secret=" & LCSC_SECRET & "&timestamp=" & timestamp
        'payloadStr = URLEncode(newPayload)
        'payloadStr = "key=" & LCSC_KEY & "&nonce=" & nonce & "&timestamp=" & timestamp
        signature = SHA1(newPayload)
        newPayload = "key=" & LCSC_KEY & "&nonce=" & nonce & "&timestamp=" & timestamp
        'Debug.Print payloadStr
        
        ' Make request
        response = SendRequest(url, newPayload, signature)
        'Debug.Print url
        
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
            Dim jsonObj As Object
            Set jsonObj = JsonConverter.ParseJson(response)
            
            
            ' Extract data
            Dim manufacturerName As String
            Dim MPN As String
            Dim quantity As Long
            Dim Description As String
            Dim prices As Object
            Dim price As Double
            
            manufacturerName = jsonObj("result")("manufacturer")("name")
            MPN = jsonObj("result")("mpn")
            quantity = jsonObj("result")("quantity")
            Description = jsonObj("result")("description")
            
            ' Output the extracted data
            ws.Cells(k, VF_LCSCmfr_Column) = manufacturerName
            ws.Cells(k, VF_LCSCmpn_Column) = MPN
            ws.Cells(k, VF_LCSCDescription_Column) = Description
            
            ' match the Digikey MPN with Customer MPN
            If Replace(Replace(MPN, "-", ""), " ", "") = Replace(Replace(ws.Cells(k, VF_CustomerMPN_Column), "-", ""), " ", "") Then
                ws.Cells(k, VF_MPNmatch_Column) = True
            Else
                ws.Cells(k, VF_MPNmatch_Column) = False
                
                ' try to match the values if it is resistor or capacitor
                ' get values from customer description
                Dim customerDescriptionJson As String
                customerDescriptionJson = ExtractComponentAsJson(customerDescription)
                
                Dim CustomerjsonDescription As Object
                Dim matchScore As Long
                
                matchScore = 0
                Set CustomerjsonDescription = JsonConverter.ParseJson(customerDescriptionJson)
                
                If CustomerjsonDescription("type") = "resistor" Then
                    ' match package
                    If CustomerjsonDescription("package") = jsonObj("result")("package") Then
                        matchScore = matchScore + 1
                    End If
                    
                    ' match resistance
                    Dim rawValue As Variant
                    rawValue = jsonObj("result")("attributes")("Resistance")
                    If CustomerjsonDescription("resistance") = NormalizeResistanceDisplay(rawValue) Then
                        matchScore = matchScore + 1
                    ElseIf CustomerjsonDescription("resistance_ohm") = NormalizeResistanceDisplay(rawValue) Then
                        matchScore = matchScore + 1
                    End If
                    
                    ' match wattage
                    Dim customerWatt As String, distWatt As String, customerWatt_mw As String
                    customerWatt = Replace(CustomerjsonDescription("wattage"), " ", "")
                    customerWatt_mw = Replace(CustomerjsonDescription("wattage_mw"), " ", "")
                    distWatt = jsonObj("result")("attributes")("Power(Watts)")
                    If customerWatt = distWatt Then
                        matchScore = matchScore + 1
                    ElseIf CompareMilliwatts(customerWatt, distWatt) < 0 Then
                        matchScore = matchScore + 1
                    ElseIf CompareMilliwatts(customerWatt_mw, distWatt) < 0 Then
                        matchScore = matchScore + 1
                    End If
                    
                    ' match tolerance
                    If CustomerjsonDescription("tolerance") = NormalizeTolerance(jsonObj("result")("attributes")("Tolerance")) Then
                        matchScore = matchScore + 1
                    End If
                    
                    If matchScore = 4 Then
                        ws.Cells(k, VF_AttributeMatch_Column) = True
                    End If
                    
                
                ElseIf CustomerjsonDescription("type") = "capacitor" Then
                    ' match package
                    If CustomerjsonDescription("package") = jsonObj("result")("package") Then
                        matchScore = matchScore + 1
                    End If
                    
                    ' match capacitance
                    Dim cap1 As Variant, cap2 As Variant
                    
                    cap1 = NormalizeCapacitanceToPF(CStr(CustomerjsonDescription("capacitance")))
                    cap2 = NormalizeCapacitanceToPF(CStr(jsonObj("result")("attributes")("Capacitance")))
                    
                    If cap1 = cap2 Then ' allow small tolerance, e.g., 1 pF
                        matchScore = matchScore + 1
                    End If

                    
                    
                    ' match voltage
                    If Replace(LCase(CustomerjsonDescription("voltage")), " ", "") = LCase(jsonObj("result")("attributes")("Voltage Rating")) Then
                        matchScore = matchScore + 1
                    End If
                    
                    
                    ' match tolerance
                    If CustomerjsonDescription("tolerance") = "" Then
                        ' get tolerance from digikey API using customer MPN
                        Dim toleranceDigikeyAPI As String
                        Dim customerMPN As String
                        customerMPN = Replace(ws.Cells(k, VF_CustomerMPN_Column), "-LF", "")
                        toleranceDigikeyAPI = getTolerancefromDigikey(customerMPN)
                        
                        If NormalizeTolerance(toleranceDigikeyAPI) = NormalizeTolerance(jsonObj("result")("attributes")("Tolerance")) Then
                            matchScore = matchScore + 1
                        End If
                    Else
                        If Replace(CustomerjsonDescription("tolerance"), " ", "") = NormalizeTolerance(jsonObj("result")("attributes")("Tolerance")) Then
                            matchScore = matchScore + 1
                        End If
                    End If
                    
                    
                    ' match temp coff
                    Dim customerTempCoefficient As String, apiTempCoff As String

                    customerTempCoefficient = NormalizeTempCoefficient(CStr(CustomerjsonDescription("tempCoeff")))
                    apiTempCoff = NormalizeTempCoefficient(CStr(jsonObj("result")("attributes")("Temperature Coefficient")))
                    
                    If customerTempCoefficient = apiTempCoff Then
                        matchScore = matchScore + 1
                    End If

                    
                    
                    If matchScore = 5 Then
                        ws.Cells(k, VF_AttributeMatch_Column) = True
                    End If
                    
                    
                    
                    
                End If
                
                ' get other names from Digikey
                If matchScore = 5 Then
                    ws.Cells(k, VF_AttributeMatch_Column) = True
                Else
                    If Digikey_OtherNamesAPI(MPN, ws.Cells(k, VF_CustomerMPN_Column)) = True Then
                        ws.Cells(k, VF_MPNmatch_Column) = True
                    ElseIf Digikey_AlternativePackaging(PNtoUse, ws.Cells(k, VF_CustomerMPN_Column)) = True Then
                        ws.Cells(k, VF_MPNmatch_Column) = True
                    End If
                End If
                
                
                
                
                
            End If
            
            
            
'            ' extract the prices
'            Set prices = jsonObj("result")("prices")
'            ' Loop through prices array and find the first price
'            Dim p As Integer
'            Dim colno As Integer
'            colno = 6
'            For p = 1 To prices.Count
'                price = prices(p)("price")
'                ws.Cells(k, colno) = price
'                colno = colno + 1
'            Next p
        Else
            Debug.Print response
        End If
    
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



