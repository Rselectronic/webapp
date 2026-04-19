Attribute VB_Name = "mod_OthF_Digikey_Response"
Option Compare Text
Sub digikey_response()

    Dim clientID As String
    Dim clientSecret As String
    Dim wb As Workbook
    Dim ws As Worksheet, machineCodeWS As Worksheet, sizeTableWS As Worksheet
    Dim lr As Long, r As Long
    Dim AccessToken As String
    Dim url As String

    ' Define your Digikey API credentials
    clientID = "kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4"
    clientSecret = "qIiFSGbrfzqBxGLr"

    ' Initialize the token and start time
    Dim lastTokenTime As Double, elapsedTime As Double
    
    lastTokenTime = Timer ' Record the current time in seconds
    AccessToken = GetAccessToken
    
    Set wb = ThisWorkbook
    Set ws = wb.ActiveSheet
    Set machineCodeWS = wb.Sheets("MachineCodes")
    Set sizeTableWS = wb.Sheets("Size Table")
    lr = ws.Cells(ws.Rows.count, "A").End(xlUp).Row
    
    Dim partNumber As String
    
    For r = 2 To lr
    partNumber = ws.Cells(r, "A")
    
    ' if Json data is available, then skip the api
    If ws.Cells(r, "J") <> "" Then GoTo skipAPI
    
retryAPI:
        elapsedTime = Timer - lastTokenTime
        
        If elapsedTime > 599 Then
            AccessToken = GetAccessToken
            lastTokenTime = Timer
        End If
        
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
        
        url = "https://api.digikey.com/products/v4/search/" & partNumber & "/productdetails"
        
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
        
        Dim jsonText As String
        Dim jsonObj As Object
        
skipAPI:
        If ws.Cells(r, "J") = "" Then
            jsonText = request.responseText
        Else
            jsonText = ws.Cells(r, "J")
        End If
        
        Set jsonObj = JsonConverter.ParseJson(jsonText)
        
        If jsonObj("status") = "404" Then
            Dim jsonBody As String
            url = "https://api.digikey.com/products/v4/search/keyword"
            jsonBody = "{""Keywords"": " & """" & partNumber & """" & ", ""Limit"": 1}"
            
            request.Open "POST", url, False
            
            ' Set the request headers
            request.setRequestHeader "accept", "application/json"
            request.setRequestHeader "X-DIGIKEY-Client-Id", "kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4"
            request.setRequestHeader "authorization", "Bearer " & AccessToken
            request.setRequestHeader "Content-Type", "application/json"
            
            request.send jsonBody
            jsonText = request.responseText
            Set jsonObj = JsonConverter.ParseJson(jsonText)
            Dim variation As Object
            Dim newProductVariation As Object
            On Error Resume Next
            Set newProductVariation = jsonObj("Products")(1)("ProductVariations")
            On Error GoTo 0
            If newProductVariation Is Nothing Then
                GoTo nextPart
            ElseIf Not newProductVariation Is Nothing And newProductVariation.count > 1 Then
                For Each variation In jsonObj("Products")(1)("ProductVariations")
                    If variation("PackageType")("Name") <> "Tape & Reel (TR)" Then
                        partNumber = variation("DigiKeyProductNumber")
                        ws.Cells(r, "B") = partNumber
                        GoTo retryAPI
                    End If
                Next variation
            ElseIf Not newProductVariation Is Nothing And newProductVariation.count = 1 Then
                For Each variation In jsonObj("Products")(1)("ProductVariations")
                    partNumber = variation("DigiKeyProductNumber")
                    ws.Cells(r, "B") = partNumber
                    GoTo retryAPI
                Next variation
            Else
                GoTo nextPart
            End If
        ElseIf jsonObj("status") = "500" Or jsonObj("status") = "502" Then
            GoTo retryAPI
        End If
        
        Dim ProductDescription As String
        Dim DetailedDescription As String
        Dim Manufacturer As String
        Dim ManufacturerProductNumber As String
        Dim category As String
        Dim ProductStatus As String
        
        On Error Resume Next
        ProductDescription = jsonObj("Product")("Description")("ProductDescription")
        DetailedDescription = jsonObj("Product")("Description")("DetailedDescription")
        Manufacturer = jsonObj("Product")("Manufacturer")("Name")
        ManufacturerProductNumber = jsonObj("Product")("ManufacturerProductNumber")
        category = jsonObj("Product")("Category")("Name")
        On Error GoTo 0
        
        Dim ChildCategories As Object
        Dim ChildCategoryItem As Object
        Dim ChildCategoryName As String
        
        Set ChildCategories = jsonObj("Product")("Category")("ChildCategories")
        If ChildCategories.count > 1 Then
            For Each ChildCategoryItem In ChildCategories
                ChildCategoryName = ChildCategoryName & ", " & ChildCategoryItem("Name")
            Next ChildCategoryItem
            ChildCategoryName = Right(ChildCategoryName, Len(ChildCategoryName) - 2)
        Else
            ChildCategoryName = ChildCategories(1)("Name")
        End If
