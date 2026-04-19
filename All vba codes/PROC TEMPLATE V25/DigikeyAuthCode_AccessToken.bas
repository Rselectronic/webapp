Attribute VB_Name = "DigikeyAuthCode_AccessToken"
Option Explicit
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
    If xmlhttp.status = 200 Then
    
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
    masterFolderName = folders(UBound(folders) - 2)
    
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

