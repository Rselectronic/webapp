Attribute VB_Name = "DigikeyOtherNames"
Option Explicit

Function Digikey_OtherNamesAPI(partNumber As String, customerPN As String, Optional digikeyJson As String) As Boolean

    ' get other names from Digikey
    Dim url As String
    Dim Request As Object
    Dim response As Object
    Dim ProductInfo As String
    Dim clientID As String
    Dim clientSecret As String
    Dim AccessToken As String
    
    clientID = "kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4"
    clientSecret = "qIiFSGbrfzqBxGLr"
    
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
                
                Dim otherNames As Object
                Dim otherName As Variant
                
                Set otherNames = jsonObj("Product")("OtherNames")
                For Each otherName In otherNames
                    If LCase(Replace(otherName, "-", "")) = LCase(Replace(customerPN, "-", "")) Then
                        Digikey_OtherNamesAPI = True
                        Exit For
                    End If
                Next otherName
            End If
        End If
    End If

End Function
