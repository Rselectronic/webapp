Attribute VB_Name = "DataVerification_API_Module"
Option Explicit
Sub DataVerification_API()

'Application.ScreenUpdating = False
'Application.DisplayAlerts = False

    Dim url As String
    Dim partNumber As String
    Dim clientID As String
    Dim clientSecret As String
    Dim Request As Object
    Dim response As Object
    Dim AccessToken As String
    Dim ProductInfo As String
    
    ' Define your Digikey API credentials
    clientID = "kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4"
    clientSecret = "qIiFSGbrfzqBxGLr"
  
    Dim PriceCalc As Worksheet
    Set PriceCalc = ThisWorkbook.Sheets("Price Calc")
    
                        ' Initialize UserForm and ProgressBar (Label)
                        Dim UserForm As Object
                        UserForm1.Show vbModeless
                        UserForm1.Caption = "Digikey & Mouser API"
                        UserForm1.Width = 246
                        UserForm1.Height = 187.4
                        
                        ' Create and format the Label to simulate a progress bar
                        Set progressBar1 = UserForm1.Controls.Add("Forms.Label.1", , True)
                        progressBar1.Name = "ProgressBar1" '
                        UserForm1.ProgressFrame.Caption = "Progress Status"
                        'UserForm1.lblmainProgCaption.Caption = "Getting Data"
                        UserForm1.lblsubProgCaption.Caption = "Part Number"
                        'UserForm1.lblmainProgPerc.Width = 0
                        'UserForm1.lblmainProgPercprocWSp.Caption = 0 & "%"
                        UserForm1.lblsubProgPerc.Width = 0
                        UserForm1.lblsubProgPercDisp.Caption = 0 & "%"
                        progressBar1.Caption = ""
                        'ProgressBar1.BackColor = RGB(0, 0, 255) ' Blue color
                        'ProgressBar1.Height = 40 ' Adjust height as needed
                        'ProgressBar1.Width = 0 ' Initialize the width to 0
    
    'If Now() > ThisWorkbook.Sheets("Authorization").Range("C2") Then
    Call RefreshAccessToken
    'End If
    
    'ThisWorkbook.Sheets("Input").Activate
    'Range("A2").Select
    
    'Do While ActiveCell.Offset(0, 1) <> ""
    
    ' Define the part number to look up (assuming it's in cell A1)
    
    
    Dim ProcWS As Worksheet
    Dim r, lr As Long
    
    Set ProcWS = ThisWorkbook.Sheets("Proc")
    
    initialiseHeaders , , , ProcWS
    lr = ProcWS.Cells(ProcWS.Rows.count, Procsheet_CPC_Column).End(xlUp).Row
    
    For r = 5 To lr
    
    'check if procWStributer is "Digikey" or "Mouser"
    
    If ProcWS.Cells(r, Procsheet_Placetobuy_Column) = "Digikey" Then
    
    ' run digikey code
    partNumber = ProcWS.Cells(r, Procsheet_DistPN_Column)
    
    If partNumber <> "" Then
    
    UserForm1.lblsubProgCaption.Caption = "Digikey " & """" & partNumber & """"
    
    Dim encodedString As String
    Dim position As Integer
    position = InStr(partNumber, "/")
    
    
    If position > 0 Then
        ' Replace "/" with "%2F" if it's present
        encodedString = Left(partNumber, position - 1) & "%2F" & Right(partNumber, Len(partNumber) - position)
        partNumber = encodedString
    Else
        ' No "/" found, keep the original string
    End If
    
    
      AccessToken = ThisWorkbook.Sheets("Authorization").Range("B2")
    
    ' Check if access token is obtained
    If AccessToken <> "" Then
                If Now() > ThisWorkbook.Sheets("Authorization").Range("C2") Then
                Call RefreshAccessToken
                End If

        ' Define the API URL to get product details
        'URL = "https://api.digikey.com/v1/products/" & PartNumber
        url = "https://api.digikey.com/Search/v3/Products/" & partNumber
        
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
        
        ' Send the request to get product details
        Request.Send
        
        ' Parse the JSON response to get product information
        ProductInfo = Request.responseText
        'Debug.Print Request.responseText
        
        ' procWSplay or process the product information as needed
        'Debug.Print ProductInfo
    

    
    
    
    Dim jsonText As String
    Dim jsonObj As Object
    Dim packageCaseValue As String
    
    
    ' JSON data
    jsonText = ProductInfo ' Replace with your JSON data
    
    ' Create a JSON parser
    Set jsonObj = JsonConverter.ParseJson(jsonText)
    
    Dim QuantityAvailable As String
    'QuantityAvailable = jsonObj("QuantityAvailable")
    'Debug.Print QuantityAvailable
    'ActiveCell.Offset(0, 2) = QuantityAvailable
    'procWs.Cells(r, Procsheet_QTYAvlble_Column) = QuantityAvailable
    
    'get Manufacturer name
    Dim manufacturerValue As String
    
    On Error Resume Next
    manufacturerValue = jsonObj("Manufacturer")("Value")
    ProcWS.Cells(r, Procsheet_MFRtoUse_Column) = manufacturerValue
    On Error GoTo 0
    
    'get Manufacturer PN
    Dim manufacturerPN As String
    
    On Error Resume Next
    manufacturerPN = jsonObj("ManufacturerPartNumber")
    ProcWS.Cells(r, Procsheet_PNTOUSE_Column) = manufacturerPN
    On Error GoTo 0
    
    'get Manufacturer PN
    Dim manufacturerDescription As String
    
    On Error Resume Next
    manufacturerDescription = jsonObj("ProductDescription")
    ProcWS.Cells(r, Procsheet_CustomerDescription_Column) = manufacturerDescription
    On Error GoTo 0
    
    
