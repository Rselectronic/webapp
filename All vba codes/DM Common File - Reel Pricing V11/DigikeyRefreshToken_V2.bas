Attribute VB_Name = "DigikeyRefreshToken_V2"
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
    
    fullPath = GetLocalPath(ThisWorkbook.fullName)
    
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
    xmlhttp.send postData
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

