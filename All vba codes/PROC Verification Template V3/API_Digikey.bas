Attribute VB_Name = "API_Digikey"
Public AccessToken As String
Public TokenExpiryTime As Double
Sub MakeDigikeyRequest(ws As Worksheet, k As Long, partNumber As String, customerDescription As String, Optional PNtoUse As String)

    Dim url As String
    Dim clientID As String
    Dim clientSecret As String
    Dim Request As Object
    Dim response As Object
    Dim ProductInfo As String
    
    
    ' Define your Digikey API credentials
    clientID = "kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4"
    clientSecret = "qIiFSGbrfzqBxGLr"
  
    'Call RefreshAccessToken

    
    ' run digikey code
    If partNumber <> "" Then
        
        Dim encodedString As String
        Dim position As Integer
        position = InStr(partNumber, "/")
    
    
        If position > 0 Then
            ' Replace "/" with "%2F" if it's present
            encodedString = Left(partNumber, position - 1) & "%2F" & Right(partNumber, Len(partNumber) - position)
            partNumber = Replace(encodedString, "/", "%2F")
        Else
            ' No "/" found, keep the original string
        End If
        
        If AccessToken = "" Or Timer > TokenExpiryTime Then
            AccessToken = GetAccessToken(clientID, clientSecret)
            TokenExpiryTime = Timer + 599
        End If
        
        ' Check if access token is obtained
        If AccessToken <> "" Then
    
            ' Define the API URL to get product details
            'URL = "https://api.digikey.com/v1/products/" & PartNumber
            url = "https://api.digikey.com/products/v4/search/" & partNumber & "/productdetails"
            
            ' Create the HTTP request for product details
            Set Request = CreateObject("MSXML2.ServerXMLHTTP.6.0")
            
            ' Set the request method and URL
            Request.Open "GET", url, False
            
            ' Set the request headers with the access token
            Request.setRequestHeader "Content-Type", "application/x-www-form-urlencoded"
            Request.setRequestHeader "X-DIGIKEY-Client-Id", clientID
            Request.setRequestHeader "X-DIGIKEY-Client-Secret", clientSecret
            Request.setRequestHeader "X-DIGIKEY-Locale-Site", "CA"
            Request.setRequestHeader "X-DIGIKEY-Locale-Currency", "CAD"
            Request.setRequestHeader "Authorization", "Bearer " & AccessToken
            Request.setRequestHeader "X-DIGIKEY-Customer-Id", "12161503"
            
            ' Send the request to get product details
            Request.Send
            
            ' Parse the JSON response to get product information
            ProductInfo = Request.responseText
            
            On Error Resume Next
            Dim requestStatus As String
            requestStatus = JsonConverter.ParseJson(ProductInfo)("status")
            On Error GoTo 0
            
            If requestStatus <> "404" Then
        
                Dim jsonText As String
                Dim jsonObj As Object
                Dim packageCaseValue As String
                
                
                ' JSON data
                jsonText = ProductInfo
                
                ' Create a JSON parser
                Set jsonObj = JsonConverter.ParseJson(jsonText)
                
                'get Manufacturer name
                Dim manufacturerName As String
                Dim manufacturerPartNumber As String
                Dim manufacturerDescription As String
                
                On Error Resume Next
                manufacturerName = jsonObj("Product")("Manufacturer")("Name")
                manufacturerPartNumber = jsonObj("Product")("ManufacturerProductNumber")
                manufacturerDescription = jsonObj("Product")("Description")("DetailedDescription")
                On Error GoTo 0
                
                ws.Cells(k, VF_DistMPN_Column) = manufacturerPartNumber
                ws.Cells(k, VF_DistMFR_Column) = manufacturerName
                ws.Cells(k, VF_DistDescription_Column) = manufacturerDescription
                
                
                ' match the Digikey MPN with Customer MPN
                If Replace(Replace(manufacturerPartNumber, "-", ""), " ", "") = Replace(Replace(ws.Cells(k, VF_CustomerMPN_Column), "-", ""), " ", "") Then
                    ws.Cells(k, VF_MPNmatch_Column) = True
                ElseIf manufacturerPartNumber Like WorksheetFunction.Rept("#", Len(manufacturerPartNumber)) Then
                    If CStr(Val(Replace(manufacturerPartNumber, " ", ""))) = CStr(Val(Replace(ws.Cells(k, VF_CustomerMPN_Column), " ", ""))) Then
                        ws.Cells(k, VF_MPNmatch_Column) = True
                    End If
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
                    
                    Dim parameters As Object, parameter As Object
                    Set parameters = jsonObj("Product")("Parameters")
                    
                    If CustomerjsonDescription("type") = "resistor" Then
                    
                        Dim apiResistorPackage As String, apiResistance As String, apiResistorWattage As String, apiResistorTolerance As String
                        For Each parameter In parameters
                            Select Case LCase(parameter("ParameterText"))
                                Case "package / case"
                                    apiResistorPackage = Split(parameter("ValueText"), " ")(0)
                                Case "resistance"
                                    apiResistance = parameter("ValueText")
                                Case "power (watts)", "wattage", "power"
                                    If InStr(1, parameter("ValueText"), ", ") > 0 Then
                                        apiResistorWattage = Split(parameter("ValueText"), ", ")(1)
                                    Else
                                        apiResistorWattage = parameter("ValueText")
                                    End If
                                Case "tolerance"
                                    apiResistorTolerance = parameter("ValueText")
                            End Select
                        Next parameter
    
                        
                    
                        ' match package
                        If CustomerjsonDescription("package") = apiResistorPackage Then
                            matchScore = matchScore + 1
                        End If
                        
                        ' match resistance
                        Dim rawValue As Variant
                        rawValue = apiResistance
                        If CustomerjsonDescription("resistance") = NormalizeResistanceDisplay(rawValue) Then
                            matchScore = matchScore + 1
                        ElseIf CustomerjsonDescription("resistance_ohm") = NormalizeResistanceDisplay(rawValue) Then
                            matchScore = matchScore + 1
                        End If
                        
                        ' match wattage
                        Dim customerWatt As String, distWatt As String, customerWatt_mw As String, distwatt_mw As String
                        customerWatt = Replace(CustomerjsonDescription("wattage"), " ", "")
                        customerWatt_mw = Replace(CustomerjsonDescription("wattage_mw"), " ", "")
                        distWatt = apiResistorWattage
                        distwatt_mw = watt_to_mWatt(distWatt)
                        
                        If customerWatt = distWatt Then
                            matchScore = matchScore + 1
                        ElseIf CompareMilliwatts(customerWatt, distWatt) < 0 Then
                            matchScore = matchScore + 1
                        ElseIf CompareMilliwatts(customerWatt_mw, distWatt) < 0 Then
                            matchScore = matchScore + 1
                        ElseIf CompareMilliwatts(customerWatt_mw, distwatt_mw) < 0 Then
                            matchScore = matchScore + 1
                        End If
                        
                        ' match tolerance
                        If CustomerjsonDescription("tolerance") = NormalizeTolerance(apiResistorTolerance) Then
                            matchScore = matchScore + 1
                        End If
                        
                        If matchScore = 4 Then
                            ws.Cells(k, VF_AttributeMatch_Column) = True
                        End If
                        
                    
                    ElseIf CustomerjsonDescription("type") = "capacitor" Then
                    
                        Dim apiCapacitorPackage As String, apiCapacitance As String, apiCapacitorVoltage As String, apiCapacitorTolerance As String, apiCapacitorTemCoff As String
                        For Each parameter In parameters
                            Select Case LCase(parameter("ParameterText"))
                                Case "package / case"
                                    apiCapacitorPackage = Split(parameter("ValueText"), " ")(0)
                                Case "capacitance"
                                    apiCapacitance = parameter("ValueText")
                                Case "voltage - rated"
                                    apiCapacitorVoltage = parameter("ValueText")
                                Case "tolerance"
                                    apiCapacitorTolerance = parameter("ValueText")
                                Case "temperature coefficient"
                                    apiCapacitorTemCoff = parameter("ValueText")
                            End Select
                        Next parameter
                    
                    
                        ' match package
                        If CustomerjsonDescription("package") = apiCapacitorPackage Then
                            matchScore = matchScore + 1
                        End If
                        
                        ' match capacitance
                        If CustomerjsonDescription("capacitance") = apiCapacitance Then
                            matchScore = matchScore + 1
                        Else
                            Dim cap1 As Variant, cap2 As Variant
                            cap1 = NormalizeCapacitanceToPF(CStr(CustomerjsonDescription("capacitance")))
                            cap2 = NormalizeCapacitanceToPF(CStr(apiCapacitance))
                            
                            If cap1 = cap2 Then ' allow small tolerance, e.g., 1 pF
                                matchScore = matchScore + 1
                            End If
                        End If
                        
                        
                        ' match voltage
                        If Replace(CustomerjsonDescription("voltage"), " ", "") = apiCapacitorVoltage Then
                            matchScore = matchScore + 1
                        End If
                        
                        
                        ' match tolerance
                        If Replace(CustomerjsonDescription("tolerance"), " ", "") = NormalizeTolerance(apiCapacitorTolerance) Then
                            matchScore = matchScore + 1
                        End If
                        
                        
                        ' match temp coff
                        If CustomerjsonDescription("tempCoeff") = apiCapacitorTemCoff Then
                            matchScore = matchScore + 1
                        Else
                            Dim customerTempCoefficient As String, apiTempCoff As String
                            customerTempCoefficient = NormalizeTempCoefficient(CStr(CustomerjsonDescription("tempCoeff")))
                            apiTempCoff = NormalizeTempCoefficient(CStr(apiCapacitorTemCoff))
                            If customerTempCoefficient = apiTempCoff Then
                                matchScore = matchScore + 1
                            End If
                            
                        End If
                        
                        If matchScore = 5 Then
                            ws.Cells(k, VF_AttributeMatch_Column) = True
                        Else
                            If Digikey_OtherNamesAPI(PNtoUse, ws.Cells(k, VF_CustomerMPN_Column)) = True Then
                                ws.Cells(k, VF_MPNmatch_Column) = True
                            ElseIf Digikey_AlternativePackaging(PNtoUse, ws.Cells(k, VF_CustomerMPN_Column)) = True Then
                                ws.Cells(k, VF_MPNmatch_Column) = True
                            End If
                        End If
                    End If
                    
                        
                    If matchScore = 5 Then
                        ws.Cells(k, VF_AttributeMatch_Column) = True
                    Else
                        If Digikey_OtherNamesAPI(PNtoUse, ws.Cells(k, VF_CustomerMPN_Column)) = True Then
                            ws.Cells(k, VF_MPNmatch_Column) = True
                        ElseIf Digikey_AlternativePackaging(PNtoUse, ws.Cells(k, VF_CustomerMPN_Column)) = True Then
                            ws.Cells(k, VF_MPNmatch_Column) = True
                        End If
                    End If
                        
                        
                    
                        
                    
                    
                    
                    
                End If
            Else
                ' skip if failed to get digikey response
                
            End If
        Else
            MsgBox "Failed to obtain access token. Check your credentials."
            Exit Sub
        End If

    End If