'
'
'    ' Access the "StandardPricing" array
'    Dim pricingArray As Collection
'    Dim pricingItem As Object
'    Dim breakQuantity As Long
'    Dim unitPrice As Double
'    Dim i As Integer
'
'
'    If jsonObj.Exists("StandardPricing") Then
'    Set pricingArray = jsonObj("StandardPricing")
'
'    ' Loop through the array and extract values
'    For i = 1 To pricingArray.count
'        Set pricingItem = pricingArray(i)
'        breakQuantity = pricingItem("BreakQuantity")
'        unitPrice = pricingItem("UnitPrice")
'
'        PriceCalc.Cells(i, "A") = breakQuantity
'        PriceCalc.Cells(i, "B") = unitPrice
'
'        ' Print or use the values as needed
'        'Debug.Print "Break Quantity: " & breakQuantity
'        'Debug.Print "Unit Price: " & unitPrice
'    Next i
'
'    Dim Breakqty1, Breakqty2, Rate As Long
'    Dim qty1, qty2, qty3, qty4 As Long
'
'    If pricingArray.count > 1 Then
'
'    For i = 1 To pricingArray.count - 1
'    qty1 = procWs.Cells(r, Procsheet_ORDERQTY_Column)
''    qty2 = procWs.Cells(r, "AB")
''    qty3 = procWs.Cells(r, "AG")
''    qty4 = procWs.Cells(r, "AL")
'
'    Breakqty1 = PriceCalc.Cells(i, "A")
'    Breakqty2 = PriceCalc.Cells(i + 1, "A")
'
'    If qty1 >= Breakqty1 And qty1 < Breakqty2 Then
'    procWs.Cells(r, Procsheet_Unit_Price_Column) = PriceCalc.Cells(i, "B")
'    ElseIf qty1 >= PriceCalc.Cells(pricingArray.count, "A") Then
'    procWs.Cells(r, Procsheet_Unit_Price_Column) = PriceCalc.Cells(pricingArray.count, "B")
'    End If
'
''    If qty2 >= Breakqty1 And qty2 < Breakqty2 Then
''    procWs.Cells(r, "Ac") = PriceCalc.Cells(i, "B")
''    ElseIf qty2 >= PriceCalc.Cells(pricingArray.count, "A") Then
''    procWs.Cells(r, "AC") = PriceCalc.Cells(pricingArray.count, "B")
''    End If
''
''    If qty3 >= Breakqty1 And qty3 < Breakqty2 Then
''    procWs.Cells(r, "AH") = PriceCalc.Cells(i, "B")
''    ElseIf qty3 >= PriceCalc.Cells(pricingArray.count, "A") Then
''    procWs.Cells(r, "AH") = PriceCalc.Cells(pricingArray.count, "B")
''    End If
''
''    If qty4 >= Breakqty1 And qty4 < Breakqty2 Then
''    procWs.Cells(r, "AM") = PriceCalc.Cells(i, "B")
''    ElseIf qty4 >= PriceCalc.Cells(pricingArray.count, "A") Then
''    procWs.Cells(r, "AM") = PriceCalc.Cells(pricingArray.count, "B")
''    End If
'
'    Next i
'
'    Else
'    ' we will directly put the unit price to all the quantities
'    If procWs.Cells(r, Procsheet_ORDERQTY_Column) <> "" Then
'    procWs.Cells(r, Procsheet_Unit_Price_Column) = unitPrice
'    End If
'
''    If procWs.Cells(r, "AB") <> "" Then
''    procWs.Cells(r, "AC") = unitPrice
''    End If
''
''    If procWs.Cells(r, "AG") <> "" Then
''    procWs.Cells(r, "AH") = unitPrice
''    End If
''
''    If procWs.Cells(r, "AL") <> "" Then
''    procWs.Cells(r, "AM") = unitPrice
''    End If
'
    'End If
    
    
