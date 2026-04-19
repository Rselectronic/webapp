Attribute VB_Name = "mod_OthF_Digikey_Parameters"
Option Compare Text
'this module taken from module2 of earlier used file

'Module Names like mod_OthF_    so OthF abbrivated of OtherFile
Sub newParameters()

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
    Set ws = wb.Sheets("New Parameters")
    Set machineCodeWS = wb.Sheets("MachineCodes")
    Set sizeTableWS = wb.Sheets("Size Table")
    lr = ws.Cells(ws.Rows.count, "A").End(xlUp).Row
    
    Dim partNumber As String
    
    For r = 2 To lr
    partNumber = ws.Cells(r, "A")
    
    ' if Json data is available, then skip the api
    If ws.Cells(r, "B") <> "" Then GoTo skipAPI
    
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
        If ws.Cells(r, "B") = "" Then
            jsonText = myJson(request.responseText)
        Else
            jsonText = myJson(ws.Cells(r, "B"))
        End If
        
        Set jsonObj = JsonConverter.ParseJson(jsonText)
        
        Dim ProductDescription As String
        Dim category As String
        Dim childCategory As String
        Dim mountingType As String
        Dim packageCase As String
        Dim sizeDimension As String
        Dim attachmentMethod As String
        Dim features As String
                
        
        On Error Resume Next
        ProductDescription = jsonObj("Description")
        category = jsonObj("Category")
        childCategory = jsonObj("Child Category")
        mountingType = jsonObj("Mounting Type")
        packageCase = jsonObj("Package / Case")
        sizeDimension = jsonObj("Size / Dimension")
        attachmentMethod = jsonObj("Attachment Method")
        features = jsonObj("Features")
        On Error GoTo 0



              
        ' assign MCODES
        Dim packageCaseColumn As Long
        Dim packageCaseValue As String
        Dim mcode As String
                
        ' First check the mount type. If it is Through Hole then MCODE should be TH, if it is "Surface Mount, Through Hole" then Mcode should be MANSMT
        ' and if it is Surface Mount then the code should further check for mcode
        
        
        Dim adminWS As Worksheet
        Set adminWS = ThisWorkbook.Sheets("Admin")
        
        ' loop through the parameters list in admin sheet to assign the mcodes
        Dim adminLR As Long, p As Long
        adminLR = adminWS.Cells(adminWS.Rows.count, "A").End(xlUp).Row
        
        For p = 2 To adminLR
            Dim operator1 As String, operator2 As String
            Dim columnTOCheck1 As String, columnTOCheck2 As String
            Dim keyword1 As String, keyword2 As String
            
            operator1 = adminWS.Cells(p, "C")
            operator2 = adminWS.Cells(p, "F")
            
            If operator1 = "equals" And operator2 = "" Then
                columnTOCheck1 = adminWS.Cells(p, "B")
                keyword1 = adminWS.Cells(p, "D")
                If columnTOCheck1 = "Mounting Type" Then
                    If mountingType = keyword Then
                        mcode = adminWS.Cells(i, "A") & " " & adminWS.Cells(p, "H")
                        GoTo mCodeValueAssigned
                        Exit For
                    End If
                ElseIf columnToCheck = "Package / Case" Then
                ElseIf columnToCheck = "Product Description" Then
                    If ProductDescription = keyword Then
                        mcode = adminWS.Cells(p, "H")
                        GoTo mCodeValueAssigned
                        Exit For
                    End If
                ElseIf columnToCheck = "Size / Dimension" Then
                ElseIf columnToCheck = "Diameter - Outside" Then
                ElseIf columnToCheck = "Length" Then
                ElseIf columnToCheck = "Width" Then
                
                ElseIf columnToCheck = "Category" Then
                
                ElseIf columnToCheck = "Sub-Category" Then

                
                End If
                
            ElseIf operator1 = "equals" And operator2 = "equals" Then
            ElseIf operator1 = "equals" And operator2 = "include" Then
            ElseIf operator1 = "in range" And operator2 = "" Then
            ElseIf operator1 = "include" And operator2 = "" Then
            ElseIf operator1 = "include" And operator2 = "include" Then
            ElseIf operator1 = "include" And operator2 = "equals" Then
            ElseIf operator1 = "include" And operator2 = "not include" Then
                
            End If
        Next p
        
        
        
        
        
        
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
        machineCodewsLR = machineCodeWS.Cells(machineCodeWS.Rows.count, "A").End(xlUp).Row
        
        For i = 2 To machineCodewsLR
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