End Sub

Sub RefreshAccessToken()
    ' Configure your OAuth endpoints and credentials
    Dim tokenUrl As String
    Dim clientID As String
    Dim clientSecret As String
    Dim refreshToken As String
    
    Dim authWS As Worksheet
    Set authWS = ThisWorkbook.Sheets("Authorization")
    
    
    tokenUrl = "https://api.digikey.com/v1/oauth2/token"
    clientID = "kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4"
    clientSecret = "qIiFSGbrfzqBxGLr"
    
    
    ' define paths
    Dim fullPath As String
    Dim masterFolderName As String
    
    fullPath = GetLocalPath(ThisWorkbook.FullName)
    
    Dim folders() As String
    
    ' Split the path string using backslash as delimiter
    folders = Split(fullPath, "\")
    masterFolderName = folders(UBound(folders) - 3)
    
    Dim masterFolderPath As String
    masterFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName, vbTextCompare) + Len(masterFolderName))
    'Debug.Print masterfolderPath
    
    
    
        ' Specify the file path for the .txt file
        Dim filePath As String
        'filePath = masterFolderPath & "6. BACKEND\API AUTHENTICATION\" & "authcode.txt"
        filePath = "C:\Users\rspcb\OneDrive\Desktop one drive\RS Master\6. BACKEND\API AUTHENTICATION\authcode.txt"
    
        Dim jsonData As String
        ' Read the contents of the file
        Open filePath For Input As #1
        jsonData = Input$(LOF(1), 1)
        Close #1
    
    
        ' Parse the JSON response (simplified JSON parsing)
        Dim responseJson As Object
        Set responseJson = JsonConverter.ParseJson(jsonData)
        
        ' Extract token details
        refreshToken = responseJson("refresh_token")
    
    
    
    
 
    'refreshToken = authWS.Range("B3")
    
    ' Prepare the request data
    Dim postData As String
    postData = "grant_type=refresh_token" & _
               "&refresh_token=" & refreshToken & _
               "&client_id=" & clientID & _
               "&client_secret=" & clientSecret
    
    ' Create and send the HTTP request to refresh the token
    Dim xmlhttp As Object
    Set xmlhttp = CreateObject("MSXML2.ServerXMLHTTP")
    
    ' Configure the request
    xmlhttp.Open "POST", tokenUrl, False
    xmlhttp.setRequestHeader "Content-Type", "application/x-www-form-urlencoded"
    xmlhttp.setRequestHeader "User-Agent", "YourUserAgent"
    
    ' Send the request
    xmlhttp.Send postData
    'Debug.Print xmlhttp.responseText
    
    
    ' Check for a successful response
    If xmlhttp.Status = 200 Then
    
        ' Save the JSON data to a .txt file
        Dim fileNumber As Integer
        fileNumber = FreeFile
        Open filePath For Output As #fileNumber
        Print #fileNumber, xmlhttp.responseText
        Close #fileNumber
        
        ' Read the contents of the file
        Open filePath For Input As #1
        jsonData = Input$(LOF(1), 1)
        Close #1
    
        ' Parse the JSON response (simplified JSON parsing)
        Set responseJson = JsonConverter.ParseJson(jsonData)
        
        ' Extract the new access token and possibly a new refresh token
        Dim newAccessToken As String
        Dim newRefreshToken As String
        Dim expiresIn As Double
        Dim refreshTokenExpiresIn As Double
        
        
        newAccessToken = responseJson("access_token")
        newRefreshToken = responseJson("refresh_token") ' Optional, not always included
        expiresIn = CDbl(responseJson("expires_in"))
        refreshTokenExpiresIn = CDbl(responseJson("refresh_token_expires_in"))
        
        
        
        ' Calculate expiration time (in seconds from now)
        expiresIn = Now + (expiresIn / 86400) ' Assuming expires_in is in seconds
        refreshTokenExpiresIn = Now + (refreshTokenExpiresIn / 86400)
        
        ' Print or use the new token details as needed
        authWS.Range("B2") = newAccessToken
        authWS.Range("B3") = newRefreshToken ' Optional
        authWS.Range("C2") = Format(expiresIn, "yyyy-mm-dd hh:mm:ss")
        authWS.Range("C3") = Format(refreshTokenExpiresIn, "yyyy-mm-dd hh:mm:ss")
        
    Else
        ' Handle the error (e.g., log or display an error message)
        Call GetAuthorizationCode
    End If
    
    ' Clean up
    Set xmlhttp = Nothing