'        For Each ChildCategoryItem In ChildCategories
'            ChildCategoryName = ChildCategoryItem("Name")
'        Next ChildCategoryItem
        
        ProductStatus = jsonObj("Product")("ProductStatus")("Status")
        
        ws.Cells(r, "C") = category
        ws.Cells(r, "D") = ChildCategoryName
        ws.Cells(r, "E") = ProductStatus
        ws.Cells(r, "F") = ProductDescription
        ws.Cells(r, "G") = DetailedDescription
        ws.Cells(r, "H") = Manufacturer
        ws.Cells(r, "I") = ManufacturerProductNumber
        
        
        Dim Parameters As Object
        Dim ParamItem As Object
        Dim ParamName As String
        Dim ParamValue As String
        Dim lastCol As Long
        
        lastCol = ws.Cells(1, ws.Columns.count).End(xlToLeft).Column + 1
        Set Parameters = jsonObj("Product")("Parameters")

        
        ' Loop through the parameters and extract names and values
        For Each ParamItem In Parameters
            ParamName = ParamItem("ParameterText")
            ParamValue = ParamItem("ValueText")
            
            Dim findrng As Range
            Dim foundCol As Range
            Set findrng = ws.Rows(1)
            Set foundCol = findrng.Find(ParamName, LookIn:=xlValues, LookAt:=xlWhole)
            
            lastCol = ws.Cells(1, ws.Columns.count).End(xlToLeft).Column + 1
            
            If Not foundCol Is Nothing Then
                ws.Cells(r, foundCol.Column) = ParamValue
            Else
                ws.Cells(1, lastCol) = ParamName
                ws.Cells(r, lastCol) = ParamValue
            End If
        Next ParamItem
        
        ' assign MCODES
        Dim packageCaseColumn As Long
        Dim packageCaseValue As String
        Dim mcode As String
                
        ' First check the mount type. If it is Through Hole then MCODE should be TH, if it is "Surface Mount, Through Hole" then Mcode should be MANSMT
        ' and if it is Surface Mount then the code should further check for mcode
        
        Dim mountingTypeColumn As Long
        Dim mountingTypeValue As String
        
        On Error Resume Next
        mountingTypeColumn = ws.Rows(1).Find(What:="Mounting Type", LookIn:=xlValues, LookAt:=xlWhole).Column
        On Error GoTo 0
        
        If mountingTypeColumn > 0 Then
            mountingTypeValue = ws.Cells(r, mountingTypeColumn)
            
            If mountingTypeValue = "Through Hole" Then
                mcode = "Mounting Type " & "TH"
                GoTo mCodeValueAssigned
            ElseIf mountingTypeValue = "Surface Mount, Through Hole" Then
                mcode = "Mounting Type " & "MANSMT"
                GoTo mCodeValueAssigned
            End If
        End If
        
        
        ' next check the assigned package id and match with API package ID and assign the mcode
        
        On Error Resume Next
        packageCaseColumn = ws.Rows(1).Find(What:="Package / Case", LookIn:=xlValues, LookAt:=xlWhole).Column
        On Error GoTo 0
        
        If packageCaseColumn > 0 Then
            packageCaseValue = ws.Cells(r, packageCaseColumn)
            If packageCaseValue <> "" Then
                mcode = mCode_using_packageCaseID(packageCaseValue, machineCodeWS)
                If mcode <> "" Then
                    GoTo mCodeValueAssigned
                End If
            End If
        End If
        
        
        ' next check all the keyword in the detaild description and assign the mcode
        Dim Description As String
        Description = DetailedDescription
        
        If Description = "" Then
            Description = ProductDescription
        End If
        
        Description = " " & Replace(Description, ",", " ,") & " "
        
        Dim machineCodewsLR As Long
        Dim i As Long
        machineCodewsLR = machineCodeWS.Cells(machineCodeWS.Rows.count, "A").End(xlUp).Row
        
        For i = 2 To machineCodewsLR
            Dim keyword As String
            keyword = " " & machineCodeWS.Cells(i, "A") & " "
            If InStr(1, Description, keyword, vbTextCompare) > 0 Then
                If Mid(Description, InStr(1, Description, keyword, vbTextCompare), Len(keyword)) = keyword Then
                    mcode = "Desc" & keyword & " " & machineCodeWS.Cells(i, "B")
                    GoTo mCodeValueAssigned
                End If
            End If
        Next i
        
        
        
        ' next check the size of the part and assign the mcode based on size and ranking
        'Size / Dimension
        'Diameter - Outside
        'Length
        'Width
         
        Dim sizeDimensionColumn As Long
        Dim sizeDimensionValue As String
        
        On Error Resume Next
        sizeDimensionColumn = ws.Rows(1).Find(What:="Size / Dimension", LookIn:=xlValues, LookAt:=xlWhole).Column
        On Error GoTo 0
        
        If sizeDimensionColumn > 0 Then
            sizeDimensionValue = ws.Cells(r, sizeDimensionColumn)
            
            If sizeDimensionValue <> "" Then
                ' get length
                Dim length As Double
                Dim firstmmPos As Long
                Dim firstBracketPos As Long
                
                firstmmPos = InStr(1, sizeDimensionValue, "mm")
                firstBracketPos = InStr(1, sizeDimensionValue, "(")
                
                length = Mid(sizeDimensionValue, firstBracketPos + 1, firstmmPos - firstBracketPos - 1)
                If length > 0 Then
                    Dim lenFrom As Double
                    Dim lenTo As Double
                    Dim sizeTableLR As Long
                    Dim lenRank As Long
                    
                    sizeTableLR = sizeTableWS.Cells(sizeTableWS.Rows.count, "A").End(xlUp).Row
                    For i = 3 To sizeTableLR
                        lenFrom = sizeTableWS.Cells(i, "C")
                        lenTo = sizeTableWS.Cells(i, "D")
                        If length >= lenFrom And length <= lenTo Then
                            lenRank = sizeTableWS.Cells(i, "A")
                            Exit For
                        End If
                    Next i
                    If length > 0 And lenRank = 0 Then
                        lenRank = 6
                    End If
                End If
                
                ' get width
                Dim width As Double
                Dim secondmmPos As Long
                Dim firstCrossPos As Long
                
                On Error Resume Next
                secondmmPos = InStr(firstmmPos + 1, sizeDimensionValue, "mm")
                firstCrossPos = InStr(firstmmPos + 1, sizeDimensionValue, "x")
                
                width = Mid(sizeDimensionValue, firstCrossPos + 1, secondmmPos - firstCrossPos - 1)
                On Error GoTo 0
                
                If width > 0 Then
                    Dim widthFrom As Double
                    Dim widthTo As Double
                    Dim widthRank As Long
                    
                    For i = 3 To sizeTableLR
                        widthFrom = sizeTableWS.Cells(i, "E")
                        widthTo = sizeTableWS.Cells(i, "F")
                        If width >= widthFrom And width <= widthTo Then
                            widthRank = sizeTableWS.Cells(i, "A")
                            Exit For
                        End If
                    Next i
                    If width > 0 And widthRank = 0 Then
                        widthRank = 6
                    End If
                End If
                
                ' assign the mcode with highest rank
                If lenRank >= widthRank Then
                    If lenRank = 6 Then
                        mcode = "SIZE " & "Length not in range"
                        GoTo mCodeValueAssigned
                    Else
                        mcode = "SIZE " & sizeTableWS.Cells(sizeTableWS.Columns("A").Find(What:=lenRank, LookIn:=xlValues, LookAt:=xlWhole).Row, "B")
                        GoTo mCodeValueAssigned
                    End If
                Else
                    If widthRank = 6 Then
                        mcode = "SIZE " & "Width not in range"
                        GoTo mCodeValueAssigned
                    Else
                        mcode = "SIZE " & sizeTableWS.Cells(sizeTableWS.Columns("A").Find(What:=widthRank, LookIn:=xlValues, LookAt:=xlWhole).Row, "B")
                        GoTo mCodeValueAssigned
                    End If
                End If
            End If
        End If
        
        ' if description has keyword "Pin" and "Crimp" then CABLE
        If InStr(1, Description, " Pin ") > 0 And InStr(1, Description, " Crimp ") > 0 Then
            mcode = "CABLE"
            GoTo mCodeValueAssigned
        End If
        
        ' If Category is "Connectors, Interconnects" and description as keyword "Surface Mount" then it is MANSMT
        If InStr(1, Description, " Surface Mount ") > 0 And category = "Connectors, Interconnects" Then
            mcode = "MANSMT"
            GoTo mCodeValueAssigned
        End If
        
        ' If Category is "Connectors, Interconnects" and description does not have keyword "Surface Mount" and Mounting type does not have keyword Surface Mount then it is TH
        If category = "Connectors, Interconnects" And Application.WorksheetFunction.Max(InStr(1, Description, " Surface Mount "), InStr(1, " " & mountingTypeValue & " ", " Surface Mount ")) = 0 Then
            mcode = "TH"
            GoTo mCodeValueAssigned
        End If
        
        ' if Description has keyword as "Connector Header position" and does not have any of the following: SMT, SMD, SURFACE MOUNT then it is TH
        If InStr(1, Description, " Connector Header position ") > 0 And _
           InStr(1, Description, "SMT") = 0 And InStr(1, Description, "SMD") = 0 And InStr(1, Description, "SURFACE MOUNT") = 0 Then
            
           mcode = "TH"
           GoTo mCodeValueAssigned
        End If
        
        'If description has keyword Connector Header and mounting type has keyword Surface Mount then it is MANSMT
        If InStr(1, Description, " Connector Header ") > 0 And InStr(1, " " & mountingTypeValue & " ", " Surface Mount ") > 0 Then
            mcode = "MANSMT"
            GoTo mCodeValueAssigned
        End If
            
        'If description has keyword "End Launch Solder" then it is TH
        If InStr(1, Description, " End Launch Solder ") > 0 Then
            mcode = "TH"
            GoTo mCodeValueAssigned
        End If
        
        ' if sub category is "Film Capacitors" and mounting type is Chassis Mount, Requires Holder/Bracket, Chassis Mount, Chassis, Stud Mount, Requires Holder, Through Hole then it is TH
        If ChildCategoryName = "Film Capacitors" And _
            (mountingTypeValue = "Chassis Mount" Or _
            mountingTypeValue = "Requires Holder/Bracket" Or _
            mountingTypeValue = "Chassis" Or _
            mountingTypeValue = "Stud Mount" Or _
            mountingTypeValue = "Requires Holder" Or _
            mountingTypeValue = "Through Hole") Then
            
            mcode = "TH"
            GoTo mCodeValueAssigned
        End If
        
            
            '''''if any new parameter then write code below'''''
            
            
            