'    PriceCalc.Range("A1:B50") = ""
'
'
'
'    Dim Parameters As Collection
'    Dim ParamItem As Object
'    Dim ParamName As String
'    Dim ParamValue As String
    
     ' Check if "Parameters" key exists
'    If jsonObj.Exists("Parameters") Then
'        ' Get the "MediaLinks" object
'        Set Parameters = jsonObj("Parameters")
'
'    ' Loop through the parameters and extract names and values
'    For Each ParamItem In Parameters
'        ParamName = ParamItem("Parameter")
'        ParamValue = ParamItem("Value")
'
'        If ParamName = "Package / Case" Then
'        'ActiveCell.Offset(0, 11) = ParamValue
'        End If
'
'        ' Print or use ParamName and ParamValue as needed
'        'Debug.Print "Parameter Name: " & ParamName
'        'Debug.Print "Parameter Value: " & ParamValue
'    Next ParamItem
'    End If
    
    
    'ActiveCell.Offset(1, 0).Select
    
    
    
    
    
    
    
    
    
'    Else
'    procWs.Cells(r, Procsheet_QTYAvlble_Column) = "Part not found"
'    End If
    
    
    
    Else
        MsgBox "Failed to obtain access token. Check your credentials."
    End If
    'Loop
    End If






    ElseIf ProcWS.Cells(r, Procsheet_DistName_Column) = "Mouser" Then
    
    ' run mouser API
    
    Dim apiKey As String
    Dim requestPayload As String
    Dim responseText As String
    Dim objHTTP As Object
    Dim jsonResponse As Object
    Dim ws As Worksheet
    Dim rowNum As Long
    Dim PP As Worksheet
    
    
    
    
    
    'Set PP = ThisWorkbook.Sheets("Price Parameters")
    
    
    
    
    
    
    ' Set the URL and API Key
    url = "https://api.mouser.com/api/v1/search/keyword?apiKey=bc62cf5b-6602-4919-b85f-ccfa6d711d2c"
    apiKey = "3142af4a-e0c2-4574-87a4-dc5b5e3b2f78"     'this is Piyush's api key
    
    'Do While ActiveCell.Value <> ""
    
    ' Construct the JSON payload
    requestPayload = "{""SearchByKeywordRequest"": {""keyword"": " & """" & ProcWS.Cells(r, Procsheet_DistPN_Column) & """,""records"": 0,""startingRecord"": 0,""searchOptions"": """",""searchWithYourSignUpLanguage"": """"}}"
    
    UserForm1.lblsubProgCaption.Caption = "Mouser " & """" & ProcWS.Cells(r, Procsheet_DistPN_Column) & """"
    
    ' Create an HTTP object
    Set objHTTP = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    
    ' Send a POST request to the API
    With objHTTP
        .Open "POST", url, False
        .setRequestHeader "accept", "application/json"
        .setRequestHeader "Content-Type", "application/json"
        .Send requestPayload
        responseText = .responseText
    End With
    
    
    'Debug.Print responseText
    
    
