Attribute VB_Name = "Digikey_Mouser_API_V5"
Option Explicit
Sub GetPriceBreakDown()

    Application.ScreenUpdating = False
    Application.DisplayAlerts = False

    Dim url As String
    Dim partNumber As String
    Dim clientID As String
    Dim clientSecret As String
    Dim Request As Object
    Dim response As Object
    Dim AccessToken As String
    Dim ProductInfo As String
    Dim TokenExpirytime As Date
    
    Dim response1 As VbMsgBoxResult
    response1 = MsgBox("Access data from API?", vbYesNo + vbQuestion, "Confirmation")
    
    ' Define your Digikey API credentials
    clientID = "kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4"
    clientSecret = "qIiFSGbrfzqBxGLr"
  
    Dim PriceCalc As Worksheet
    Set PriceCalc = ThisWorkbook.Sheets("Price Calc")
    
    ' define location to save json data
    Dim JsonFolderPath As String
    Dim fullPath As String
    Dim parentFolderName As String
    
    fullPath = GetLocalPath(ThisWorkbook.FullName)
    parentFolderName = ExtractFolderName(fullPath)
    JsonFolderPath = Left(fullPath, InStr(1, fullPath, parentFolderName, vbTextCompare) + Len(parentFolderName)) & "6. BACKEND\JSON DATA\"
    
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
    


    
    Dim ProcWS As Worksheet
    Dim r, lr As Long
    Dim originalDistPN As String, OriginalDistPNencoded As String
    
    Set ProcWS = ThisWorkbook.Sheets("Proc")
    
    initialiseHeaders , , , ProcWS
    lr = ProcWS.Cells(ProcWS.Rows.count, Procsheet_CPC_Column).End(xlUp).Row
    
    For r = 5 To lr
    
        'check if procWStributer is "Digikey" or "Mouser"
        If ProcWS.Cells(r, Procsheet_DistName_Column) = "Digikey" Then
        
            ' run digikey code
            partNumber = ProcWS.Cells(r, Procsheet_DistPN_Column)
            originalDistPN = partNumber
            OriginalDistPNencoded = CleanFileName(originalDistPN)
            
            If partNumber <> "" Then
            
                UserForm1.lblsubProgCaption.Caption = "Digikey " & """" & partNumber & """"
                
                Dim encodedString As String
                Dim position As Integer
                position = InStr(partNumber, "/")
                
                
                If position > 0 Then
                    ' Replace "/" with "%2F" if it's present
                    'encodedString = Left(partNumber, position - 1) & "%2F" & Right(partNumber, Len(partNumber) - position)
                    encodedString = Replace(partNumber, "/", "%2F")
                    partNumber = encodedString
                Else
                    ' No "/" found, keep the original string
                End If
                
                
                ' get the json data from storage if exixts
                ProductInfo = ReadJSONFromFile(JsonFolderPath & OriginalDistPNencoded & ".json", response1)
                
                If ProductInfo <> "" Then
                    GoTo digikey_skipAPIcall
                End If
                
                
                If AccessToken = "" Or TokenExpirytime < Now Then
                    AccessToken = GetAccessToken
                    TokenExpirytime = Now + TimeSerial(0, 0, 599)
                End If
                
                ' Check if access token is obtained
                If AccessToken <> "" Then
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
                        
                    ' save the json data
                    SaveJSONToFile ProductInfo, JsonFolderPath, OriginalDistPNencoded & ".json"
                
                    Dim jsonText As String
                    Dim jsonObj As Object
                    Dim packageCaseValue As String
