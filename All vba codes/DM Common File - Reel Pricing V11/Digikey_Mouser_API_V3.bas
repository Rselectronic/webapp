Attribute VB_Name = "Digikey_Mouser_API_V3"
Public AccessToken As String
Sub GetPriceBreakDown(wsName As String, response1 As VbMsgBoxResult)

turnoffscreenUpdate

    Dim url As String
    Dim partNumber As String
    Dim clientID As String
    Dim clientSecret As String
    Dim request As Object
    Dim response As Object
    
    Dim ProductInfo As String
    
    ' Define your Digikey API credentials
    clientID = "kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4"
    clientSecret = "qIiFSGbrfzqBxGLr"
  
    Dim PriceCalc As Worksheet
    Set PriceCalc = ThisWorkbook.Sheets("Price Calc")
    
    ' define location to save json data
    Dim JsonFolderPath As String
    Dim fullPath As String
    Dim parentFolderName As String
    
    fullPath = GetLocalPath(ThisWorkbook.fullName)
    parentFolderName = ExtractFolderName(fullPath)
    JsonFolderPath = Left(fullPath, InStr(1, fullPath, parentFolderName, vbTextCompare) + Len(parentFolderName)) & "6. BACKEND\JSON DATA\"
    
    
                        ' Initialize UserForm and ProgressBar (Label)
                        Dim UserForm As Object
                        UserForm1.Show vbModeless
                        UserForm1.Caption = "Digikey & Mouser API"
                        UserForm1.width = 246
                        UserForm1.Height = 187.4
                        
                        ' Create and format the Label to simulate a progress bar
                        Set ProgressBar1 = UserForm1.Controls.Add("Forms.Label.1", , True)
                        ProgressBar1.Name = "ProgressBar1" '
                        UserForm1.ProgressFrame.Caption = "Validating Access Token"
                        'UserForm1.lblmainProgCaption.Caption = "Getting Data"
                        UserForm1.lblsubProgCaption.Caption = "Part Number"
                        'UserForm1.lblmainProgPerc.Width = 0
                        'UserForm1.lblmainProgPercDisp.Caption = 0 & "%"
                        UserForm1.lblsubProgPerc.width = 0
                        UserForm1.lblsubProgPercDisp.Caption = 0 & "%"
                        ProgressBar1.Caption = ""
                        'ProgressBar1.BackColor = RGB(0, 0, 255) ' Blue color
                        'ProgressBar1.Height = 40 ' Adjust height as needed
                        'ProgressBar1.Width = 0 ' Initialize the width to 0
                        
                        UserForm1.Show vbModeless
                        DoEvents
                        
                        AccessToken = GetAccessToken
                        
                        Dim accessTokenJson As Object
                        Set accessTokenJson = JsonConverter.ParseJson(AccessToken)
                        
                        AccessToken = accessTokenJson("access_token")
                        
                        
        
    
    
    Dim dis As Worksheet
    Dim r, lr As Long
    
    Set dis = ThisWorkbook.Sheets(wsName)
    lr = dis.Cells(dis.Rows.count, "G").End(xlUp).Row
    
    Dim dataArray() As Variant
    dataArray = dis.Range("A4:BG" & lr).value
    'For r = 4 To lr
    r = 1
    Do While r <= UBound(dataArray, 1)
    'check if distributer is "Digikey" or "Mouser"
    If dataArray(r, 16) = "Digikey" Then
    
    ' run digikey code
    partNumber = dataArray(r, 17)
    
    If partNumber <> "" Then
    
    UserForm1.lblsubProgCaption.Caption = "Digikey " & """" & partNumber & """"
    
    Dim encodedString As String
    Dim position As Integer
    position = InStr(partNumber, "/")
    
    
    If position > 0 Then
        ' Replace "/" with "%2F" if it's present
        encodedString = Replace(partNumber, "/", "%2F")
        partNumber = encodedString
    Else
        ' No "/" found, keep the original string
    End If
    
    ' get the json data from storage if exixts
    ProductInfo = ReadJSONFromFile(JsonFolderPath & UrlEncodeDigikeyKey(partNumber) & ".json", response1)
    
    If ProductInfo <> "" Then
        GoTo skipAPIcall_Digikey
    End If
    
    
'      AccessToken = ThisWorkbook.Sheets("Authorization").Range("B2")
    
    ' Check if access token is obtained