End Sub

Sub GetAuthorizationCode()

    Dim authWS As Worksheet
    Set authWS = ThisWorkbook.Sheets("Authorization")
    
    Dim ie As Object
    Set ie = CreateObject("InternetExplorer.Application")
    
    ' Make Internet Explorer visible
    ie.Visible = True
    
    ' Define your authorization URL
    Dim authUrl As String
    authUrl = "https://api.digikey.com/v1/oauth2/authorize?" & _
              "client_id=kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4" & _
              "&response_type=code" & _
              "&redirect_uri=https://localhost:8139/digikey_callback" & _
              "&scope=openid profile email"
    
    ' Open the authorization URL in a new browser window
    ie.navigate authUrl
    
    
    ' Wait for the user to complete the authorization process
    Do While ie.Busy Or ie.readyState <> 4
        DoEvents
    Loop
    
    'Debug.Print ie.LocationURL
    
    Do While Left(ie.LocationURL, 67) = "https://auth.digikey.com/as/authorization.oauth2?response_type=code"
    Application.Wait Now + TimeValue("00:00:02")
    Loop
    
    Do While Left(ie.LocationURL, 22) <> "https://localhost:8139"
    ie.Refresh
        Do While ie.Busy Or ie.readyState <> 4
        DoEvents
        Loop
    Loop
    
    ' Once the user completes the authorization, retrieve the URL of the current page
    Dim currentUrl As String
    currentUrl = ie.document.url
    'Debug.Print currentUrl
    'Debug.Print ie.LocationURL
    
    
    
    ' Extract the authorization code from the URL (assuming it's in the query parameters)
    Dim authorizationCode As String
    authorizationCode = GetParameterValueFromUrl(currentUrl, "code")
    
    ' Close the Internet Explorer window
    ie.Quit
    
    ' Now, you have the authorization code for further use
    'Debug.Print "Authorization Code: " & authorizationCode
    
    
    
    
    Dim AccessToken As String
    Dim refreshToken As String
    Dim expires As Double
    Dim refreshTokenExpiresIn As Double
    
    ' Configure your OAuth endpoints and credentials
    
    Dim tokenUrl As String
    Dim clientID As String
    Dim clientSecret As String
    Dim redirectUri As String
    
    authUrl = "https://api.digikey.com/v1/oauth2/authorize"
    tokenUrl = "https://api.digikey.com/v1/oauth2/token"
    clientID = "kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4"
    clientSecret = "qIiFSGbrfzqBxGLr"
    redirectUri = "https://localhost:8139/digikey_callback"
    
    ' Obtain the authorization code from user interaction
    
    
    
    ' Prepare the request data
    Dim postData As String
    postData = "grant_type=authorization_code" & _
               "&code=" & authorizationCode & _
               "&client_id=" & clientID & _
               "&client_secret=" & clientSecret & _
               "&redirect_uri=" & redirectUri
    
    ' Create and send the HTTP request to exchange the code for a token
    Dim xmlhttp As Object
    Set xmlhttp = CreateObject("MSXML2.ServerXMLHTTP")
    
    ' Configure the request
    xmlhttp.Open "POST", tokenUrl, False
    xmlhttp.setRequestHeader "Content-Type", "application/x-www-form-urlencoded"
    xmlhttp.setRequestHeader "User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:93.0) Gecko/20100101 Firefox/93.0"
    
    ' Send the request
    xmlhttp.Send postData
    
    
    
    
    
    'Debug.Print xmlhttp.responseText
    ' Check for a successful response
    If xmlhttp.Status = 200 Then
    
    ' Ensure you have the response text
    Dim responseText As String
    responseText = xmlhttp.responseText
    
    
    
    
    ' define paths
    Dim fullPath As String
    Dim masterFolderName As String
    
    fullPath = GetLocalPath(ThisWorkbook.FullName)
    
    Dim folders() As String
    
    ' Split the path string using backslash as delimiter
    folders = Split(fullPath, "\")
    masterFolderName = folders(UBound(folders) - 3)
    
    Dim masterFolderPath As String
    masterFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName, vbTextCompare) + Len(masterFolderName))
    'Debug.Print masterfolderPath
    
    
    
        ' Specify the file path for the .txt file
        Dim filePath As String
        filePath = masterFolderPath & "6. BACKEND\API AUTHENTICATION\" & "authcode.txt"
        
    ' Save the JSON data to a .txt file
    Dim fileNumber As Integer
    fileNumber = FreeFile
    Open filePath For Output As #fileNumber
    Print #fileNumber, responseText
    Close #fileNumber
    
        Dim jsonData As String
        ' Read the contents of the file
        Open filePath For Input As #1
        jsonData = Input$(LOF(1), 1)
        Close #1
    
    
        ' Parse the JSON response (simplified JSON parsing)
        Dim responseJson As Object
        Set responseJson = JsonConverter.ParseJson(jsonData)
        
        ' Extract token details
        AccessToken = responseJson("access_token")
        refreshToken = responseJson("refresh_token")
        expires = CDbl(responseJson("expires_in"))
        refreshTokenExpiresIn = CDbl(responseJson("refresh_token_expires_in"))
        
        
        ' Calculate expiration time (in seconds from now)
        expires = Now + (expires / 86400) ' Assuming expires_in is in seconds
        refreshTokenExpiresIn = Now + (refreshTokenExpiresIn / 86400)
        
        ' Print or use the token details as needed
        'Debug.Print "Access Token: " & accessToken
        'Debug.Print "Refresh Token: " & refreshToken
        'Debug.Print "Token Expiration: " & Format(expires, "yyyy-mm-dd hh:mm:ss")
        'Debug.Print "Refresh Token Expiration: " & Format(refreshTokenExpiresIn, "yyyy-mm-dd hh:mm:ss")
        
        authWS.Range("B2") = AccessToken
        authWS.Range("B3") = refreshToken
        authWS.Range("C2") = Format(expires, "yyyy-mm-dd hh:mm:ss")
        authWS.Range("C3") = Format(refreshTokenExpiresIn, "yyyy-mm-dd hh:mm:ss")
        
        
    Else
        ' Handle the error (e.g., log or display an error message)
        'Debug.Print "Error: " & xmlhttp.Status & " - " & xmlhttp.statustext
    End If
    
    ' Clean up
    Set xmlhttp = Nothing
        
    
