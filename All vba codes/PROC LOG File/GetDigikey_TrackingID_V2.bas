Attribute VB_Name = "GetDigikey_TrackingID_V2"
Option Explicit

Public Sub GetDigikeyTrackingIDSub()
Application.DisplayAlerts = False

Dim StatusofGetDigikeyTrackingIDFunction As String
StatusofGetDigikeyTrackingIDFunction = GetDigikeyTrackingIDFunction()

If StatusofGetDigikeyTrackingIDFunction <> "" Then
  MsgBox StatusofGetDigikeyTrackingIDFunction, , "Macro"
Else
  MsgBox "Status Updated Successfully", , "Macro"
End If

Application.DisplayAlerts = True
End Sub

Public Function GetDigikeyTrackingIDFunction()
On Error GoTo errhandler

Dim i As Double
Dim ProcFileTrackingSheet As Worksheet
Dim ProcFileTrackingSheetLrow As Double
Dim SalesOrder As String, orderStatus As String
Dim StatusofAPICourier As String
Dim Suppliers As String
Dim ReturnOrderStatus As String, ReturnCourierStatus As String, ReturnTrackingNumbers As String

Set ProcFileTrackingSheet = ThisWorkbook.Sheets("Tracking")
ProcFileTrackingSheet.Activate
initialiseHeaders , , , , , , , , , , ProcFileTrackingSheet
ProcFileTrackingSheetLrow = ProcFileTrackingSheet.Cells(Rows.Count, ProcFile_Tracking_Sheet_PROCBATCHCODE__Column).End(xlUp).Row
  
For i = 3 To ProcFileTrackingSheetLrow
   SalesOrder = ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_SalesOrder__Column).Value
   Suppliers = Trim(UCase(ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_Suppliers__Column).Value))
   orderStatus = ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_Orderstatus__Column).Value
   
   If Suppliers Like "DIGIKEY*" And orderStatus <> "Shipped" Then
      ReturnOrderStatus = "": ReturnOrderStatus = "": ReturnCourierStatus = "": ReturnTrackingNumbers = ""
      StatusofAPICourier = GetDigikeyOrderStatus(SalesOrder, ReturnOrderStatus, ReturnCourierStatus, ReturnTrackingNumbers)
      ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_TrackingID__Column).NumberFormat = "@"
      ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_TrackingID__Column).Value = ReturnTrackingNumbers
      ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_Orderstatus__Column).Value = ReturnOrderStatus
      
      If UCase(ReturnCourierStatus) Like "*" & "FEDEX" & "*" Then
         ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_CourierName__Column).Value = "FedEx"
      ElseIf UCase(ReturnCourierStatus) Like "*" & "DHL" & "*" Then
         ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_CourierName__Column).Value = "DHL"
      ElseIf UCase(ReturnCourierStatus) Like "*" & "UPS" & "*" Then
         ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_CourierName__Column).Value = "UPS"
      Else
         ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_CourierName__Column).Value = ReturnCourierStatus
      End If
   End If
   
Next i

Exit Function
errhandler:
GetDigikeyTrackingIDFunction = Err.Description
End Function

Private Function GetDigikeyOrderStatus(salesOrderID As String, ReturnOrderStatus As String, ReturnCourierStatus As String, ReturnTrackingNumbers As String) As String
    Dim http As Object
    Dim url As String
    Dim accessToken As String
    Dim responseText As String
    Dim json As Object
    Dim trackingNumbers As String
    Dim itemShipments As Object
    Dim orderStatus As String
    Dim courierName As String
    Dim i As Integer

    ' Get Digikey access token
    accessToken = GetDigikeyToken()
    If Left(accessToken, 5) = "Error" Then
        GetDigikeyOrderStatus = "Error: Could not retrieve access token."
        Exit Function
    End If

    ' Set API URL
    url = "https://api.digikey.com/orderstatus/v4/salesorder/" & salesOrderID

    ' Create HTTP request
    Set http = CreateObject("MSXML2.XMLHTTP")
    With http
        .Open "GET", url, False
        .setRequestHeader "accept", "application/json"
        .setRequestHeader "X-DIGIKEY-Client-Id", "kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4"
        .setRequestHeader "X-DIGIKEY-Locale-Site", "CA"
        .setRequestHeader "X-DIGIKEY-Customer-Id", "12161502"
        .setRequestHeader "Authorization", "Bearer " & accessToken
        .Send
        responseText = .responseText
    End With

    ' Parse JSON response
    Set json = JsonConverter.ParseJson(responseText)

    ' Extract order status
    On Error Resume Next
    orderStatus = json("Status")("ShortDescription")
    courierName = json("ShipMethod")
    On Error GoTo 0

    ' Extract tracking numbers
    trackingNumbers = ""
    On Error Resume Next
    If json.Exists("LineItems") Then
        If TypeName(json("LineItems")) = "Collection" Then
            If json("LineItems").Count > 0 Then
                If json("LineItems")(1).Exists("ItemShipments") Then
                    Set itemShipments = json("LineItems")(1)("ItemShipments")
                    
                    ' Ensure itemShipments is a collection before looping
                    If TypeName(itemShipments) = "Collection" Then
                        For i = 1 To itemShipments.Count
                            If trackingNumbers <> "" Then trackingNumbers = trackingNumbers & ", "
                            trackingNumbers = trackingNumbers & itemShipments(i)("TrackingNumber")
                        Next i
                    End If
                End If
            End If
        End If
    End If
    On Error GoTo 0

    ' Format the result
    If orderStatus <> "" And trackingNumbers <> "" Then
        GetDigikeyOrderStatus = "Order Status: " & orderStatus & vbCrLf & _
                        "Courier: " & courierName & vbCrLf & _
                        "Tracking Numbers: " & trackingNumbers

    ElseIf orderStatus <> "" Then
        GetDigikeyOrderStatus = "Order Status: " & orderStatus & vbCrLf & "No tracking numbers available."
    Else
        GetDigikeyOrderStatus = "No order status found."
    End If
    
    If orderStatus <> "" Then
      ReturnOrderStatus = orderStatus
    End If
    If trackingNumbers <> "" Then
       ReturnTrackingNumbers = trackingNumbers
    End If
    If courierName <> "" Then
       ReturnCourierStatus = courierName
    End If
    
End Function

Private Function GetDigikeyToken() As String
    Dim http As Object
    Dim url As String
    Dim requestBody As String
    Dim responseText As String
    Dim json As Object
    Dim accessToken As String

    ' API URL for authentication
    url = "https://api.digikey.com/v1/oauth2/token"

    ' Prepare request body
    requestBody = "grant_type=client_credentials" & _
                  "&client_id=kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4" & _
                  "&client_secret=qIiFSGbrfzqBxGLr"

    ' Create HTTP request
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
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
        GetDigikeyToken = accessToken
    Else
        GetDigikeyToken = "Error: Could not retrieve Digikey token."
    End If
End Function