digikey_skipAPIcall:
                    
                    ' JSON data
                    jsonText = ProductInfo ' Replace with your JSON data
                    
                    ' Create a JSON parser
                    Set jsonObj = JsonConverter.ParseJson(jsonText)
                    
                    If jsonObj("status") = 404 Then GoTo nextLine
                    
                    Dim QuantityAvailable As String
                    Dim packagingType As String
                    Dim manufacturerPN As String
                    QuantityAvailable = jsonObj("Product")("QuantityAvailable")
                    manufacturerPN = jsonObj("Product")("ManufacturerProductNumber")

                    
                    Dim ProductVariations As Object, productVariation As Variant
                    Set ProductVariations = jsonObj("Product")("ProductVariations")
                    For Each productVariation In ProductVariations
                        If partNumber = productVariation("DigiKeyProductNumber") Then
                            packagingType = productVariation("PackageType")("Name")
                        End If
                    Next productVariation
                    
                    ProcWS.Cells(r, Procsheet_DistStock_Column) = QuantityAvailable
                    ProcWS.Cells(r, Procsheet_PackagingType_Column) = packagingType
                    ProcWS.Cells(r, Procsheet_PNTOUSE_Column) = manufacturerPN
                    
                    'get Manufacturer name
                    Dim manufacturerValue As String
                    
                    On Error Resume Next
                    manufacturerValue = jsonObj("Product")("Manufacturer")("Name")
                    ProcWS.Cells(r, Procsheet_MFRtoUse_Column) = manufacturerValue
                    On Error GoTo 0
                    
                    'ProcWS.Cells(r, Procsheet_OrderQtyUnitPrice_Column) = GetUnitPriceFromAllBreaks(ProductVariations, ProcWS.Cells(r, Procsheet_ORDERQTY_Column))
                    ProcWS.Cells(r, Procsheet_OrderQtyUnitPrice_Column) = GetUnitPriceForQuantity(ProductVariations, ProcWS.Cells(r, Procsheet_ORDERQTY_Column))
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
            Dim mouserPN As String, mouserPNforDatabase As String
            
            mouserPN = ProcWS.Cells(r, Procsheet_DistPN_Column)
            mouserPNforDatabase = CleanFileName(mouserPN)
            
            UserForm1.lblsubProgCaption.Caption = "Mouser " & """" & mouserPN & """"
            responseText = ReadJSONFromFile(JsonFolderPath & mouserPNforDatabase & ".json", response1)
                
            If responseText <> "" Then
                GoTo mouser_skipAPIcall
            End If
            
            
            
            
            
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
            
            ' save the json data
            SaveJSONToFile responseText, JsonFolderPath, mouserPNforDatabase & ".json"
            
            'Debug.Print responseText
            
            
        '=======================================================Parse Json====================================================================
