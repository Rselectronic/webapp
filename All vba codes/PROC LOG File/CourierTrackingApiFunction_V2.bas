Attribute VB_Name = "CourierTrackingApiFunction_V2"
Option Explicit

''DHL API''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''

Public Function TrackDHLPackages(TrackingNumber As String, estimateDeliveryDateCell As Range) As String
    Dim http As Object
    Dim url As String
    Dim apiKey As String
    Dim responseText As String
    Dim json As Object
    Dim latestStatus As String
    Dim latestDate As String, estimateDeliveryDate As String

    ' Set the API Key
    apiKey = "mUPilasF8krXaso5gS948OSilXGVhMEn" ' Replace with your actual DHL API Key

    ' Set the DHL Tracking API URL
    url = "https://api-eu.dhl.com/track/shipments?trackingNumber=" & TrackingNumber

    ' Create HTTP request
    Set http = CreateObject("MSXML2.XMLHTTP")
    With http
        .Open "GET", url, False
        .setRequestHeader "DHL-API-Key", apiKey
        .Send
        responseText = .responseText
    End With

    ' Parse JSON response
    Set json = JsonConverter.ParseJson(responseText)

    ' Extract latest tracking event
    On Error Resume Next
    latestStatus = json("shipments")(1)("events")(1)("description")
    latestDate = Format(DateValue(Left(json("shipments")(1)("events")(1)("timestamp"), 10)), "mm/dd/yyyy")
    estimateDeliveryDate = Format(DateValue(Left(json("shipments")(1)("estimatedTimeOfDelivery"), 10)), "mm/dd/yyyy")
    On Error GoTo 0

    ' Return tracking result
    If latestStatus <> "" And latestDate <> "" Then
        TrackDHLPackages = "Status: " & latestStatus & " on " & latestDate
        estimateDeliveryDateCell = estimateDeliveryDate
        estimateDeliveryDateCell.Interior.Color = RGB(255, 0, 0)
    Else
        TrackDHLPackages = "No tracking data available."
    End If
End Function
''DHL API''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''

''FedEx API''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''