End Sub

Function GetParameterValueFromUrl(url As String, ParamName As String) As String
    Dim queryString As String
    Dim params() As String
    Dim param As Variant
    
    ' Extract the query string from the URL
    queryString = Split(url, "?code=")(1)
    GetParameterValueFromUrl = Left(queryString, 8)
    
End Function


Function GetAccessToken(clientID As String, clientSecret As String) As String
    Dim http As Object
    Dim url As String
    Dim grantType As String
    Dim response As String
    Dim token As String
    
    ' Set the API URL
    url = "https://api.digikey.com/v1/oauth2/token"
    
    ' Your client ID and client secret
    grantType = "client_credentials"
    
    ' Create the XMLHTTP object
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    
    ' Open a POST request
    http.Open "POST", url, False
    
    ' Set the request headers
    http.setRequestHeader "Content-Type", "application/x-www-form-urlencoded"
    
    ' Prepare the POST data
    Dim postData As String
    postData = "client_id=" & clientID & "&client_secret=" & clientSecret & "&grant_type=" & grantType
    
    ' Send the request
    http.Send postData
    
    ' Get the response
    response = http.responseText
    
    ' Parse the token from the JSON response
    Dim json As Object
    Set json = JsonConverter.ParseJson(response) ' Requires JsonConverter library
    
    ' Extract the access token
    token = json("access_token")
    
    ' Set the function's return value to the token
    GetAccessToken = token
    
    ' Clean up
    Set http = Nothing
    Set json = Nothing