mCodeValueAssigned:
    ws.Cells(r, "K") = mcode
    ws.Cells(r, "J") = jsonText
        
        ' reset the values
        ProductDescription = ""
        DetailedDescription = ""
        Manufacturer = ""
        ManufacturerProductNumber = ""
        category = ""
        ChildCategoryName = ""
        ProductStatus = ""
        mcode = ""
        lenRank = 0
        widthRank = 0
nextPart:
    Next r
End Sub

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
    http.send postData
    
    ' Get the response
    response = http.responseText
    
    ' Parse the token from the JSON response
    Dim json As Object
    Set json = JsonConverter.ParseJson(response) ' Requires JsonConverter library
    
    ' Extract the access token
    token = json("access_token")
    Debug.Print token
    ' Set the function's return value to the token
    GetAccessToken = token
    
    ' Clean up
    Set http = Nothing
    Set json = Nothing
End Function

Private Function mCode_using_packageCaseID(packageCaseValue As String, mcWS As Worksheet) As String
    Dim machineCodeRow As Long
    Dim machineCode As String
    
    On Error Resume Next
    machineCodeRow = mcWS.Columns("A").Find(What:=packageCaseValue, LookIn:=xlValues, LookAt:=xlWhole).Row
    On Error GoTo 0
    
    If machineCodeRow > 0 Then
        machineCode = "package " & mcWS.Cells(machineCodeRow, "B")
        mCode_using_packageCaseID = machineCode
    End If
    
End Function