'    If AccessToken <> "" Then
'                If Now() > ThisWorkbook.Sheets("Authorization").Range("C2") Then
'                    Call RefreshAccessToken
'                End If

        ' Define the API URL to get product details
        'URL = "https://api.digikey.com/v1/products/" & PartNumber
        'url = "https://api.digikey.com/Search/v3/Products/" & partNumber
        url = "https://api.digikey.com/products/v4/search/" & partNumber & "/productdetails"            ' updated as per api V4
        
        ' Create the HTTP request for product details
        Set request = CreateObject("MSXML2.ServerXMLHTTP.6.0")
        
        ' Set the request method and URL
        request.Open "GET", url, False
        
        
        ' Set the request headers with the access token
        request.setRequestHeader "Content-Type", "application/x-www-form-urlencoded"
        request.setRequestHeader "X-DIGIKEY-Client-Id", clientID
        request.setRequestHeader "X-DIGIKEY-Client-Secret", clientSecret
        request.setRequestHeader "X-DIGIKEY-Locale-Site", "CA"
        request.setRequestHeader "X-DIGIKEY-Locale-Currency", "CAD"
        request.setRequestHeader "Authorization", "Bearer " & AccessToken
        request.setRequestHeader "X-DIGIKEY-Customer-Id", "12161503"
        
        ' Send the request to get product details
        request.send
        
        ' Parse the JSON response to get product information
        ProductInfo = request.responseText
        
        ' save the json data
        SaveJSONToFile ProductInfo, JsonFolderPath, UrlEncodeDigikeyKey(partNumber) & ".json"
    

    