mouser_skipAPIcall:

            Dim Json As Object
            Set Json = JsonConverter.ParseJson(responseText) ' Replace 'yourJsonString' with your JSON response
        
            On Error Resume Next
            Dim parts As Object, part As Variant
            Set parts = Json("SearchResults")("Parts")
        
        
            On Error GoTo 0
        
        
        '--------------------------------------get stock availability--------------------------------------------------------
        
            Dim specificPart As Object
            Set specificPart = Nothing
        
            ' Loop through the parts to find the specific part
            For Each part In parts
                If part("MouserPartNumber") = ProcWS.Cells(r, Procsheet_DistPN_Column) Then
                    Set specificPart = part
                    Exit For
                End If
            Next part
        
            If Not specificPart Is Nothing Then
                Dim availability As String, mouser_manufacturerPN As String
                'reset availability
                availability = ""
                Dim MFR As String
                On Error Resume Next
                availability = specificPart("AvailabilityInStock")
                MFR = specificPart("Manufacturer")
                mouser_manufacturerPN = specificPart("ManufacturerPartNumber")
                On Error GoTo 0
                'Debug.Print "AvailabilityInStock for " & ActiveCell.Offset(0, 1) & ": " & availability
                ProcWS.Cells(r, Procsheet_DistStock_Column) = availability
                ProcWS.Cells(r, Procsheet_PNTOUSE_Column) = mouser_manufacturerPN
                ProcWS.Cells(r, Procsheet_MFRtoUse_Column) = MFR
            
            Else
                'Debug.Print "Part not found: 581-TAJV226K050"
                ProcWS.Cells(r, Procsheet_DistStock_Column) = "Part not found"
            End If
            
            
            Dim mouserPackageType As String
            Dim mouserProductAttributesArray As Object
            Dim mouserProdAttribute As Variant
            
            Set mouserProductAttributesArray = specificPart("ProductAttributes")
            For Each mouserProdAttribute In mouserProductAttributesArray
                If mouserProdAttribute("AttributeName") = "Packaging" Then
                    If mouserPackageType = "" Then
                        mouserPackageType = mouserProdAttribute("AttributeValue")
                    Else
                        mouserPackageType = mouserPackageType & ", " & mouserProdAttribute("AttributeValue")
                    End If
                End If
            Next mouserProdAttribute
            
            ProcWS.Cells(r, Procsheet_PackagingType_Column) = mouserPackageType
            mouserPackageType = ""
        '---------------------------------------------------------------------------------------------------------------------------------------
        
        
        '======================================GET PRICEBREAKS==================================================================================
        
            If Not specificPart Is Nothing Then
                Dim priceBreaks As Collection, i As Long, pricingItem As Object
                Set priceBreaks = specificPart("PriceBreaks")
        
                ' Loop through the price breaks and extract Quantity and Price
                
                If priceBreaks.count <> 0 Then
                For i = 1 To priceBreaks.count
                    Dim quantity As Long
                    Dim price As Double
        
                    Set pricingItem = priceBreaks(i)
                    quantity = pricingItem("Quantity")
                    price = pricingItem("Price")
                    
                    PriceCalc.Cells(i, "A") = quantity
                    PriceCalc.Cells(i, "B") = price
                    
                    Next i
                
                    
                    
                    If priceBreaks.count > 1 Then
                    Dim qty1 As Long, Breakqty1 As Long, Breakqty2 As Long
                    For i = 1 To priceBreaks.count - 1
                        qty1 = ProcWS.Cells(r, Procsheet_ORDERQTY_Column)
                        Breakqty1 = PriceCalc.Cells(i, "A")
                        Breakqty2 = PriceCalc.Cells(i + 1, "A")
                        
                        If qty1 >= Breakqty1 And qty1 < Breakqty2 Then
                            ProcWS.Cells(r, Procsheet_OrderQtyUnitPrice_Column) = PriceCalc.Cells(i, "B")
                        ElseIf qty1 >= PriceCalc.Cells(priceBreaks.count, "A") Then
                            ProcWS.Cells(r, Procsheet_OrderQtyUnitPrice_Column) = PriceCalc.Cells(priceBreaks.count, "B")
                        End If
        
                    Next i
            
                    Else
                
                        ' we will directly put the unit price to all the quantities
                        If ProcWS.Cells(r, Procsheet_ORDERQTY_Column) <> "" Then
                            ProcWS.Cells(r, Procsheet_OrderQtyUnitPrice_Column) = price
                        End If
                    End If
                End If
            
            PriceCalc.Range("A1:B50") = ""
                    
            Else
                'Debug.Print "Part not found: " & ActiveCell.Offset(0, 1)
            End If
            
            
            
            End If
        
        
        ProcWS.Cells(r, Procsheet_OrderQtyUnitPrice_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* ""-""??_);_(@_)"
        ProcWS.Cells(r, Procsheet_OrderQtyExtPrice_Column) = ProcWS.Cells(r, Procsheet_OrderQtyUnitPrice_Column) * ProcWS.Cells(r, Procsheet_ORDERQTY_Column)
        ProcWS.Cells(r, Procsheet_OrderQtyExtPrice_Column).NumberFormat = "_($* #,##0.00_);_($* (#,##0.00);_($* ""-""??_);_(@_)"
        
                                    ' Update progress bar by changing Label's width
                                    UserForm1.Caption = "Digikey & Mouser API"
                                    UserForm1.lblmainProgPercDisp.Caption = Format((r - 3) / (lr - 3), "0.00%")
                                    UserForm1.lblmainProgPerc.Width = ((r - 3) / (lr - 3)) * 180
                                    UserForm1.lblsubProgPercDisp.Caption = Format((r - 3) / (lr - 3), "0.00%")
                                    UserForm1.lblsubProgPerc.Width = ((r - 3) / (lr - 3)) * 180
                                    
                                    
                                    'UserForm1.Caption = "Progress (" & r - 3 & "/" & lr - 3 & ")....." & Format((r - 3) / (lr - 3), "0.00%")
                                    'ProgressBar1.Width = (r / lr) * (UserForm1.Width) ' Adjust the width calculation
                                    DoEvents ' Allow the UserForm to update
        