End Function

Function getTolerancefromDigikey(partNumber As String) As String
    Dim url As String
    Dim clientID As String
    Dim clientSecret As String
    Dim Request As Object
    Dim response As Object
    Dim ProductInfo As String
    
    
    ' Define your Digikey API credentials
    clientID = "kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4"
    clientSecret = "qIiFSGbrfzqBxGLr"
  
    'Call RefreshAccessToken

    
    ' run digikey code
    If partNumber <> "" Then
        
        Dim encodedString As String
        Dim position As Integer
        position = InStr(partNumber, "/")
    
    
        If position > 0 Then
            ' Replace "/" with "%2F" if it's present
            encodedString = Left(partNumber, position - 1) & "%2F" & Right(partNumber, Len(partNumber) - position)
            partNumber = Replace(encodedString, "/", "%2F")
        Else
            ' No "/" found, keep the original string
        End If
        
        If AccessToken = "" Or Timer > TokenExpiryTime Then
            AccessToken = GetAccessToken(clientID, clientSecret)
            TokenExpiryTime = Timer + 599
        End If
        
        ' Check if access token is obtained
        If AccessToken <> "" Then
    
            ' Define the API URL to get product details
            'URL = "https://api.digikey.com/v1/products/" & PartNumber
            url = "https://api.digikey.com/products/v4/search/" & partNumber & "/productdetails"
            
            ' Create the HTTP request for product details
            Set Request = CreateObject("MSXML2.ServerXMLHTTP.6.0")
            
            ' Set the request method and URL
            Request.Open "GET", url, False
            
            ' Set the request headers with the access token
            Request.setRequestHeader "Content-Type", "application/x-www-form-urlencoded"
            Request.setRequestHeader "X-DIGIKEY-Client-Id", clientID
            Request.setRequestHeader "X-DIGIKEY-Client-Secret", clientSecret
            Request.setRequestHeader "X-DIGIKEY-Locale-Site", "CA"
            Request.setRequestHeader "X-DIGIKEY-Locale-Currency", "CAD"
            Request.setRequestHeader "Authorization", "Bearer " & AccessToken
            Request.setRequestHeader "X-DIGIKEY-Customer-Id", "12161503"
            
            ' Send the request to get product details
            Request.Send
            
            ' Parse the JSON response to get product information
            ProductInfo = Request.responseText
            
            On Error Resume Next
            Dim requestStatus As String
            requestStatus = JsonConverter.ParseJson(ProductInfo)("status")
            On Error GoTo 0
            
            If requestStatus <> "404" Then
        
                Dim jsonText As String
                Dim jsonObj As Object
                Dim packageCaseValue As String
                
                
                ' JSON data
                jsonText = ProductInfo
                
                ' Create a JSON parser
                Set jsonObj = JsonConverter.ParseJson(jsonText)
                
                Dim parameters As Object, parameter As Object
                Set parameters = jsonObj("Product")("Parameters")
                
                For Each parameter In parameters
                    Select Case LCase(parameter("ParameterText"))
                        Case "tolerance"
                            getTolerancefromDigikey = parameter("ValueText")
                            Exit For
                    End Select
                Next parameter
            End If
        End If
    End If
    

End Function