skipAPIcall_Digikey:

    Dim jsonText As String
    Dim jsonObj As Object
    Dim packageCaseValue As String
    
    
    ' JSON data
    jsonText = ProductInfo ' Replace with your JSON data
    
    ' Create a JSON parser
    Set jsonObj = JsonConverter.ParseJson(jsonText)
    
    If jsonObj("status") = "" Then
        
    Dim QuantityAvailable As String
    'QuantityAvailable = jsonObj("QuantityAvailable")
    QuantityAvailable = jsonObj("Product")("QuantityAvailable")             ' changed as per new API v4
    'Debug.Print QuantityAvailable
    'ActiveCell.Offset(0, 2) = QuantityAvailable
    dataArray(r, 15) = QuantityAvailable
    
    'get Manufacturer name
    Dim manufacturerValue As String
    
    On Error Resume Next
    'manufacturerValue = jsonObj("Manufacturer")("Value")
    'ActiveCell.Offset(0, 12) = manufacturerValue
    On Error GoTo 0
    
    ' get the standard package quantity
    Dim standardQty As Long
    standardQty = jsonObj("Product")("ProductVariations")(1)("StandardPackage")
    
    If standardQty < 1 Then
        standardQty = jsonObj("Product")("ProductVariations")(1)("MinimumOrderQuantity")
    End If
    
    If standardQty < 1 Then
        Dim DataObj As New MSForms.DataObject
        DataObj.SetText partNumber
        DataObj.PutInClipboard
        standardQty = InputBox("Please input Standard Qty or Minimum Order Quantity (MOQ)" & vbNewLine & "(Part Number already copied to clipboard)", "SPQ")
        DataObj.SetText ""
        DataObj.PutInClipboard
    End If
    
    dataArray(r, 59) = standardQty
    
    If jsonObj("Product")("ProductVariations")(1)("PackageType")("Name") = "Bulk" Or jsonObj("Product")("ProductVariations")(1)("PackageType")("Name") = "Box" Or jsonObj("Product")("ProductVariations")(1)("PackageType")("Name") = "Tube" Or jsonObj("Product")("ProductVariations")(1)("PackageType")("Name") = "Tray" Then
        standardQty = 99999                 ' so that it does not generate the new line based on standard package
    End If
    
    ' Access the "StandardPricing" array
    Dim pricingArray As Collection
    Dim pricingItem As Object
    Dim breakQuantity As Long
    Dim UnitPrice As Double
    Dim i As Integer
    
    
    If jsonObj.Exists("Product") Then
    
        ' Get the ProductVariations array
        Dim productVariations As Object
        Dim j As Long
        Dim p As Long
        p = 1
        Set productVariations = jsonObj("Product")("ProductVariations")
        
        ' Loop through the product variations and get cut tape price
        For i = 1 To productVariations.count
            ' Check if the package type is "Cut Tape (CT)"
            If productVariations(i)("PackageType")("Name") = "Cut Tape (CT)" Then
                ' Get the MyPricing array
                Set pricingArray = productVariations(i)("MyPricing")
                If pricingArray.count = 0 Then
                    Set pricingArray = productVariations(i)("StandardPricing")
                End If
                ' Loop through the MyPricing breakdowns
                For j = 1 To pricingArray.count
                    Dim pricing As Object
                    Set pricing = pricingArray(j)
                    PriceCalc.Cells(p, "A") = pricing("BreakQuantity")
                    PriceCalc.Cells(p, "B") = pricing("UnitPrice")
                    p = p + 1
                Next j
                ' Exit the loop after processing the Cut Tape (CT) pricing
                Exit For
            End If
        Next i
        
        ' Loop through the product variations and get tape and reel price
        For i = 1 To productVariations.count
            ' Check if the package type is "Tape & Reel (TR)"
            If productVariations(i)("PackageType")("Name") = "Tape & Reel (TR)" Then
                ' Get the MyPricing array
                Set pricingArray = productVariations(i)("MyPricing")
                If pricingArray.count = 0 Then
                    Set pricingArray = productVariations(i)("StandardPricing")
                End If
                ' Loop through the MyPricing breakdowns
                For j = 1 To pricingArray.count
                    Set pricing = pricingArray(j)
                    PriceCalc.Cells(p, "A") = pricing("BreakQuantity")
                    PriceCalc.Cells(p, "B") = pricing("UnitPrice")
                    p = p + 1
                Next j
                ' Exit the loop after processing the Cut Tape (CT) pricing
                Exit For
            End If
        Next i
        
        ' Loop through the product variations and get bulk price
        For i = 1 To productVariations.count
            ' Check if the package type is "Bulk"
            If productVariations(i)("PackageType")("Name") = "Bulk" Then
                ' Get the MyPricing array
                Set pricingArray = productVariations(i)("MyPricing")
                If pricingArray.count = 0 Then
                    Set pricingArray = productVariations(i)("StandardPricing")
                End If
                ' Loop through the MyPricing breakdowns
                For j = 1 To pricingArray.count
                    Set pricing = pricingArray(j)
                    PriceCalc.Cells(p, "A") = pricing("BreakQuantity")
                    PriceCalc.Cells(p, "B") = pricing("UnitPrice")
                    p = p + 1
                Next j
                ' Exit the loop after processing the Cut Tape (CT) pricing
                Exit For
            End If
        Next i
        
         ' Loop through the product variations and get tube price
        For i = 1 To productVariations.count
            ' Check if the package type is "Bulk"
            If productVariations(i)("PackageType")("Name") = "Tube" Then
                ' Get the MyPricing array
                Set pricingArray = productVariations(i)("MyPricing")
                If pricingArray.count = 0 Then
                    Set pricingArray = productVariations(i)("StandardPricing")
                End If
                ' Loop through the MyPricing breakdowns
                For j = 1 To pricingArray.count
                    Set pricing = pricingArray(j)
                    PriceCalc.Cells(p, "A") = pricing("BreakQuantity")
                    PriceCalc.Cells(p, "B") = pricing("UnitPrice")
                    p = p + 1
                Next j
                ' Exit the loop after processing the Cut Tape (CT) pricing
                Exit For
            End If
        Next i
    
    
         ' Loop through the product variations and get tube price
        For i = 1 To productVariations.count
            ' Check if the package type is "Bulk"
            If productVariations(i)("PackageType")("Name") = "Tray" Then
                ' Get the MyPricing array
                Set pricingArray = productVariations(i)("MyPricing")
                If pricingArray.count = 0 Then
                    Set pricingArray = productVariations(i)("StandardPricing")
                End If
                ' Loop through the MyPricing breakdowns
                For j = 1 To pricingArray.count
                    Set pricing = pricingArray(j)
                    PriceCalc.Cells(p, "A") = pricing("BreakQuantity")
                    PriceCalc.Cells(p, "B") = pricing("UnitPrice")
                    p = p + 1
                Next j
                ' Exit the loop after processing the Cut Tape (CT) pricing
                Exit For
            End If
        Next i
        
         ' Loop through the product variations and get tube price
        For i = 1 To productVariations.count
            ' Check if the package type is "Bulk"
            If productVariations(i)("PackageType")("Name") = "Box" Then
                ' Get the MyPricing array
                Set pricingArray = productVariations(i)("MyPricing")
                If pricingArray.count = 0 Then
                    Set pricingArray = productVariations(i)("StandardPricing")
                End If
                ' Loop through the MyPricing breakdowns
                For j = 1 To pricingArray.count
                    Set pricing = pricingArray(j)
                    PriceCalc.Cells(p, "A") = pricing("BreakQuantity")
                    PriceCalc.Cells(p, "B") = pricing("UnitPrice")
                    p = p + 1
                Next j
                ' Exit the loop after processing the Cut Tape (CT) pricing
                Exit For
            End If
        Next i
        
         ' Loop through the product variations and get tube price
        For i = 1 To productVariations.count
            ' Check if the package type is "Bulk"
            If productVariations(i)("PackageType")("Name") = "Bag" Then
                ' Get the MyPricing array
                Set pricingArray = productVariations(i)("MyPricing")
                If pricingArray.count = 0 Then
                    Set pricingArray = productVariations(i)("StandardPricing")
                End If
                ' Loop through the MyPricing breakdowns
                For j = 1 To pricingArray.count
                    Set pricing = pricingArray(j)
                    PriceCalc.Cells(p, "A") = pricing("BreakQuantity")
                    PriceCalc.Cells(p, "B") = pricing("UnitPrice")
                    p = p + 1
                Next j
                ' Exit the loop after processing the Cut Tape (CT) pricing
                Exit For
            End If
        Next i
        
          ' Loop through the product variations and get tube price
        For i = 1 To productVariations.count
            ' Check if the package type is "Bulk"
            If productVariations(i)("PackageType")("Name") = "Strip" Then
                ' Get the MyPricing array
                Set pricingArray = productVariations(i)("MyPricing")
                If pricingArray.count = 0 Then
                    Set pricingArray = productVariations(i)("StandardPricing")
                End If
                ' Loop through the MyPricing breakdowns
                For j = 1 To pricingArray.count
                    Set pricing = pricingArray(j)
                    PriceCalc.Cells(p, "A") = pricing("BreakQuantity")
                    PriceCalc.Cells(p, "B") = pricing("UnitPrice")
                    p = p + 1
                Next j
                ' Exit the loop after processing the Cut Tape (CT) pricing
                Exit For
            End If
        Next i
        

    
    
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
    
    Dim Breakqty1 As Long, Breakqty2, Rate As Long
    Dim reelqty1 As Long, reelqty2 As Long, reelqty3 As Long, reelqty4 As Long
    Dim qty1 As Long, qty2 As Long, qty3 As Long, qty4 As Long
    Dim qty1reelextPrice As Double, qty2reelextPrice As Double, qty3reelextPrice As Double, qty4reelextPrice As Double
    Dim qty1reelunitPrice As Double, qty2reelunitPrice As Double, qty3reelunitPrice As Double, qty4reelunitPrice As Double
    Dim qty1sum As Double, qty2sum As Double, qty3sum As Double, qty4sum As Double
    Dim ctQty1 As Long, ctQty2 As Long, ctQty3 As Long, ctQty4 As Long
    Dim ctqty1Unitprice As Double, ctqty2Unitprice As Double, ctqty3Unitprice As Double, ctqty4Unitprice As Double
    Dim ctqty1Extprice As Double, ctqty2Extprice As Double, ctqty3Extprice As Double, ctqty4Extprice As Double
    Dim newLine As Boolean
    
    newLine = False
    
    
    Dim pricecalcLR As Long
    pricecalcLR = PriceCalc.Cells(PriceCalc.Rows.count, "A").End(xlUp).Row
    Dim priceCalcPricing As Range
    Set priceCalcPricing = PriceCalc.Range(PriceCalc.Cells(1, 1), PriceCalc.Cells(pricecalcLR, "B"))
    
    
    


    If pricecalcLR > 0 Then
    
    'get unit price and ext Price for qty1
        qty1 = dataArray(r, 23)
        If qty1 / standardQty >= 1 Then
            'create a new line for reel qty
            If newLine = False Then
                Dim newArray() As Variant
                ReDim newArray(LBound(dataArray, 1) To UBound(dataArray, 1) + 1, LBound(dataArray, 2) To UBound(dataArray, 2))
                
                ' Copy original data to the new array
                For i = LBound(dataArray, 1) To UBound(dataArray, 1)
                    For j = LBound(dataArray, 2) To UBound(dataArray, 2)
                        newArray(i, j) = dataArray(i, j)
                    Next j
                Next i
                
                'ThisWorkbook.Sheets("Sheet1").Range("A1:BG" & UBound(newArray)).Value = newArray

                ' Shift rows down starting from the last row to current row + 1
                For i = UBound(newArray, 1) To r + 1 Step -1
                    For j = 1 To UBound(newArray, 2)
                        newArray(i, j) = newArray(i - 1, j)
                    Next j
                    'ThisWorkbook.Sheets("Sheet1").Range("A1:BG" & UBound(newArray)).Value = newArray
                Next i

                ' Leave the blank row just below the current row
                For j = 1 To UBound(newArray, 2)
                    newArray(r + 1, j) = Empty
                Next j
                
                ' copy only procurement data to new line
                For j = 6 To 17
                    If j >= 6 And j <= 9 Or j >= 16 And j <= 17 Then
                        newArray(r + 1, j) = newArray(r, j)
                    End If
                Next j

                
                'ThisWorkbook.Sheets("Sheet1").Range("A1:BG" & UBound(newArray)).Value = newArray
                
                newLine = True
            End If
            
            reelqty1 = (qty1 \ standardQty)
            reelqty1 = reelqty1 * standardQty
                'get the reel price
                newArray(r + 1, 23) = reelqty1
                qty1reelunitPrice = Application.WorksheetFunction.VLookup(reelqty1, priceCalcPricing, 2, True)
                newArray(r + 1, 24) = qty1reelunitPrice
            ctQty1 = qty1 Mod standardQty
            If ctQty1 <> 0 Then
                'get the cut tape price
                newArray(r, 23) = ctQty1
                ctqty1Unitprice = Application.WorksheetFunction.VLookup(ctQty1, priceCalcPricing, 2, True)
                newArray(r, 24) = ctqty1Unitprice
            Else
                newArray(r, 23) = 0
            End If
        Else
        ' when the order qty is less then reel qty then get the cut tape price
            newArray = dataArray
            ctQty1 = qty1
            On Error Resume Next
            ctqty1Unitprice = Application.WorksheetFunction.VLookup(ctQty1, priceCalcPricing, 2, True)
            On Error GoTo 0
            If ctqty1Unitprice = 0 Then
                newArray(r, 24) = "Error"
            Else
                newArray(r, 24) = ctqty1Unitprice
            End If
            dataArray = newArray
        End If
        'ThisWorkbook.Sheets("Sheet1").Range("A1:BG" & UBound(newArray)).Value = newArray
        
    'get unit price and ext Price for qty2
        qty2 = dataArray(r, 28)
        If qty2 > 0 Then
            If qty2 / standardQty >= 1 Then
                'create a new line for reel qty
                If newLine = False Then
                    ReDim newArray(LBound(dataArray, 1) To UBound(dataArray, 1) + 1, LBound(dataArray, 2) To UBound(dataArray, 2))
                    
                    ' Copy original data to the new array
                    For i = LBound(dataArray, 1) To UBound(dataArray, 1)
                        For j = LBound(dataArray, 2) To UBound(dataArray, 2)
                            newArray(i, j) = dataArray(i, j)
                        Next j
                    Next i
                    ' Shift rows down starting from the last row to current row + 1
                    For i = UBound(newArray, 1) To r + 1 Step -1
                        For j = 1 To UBound(newArray, 2)
                            newArray(i, j) = newArray(i - 1, j)
                        Next j
                    Next i
    
                    ' Leave the blank row just below the current row
                    For j = 1 To UBound(newArray, 2)
                        newArray(r + 1, j) = Empty
                    Next j
                    
                    ' copy only procurement data to new line
                    For j = 6 To 17
                    If j >= 6 And j <= 9 Or j >= 16 And j <= 17 Then
                        newArray(r + 1, j) = newArray(r, j)
                    End If
                Next j
                    
                    newLine = True
                End If
                
                reelqty2 = (qty2 \ standardQty)
                reelqty2 = reelqty2 * standardQty
                    'get the reel price
                    newArray(r + 1, 28) = reelqty2
                    qty2reelunitPrice = Application.WorksheetFunction.VLookup(reelqty2, priceCalcPricing, 2, True)
                    newArray(r + 1, 29) = qty2reelunitPrice
                ctQty2 = qty2 Mod standardQty
                If ctQty2 <> 0 Then
                    'get the cut tape price
                    newArray(r, 28) = ctQty2
                    ctqty2Unitprice = Application.WorksheetFunction.VLookup(ctQty2, priceCalcPricing, 2, True)
                    newArray(r, 29) = ctqty2Unitprice
                Else
                    newArray(r, 28) = 0
                End If
            Else
            ' when the order qty is less then reel qty then get the cut tape price
                newArray = dataArray
                ctQty2 = qty2
                On Error Resume Next
                ctqty2Unitprice = Application.WorksheetFunction.VLookup(ctQty2, priceCalcPricing, 2, True)
                On Error GoTo 0
                If ctqty2Unitprice = 0 Then
                    newArray(r, 29) = "Error"
                Else
                    newArray(r, 29) = ctqty2Unitprice
                End If
                dataArray = newArray
            End If
        End If
        'ThisWorkbook.Sheets("Sheet1").Range("A1:BG" & UBound(newArray)).Value = newArray
    
    
    'get unit price and ext Price for qty3
        qty3 = dataArray(r, 33)
        If qty3 > 0 Then
            If qty3 / standardQty >= 1 Then
                'create a new line for reel qty
                If newLine = False Then
                    ReDim newArray(LBound(dataArray, 1) To UBound(dataArray, 1) + 1, LBound(dataArray, 2) To UBound(dataArray, 2))
                    
                    ' Copy original data to the new array
                    For i = LBound(dataArray, 1) To UBound(dataArray, 1)
                        For j = LBound(dataArray, 2) To UBound(dataArray, 2)
                            newArray(i, j) = dataArray(i, j)
                        Next j
                    Next i
                    ' Shift rows down starting from the last row to current row + 1
                    For i = UBound(newArray, 1) To r + 1 Step -1
                        For j = 1 To UBound(newArray, 2)
                            newArray(i, j) = newArray(i - 1, j)
                        Next j
                    Next i
    
                    ' Leave the blank row just below the current row
                    For j = 1 To UBound(newArray, 2)
                        newArray(r + 1, j) = Empty
                    Next j
                    
                    ' copy only procurement data to new line
                    For j = 6 To 17
                        If j >= 6 And j <= 9 Or j >= 16 And j <= 17 Then
                            newArray(r + 1, j) = newArray(r, j)
                        End If
                    Next j
                    
                    newLine = True
                End If
                
                reelqty3 = (qty3 \ standardQty)
                reelqty3 = reelqty3 * standardQty
                    'get the reel price
                    newArray(r + 1, 33) = reelqty3
                    qty3reelunitPrice = Application.WorksheetFunction.VLookup(reelqty3, priceCalcPricing, 2, True)
                    newArray(r + 1, 34) = qty3reelunitPrice
                ctQty3 = qty3 Mod standardQty
                If ctQty3 <> 0 Then
                    'get the cut tape price
                    newArray(r, 33) = ctQty3
                    ctqty3Unitprice = Application.WorksheetFunction.VLookup(ctQty3, priceCalcPricing, 2, True)
                    newArray(r, 34) = ctqty3Unitprice
                Else
                    newArray(r, 33) = 0
                End If
            Else
            ' when the order qty is less then reel qty then get the cut tape price
                newArray = dataArray
                ctQty3 = qty3
                On Error Resume Next
                ctqty3Unitprice = Application.WorksheetFunction.VLookup(ctQty3, priceCalcPricing, 2, True)
                On Error GoTo 0
                If ctqty3Unitprice = 0 Then
                    newArray(r, 34) = "Error"
                Else
                    newArray(r, 34) = ctqty3Unitprice
                End If
                dataArray = newArray
            End If
        End If
            'ThisWorkbook.Sheets("Sheet1").Range("A1:BG" & UBound(newArray)).Value = newArray
    
      
      'get unit price and ext Price for qty4
        qty4 = dataArray(r, 38)
        If qty4 > 0 Then
            If qty4 / standardQty >= 1 Then
                'create a new line for reel qty
                If newLine = False Then
                    ReDim newArray(LBound(dataArray, 1) To UBound(dataArray, 1) + 1, LBound(dataArray, 2) To UBound(dataArray, 2))
                    
                    
                    ' Copy original data to the new array
                    For i = LBound(dataArray, 1) To UBound(dataArray, 1)
                        For j = LBound(dataArray, 2) To UBound(dataArray, 2)
                            newArray(i, j) = dataArray(i, j)
                        Next j
                    Next i
                    'ThisWorkbook.Sheets("Sheet1").Range("A1:BG" & UBound(newArray)).Value = newArray
                    
                    ' Shift rows down starting from the last row to current row + 1
                    For i = UBound(newArray, 1) To r + 1 Step -1
                        For j = 1 To UBound(newArray, 2)
                            newArray(i, j) = newArray(i - 1, j)
                        Next j
                    Next i
    'ThisWorkbook.Sheets("Sheet1").Range("A1:BG" & UBound(newArray)).Value = newArray
                    ' Leave the blank row just below the current row
                    For j = 1 To UBound(newArray, 2)
                        newArray(r + 1, j) = Empty
                    Next j
                    
                    ' copy only procurement data to new line
                    For j = 6 To 17
                        If j >= 6 And j <= 9 Or j >= 16 And j <= 17 Then
                            newArray(r + 1, j) = newArray(r, j)
                        End If
                    Next j
                    
                    newLine = True
                End If
                'ThisWorkbook.Sheets("Sheet1").Range("A1:BG" & UBound(newArray)).Value = newArray
                reelqty4 = (qty4 \ standardQty)
                reelqty4 = reelqty4 * standardQty
                    'get the reel price
                    newArray(r + 1, 38) = reelqty4
                    qty4reelunitPrice = Application.WorksheetFunction.VLookup(reelqty4, priceCalcPricing, 2, True)
                    newArray(r + 1, 39) = qty4reelunitPrice
                ctQty4 = qty4 Mod standardQty
                If ctQty4 <> 0 Then
                    'get the cut tape price
                    newArray(r, 38) = ctQty4
                    ctqty4Unitprice = Application.WorksheetFunction.VLookup(ctQty4, priceCalcPricing, 2, True)
                    newArray(r, 39) = ctqty4Unitprice
                Else
                    newArray(r, 38) = 0
                End If
            Else
            ' when the order qty is less then reel qty then get the cut tape price
                newArray = dataArray
                ctQty4 = qty4
                On Error Resume Next
                ctqty4Unitprice = Application.WorksheetFunction.VLookup(ctQty4, priceCalcPricing, 2, True)
                On Error GoTo 0
                If ctqty4Unitprice = 0 Then
                    newArray(r, 39) = "Error"
                Else
                    newArray(r, 39) = ctqty4Unitprice
                End If
                dataArray = newArray
            End If
        End If
        
        