Public Function TrackFedExPackage(TrackingNumber As String, estimateDeliveryDateCell As Range) As String
    Dim http As Object
    Dim url As String
    Dim accessToken As String
    Dim requestBody As String
    Dim responseText As String
    Dim json As Object
    Dim latestStatus As String
    Dim latestDate As String
    Dim estimateDeliveryDate As String

    ' Get FedEx access token
    accessToken = GetFedExToken()
    If Left(accessToken, 5) = "Error" Then
        TrackFedExPackage = "Error: Could not retrieve access token."
        Exit Function
    End If

    ' Set API URL
    url = "https://apis.fedex.com/track/v1/trackingnumbers"

    ' Prepare JSON request body
    requestBody = "{""trackingInfo"": [{""trackingNumberInfo"": {""trackingNumber"": """ & TrackingNumber & """}}],""includeDetailedScans"": true}"

    ' Create HTTP request
    Set http = CreateObject("MSXML2.XMLHTTP")
    With http
        .Open "POST", url, False
        .setRequestHeader "Authorization", "Bearer " & accessToken
        .setRequestHeader "Content-Type", "application/json"
        .Send requestBody
        responseText = .responseText
    End With

    ' Parse JSON response
    Set json = JsonConverter.ParseJson(responseText)

    ' Extract latest tracking event
    On Error Resume Next
    latestStatus = json("output")("completeTrackResults")(1)("trackResults")(1)("scanEvents")(1)("eventDescription")
    latestDate = Format(DateValue(Left(json("output")("completeTrackResults")(1)("trackResults")(1)("scanEvents")(1)("date"), 10)), "mm/dd/yyyy")
    
    Dim dateTimeObj As Object, dateTime As Variant
    Set dateTimeObj = json("output")("completeTrackResults")(1)("trackResults")(1)("dateAndTimes")
    
    For Each dateTime In dateTimeObj
        If dateTime("type") = "ESTIMATED_DELIVERY" Then
            estimateDeliveryDate = Format(DateValue(Left(dateTime("dateTime"), 10)), "mm/dd/yyyy")
            Exit For
        End If
    Next dateTime

    On Error GoTo 0
    
    estimateDeliveryDateCell = estimateDeliveryDate
    estimateDeliveryDateCell.Interior.Color = RGB(255, 0, 0)
    ' Return tracking result
    If latestStatus <> "" And latestDate <> "" Then
        TrackFedExPackage = "Status: " & latestStatus & " on " & latestDate
    Else
        TrackFedExPackage = "No tracking data available."
    End If
End Function

Public Function GetFedExToken() As String
    Dim http As Object
    Dim url As String
    Dim requestBody As String
    Dim responseText As String
    Dim json As Object
    Dim accessToken As String

    ' API URL for authentication
    url = "https://apis.fedex.com/oauth/token"

    ' Prepare request body
    requestBody = "grant_type=client_credentials" & _
                  "&client_id=l7392adb2ce9834ba68e81b8ef94f66873" & _
                  "&client_secret=bbf6e719be5c46c09f7b42e31b1e2291"

    ' Create HTTP request
    Set http = CreateObject("MSXML2.XMLHTTP")
    With http
        .Open "POST", url, False
        .setRequestHeader "Content-Type", "application/x-www-form-urlencoded"
        .Send requestBody
        responseText = .responseText
    End With

    ' Parse JSON response
    Set json = JsonConverter.ParseJson(responseText)

    ' Extract access token
    On Error Resume Next
    accessToken = json("access_token")
    On Error GoTo 0

    ' Return token or error
    If accessToken <> "" Then
        GetFedExToken = accessToken
    Else
        GetFedExToken = "Error: Could not retrieve FedEx token."
    End If
End Function

''FedEx API''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''

''UPS API''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''

Public Function TrackUPSPackage(TrackingNumber As String, estimateDeliveryDateCell As Range) As String
    Dim http As Object
    Dim url As String
    Dim accessToken As String
    Dim responseText As String
    Dim json As Object
    Dim trackingInfo As String
    Dim latestStatus As String
    Dim latestDate As String
    Dim estimateDeliveryDate As String

    ' Get the access token from the UPS OAuth function
    accessToken = GetUPSToken()
    
    ' Validate if token was retrieved
    If Left(accessToken, 5) = "Error" Then
        TrackUPSPackage = "Error: Could not retrieve access token."
        Exit Function
    End If

    ' Set the tracking API URL
    url = "https://onlinetools.ups.com/api/track/v1/details/" & TrackingNumber

    ' Create XMLHTTP object
    Set http = CreateObject("MSXML2.XMLHTTP")
    
    ' Make the request
    With http
        .Open "GET", url, False
        .setRequestHeader "Authorization", "Bearer " & accessToken
        .setRequestHeader "transId", "1234567891"
        .setRequestHeader "transactionSrc", "Tracking Info"
        .Send
        
        ' Capture response
        responseText = .responseText
    End With

    ' Parse JSON response
    Set json = JsonConverter.ParseJson(responseText)

    ' Extract latest tracking event (first activity in the array)
    On Error Resume Next
    latestStatus = json("trackResponse")("shipment")(1)("package")(1)("activity")(1)("status")("description")
    latestDate = Format(DateSerial(Left(json("trackResponse")("shipment")(1)("package")(1)("activity")(1)("date"), 4), _
                               Mid(json("trackResponse")("shipment")(1)("package")(1)("activity")(1)("date"), 5, 2), _
                               Right(json("trackResponse")("shipment")(1)("package")(1)("activity")(1)("date"), 2)), "mm/dd/yyyy")
    estimateDeliveryDate = json("trackResponse")("shipment")(1)("package")(1)("deliveryDate")(1)("date")
    estimateDeliveryDate = Format(DateSerial(Left(estimateDeliveryDate, 4), Mid(estimateDeliveryDate, 5, 2), Right(estimateDeliveryDate, 2)), "mm/dd/yyyy")
    On Error GoTo 0
    
    ' Return result
    If latestStatus <> "" And latestDate <> "" Then
        TrackUPSPackage = "Status: " & latestStatus & " on " & latestDate
        estimateDeliveryDateCell = estimateDeliveryDate
        estimateDeliveryDateCell.Interior.Color = RGB(255, 0, 0)
    Else
        TrackUPSPackage = "No tracking data available."
    End If
    
    
    ' Cleanup
    Set http = Nothing
    Set json = Nothing
End Function

Public Function GetUPSToken() As String
    Dim http As Object
    Dim url As String
    Dim clientID As String
    Dim clientSecret As String
    Dim requestBody As String
    Dim responseText As String
    Dim json As Object
    Dim authHeader As String

    ' Set API URL
    url = "https://onlinetools.ups.com/security/v1/oauth/token"
    
    ' Set Client ID and Secret
    clientID = "shTCzeovQ8HmgXBEOmBrKaO1DAkRmXNDXFFMu0GMwrYeaumd"
    clientSecret = "XunjudyOyt6t8MMRsHyYnOGrjfsfAu1q3JPtCavifC43IAjvZoybBtHnCG5JAC0X"

    ' Generate Basic Auth Header
    authHeader = "Basic " & Base64Encode(clientID & ":" & clientSecret)

    ' Prepare request body
    requestBody = "grant_type=client_credentials"

    ' Create XMLHTTP object
    Set http = CreateObject("MSXML2.XMLHTTP")
    
    ' Make the request
    With http
        .Open "POST", url, False
        .setRequestHeader "Content-Type", "application/x-www-form-urlencoded"
        .setRequestHeader "x-merchant-id", "4E52E9"
        .setRequestHeader "Authorization", authHeader
        .Send requestBody
        
        ' Capture response
        responseText = .responseText
    End With

    ' Parse JSON response
    Set json = JsonConverter.ParseJson(responseText)

    ' Return the access token
    If Not json Is Nothing Then
        GetUPSToken = json("access_token")
    Else
        GetUPSToken = "Error: Could not retrieve token"
    End If
    
    ' Cleanup
    Set http = Nothing
    Set json = Nothing
End Function

Public Function Base64Encode(ByVal inputStr As String) As String
    Dim bytes() As Byte
    Dim objXML As Object
    Dim objNode As Object
    Dim encoded As String

    ' Convert input string to byte array
    bytes = StrConv(inputStr, vbFromUnicode)

    ' Create XML DOM document
    Set objXML = CreateObject("MSXML2.DOMDocument")
    Set objNode = objXML.createElement("Base64")
    
    ' Encode byte array as Base64
    objNode.DataType = "bin.base64"
    objNode.nodeTypedValue = bytes
    encoded = objNode.Text

    ' Remove any line breaks (CRLF)
    encoded = Replace(encoded, vbCrLf, "")
    encoded = Replace(encoded, vbLf, "")

    ' Return the cleaned Base64 string
    Base64Encode = encoded

    ' Cleanup
    Set objNode = Nothing
    Set objXML = Nothing
End Function




