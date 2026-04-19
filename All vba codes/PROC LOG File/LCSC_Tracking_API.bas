Attribute VB_Name = "LCSC_Tracking_API"
Sub GetLCSCTrackingNumbers()
    '------------------------------------------------------------
    ' Calls the LCSC order/page API for each LCSC row in the
    ' Tracking sheet that is missing a Tracking ID (column F),
    ' and fills in Tracking ID (F), Courier Name (G), and
    ' Shipment Status (E).
    '
    ' Prerequisites:
    '   - JsonConverter module (VBA-JSON by Tim Hall)
    '   - Your existing MakeLCSCAPICall, SendRequest, SHA1,
    '     and ConvertToUtc helper functions
    '   - API credentials stored in named ranges or constants
    '------------------------------------------------------------

    Const API_KEY As String = "7Fu3OUGZ4KlEfU5l0QzGXAEG7b"        ' <-- replace
    Const API_SECRET As String = "Le8WX2RgLQvYpia9xSQLJRxeUztbm7xoUex"   ' <-- replace
    Const BASE_URL As String = "https://ips.lcsc.com/rest/wmsc2agent/select/order/page"

    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets("Tracking")

    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, "D").End(xlUp).Row  ' last row with a Sales Order

    Dim i As Long
    Dim orderCode As String
    Dim response As String
    Dim json As Object
    Dim orders As Object
    Dim order As Object
    Dim packages As Object
    Dim pkg As Object

    For i = 3 To lastRow   ' data starts at row 3

        ' --- Only process LCSC rows that are missing a Tracking ID ---
        Dim distName As String
        distName = Trim(CStr(ws.Cells(i, "C").Value))

        If UCase(distName) = "LCSC" And Trim(CStr(ws.Cells(i, "F").Value)) = "" Then

            orderCode = Trim(CStr(ws.Cells(i, "D").Value))  ' Sales Order (column D)

            If orderCode <> "" Then

                ' Build the URL with the orderCodes parameter
                Dim callUrl As String
                callUrl = BASE_URL & "?orderCodes=" & orderCode

                ' Make the authenticated API call (your existing function)
                response = MakeLCSCAPICall(callUrl, API_KEY, API_SECRET)

                ' Parse the JSON response
                On Error Resume Next
                Set json = JsonConverter.ParseJson(response)
                On Error GoTo 0

                If Not json Is Nothing Then
                    If json("code") = 200 Then

                        ' Navigate: result > list (array of orders)
                        If json.Exists("result") Then
                            If json("result")(1).Exists("shipping_infomation") Then
                                ws.Cells(i, "F").NumberFormat = "@"
                                ws.Cells(i, "F").Value = json("result")(1)("shipping_infomation")("Tracking No.")
                            End If  ' list exists
                        End If  ' result exists

                    Else
                        ' Non-200 response — log error in column H
                        ws.Cells(i, "H").Value = "API Error: " & json("code") & " - " & json("msg")
                    End If  ' code = 200

                End If  ' json not nothing

                Set json = Nothing
            End If  ' orderCode not empty
        End If  ' LCSC + no tracking

    Next i

    MsgBox "LCSC tracking update complete.", vbInformation
End Sub


Private Function MakeLCSCAPICall(url As String, apiKey As String, apiSecret As String) As String
    Dim nonce As String
    Dim timestamp As String
    Dim signature As String
    Dim newPayload As String
    Dim response As String
    Dim y As Integer
    
    ' Generate random nonce (16 lowercase letters)
    Randomize
    nonce = ""
    For y = 1 To 16
        nonce = nonce & Chr(asc("a") + Int((asc("z") - asc("a") + 1) * Rnd))
    Next y

    ' Generate Unix timestamp (seconds since 1970-01-01)
    timestamp = Round(DateDiff("s", DateSerial(1970, 1, 1), ConvertToUtc(Now)))

    ' Generate signature hash for authentication
    newPayload = "key=" & apiKey & "&nonce=" & nonce & "&secret=" & apiSecret & "&timestamp=" & timestamp
    signature = SHA1(newPayload)
    newPayload = "key=" & apiKey & "&nonce=" & nonce & "&timestamp=" & timestamp

    ' Make HTTP request to LCSC API
    response = SendRequest(url, newPayload, signature)

    ' Retry logic: Try up to 3 times if request fails
    Dim jsonResponse As Object
    Set jsonResponse = JsonConverter.ParseJson(response)
    Dim responseCode As Integer
    responseCode = jsonResponse("code")
    Dim retryCount As Integer
    retryCount = 0

    Do While responseCode <> 200 And retryCount < 3
        Application.Wait (Now + TimeValue("0:00:01"))
        response = SendRequest(url, newPayload, signature)
        Set jsonResponse = JsonConverter.ParseJson(response)
        responseCode = jsonResponse("code")
        retryCount = retryCount + 1
    Loop
    
    MakeLCSCAPICall = response
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
    url_full = url & "&" & newPayload & "&signature=" & signature
    'Debug.Print url_full
    xmlhttp.Open "GET", url_full, False
    xmlhttp.setRequestHeader "Content-Type", "application/json"
    xmlhttp.Send
    SendRequest = xmlhttp.responseText
End Function