'ThisWorkbook.Sheets("Sheet1").Range("A1:BG" & UBound(newArray)).Value = newArray

        
'  Adjust the loop counter and last row variable
        If newLine = True Then
            r = r + 1 ' Skip the newly inserted row
'            lr = lr + 1 ' Adjust the last row count
        End If
   End If
    
    
    PriceCalc.Range("A2:H50") = ""
    
    
    
    Dim Parameters As Collection
    Dim ParamItem As Object
    Dim ParamName As String
    Dim ParamValue As String
    
'     ' Check if "Parameters" key exists
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
    
    
    
    
    
    
    
    
    
    Else
    dis.Cells(r, "O") = "Part not found"
    End If
    
    
    
'    Else
'        MsgBox "Failed to obtain access token. Check your credentials."
'    End If
    'Loop
    
    Else
        dataArray(r, 18) = "Part not found. " & dataArray(r, 18)
        newArray = dataArray
    End If
    End If






    'ElseIf dis.Cells(r, "P") = "Mouser" Then
    ElseIf dataArray(r, 16) = "Mouser" Then
    ' run mouser API
    
    Dim apiKey As String
    Dim requestPayload As String
    Dim responseText As String
    Dim objHTTP As Object
    Dim jsonResponse As Object
    Dim ws As Worksheet
    Dim rowNum As Long
    Dim PP As Worksheet
    
    
    
    
    UserForm1.lblsubProgCaption.Caption = "Mouser " & """" & dataArray(r, 17) & """"
    ' get the json data from storage if exixts
    responseText = ReadJSONFromFile(JsonFolderPath & dataArray(r, 17) & ".json", response1)
    
    If responseText <> "" Then
        GoTo skipAPIcall_Mouser
    End If
    
    
    
    
    
    
    ' Set the URL and API Key
    url = "https://api.mouser.com/api/v1/search/keyword?apiKey=bc62cf5b-6602-4919-b85f-ccfa6d711d2c"
    apiKey = "3142af4a-e0c2-4574-87a4-dc5b5e3b2f78"     'this is Piyush's api key
    
    'Do While ActiveCell.Value <> ""
    
    ' Construct the JSON payload
    requestPayload = "{""SearchByKeywordRequest"": {""keyword"": " & """" & dataArray(r, 17) & """,""records"": 0,""startingRecord"": 0,""searchOptions"": """",""searchWithYourSignUpLanguage"": """"}}"
    
    UserForm1.lblsubProgCaption.Caption = "Mouser " & """" & dataArray(r, 17) & """"
    
    ' Create an HTTP object
    Set objHTTP = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    
    ' Send a POST request to the API
    With objHTTP
        .Open "POST", url, False
        .setRequestHeader "accept", "application/json"
        .setRequestHeader "Content-Type", "application/json"
        .send requestPayload
        responseText = .responseText
    End With
    
    ' save the json data
    SaveJSONToFile responseText, JsonFolderPath, dataArray(r, 17) & ".json"
    
    'Debug.Print responseText
    
    
