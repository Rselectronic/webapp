Attribute VB_Name = "mod_OthF_Digikey_Parameters_1"
'module 3 and 4 from earlier file


Option Compare Text
Function myJson(Optional digikeyJson As String)
    
    Dim mouserJson As String
    Dim Description As String
    Dim category As String
    Dim ChildCategories As Object
    Dim ChildCategoryItem As Object
    Dim ChildCategoryName As String
    Dim mountingType As String
    Dim packageCase As String
    Dim sizeDimension As String
    Dim diameterOutside As String
    Dim length As String
    Dim width As String
    Dim attachmentMethod As String
    Dim features As String
    
    Dim jsonObj As Object
    Set jsonObj = JsonConverter.ParseJson(digikeyJson)
    
    On Error Resume Next
    Description = jsonObj("Product")("Description")("ProductDescription") & " " & jsonObj("Product")("Description")("DetailedDescription")
    Description = Replace(Description, """", "\" & """")
    category = jsonObj("Product")("Category")("Name")
    
    Set ChildCategories = jsonObj("Product")("Category")("ChildCategories")
    If ChildCategories.count > 1 Then
        For Each ChildCategoryItem In ChildCategories
            ChildCategoryName = ChildCategoryName & ", " & ChildCategoryItem("Name")
        Next ChildCategoryItem
        ChildCategoryName = Right(ChildCategoryName, Len(ChildCategoryName) - 2)
    Else
        ChildCategoryName = ChildCategories(1)("Name")
    End If
        
        
    Dim Parameters As Object
    Dim ParamItem As Object
    Dim ParamName As String
    Dim ParamValue As String
    Set Parameters = jsonObj("Product")("Parameters")
    ' Loop through the parameters and extract names and values
    For Each ParamItem In Parameters
        ParamName = ParamItem("ParameterText")
        ParamValue = ParamItem("ValueText")
        
        If ParamName = "Mounting Type" Then mountingType = Replace(ParamValue, """", "\" & """")
        If ParamName = "Package / Case" Then packageCase = Replace(ParamValue, """", "\" & """")
        If ParamName = "Size / Dimension" Then sizeDimension = Replace(ParamValue, """", "\" & """")
        If ParamName = "Diameter - Outside" Then diameterOutside = Replace(ParamValue, """", "\" & """")
        If ParamName = "Length" Then length = Replace(ParamValue, """", "\" & """")
        If ParamName = "Width" Then width = Replace(ParamValue, """", "\" & """")
        If ParamName = "Attachment Method" Then attachmentMethod = Replace(ParamValue, """", "\" & """")
        If ParamName = "Features" Then features = Replace(ParamValue, """", "\" & """")
        
    Next ParamItem
    
    myJson = "{" & _
                    """" & "Category" & """" & ":" & """" & category & """" & "," & _
                    """" & "Child Category" & """" & ":" & """" & ChildCategoryName & """" & "," & _
                    """" & "Description" & """" & ":" & """" & Description & """" & "," & _
                    """" & "Mounting Type" & """" & ":" & """" & mountingType & """" & "," & _
                    """" & "Package / Case" & """" & ":" & """" & packageCase & """" & "," & _
                    """" & "Size / Dimension" & """" & ":" & """" & sizeDimension & """" & "," & _
                    """" & "Diameter - Outside" & """" & ":" & """" & diameterOutside & """" & "," & _
                    """" & "Length" & """" & ":" & """" & length & """" & "," & _
                    """" & "Width" & """" & ":" & """" & width & """" & "," & _
                    """" & "Attachment Method" & """" & ":" & """" & attachmentMethod & """" & "," & _
                    """" & "Features" & """" & ":" & """" & features & """" & _
            "}"


    'Debug.Print myJson
    On Error GoTo 0
End Function




Function newParameters1(Json_Text As String, r As Long)

'    Dim clientID As String
'    Dim clientSecret As String
'    Dim wb As Workbook
    Dim ws As Worksheet, machineCodeWS As Worksheet, sizeTableWS As Worksheet, adminWS As Worksheet, ms As Worksheet
'    Dim lr As Long, r As Long
'    Dim accessToken As String
'    Dim url As String
'
'    ' Define Digikey API credentials
'    clientID = "kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4"
'    clientSecret = "qIiFSGbrfzqBxGLr"
'
'    ' Initialize token time
'    Dim lastTokenTime As Double, elapsedTime As Double
'    lastTokenTime = Timer
'    accessToken = GetAccessToken
'
    ' Set worksheets
    Set wb = ThisWorkbook
    'Set ws = wb.Sheets("New Parameters")
    Set machineCodeWS = wb.Sheets("MachineCodes")
    Set sizeTableWS = wb.Sheets("Size Table")
    Set adminWS = wb.Sheets("Admin")
    Set ms = wb.Sheets("MasterSheet")
'
'
'
'    'Initliazing headers
'    initialiseHeaders , , ms
'
'
'   ' lr = ws.Cells(ws.Rows.count, "A").End(xlUp).Row
'    lr = ms.Cells(ms.Rows.count, Master_DistributorPartnumber_Column).End(xlUp).Row
'
'    Dim partNumber As String
    Dim jsonText As String
    Dim jsonObj As Object
'    Dim mcode As String
'
'    ' Loop through each part number
'    For r = 4 To lr
'            'partNumber = ws.Cells(r, "A").value
'            partNumber = ms.Cells(r, Master_DistributorPartnumber_Column).value
'
'        If partNumber <> "" Then
'            If Right(partNumber, 3) = "-ND" Then
'
'            ' Skip API call if data is available
'            'for now skipping this to check Jason in column B
''            If ws.Cells(r, "B") <> "" Then
''                jsonText = myJson(ws.Cells(r, "B"))
''            Else
'retryAPI:
'                elapsedTime = Timer - lastTokenTime
'                If elapsedTime > 599 Then
'                    accessToken = GetAccessToken
'                    lastTokenTime = Timer
'                End If
'
'                ' Encode partNumber if it has "/"
'                Dim encodedString As String
'                Dim position As Integer
'                position = InStr(partNumber, "/")
'                If position > 0 Then
'                    encodedString = Left(partNumber, position - 1) & "%2F" & Right(partNumber, Len(partNumber) - position)
'                    partNumber = encodedString
'                End If
'
'                url = "https://api.digikey.com/products/v4/search/" & partNumber & "/productdetails"
'
'                ' API Request
'                Dim request As Object
'                Set request = CreateObject("MSXML2.ServerXMLHTTP.6.0")
'                request.Open "GET", url, False
'                request.setRequestHeader "Content-Type", "application/x-www-form-urlencoded"
'                request.setRequestHeader "X-DIGIKEY-Client-Id", clientID
'                request.setRequestHeader "X-DIGIKEY-Client-Secret", clientSecret
'                request.setRequestHeader "X-DIGIKEY-Locale-Site", "CA"
'                request.setRequestHeader "X-DIGIKEY-Locale-Currency", "CAD"
'                request.setRequestHeader "Authorization", "Bearer " & accessToken
'                request.setRequestHeader "X-DIGIKEY-Customer-Id", "12161503"
'                request.send

                jsonText = myJson(Json_Text)
           

            ' Parse JSON
            Set jsonObj = JsonConverter.ParseJson(jsonText)
    
            ' Extract product details
            Dim ProductDescription As String, category As String, childCategory As String
            Dim mountingType As String, packageCase As String, sizeDimension As String, diameterOutside As String, length As String, width As String
            Dim attachmentMethod As String, features As String
    
            On Error Resume Next
            ProductDescription = jsonObj("Description")
            category = jsonObj("Category")
            childCategory = jsonObj("Child Category")
            mountingType = jsonObj("Mounting Type")
            packageCase = jsonObj("Package / Case")
            sizeDimension = jsonObj("Size / Dimension")
            diameterOutside = jsonObj("Diameter - Outside")
            length = jsonObj("Length")
            width = jsonObj("Width")
            attachmentMethod = jsonObj("Attachment Method")
            features = jsonObj("Features")
            
            If sizeDimension = "" And length <> "" And width <> "" Then
                sizeDimension = length & " x " & width
            End If
            
            On Error GoTo 0
    
            ' Assign MCODE
            mcode = AssignMcode(ProductDescription, category, childCategory, mountingType, packageCase, sizeDimension, diameterOutside, attachmentMethod, features, adminWS, machineCodeWS, sizeTableWS)
            ' Save results
            Dim arr() As String
            'ws.Cells(r, "C").value = mcode
            If InStr(mcode, ";") > 0 Then
            arr = Split(mcode, ";")
                ms.Cells(r, Master_ParametersMCodes_Column).value = Trim(arr(0))
                 ms.Cells(r, Master_DigikeyMCodes_Column).value = Trim(arr(1))
            Else
                'firstValue = Trim(mcode)
                ms.Cells(r, Master_ParametersMCodes_Column).value = mcode
            End If
            
            'ms.Cells(r, Master_Notes_Column).value = mcode
            'skipping for now
            'ws.Cells(r, "D").value = jsonText
    
            ' Reset variables
            ProductDescription = ""
            category = ""
            childCategory = ""
            mountingType = ""
            packageCase = ""
            sizeDimension = ""
            attachmentMethod = ""
            features = ""
            mcode = ""

    
End Function

Function AssignMcode(ProductDescription As String, category As String, childCategory As String, mountingType As String, packageCase As String, sizeDimension As String, diameterOutside As String, attachmentMethod As String, features As String, adminWS As Worksheet, machineCodeWS As Worksheet, sizeTableWS As Worksheet) As String
    Dim adminLR As Long, p As Long
    Dim operator1 As String, operator2 As String
    Dim columnTOCheck1 As String, columnTOCheck2 As String
    Dim keyword1 As String, keyword2 As String
    Dim valueToCheck1 As String, valueToCheck2 As String
    Dim firstCondition As Boolean, secondCondition As Boolean

    adminLR = adminWS.Cells(adminWS.Rows.count, "A").End(xlUp).Row

    ' Loop through admin sheet for conditions
    For p = 2 To adminLR
        operator1 = adminWS.Cells(p, "C").value
        operator2 = adminWS.Cells(p, "F").value
        columnTOCheck1 = adminWS.Cells(p, "B").value
        keyword1 = adminWS.Cells(p, "D").value
        columnTOCheck2 = adminWS.Cells(p, "E").value
        keyword2 = adminWS.Cells(p, "G").value

        ' Get the values to check
        Select Case columnTOCheck1
            Case "Product Description": valueToCheck1 = ProductDescription
            Case "Category": valueToCheck1 = category
            Case "Sub-Category": valueToCheck1 = childCategory
            Case "Mounting Type": valueToCheck1 = mountingType
            Case "Package / Case": valueToCheck1 = packageCase
            Case "Size / Dimension": valueToCheck1 = sizeDimension
            Case "Diameter - Outside": valueToCheck1 = diameterOutside
            Case "Attachment Method": valueToCheck1 = attachmentMethod
            Case "Features": valueToCheck1 = features
        End Select
        
        ' Skip to the next iteration if valueToCheck1 is empty
        If Trim(valueToCheck1) = "" Then
            GoTo NextIteration
        End If
        
        Select Case columnTOCheck2
            Case "Product Description": valueToCheck2 = ProductDescription
            Case "Category": valueToCheck2 = category
            Case "Sub-Category": valueToCheck2 = childCategory
            Case "Mounting Type": valueToCheck2 = mountingType
            Case "Package / Case": valueToCheck2 = packageCase
            Case "Size / Dimension": valueToCheck2 = sizeDimension
            Case "Attachment Method": valueToCheck2 = attachmentMethod
            Case "Features": valueToCheck2 = features
        End Select
    
        ' If the parameter is Product Description or Package / Case, check the MachineCodes table
        If (columnTOCheck1 = "Product Description" And keyword1 = "{{keyword array}}") Or (columnTOCheck1 = "Package / Case" And keyword1 = "{{keyword array}}") Then
            mcode = GetMcodeFromMachineCodes(" " & valueToCheck1 & " " & Replace(valueToCheck1, ",", " , ") & " ", machineCodeWS)
            If mcode <> "" Then
                AssignMcode = adminWS.Cells(p, "A").value & ", " & mcode
                Exit Function
            End If
        End If
        
        ' Check Size-Based Parameters (Size / Dimension, Diameter, Length, Width)
        If columnTOCheck1 = "Size / Dimension" Or columnTOCheck1 = "Diameter - Outside" Or columnTOCheck1 = "Length" Or columnTOCheck1 = "Width" Then
            mcode = GetSizeBasedMcode(valueToCheck1, sizeTableWS)
            If mcode <> "" Then
                AssignMcode = adminWS.Cells(p, "A").value & "; " & mcode
                Exit Function
            End If
        End If
        
        ' Check first condition
        firstCondition = CheckCondition(valueToCheck1, keyword1, operator1)

        ' Check second condition if exists
        secondCondition = True ' Default to True if there's no second condition
        If operator2 <> "" Then
            secondCondition = CheckCondition(valueToCheck2, keyword2, operator2)
        End If

        ' Assign MCODE if both conditions match
        If firstCondition And secondCondition Then
            AssignMcode = adminWS.Cells(p, "A").value & "; " & adminWS.Cells(p, "H").value
            Exit Function
        End If
    
NextIteration:
    Next p

    AssignMcode = "N/A"
End Function

Function CheckCondition(value As String, keyword As String, operatorType As String) As Boolean
    Dim keywordArray() As String
    Dim i As Integer
    Dim individualKeyword As String

    Select Case operatorType
        Case "equals"
            CheckCondition = (Trim(value) = Trim(keyword))

        Case "include"
            CheckCondition = (InStr(1, value, keyword, vbTextCompare) > 0)

        Case "not include"
            ' Split keywords by comma and check each separately
            keywordArray = Split(keyword, ",") ' Split into an array
            CheckCondition = True ' Default to True (Assume all conditions pass)

            For i = LBound(keywordArray) To UBound(keywordArray)
                individualKeyword = Trim(keywordArray(i)) ' Remove spaces
                If InStr(1, value, individualKeyword, vbTextCompare) > 0 Then
                    CheckCondition = False ' If any keyword is found, condition fails
                    Exit Function
                End If
            Next i

        Case Else
            CheckCondition = False
    End Select
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

Function GetMcodeFromMachineCodes(valueToCheck As String, machineCodeWS As Worksheet) As String
    Dim machineCodeLR As Long, i As Long
    Dim keyword As String, mcode As String

    machineCodeLR = machineCodeWS.Cells(machineCodeWS.Rows.count, "A").End(xlUp).Row

    ' Loop through MachineCodes table
    For i = 2 To machineCodeLR
        keyword = " " & machineCodeWS.Cells(i, "A").value & " "
        mcode = machineCodeWS.Cells(i, "B").value

        ' If keyword is found in Product Description or Package / Case, assign MCODE
        If InStr(1, valueToCheck, keyword, vbTextCompare) > 0 Then
            GetMcodeFromMachineCodes = keyword & "; " & mcode
            Exit Function
        End If
    Next i

    GetMcodeFromMachineCodes = ""
End Function

Function GetSizeBasedMcode(sizeValue As String, sizeTableWS As Worksheet) As String
    Dim sizeTableLR As Long, i As Long
    Dim length As Double, width As Double
    Dim lenFrom As Double, lenTo As Double, widthFrom As Double, widthTo As Double
    Dim lenRank As Long, widthRank As Long
    Dim mcode As String

    ' Get the last row of the size table
    sizeTableLR = sizeTableWS.Cells(sizeTableWS.Rows.count, "A").End(xlUp).Row

    ' Extract length & Width from Size / Dimension
    length = ExtractSize(sizeValue, "L")
    width = ExtractSize(sizeValue, "W")

    ' Initialize default rankings
    lenRank = 6 ' Default to lowest rank
    widthRank = 6 ' Default to lowest rank

    ' Find matching rank for Length
    If length > 0 Then
        For i = 3 To sizeTableLR
            lenFrom = sizeTableWS.Cells(i, "C").value
            lenTo = sizeTableWS.Cells(i, "D").value
            If length >= lenFrom And length <= lenTo Then
                lenRank = sizeTableWS.Cells(i, "A").value
                Exit For
            End If
        Next i
    End If

    ' Find matching rank for Width
    If width > 0 Then
        For i = 3 To sizeTableLR
            widthFrom = sizeTableWS.Cells(i, "E").value
            widthTo = sizeTableWS.Cells(i, "F").value
            If width >= widthFrom And width <= widthTo Then
                widthRank = sizeTableWS.Cells(i, "A").value
                Exit For
            End If
        Next i
    End If

    ' Assign the highest-ranked MCODE
    If lenRank <= widthRank Then
        If lenRank = 6 Then
            GetSizeBasedMcode = "Length not in range"
        Else
            GetSizeBasedMcode = sizeTableWS.Cells(sizeTableWS.Columns("A").Find(What:=lenRank, LookIn:=xlValues, LookAt:=xlWhole).Row, "B").value
        End If
    Else
        If widthRank = 6 Then
            GetSizeBasedMcode = "Width not in range"
        Else
            GetSizeBasedMcode = sizeTableWS.Cells(sizeTableWS.Columns("A").Find(What:=widthRank, LookIn:=xlValues, LookAt:=xlWhole).Row, "B").value
        End If
    End If
End Function


Function ExtractSize(sizeValue As String, extractType As String) As Double
    Dim regex As Object
    Dim matches As Object
    Dim match As Object
    Dim numbers() As String
    Dim Found As Integer
    Dim firstNumber As Double, secondNumber As Double

    ' Initialize Regular Expression object
    Set regex = CreateObject("VBScript.RegExp")
    regex.Pattern = "(\d+(\.\d+)?)mm"  ' Looks for numbers followed by "mm"
    regex.Global = True

    ' Find all numeric values followed by "mm" in the string
    Set matches = regex.Execute(sizeValue)

    ' Ensure at least one match exists
    If matches.count > 0 Then
        ReDim numbers(matches.count - 1)
        Found = 0

        ' Store extracted numbers in an array
        For Each match In matches
            numbers(Found) = match.Submatches(0)
            Found = Found + 1
        Next match

        ' Assign first and second number (handles missing values)
        firstNumber = CDbl(numbers(0)) ' First number = Length
        If Found > 1 Then
            secondNumber = CDbl(numbers(1)) ' Second number = Width
        Else
            secondNumber = 0 ' Default to 0 if width is missing
        End If
    Else
        firstNumber = 0
        secondNumber = 0
    End If

    ' Return based on requested type
    If extractType = "L" Then
        ExtractSize = firstNumber
    Else
        ExtractSize = secondNumber
    End If
End Function