nextLine:
            Next r
        Application.ScreenUpdating = True
        Application.DisplayAlerts = True
            
            'ProgressBar2.Width = 0
            
        Unload UserForm1
End Sub
Function ExtractFolderName(ByVal fullPath As String) As String
    Dim folders() As String
    Dim folderName As String
    
    ' Split the path string using backslash as delimiter
    folders = Split(fullPath, "\")
    
    ' Check if there are at least three elements in the array
    If UBound(folders) >= 2 Then
        ' Get the third element which corresponds to the folder name
        folderName = folders(UBound(folders) - 3)
    Else
        ' If the path is invalid, return empty string
        folderName = ""
    End If
    
    ' Return the folder name
    ExtractFolderName = folderName
End Function
Function CleanFileName(ByVal FileName As String) As String
    Dim InvalidChars As Variant
    InvalidChars = Array("\", "/", ":", "*", "?", """", "<", ">", "|")

    Dim ch As Variant
    For Each ch In InvalidChars
        FileName = Replace(FileName, ch, "_")
    Next ch

    ' Optional: Trim spaces at beginning and end
    FileName = Trim(FileName)

    ' Optional: Remove leading period to avoid hidden files
    If Left(FileName, 1) = "." Then FileName = Mid(FileName, 2)

    CleanFileName = FileName
End Function
Function SaveJSONToFile(jsonResponse As String, folderPath As String, Optional FileName As String = "") As String
    Dim filePath As String
    Dim fileNum As Integer

    ' Add trailing backslash if needed
    If Right(folderPath, 1) <> "\" Then folderPath = folderPath & "\"

    ' Generate filename if not provided
    If FileName = "" Then
        FileName = "api_response_" & Format(Now, "yyyymmdd_hhnnss") & ".json"
    End If

    filePath = folderPath & FileName

    ' Create folder if it doesn't exist
    If Dir(folderPath, vbDirectory) = "" Then
        MkDir folderPath
    End If

    ' Save JSON to file
    fileNum = FreeFile
    Open filePath For Output As #fileNum
        Print #fileNum, jsonResponse
    Close #fileNum

    ' Return full file path
    SaveJSONToFile = filePath
End Function
Function ReadJSONFromFile(filePath As String, response1 As VbMsgBoxResult) As String
    Dim fileNum As Integer
    Dim fileContent As String

    ' Check if file exists
    If Dir(filePath) = "" Then
        'MsgBox "File not found: " & filePath, vbExclamation
        ReadJSONFromFile = ""
        Exit Function
    End If
    
    ' Check if file older than 4 hours
    
    If response1 = vbYes Then
        ReadJSONFromFile = ""
        Exit Function
    End If

    ' Read file content
    fileNum = FreeFile
    Open filePath For Input As #fileNum
        fileContent = Input$(LOF(fileNum), fileNum)
    Close #fileNum
    
    Dim JsonObject As Object
    Set JsonObject = JsonConverter.ParseJson(fileContent)
    
    If JsonObject("status") = 401 Then
        ReadJSONFromFile = ""
        Exit Function
    End If

    ReadJSONFromFile = fileContent
End Function

Function GetAccessToken() As String
    Dim http As Object
    Dim url As String
    Dim clientID As String
    Dim clientSecret As String
    Dim grantType As String
    Dim response As String
    Dim token As String
    
    ' Set the API URL
    url = "https://api.digikey.com/v1/oauth2/token"
    
    ' Your client ID and client secret
    clientID = "kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4"
    clientSecret = "qIiFSGbrfzqBxGLr"
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
    Dim Json As Object
    Set Json = JsonConverter.ParseJson(response) ' Requires JsonConverter library
    
    ' Extract the access token
    token = Json("access_token")
    
    ' Set the function's return value to the token
    GetAccessToken = token
    
    ' Clean up
    Set http = Nothing
    Set Json = Nothing
End Function




' Master function:
' - If BOTH Cut Tape (CT) and Tape & Reel (TR) exist:
'       -> uses split logic (TR in multiples, remainder CT)
' - Otherwise:
'       -> uses direct pricing from the first valid package (Bulk, Tray, Tube, CT-only, TR-only, etc.)
'
' ProductVariations: the JSON "ProductVariations" object
' quantity: total quantity required
' ExtendedPrice (optional): total extended price returned via ByRef
Public Function GetUnitPriceForQuantity( _
    ByVal ProductVariations As Object, _
    ByVal quantity As Long, _
    Optional ByRef ExtendedPrice As Double) As Double

    Dim trVar As Object, ctVar As Object, v As Object
    Dim trPricing As Object, ctPricing As Object
    Dim hasTR As Boolean, hasCT As Boolean
    
    Dim unitPrice As Double
    
    If quantity <= 0 Then
        GetUnitPriceForQuantity = 0
        ExtendedPrice = 0
        Exit Function
    End If
    
    ' --- Detect CT and TR variations if present ---
    For Each v In ProductVariations
        If v.Exists("PackageType") Then
            Select Case v("PackageType")("Name")
                Case "Tape & Reel (TR)"
                    Set trVar = v
                    hasTR = True
                Case "Cut Tape (CT)"
                    Set ctVar = v
                    hasCT = True
            End Select
        End If
    Next v
    
    ' --- If BOTH Cut Tape and Tape & Reel exist, use split logic ---
    If hasTR And hasCT Then
        unitPrice = GetCTTRSplitUnitPrice(ProductVariations, quantity, ExtendedPrice)
        GetUnitPriceForQuantity = unitPrice
        Exit Function
    End If
    
    ' --- Otherwise: NO split, just direct pricing from whichever package exists ---
    ' (Bulk / Tray / Tube / CT-only / TR-only / etc.)
    
    Dim bestPrice As Double
    Dim havePrice As Boolean
    Dim pricing As Object
    
    bestPrice = 0
    havePrice = False
    
    For Each v In ProductVariations
        Set pricing = GetBestPricingObject(v)
        If Not pricing Is Nothing Then
            unitPrice = GetUnitPriceFromPricing(pricing, quantity)
            If unitPrice > 0 Then
                bestPrice = unitPrice
                havePrice = True
                Exit For  ' for now, just take the first valid package
            End If
        End If
    Next v
    
    If havePrice Then
        ExtendedPrice = bestPrice * quantity
        GetUnitPriceForQuantity = bestPrice
    Else
        ExtendedPrice = 0
        GetUnitPriceForQuantity = 0
    End If
    
End Function

' Special logic ONLY for Cut Tape (CT) + Tape & Reel (TR)
' Uses TR in multiples of its minimum break (e.g. 3000), remainder on CT
Private Function GetCTTRSplitUnitPrice( _
    ByVal ProductVariations As Object, _
    ByVal quantity As Long, _
    Optional ByRef ExtendedPrice As Double) As Double

    Dim trVar As Object, ctVar As Object, v As Object
    Dim trPricing As Object, ctPricing As Object
    Dim trStep As Long, maxReels As Long
    Dim r As Long
    Dim qTR As Long, qCT As Long
    Dim ext As Double, bestExt As Double
    Dim hasTR As Boolean, hasCT As Boolean
    
    ' Find CT and TR again (local)
    For Each v In ProductVariations
        If v.Exists("PackageType") Then
            Select Case v("PackageType")("Name")
                Case "Tape & Reel (TR)"
                    Set trVar = v
                    hasTR = True
                Case "Cut Tape (CT)"
                    Set ctVar = v
                    hasCT = True
            End Select
        End If
    Next v
    
    If Not hasTR Or Not hasCT Then
        ExtendedPrice = 0
        GetCTTRSplitUnitPrice = 0
        Exit Function
    End If
    
    Set trPricing = GetBestPricingObject(trVar)
    Set ctPricing = GetBestPricingObject(ctVar)
    
    If trPricing Is Nothing Or ctPricing Is Nothing Then
        ExtendedPrice = 0
        GetCTTRSplitUnitPrice = 0
        Exit Function
    End If
    
    trStep = GetMinBreakQty(trPricing)   ' e.g. 3000
    If trStep <= 0 Then
        ' Fallback: everything on CT
        ext = quantity * GetUnitPriceFromPricing(ctPricing, quantity)
        ExtendedPrice = ext
        GetCTTRSplitUnitPrice = ext / quantity
        Exit Function
    End If
    
    maxReels = quantity \ trStep
    bestExt = -1
    
    ' Try all valid combinations: r reels (TR) + remainder on CT
    For r = 0 To maxReels
        qTR = r * trStep
        qCT = quantity - qTR
        
        ext = 0
        
        If qTR > 0 Then
            ext = ext + qTR * GetUnitPriceFromPricing(trPricing, qTR)
        End If
        
        If qCT > 0 Then
            ext = ext + qCT * GetUnitPriceFromPricing(ctPricing, qCT)
        End If
        
        If bestExt < 0 Or ext < bestExt Then
            bestExt = ext
        End If
    Next r
    
    If bestExt < 0 Then
        ExtendedPrice = 0
        GetCTTRSplitUnitPrice = 0
    Else
        ExtendedPrice = bestExt
        GetCTTRSplitUnitPrice = bestExt / quantity
    End If
    
End Function
' Prefer MyPricing if present and non-empty, otherwise StandardPricing
Private Function GetBestPricingObject(variation As Object) As Object
    On Error Resume Next
    
    If variation.Exists("MyPricing") Then
        If Not variation("MyPricing") Is Nothing Then
            If variation("MyPricing").count > 0 Then
                Set GetBestPricingObject = variation("MyPricing")
                Exit Function
            End If
        End If
    End If
    
    If variation.Exists("StandardPricing") Then
        If Not variation("StandardPricing") Is Nothing Then
            If variation("StandardPricing").count > 0 Then
                Set GetBestPricingObject = variation("StandardPricing")
                Exit Function
            End If
        End If
    End If
    
    ' If neither exists or both empty, Nothing is returned
End Function
Private Function GetMinBreakQty(pricing As Object) As Long
    Dim br As Object
    Dim first As Boolean
    Dim qty As Long, minQty As Long
    
    first = True
    For Each br In pricing
        qty = CLng(br("BreakQuantity"))
        If first Or qty < minQty Then
            minQty = qty
            first = False
        End If
    Next br
    
    If first Then
        GetMinBreakQty = 0
    Else
        GetMinBreakQty = minQty
    End If
End Function
' Given a pricing list (StandardPricing/MyPricing) and a quantity,
' returns the correct Digi-Key-style unit price using price breaks.
Private Function GetUnitPriceFromPricing(pricing As Object, qty As Long) As Double
    Dim br As Object
    Dim bestBreak As Long
    Dim bestPrice As Double
    Dim haveBreak As Boolean
    Dim curQty As Long, curPrice As Double
    
    ' 1) Find the largest BreakQuantity <= qty
    For Each br In pricing
        curQty = CLng(br("BreakQuantity"))
        curPrice = CDbl(br("UnitPrice"))
        
        If curQty <= qty Then
            If Not haveBreak Or curQty > bestBreak Then
                bestBreak = curQty
                bestPrice = curPrice
                haveBreak = True
            End If
        End If
    Next br
    
    ' 2) If none <= qty, use the smallest break
    If Not haveBreak Then
        haveBreak = False
        For Each br In pricing
            curQty = CLng(br("BreakQuantity"))
            curPrice = CDbl(br("UnitPrice"))
            
            If Not haveBreak Or curQty < bestBreak Then
                bestBreak = curQty
                bestPrice = curPrice
                haveBreak = True
            End If
        Next br
    End If
    
    If haveBreak Then
        GetUnitPriceFromPricing = bestPrice
    Else
        GetUnitPriceFromPricing = 0
    End If
End Function


Sub enableEvents()

        Application.ScreenUpdating = True
        Application.DisplayAlerts = True
End Sub