'=======================================================Parse Json====================================================================
skipAPIcall_Mouser:
    Dim json As Object
    Set json = JsonConverter.ParseJson(responseText) ' Replace 'yourJsonString' with your JSON response

    On Error Resume Next
    Dim parts As Object
    Set parts = json("SearchResults")("Parts")


    On Error GoTo 0


'--------------------------------------get stock availability--------------------------------------------------------

    Dim specificPart As Object
    Set specificPart = Nothing

    ' Loop through the parts to find the specific part
    For Each part In parts
        If part("MouserPartNumber") = dataArray(r, 17) Then
            Set specificPart = part
                'get the standard Package qty
                Dim attr As Variant
                For Each attr In part("ProductAttributes")
                    If attr("AttributeName") = "Standard Pack Qty" Then
                        StandardPackQty = attr("AttributeValue")
                        Exit For
                    End If
                Next attr
            Exit For
        End If
    Next part

    If Not specificPart Is Nothing Then
        Dim availability As String
        'reset availability
        availability = ""
        Dim MFR As String
        On Error Resume Next
        availability = specificPart("AvailabilityInStock")
        MFR = specificPart("Manufacturer")
        On Error GoTo 0
        'Debug.Print "AvailabilityInStock for " & ActiveCell.Offset(0, 1) & ": " & availability
        dataArray(r, 15) = availability
        'ActiveCell.Offset(0, 12) = mfr
        
        'get the standard packaging qty
        dataArray(r, 59) = StandardPackQty
        
    Else
        'Debug.Print "Part not found: 581-TAJV226K050"
        dataArray(r, 15) = "Part not found"
    End If
    