'=======================================================Parse Json====================================================================

    Dim Json As Object
    Set Json = JsonConverter.ParseJson(responseText) ' Replace 'yourJsonString' with your JSON response

    On Error Resume Next
    Dim parts As Object
    Set parts = Json("SearchResults")("Parts")


    On Error GoTo 0




'--------------------------------------get stock availability--------------------------------------------------------

    Dim specificPart As Object, part As Variant
    Set specificPart = Nothing

    ' Loop through the parts to find the specific part
    For Each part In parts
        If part("MouserPartNumber") = ProcWS.Cells(r, Procsheet_DistPN_Column) Then
            Set specificPart = part
            Exit For
        End If
    Next part
    
    
    If Not specificPart Is Nothing Then
        ' get Dist MPN
        Dim distMPN As String
        distMPN = ""
        distMPN = specificPart("ManufacturerPartNumber")
        ProcWS.Cells(r, Procsheet_PNTOUSE_Column) = distMPN
        
        
        'get Dist MFR
        Dim distMFR As String
        distMFR = ""
        distMFR = specificPart("Manufacturer")
        ProcWS.Cells(r, Procsheet_MFRtoUse_Column) = distMFR
        
        
        ' get Dist Description
        Dim distDescription As String
        distDescription = ""
        distDescription = specificPart("Description")
        ProcWS.Cells(r, Procsheet_CustomerDescription_Column) = distDescription
    
    End If

'    If Not specificPart Is Nothing Then
'        Dim availability As String
'        'reset availability
'        availability = ""
'        Dim MFR As String
'        On Error Resume Next
'        availability = specificPart("AvailabilityInStock")
'        MFR = specificPart("Manufacturer")
'        On Error GoTo 0
'        'Debug.Print "AvailabilityInStock for " & ActiveCell.Offset(0, 1) & ": " & availability
'        procWs.Cells(r, Procsheet_QTYAvlble_Column) = availability
'        'ActiveCell.Offset(0, 12) = mfr
'    Else
'        'Debug.Print "Part not found: 581-TAJV226K050"
'        procWs.Cells(r, Procsheet_QTYAvlble_Column) = "Part not found"
'    End If
    
'---------------------------------------------------------------------------------------------------------------------------------------


'======================================GET PRICEBREAKS==================================================================================

