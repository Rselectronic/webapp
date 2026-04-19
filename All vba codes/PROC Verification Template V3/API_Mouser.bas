Attribute VB_Name = "API_Mouser"
Sub MakeMouserRequest(ws As Worksheet, k As Long, distPN As String, customerDescription As String, Optional PNtoUse As String)

    Dim apiKey As String
    Dim requestPayload As String
    Dim responseText As String
    Dim objHTTP As Object
    Dim jsonResponse As Object
    Dim rowNum As Long
    Dim PP As Worksheet

    
    
    ' Set the URL and API Key
    url = "https://api.mouser.com/api/v1/search/keyword?apiKey=bc62cf5b-6602-4919-b85f-ccfa6d711d2c"
    apiKey = "bc62cf5b-6602-4919-b85f-ccfa6d711d2c"     'this is Anas's api key
    
    ' Construct the JSON payload
    requestPayload = "{""SearchByKeywordRequest"": {""keyword"": " & """" & distPN & """,""records"": 0,""startingRecord"": 0,""searchOptions"": """",""searchWithYourSignUpLanguage"": """"}}"
        
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
    
    
    
    
'=======================================================Parse Json====================================================================

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
    For Each PART In parts
        If PART("MouserPartNumber") = distPN Then
            Set specificPart = PART
            Exit For
        End If
    Next PART

    If Not specificPart Is Nothing Then
        Dim MFR As String
        Dim MPN As String
        Dim Description As String
        
        On Error Resume Next
        MFR = specificPart("Manufacturer")
        MPN = specificPart("ManufacturerPartNumber")
        Description = specificPart("Description")
        On Error GoTo 0
        
        ws.Cells(k, VF_DistMPN_Column) = MPN
        ws.Cells(k, VF_DistMFR_Column) = MFR
        ws.Cells(k, VF_DistDescription_Column) = Description
        
        ' match the mouser MPN with Customer MPN
        If Replace(Replace(MPN, "-", ""), " ", "") = Replace(Replace(ws.Cells(k, VF_CustomerMPN_Column), "-", ""), " ", "") Then
            ws.Cells(k, VF_MPNmatch_Column) = True
        ElseIf MPN Like WorksheetFunction.Rept("#", Len(MPN)) Then
            If CStr(Val(Replace(MPN, " ", ""))) = CStr(Val(Replace(ws.Cells(k, VF_CustomerMPN_Column), " ", ""))) Then
                ws.Cells(k, VF_MPNmatch_Column) = True
            End If
        Else
            ws.Cells(k, VF_MPNmatch_Column) = False
                    
            ' try to match the values if it is resistor or capacitor
            ' get values from customer description and mouser description
            Dim mouserDescription As String
            mouserDescription = specificPart("Description")
            
            Dim customerDescriptionJson As String, mouserDescriptionJson As String
            customerDescriptionJson = ExtractComponentAsJson(customerDescription)
            mouserDescriptionJson = ExtractComponentAsJson(mouserDescription)
            
            Dim CustomerjsonDescription As Object
            Dim mouserjsonDescription As Object
            Dim matchScore As Long
            
            matchScore = 0
            Set CustomerjsonDescription = JsonConverter.ParseJson(customerDescriptionJson)
            Set mouserjsonDescription = JsonConverter.ParseJson(mouserDescriptionJson)
                        
            If InStr(1, mouserDescription, "Resistor") > 0 Then
                        
                ' match package
                If CustomerjsonDescription("package") = mouserjsonDescription("package") Then
                    matchScore = matchScore + 1
                End If
                
                ' match resistance
                Dim rawValue As Variant
                rawValue = apiResistance
                If CustomerjsonDescription("resistance") = mouserjsonDescription("resistance") Then
                    matchScore = matchScore + 1
                ElseIf CustomerjsonDescription("resistance_ohm") = mouserjsonDescription("resistance_ohm") Then
                    matchScore = matchScore + 1
                End If
                
                ' match wattage
                Dim customerWatt As String, mouserWatt As String, customerWatt_mw As String
                customerWatt = Replace(CustomerjsonDescription("wattage"), " ", "")
                customerWatt_mw = Replace(CustomerjsonDescription("wattage_mw"), " ", "")
                mouserWatt = Replace(mouserjsonDescription("wattage"), " ", "")
                If customerWatt = mouserWatt Then
                    matchScore = matchScore + 1
                ElseIf CompareMilliwatts(customerWatt, mouserWatt) < 0 Then
                    matchScore = matchScore + 1
                ElseIf CompareMilliwatts(customerWatt_mw, mouserWatt) < 0 Then
                    matchScore = matchScore + 1
                End If
                
                ' match tolerance
                If CustomerjsonDescription("tolerance") = mouserjsonDescription("tolerance") Then
                    matchScore = matchScore + 1
                End If
                
                If matchScore = 4 Then
                    ws.Cells(k, VF_AttributeMatch_Column) = True
                End If
                
            
            ElseIf InStr(1, mouserDescription, "Capacitor") > 0 Then
            
                ' match package
                If CustomerjsonDescription("package") = mouserjsonDescription("package") Then
                    matchScore = matchScore + 1
                End If
                
                ' match capacitance
                If LCase(CustomerjsonDescription("capacitance")) = LCase(mouserjsonDescription("capacitance")) Then
                    matchScore = matchScore + 1
                Else
                    Dim cap1 As Variant, cap2 As Variant
                    cap1 = NormalizeCapacitanceToPF(CStr(CustomerjsonDescription("capacitance")))
                    cap2 = NormalizeCapacitanceToPF(CStr(mouserjsonDescription("capacitance")))
                    
                    If cap1 = cap2 Then ' allow small tolerance, e.g., 1 pF
                        matchScore = matchScore + 1
                    End If
                End If
                
                
                ' match voltage
                If Replace(CustomerjsonDescription("voltage"), " ", "") = Replace(mouserjsonDescription("voltage"), " ", "") Then
                    matchScore = matchScore + 1
                End If
                
                
                ' match tolerance
                If Replace(CustomerjsonDescription("tolerance"), " ", "") = Replace(mouserjsonDescription("tolerance"), " ", "") Then
                    matchScore = matchScore + 1
                End If
                
                
                ' match temp coff
                If CustomerjsonDescription("tempCoeff") = mouserjsonDescription("tempCoeff") Then
                    matchScore = matchScore + 1
                Else
                    Dim customerTempCoefficient As String, mouserTempCoff As String
                    customerTempCoefficient = NormalizeTempCoefficient(CStr(CustomerjsonDescription("tempCoeff")))
                    mouserTempCoff = NormalizeTempCoefficient(CStr(mouserjsonDescription("tempCoeff")))
                    If customerTempCoefficient = apiTempCoff Then
                        matchScore = matchScore + 1
                    End If
                    
                End If
            End If
            ' get other names from Digikey
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
    End If
End Sub