'---------------------------------------------------------------------------------------------------------------------------------------


'======================================GET PRICEBREAKS==================================================================================

  If Not specificPart Is Nothing Then
        Dim priceBreaks As Collection
        Set priceBreaks = specificPart("PriceBreaks")

        ' Loop through the price breaks and extract Quantity and Price
        
        If priceBreaks.count <> 0 Then
        For i = 1 To priceBreaks.count
            Dim quantity As Long
            Dim price As Double

            Set pricingItem = priceBreaks(i)
            quantity = pricingItem("Quantity")
            price = CleanPrice(pricingItem("Price"))
            
            PriceCalc.Cells(i, "A") = quantity
            PriceCalc.Cells(i, "B") = price
            
            Next i
        
            
            
            If priceBreaks.count > 1 Then
            
            For i = 1 To priceBreaks.count - 1
            qty1 = dataArray(r, 23)
            qty2 = dataArray(r, 28)
            qty3 = dataArray(r, 33)
            qty4 = dataArray(r, 38)
            
            Breakqty1 = PriceCalc.Cells(i, "A")
            Breakqty2 = PriceCalc.Cells(i + 1, "A")
            
            If qty1 >= Breakqty1 And qty1 < Breakqty2 Then
            dataArray(r, 24) = PriceCalc.Cells(i, "B")
            
            ElseIf qty1 >= PriceCalc.Cells(priceBreaks.count, "A") Then
            dataArray(r, 24) = PriceCalc.Cells(priceBreaks.count, "B")
            End If
            
            If qty2 >= Breakqty1 And qty2 < Breakqty2 Then
            dataArray(r, 29) = PriceCalc.Cells(i, "B")
            ElseIf qty2 >= PriceCalc.Cells(priceBreaks.count, "A") Then
            dataArray(r, 29) = PriceCalc.Cells(priceBreaks.count, "B")
            End If
            
            If qty3 >= Breakqty1 And qty3 < Breakqty2 Then
            dataArray(r, 34) = PriceCalc.Cells(i, "B")
            ElseIf qty3 >= PriceCalc.Cells(priceBreaks.count, "A") Then
            dataArray(r, 34) = PriceCalc.Cells(priceBreaks.count, "B")
            End If
            
            If qty4 >= Breakqty1 And qty4 < Breakqty2 Then
            dataArray(r, 39) = PriceCalc.Cells(i, "B")
            ElseIf qty4 >= PriceCalc.Cells(priceBreaks.count, "A") Then
            dataArray(r, 39) = PriceCalc.Cells(priceBreaks.count, "B")
            End If
    
            Next i
    
        Else
        
        ' we will directly put the unit price to all the quantities
            If dataArray(r, 23) <> "" Then
            dataArray(r, 24) = price
            End If
            
            If dataArray(r, 28) <> "" Then
            dataArray(r, 29) = price
            End If
            
            If dataArray(r, 33) <> "" Then
            dataArray(r, 34) = price
            End If
            
            If dataArray(r, 38) <> "" Then
            dataArray(r, 39) = price
            End If
        newArray = dataArray
        End If
        End If
            newArray = dataArray
            PriceCalc.Range("A1:B50") = ""
            
    Else
        'Debug.Print "Part not found: " & ActiveCell.Offset(0, 1)
    End If
    
    
    Else
    UserForm1.lblsubProgCaption.Caption = "Other " & """" & dataArray(r, 17) & """"
    newArray = dataArray
    
    End If

                            ' Update progress bar by changing Label's width
                            UserForm1.Caption = "Digikey & Mouser API"
                            'UserForm1.lblmainProgPercDisp.Caption = Format((r - 3) / (lr - 3), "0.00%")
                            'UserForm1.lblmainProgPerc.Width = ((r - 3) / (lr - 3)) * 180
                            UserForm1.lblsubProgPercDisp.Caption = Format(((r) / UBound(newArray, 1)), "0.00%")
                            UserForm1.lblsubProgPerc.width = ((r) / UBound(newArray, 1)) * 180
                            
                            
                            'UserForm1.Caption = "Progress (" & r - 3 & "/" & lr - 3 & ")....." & Format((r - 3) / (lr - 3), "0.00%")
                            'ProgressBar1.Width = (r / lr) * (UserForm1.Width) ' Adjust the width calculation
                            DoEvents ' Allow the UserForm to update

    'move to next row
    r = r + 1
    dataArray = newArray
    
    ' clear the assigned values
    ctqty1Unitprice = 0
    ctqty2Unitprice = 0
    ctqty3Unitprice = 0
    ctqty4Unitprice = 0
    
    Loop
    