'  If Not specificPart Is Nothing Then
'        Dim priceBreaks As Collection
'        Set priceBreaks = specificPart("PriceBreaks")
'
'        ' Loop through the price breaks and extract Quantity and Price
'
'        If priceBreaks.count <> 0 Then
'        For i = 1 To priceBreaks.count
'            Dim quantity As Long
'            Dim price As Double
'
'            Set pricingItem = priceBreaks(i)
'            quantity = pricingItem("Quantity")
'            price = pricingItem("Price")
'
'            PriceCalc.Cells(i, "A") = quantity
'            PriceCalc.Cells(i, "B") = price
'
'            Next i
'
'
'
'            If priceBreaks.count > 1 Then
'
'            For i = 1 To priceBreaks.count - 1
'            qty1 = procWs.Cells(r, Procsheet_ORDERQTY_Column)
''            qty2 = procWs.Cells(r, "AB")
''            qty3 = procWs.Cells(r, "AG")
''            qty4 = procWs.Cells(r, "AL")
'
'            Breakqty1 = PriceCalc.Cells(i, "A")
'            Breakqty2 = PriceCalc.Cells(i + 1, "A")
'
'            If qty1 >= Breakqty1 And qty1 < Breakqty2 Then
'            procWs.Cells(r, Procsheet_Unit_Price_Column) = PriceCalc.Cells(i, "B")
'            ElseIf qty1 >= PriceCalc.Cells(priceBreaks.count, "A") Then
'            procWs.Cells(r, Procsheet_Unit_Price_Column) = PriceCalc.Cells(priceBreaks.count, "B")
'            End If
'
''            If qty2 >= Breakqty1 And qty2 < Breakqty2 Then
''            procWs.Cells(r, "AC") = PriceCalc.Cells(i, "B")
''            ElseIf qty2 >= PriceCalc.Cells(priceBreaks.count, "A") Then
''            procWs.Cells(r, "AC") = PriceCalc.Cells(priceBreaks.count, "B")
''            End If
''
''            If qty3 >= Breakqty1 And qty3 < Breakqty2 Then
''            procWs.Cells(r, "AH") = PriceCalc.Cells(i, "B")
''            ElseIf qty3 >= PriceCalc.Cells(priceBreaks.count, "A") Then
''            procWs.Cells(r, "AH") = PriceCalc.Cells(priceBreaks.count, "B")
''            End If
''
''            If qty4 >= Breakqty1 And qty4 < Breakqty2 Then
''            procWs.Cells(r, "AM") = PriceCalc.Cells(i, "B")
''            ElseIf qty4 >= PriceCalc.Cells(priceBreaks.count, "A") Then
''            procWs.Cells(r, "AM") = PriceCalc.Cells(priceBreaks.count, "B")
''            End If
'
'            Next i
'
'        Else
'
'        ' we will directly put the unit price to all the quantities
'            If procWs.Cells(r, Procsheet_ORDERQTY_Column) <> "" Then
'            procWs.Cells(r, Procsheet_Unit_Price_Column) = price
'            End If
'
''            If procWs.Cells(r, "AB") <> "" Then
''            procWs.Cells(r, "AC") = price
''            End If
''
''            If procWs.Cells(r, "AG") <> "" Then
''            procWs.Cells(r, "AH") = price
''            End If
''
''            If procWs.Cells(r, "AL") <> "" Then
''            procWs.Cells(r, "AM") = price
''            End If
'
'        End If
'        End If
'
'            PriceCalc.Range("A1:B50") = ""
'
'    Else
'        'Debug.Print "Part not found: " & ActiveCell.Offset(0, 1)
'    End If
    
    
    
    End If


'procWs.Cells(r, Procsheet_Unit_Price_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* ""-""??_);_(@_)"
'procWs.Cells(r, Procsheet_ExtPrice_Column) = procWs.Cells(r, Procsheet_Unit_Price_Column) * procWs.Cells(r, Procsheet_ORDERQTY_Column)
'procWs.Cells(r, Procsheet_ExtPrice_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* ""-""??_);_(@_)"

                            ' Update progress bar by changing Label's width
                            UserForm1.Caption = "Digikey & Mouser API"
                            UserForm1.lblmainProgPercDisp.Caption = Format((r - 3) / (lr - 3), "0.00%")
                            UserForm1.lblmainProgPerc.Width = ((r - 3) / (lr - 3)) * 180
                            UserForm1.lblsubProgPercDisp.Caption = Format((r - 3) / (lr - 3), "0.00%")
                            UserForm1.lblsubProgPerc.Width = ((r - 3) / (lr - 3)) * 180
                            
                            
                            'UserForm1.Caption = "Progress (" & r - 3 & "/" & lr - 3 & ")....." & Format((r - 3) / (lr - 3), "0.00%")
                            'ProgressBar1.Width = (r / lr) * (UserForm1.Width) ' Adjust the width calculation
                            DoEvents ' Allow the UserForm to update


    Next r
Application.ScreenUpdating = True
Application.DisplayAlerts = True
    
    'ProgressBar2.Width = 0
    
Unload UserForm1
End Sub