turnonscreenUpdate
    
    'ProgressBar2.Width = 0
dataArray = newArray
dis.Range("A4:BG" & UBound(dataArray) + 3) = dataArray

' Borders and formatting the data
dis.Range("A4:BG" & UBound(dataArray) + 3).Borders.LineStyle = xlContinuous
dis.Rows(4).Copy
dis.Rows("4:" & UBound(dataArray) + 3).PasteSpecial Paste:=xlPasteFormats

'' subtotals at the end
'dis.Cells(UBound(dataArray) + 4, "Y").Formula = "=SUM(Y4:Y" & UBound(dataArray) + 3 & ")"
'dis.Cells(UBound(dataArray) + 4, "AD").Formula = "=SUM(AD4:AD" & UBound(dataArray) + 3 & ")"
'dis.Cells(UBound(dataArray) + 4, "AI").Formula = "=SUM(AI4:AI" & UBound(dataArray) + 3 & ")"
'dis.Cells(UBound(dataArray) + 4, "AN").Formula = "=SUM(AN4:AN" & UBound(dataArray) + 3 & ")"



End Sub

Function ExtractFolderName(ByVal fullPath As String) As String
    Dim folders() As String
    Dim folderName As String
    
    ' Split the path string using backslash as delimiter
    folders = Split(fullPath, "\")
    
    ' Check if there are at least three elements in the array
    If UBound(folders) >= 2 Then
        ' Get the third element which corresponds to the folder name
        folderName = folders(UBound(folders) - 2)
    Else
        ' If the path is invalid, return empty string
        folderName = ""
    End If
    
    ' Return the folder name
    ExtractFolderName = folderName
End Function


Public Function GetAccessToken() As String
    Dim http As Object
    Dim url As String
    Dim response As String

    url = "https://api.digikey.com/v1/oauth2/token"

    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.Open "POST", url, False
    http.setRequestHeader "Content-Type", "application/x-www-form-urlencoded"

    Dim postData As String
    postData = "client_id=" & "kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4" & _
               "&client_secret=" & "qIiFSGbrfzqBxGLr" & _
               "&grant_type=client_credentials"

    http.send postData
    response = http.responseText

    GetAccessToken = response

    Set http = Nothing
End Function


Private Function UrlEncodeDigikeyKey(ByVal s As String) As String
    ' Minimal: DigiKey needs "/" encoded for path segment
    UrlEncodeDigikeyKey = Replace(s, "/", "%2F")
End Function

Function CleanPrice(rawPrice As String) As Double
    Dim i As Integer
    Dim cleanStr As String
    Dim c As String
    
    cleanStr = ""
    
    For i = 1 To Len(rawPrice)
        c = Mid(rawPrice, i, 1)
        ' Keep only digits and decimal point
        If c Like "[0-9]" Or c = "." Then
            cleanStr = cleanStr & c
        End If
    Next i
    
    If cleanStr = "" Then
        CleanPrice = 0
    Else
        CleanPrice = CDbl(cleanStr)
    End If
End Function
