Attribute VB_Name = "Digikey_Mouser_MasterSheet_API4"
Option Explicit

' Windows API to get UTC time
Private Type SYSTEMTIME
    wYear As Integer
    wMonth As Integer
    wDayOfWeek As Integer
    wDay As Integer
    wHour As Integer
    wMinute As Integer
    wSecond As Integer
    wMilliseconds As Integer
End Type

Private Declare PtrSafe Sub GetSystemTime Lib "kernel32" (lpSystemTime As SYSTEMTIME)

'========================
' Globals
'========================
Public AccessToken As String
Public AccessTokenExpiry As Date
Public dt As Date
Public DigiKeyPackID As String
Public PackType As String
Public MouserPackaging As String

'========================
' CONFIG (EDIT THESE)
'========================
Private Const DIGIKEY_CLIENT_ID As String = "kJuY1luWJ2dHDWjgtun4Q7j3zFmdMqc4"
Private Const DIGIKEY_CLIENT_SECRET As String = "qIiFSGbrfzqBxGLr"
Private Const DIGIKEY_CUSTOMER_ID As String = "12161503"
Private Const DIGIKEY_SITE As String = "CA"
Private Const DIGIKEY_CURRENCY As String = "CAD"

Private Const MOUSER_API_KEY As String = "3142af4a-e0c2-4574-87a4-dc5b5e3b2f78"  ' query-string apiKey
Private Const MOUSER_URL As String = "https://api.mouser.com/api/v1/search/keyword?apiKey="

'========================
' DATA MODEL
'========================
Private Type ProductData
    Found As Boolean
    distributor As String       ' "Digikey" / "Mouser"
    distPN As String            ' Distributor PN (canonical)
    mPN As String
    MFR As String
    Stock As Double
    UnitPrice As Double
    Description As String
    StandardPack As Long
    RawJson As String
    FetchDate As Variant
    ProductStatus As String
    ManufacturerLeadTime As String
End Type

'========================
' MAIN MACRO (REPLACE YOUR EXISTING SUB WITH THIS)
'========================
Public Sub Digikey_Mouser_MasterSheet_API()

    On Error GoTo CleanFail

    turnoffscreenUpdate

    Dim dis As Worksheet
    Set dis = ThisWorkbook.Sheets("MasterSheet")

initialiseHeaders , , dis

    Dim lr As Long
    lr = dis.Cells(dis.Rows.count, Master_SNO_Column).End(xlUp).Row
    If lr < 4 Then GoTo CleanExit

    ' JSON folder path (uses your existing helpers)
    Dim fullPath As String, parentFolderName As String, JsonFolderPath As String
    fullPath = GetLocalPath(ThisWorkbook.fullName)
    parentFolderName = ExtractFolderName(fullPath)
    JsonFolderPath = Left(fullPath, InStr(1, fullPath, parentFolderName, vbTextCompare) + Len(parentFolderName)) & "6. BACKEND\JSON DATA\"
    If Right(JsonFolderPath, 1) <> "\" Then JsonFolderPath = JsonFolderPath & "\"

    Dim response1 As VbMsgBoxResult
    response1 = MsgBox("Access data from API?", vbYesNoCancel + vbQuestion, "API Confirmation")
    If response1 = vbCancel Then Exit Sub
    
    Dim response2 As VbMsgBoxResult
    response2 = MsgBox("Pull Description?", vbYesNoCancel + vbQuestion, "Description Confirmation")
    If response2 = vbCancel Then Exit Sub
    
    'third message box for user to process the selected rows or all
    Dim response3 As VbMsgBoxResult
    response3 = MsgBox("Process All Lines?" & vbCrLf & vbCrLf & _
                       "Yes = All Lines" & vbCrLf & "No = Selected Lines", _
                       vbYesNoCancel + vbQuestion, "Processing Mode")
                       
                       ' process all lines?
                       'Yes = Process All
                       'No = Select Lines
                       'Cancel =  Cncel operation
                       
    
    If response3 = vbCancel Then Exit Sub

        Dim rowstoprocess As Collection
        Set rowstoprocess = New Collection
        
        If response3 = vbNo Then
        turnonscreenUpdate
            ' selected lines
            Dim selectedrange As Range
            On Error Resume Next
            Set selectedrange = Application.InputBox("select the rows to process:", "select rows", Type:=8)
            On Error GoTo 0
            
            If selectedrange Is Nothing Then Exit Sub
            
            Dim cell As Range
            For Each cell In selectedrange.Rows
                If cell.Row >= 4 And cell.Row <= lr Then
                    rowstoprocess.Add cell.Row
                End If
            Next cell
            
            If rowstoprocess.count = 0 Then
                MsgBox "no valid rows selected.", vbExclamation
                Exit Sub
            End If
        Else
            ' all lines
            Dim i As Long
            For i = 4 To lr
                rowstoprocess.Add i
            Next i
        End If

    turnoffscreenUpdate
    


    Dim forceApi As Boolean: forceApi = (response1 = vbYes)
    Dim pullDesc As Boolean: pullDesc = (response2 = vbYes)

    ' Progress UI (keeps your current behavior)
    On Error Resume Next
    UserForm1.Show vbModeless
    UserForm1.Caption = "Digikey & Mouser API"
    UserForm1.width = 246
    UserForm1.Height = 187.4

    UserForm1.ProgressFrame.Caption = "Progress Status"
    UserForm1.lblmainProgCaption.Caption = "Getting Data"
    UserForm1.lblsubProgCaption.Caption = "Part Number"
    UserForm1.lblmainProgPerc.width = 0
    UserForm1.lblmainProgPercDisp.Caption = "0%"
    UserForm1.lblsubProgPerc.width = 0
    UserForm1.lblsubProgPercDisp.Caption = "0%"
    On Error GoTo 0

    Dim r As Long
    'For r = 4 To lr
    Dim rowindex As Long
    For rowindex = 1 To rowstoprocess.count
        r = rowstoprocess(rowindex)
        
        Dim dist As String, distPN As String, mpnSheet As String
        dist = Trim$(CStr(dis.Cells(r, Master_Distrib1_Column).value))     ' Distributor Name
        distPN = Trim$(CStr(dis.Cells(r, Master_DistributorPartnumber_Column).value))   ' Distributor PN
        mpnSheet = Trim$(CStr(dis.Cells(r, Master_MFRHas_Column).value)) ' MPN (your sheet column)

        Dim primary As ProductData, secondary As ProductData
        Dim mpnToUse As String

        '========================
        ' Decide primary query
        '========================
        If LCase$(dist) = "digikey" And distPN <> "" Then
            primary = GetDigikeyProduct(distPN, JsonFolderPath, forceApi, pullDesc, r)

            If primary.Found And primary.Stock <= 0 Then
                mpnToUse = IIf(primary.mPN <> "", primary.mPN, mpnSheet)
                If mpnToUse <> "" Then
                    secondary = GetMouserProduct(mpnToUse, JsonFolderPath, forceApi, pullDesc)
                    If secondary.Found And secondary.Stock > 0 Then primary = secondary
                End If
            End If

        ElseIf LCase$(dist) = "mouser" And distPN <> "" Then
            primary = GetMouserProduct(distPN, JsonFolderPath, forceApi, pullDesc)

            If primary.Found And primary.Stock <= 0 Then
                mpnToUse = IIf(primary.mPN <> "", primary.mPN, mpnSheet)
                If mpnToUse <> "" Then
                    secondary = GetDigikeyProduct(mpnToUse, JsonFolderPath, forceApi, pullDesc, r)
                    If secondary.Found And secondary.Stock > 0 Then primary = secondary
                End If
            End If

        ElseIf dist = "" Then
            ' No distributor -> start with DigiKey by MPN
            If mpnSheet <> "" Then
                primary = GetDigikeyProduct(mpnSheet, JsonFolderPath, forceApi, pullDesc, r)

                ' If DigiKey found but stock 0 -> check Mouser too
                If primary.Found And primary.Stock <= 0 Then
                    secondary = GetMouserProduct(mpnSheet, JsonFolderPath, forceApi, pullDesc)
                    If secondary.Found And secondary.Stock > 0 Then primary = secondary
                End If
            End If

        Else
            ' Other distributor -> skip
            primary.Found = False
        End If

        '========================
        ' Write back
        '========================
        If primary.Found Then
            dis.Cells(r, Master_Distrib1_Column).value = primary.distributor
            dis.Cells(r, Master_DistributorPartnumber_Column).value = primary.distPN
            dis.Cells(r, Master_QTYAvlble_Column).value = primary.Stock
            dis.Cells(r, Master_MFR_Column).value = primary.MFR
            dis.Cells(r, Master_PNTOUSE_Column).value = primary.mPN
            dis.Cells(r, Master_UnitPrice_Column).value = primary.UnitPrice
            dis.Cells(r, Master_STANDARDQty_Column).value = primary.StandardPack
            dis.Cells(r, Master_ProductStatus_Column).value = primary.ProductStatus
            dis.Cells(r, Master_LeadTime_Column).value = primary.ManufacturerLeadTime
            dis.Cells(r, Master_JSON_FetchDateTime_Column).value = dt
            dis.Cells(r, Master_PackgingType_Column).value = PackType
            
            If pullDesc Then dis.Cells(r, Master_Description_Column).value = primary.Description
        Else
            ' Optional: clear values or just mark not found
            If dist = "" Or LCase$(dist) = "digikey" Or LCase$(dist) = "mouser" Then
                dis.Cells(r, Master_QTYAvlble_Column).value = "Part not found"
            End If
        End If

         dt = 0
        
        '========================
        ' Progress update
        '========================
        On Error Resume Next
        UserForm1.lblsubProgCaption.Caption = primary.distributor & " " & """" & IIf(primary.distPN <> "", primary.distPN, IIf(distPN <> "", distPN, mpnSheet)) & """"
'        UserForm1.lblmainProgPercDisp.Caption = Format((r - 3) / (lr - 3), "0.00%")
'        UserForm1.lblmainProgPerc.width = ((r - 3) / (lr - 3)) * 180
'        UserForm1.lblsubProgPercDisp.Caption = Format((r - 3) / (lr - 3), "0.00%")
'        UserForm1.lblsubProgPerc.width = ((r - 3) / (lr - 3)) * 180

        UserForm1.lblmainProgPercDisp.Caption = Format(CDbl(rowindex) / rowstoprocess.count, "0.00%")
        UserForm1.lblmainProgPerc.width = (CDbl(rowindex) / rowstoprocess.count) * 180
        UserForm1.lblsubProgPercDisp.Caption = Format(CDbl(rowindex) / rowstoprocess.count, "0.00%")
        UserForm1.lblsubProgPerc.width = (CDbl(rowindex) / rowstoprocess.count) * 180
        DoEvents
        On Error GoTo 0

    Next rowindex

CleanExit:
    turnonscreenUpdate
    On Error Resume Next
    Unload UserForm1
    On Error GoTo 0
    Exit Sub

CleanFail:
    turnonscreenUpdate
    On Error Resume Next
    Unload UserForm1
    On Error GoTo 0
    MsgBox "Error: " & Err.Description, vbExclamation
End Sub

'=========================================================
' DigiKey: Fetch -> Cache -> Parse
'=========================================================
Private Function GetDigikeyProduct(ByVal queryKey As String, ByVal jsonFolder As String, ByVal forceApi As Boolean, ByVal pullDesc As Boolean, r As Long) As ProductData
    Dim d As ProductData
    d.distributor = "Digikey"

    Dim cached As String
    cached = ReadCachedJsonSmart(jsonFolder, "Digikey", queryKey, forceApi)
    If cached <> "" Then
        d = ParseDigikeyJson(cached, pullDesc, r)
        d.RawJson = cached
'        If d.Found Then
'            If d.distPN = "" Then d.distPN = queryKey
'            SaveCachedJsonDual cached, jsonFolder, "Digikey", d.distPN, queryKey
'        End If
        GetDigikeyProduct = d
        Exit Function
    End If

    Dim safeKey As String
    safeKey = UrlEncodeDigikeyKey(queryKey)

    Dim url As String
    url = "https://api.digikey.com/products/v4/search/" & safeKey & "/productdetails"

    Dim jsonText As String
    jsonText = DigikeyHttpGet(url, DIGIKEY_CLIENT_ID, DIGIKEY_CLIENT_SECRET)
    
    ' get mcode function call
    newParameters1 jsonText, r

    d = ParseDigikeyJson(jsonText, pullDesc, r)
    d.RawJson = jsonText

    If d.Found Then
        If d.distPN = "" Then d.distPN = queryKey
        SaveCachedJsonDual jsonText, jsonFolder, "Digikey", d.distPN, queryKey
    End If

    GetDigikeyProduct = d
End Function

Private Function ParseDigikeyJson(ByVal jsonText As String, ByVal pullDesc As Boolean, r As Long) As ProductData
    Dim d As ProductData
    d.distributor = "Digikey"

    If Len(jsonText) = 0 Then
        d.Found = False
        ParseDigikeyJson = d
        Exit Function
    End If

    On Error GoTo Fail

    Dim jsonObj As Object
    Set jsonObj = JsonConverter.ParseJson(jsonText)

    ' Success responses typically do NOT have status, while errors do.
    If jsonObj.Exists("status") Then
        d.Found = False
        ParseDigikeyJson = d
        Exit Function
    End If

    d.Found = True
' get mcode function call
    newParameters1 jsonText, r
    On Error Resume Next
    d.Stock = CDbl(jsonObj("Product")("QuantityAvailable"))
    d.MFR = CStr(jsonObj("Product")("Manufacturer")("Name"))
    d.mPN = CStr(jsonObj("Product")("ManufacturerProductNumber"))
    d.UnitPrice = CDbl(jsonObj("Product")("UnitPrice"))
    d.ProductStatus = CStr(jsonObj("Product")("ProductStatus")("Status"))
    d.ManufacturerLeadTime = CStr(jsonObj("Product")("ManufacturerLeadWeeks"))
    
    If pullDesc Then d.Description = CStr(jsonObj("Product")("Description")("ProductDescription"))
    On Error GoTo 0

    ' Choose a canonical DigiKey PN:
    ' Prefer common package types you already used (CT/Tray/Bulk/Tube/Box/Strip), else first available.
    Dim productVariations As Object
    Set productVariations = jsonObj("Product")("ProductVariations")

    Dim p As Long
    Dim pnPicked As String: pnPicked = ""

    For p = 1 To productVariations.count
        If productVariations(p).Exists("PackageType") Then
            Dim pkg As String
            pkg = CStr(productVariations(p)("PackageType")("Name"))
            If pkg = "Cut Tape (CT)" Or pkg = "Tray" Or pkg = "Bulk" Or pkg = "Tube" Or pkg = "Box" Or pkg = "Strip" Then
                pnPicked = CStr(productVariations(p)("DigiKeyProductNumber"))
                Exit For
            End If
        End If
    Next p
    
    '========================
    ' NEW: Extract DigiKey Packaging ID and Type
    '========================
    DigiKeyPackID = ""
    PackType = ""
    
    ' First priority: Cut Tape keyword
    For p = 1 To productVariations.count
        If productVariations(p).Exists("PackageType") Then
            Dim pkgType As String
            pkgType = CStr(productVariations(p)("PackageType")("Name"))
            If InStr(1, pkgType, "Cut Tape", vbTextCompare) > 0 Then
                DigiKeyPackID = CStr(productVariations(p)("DigiKeyProductNumber"))
                PackType = pkgType
                Exit For
            End If
        End If
    Next p
    
    ' Second priority: Reel keyword (if Cut Tape not found)
    If DigiKeyPackID = "" Then
        For p = 1 To productVariations.count
            If productVariations(p).Exists("PackageType") Then
                pkgType = CStr(productVariations(p)("PackageType")("Name"))
                If InStr(1, pkgType, "Reel", vbTextCompare) > 0 Then
                    DigiKeyPackID = CStr(productVariations(p)("DigiKeyProductNumber"))
                    PackType = pkgType
                    Exit For
                End If
            End If
        Next p
    End If
    
    ' Third priority: First available (if neither found)
    If DigiKeyPackID = "" Then
        On Error Resume Next
        DigiKeyPackID = CStr(productVariations(1)("DigiKeyProductNumber"))
        If productVariations(1).Exists("PackageType") Then
            PackType = CStr(productVariations(1)("PackageType")("Name"))
        End If
        On Error GoTo 0
    End If
    '========================
    ' END: DigiKey Packaging ID and Type
    '========================
    'temporary checking
    pnPicked = DigiKeyPackID



    If pnPicked = "" Then
        On Error Resume Next
        pnPicked = CStr(productVariations(1)("DigiKeyProductNumber"))
        On Error GoTo 0
    End If

    d.distPN = pnPicked

    On Error Resume Next
    d.StandardPack = CLng(productVariations(1)("StandardPackage"))
    On Error GoTo 0

    ParseDigikeyJson = d
    Exit Function

Fail:
    d.Found = False
    ParseDigikeyJson = d
End Function

Private Function DigikeyHttpGet(ByVal url As String, ByVal clientID As String, ByVal clientSecret As String) As String
    On Error GoTo Fail

    If AccessToken = "" Or Now >= AccessTokenExpiry Then
        Dim tokenJsonText As String
        tokenJsonText = GetAccessToken()

        Dim tokenJson As Object
        Set tokenJson = JsonConverter.ParseJson(tokenJsonText)

        AccessToken = CStr(tokenJson("access_token"))
        AccessTokenExpiry = DateAdd("s", CLng(tokenJson("expires_in")), Now)
    End If

    Dim req As Object
    Set req = CreateObject("MSXML2.ServerXMLHTTP.6.0")

    req.Open "GET", url, False
    req.setRequestHeader "Content-Type", "application/x-www-form-urlencoded"
    req.setRequestHeader "X-DIGIKEY-Client-Id", clientID
    req.setRequestHeader "X-DIGIKEY-Client-Secret", clientSecret
    req.setRequestHeader "X-DIGIKEY-Locale-Site", DIGIKEY_SITE
    req.setRequestHeader "X-DIGIKEY-Locale-Currency", DIGIKEY_CURRENCY
    req.setRequestHeader "Authorization", "Bearer " & AccessToken
    req.setRequestHeader "X-DIGIKEY-Customer-Id", DIGIKEY_CUSTOMER_ID

    req.send

    DigikeyHttpGet = req.responseText
    Exit Function

Fail:
    DigikeyHttpGet = ""
End Function

'=========================================================
' Mouser: Fetch -> Cache -> Parse
'=========================================================
Private Function GetMouserProduct(ByVal queryKey As String, ByVal jsonFolder As String, ByVal forceApi As Boolean, ByVal pullDesc As Boolean) As ProductData
    Dim d As ProductData
    d.distributor = "Mouser"

    Dim cached As String
    cached = ReadCachedJsonSmart(jsonFolder, "Mouser", queryKey, forceApi)
    If cached <> "" Then
        d = ParseMouserJson(cached, queryKey, pullDesc)
        d.RawJson = cached
'        If d.Found Then
'            If d.distPN = "" Then d.distPN = queryKey
'            SaveCachedJsonDual cached, jsonFolder, "Mouser", d.distPN, queryKey
'        End If
        GetMouserProduct = d
        Exit Function
    End If

    Dim url As String
    url = MOUSER_URL & MOUSER_API_KEY

    Dim jsonText As String
    jsonText = MouserHttpPostKeyword(queryKey, url)

    d = ParseMouserJson(jsonText, queryKey, pullDesc)
    d.RawJson = jsonText

    If d.Found Then
        If d.distPN = "" Then d.distPN = queryKey
        SaveCachedJsonDual jsonText, jsonFolder, "Mouser", d.distPN, queryKey
    End If

    GetMouserProduct = d
End Function

Private Function MouserHttpPostKeyword(ByVal keyword As String, ByVal apiUrl As String) As String
    On Error GoTo Fail

    Dim requestPayload As String
    requestPayload = "{""SearchByKeywordRequest"":{""keyword"":""" & keyword & """,""records"":0,""startingRecord"":0,""searchOptions"":"""",""searchWithYourSignUpLanguage"":""""}}"

    Dim objHTTP As Object
    Set objHTTP = CreateObject("MSXML2.ServerXMLHTTP.6.0")

    With objHTTP
        .Open "POST", apiUrl, False
        .setRequestHeader "accept", "application/json"
        .setRequestHeader "Content-Type", "application/json"
        .send requestPayload
        MouserHttpPostKeyword = .responseText
    End With

    Exit Function

Fail:
    MouserHttpPostKeyword = ""
End Function

Private Function ParseMouserJson(ByVal jsonText As String, ByVal desiredKey As String, ByVal pullDesc As Boolean) As ProductData
    Dim d As ProductData
    d.distributor = "Mouser"

    If Len(jsonText) = 0 Then
        d.Found = False
        ParseMouserJson = d
        Exit Function
    End If

    On Error GoTo Fail

    Dim json As Object
    Set json = JsonConverter.ParseJson(jsonText)

    Dim parts As Object
    Set parts = json("SearchResults")("Parts")

    Dim part As Object, specificPart As Object
    Set specificPart = Nothing

    ' Prefer exact MouserPartNumber match if present
    For Each part In parts
        If LCase$(CStr(part("MouserPartNumber"))) = LCase$(desiredKey) Then
            Set specificPart = part
            Exit For
        End If
    Next part

    ' Otherwise take first result
    If specificPart Is Nothing Then
        If parts.count > 0 Then Set specificPart = parts(1)
    End If

    If specificPart Is Nothing Then
        d.Found = False
        ParseMouserJson = d
        Exit Function
    End If

    d.Found = True
    d.distPN = CStr(specificPart("MouserPartNumber"))
    d.MFR = CStr(specificPart("Manufacturer"))
    d.mPN = CStr(specificPart("ManufacturerPartNumber"))

    Dim avail As String
    avail = CStr(IIf(IsNull(specificPart("AvailabilityInStock")), "0", specificPart("AvailabilityInStock")))
    d.Stock = ParseMouserStock(avail)
    
    d.ManufacturerLeadTime = LeadTimeStringToWeeks(specificPart("LeadTime"))
    If IsNull(specificPart("LifecycleStatus")) Then
        d.ProductStatus = "Active"
    Else
        d.ProductStatus = specificPart("LifecycleStatus")
    End If


    If pullDesc Then d.Description = CStr(specificPart("Description"))

    ' Price: first price break if exists
    On Error Resume Next
    If specificPart("PriceBreaks").count > 0 Then d.UnitPrice = CDbl(specificPart("PriceBreaks")(1)("Price"))
    On Error GoTo 0

    ' Standard Pack Qty attribute
    On Error Resume Next
    Dim attrs As Object, a As Object
    Set attrs = specificPart("ProductAttributes")
    For Each a In attrs
        If CStr(a("AttributeName")) = "Standard Pack Qty" Then
            d.StandardPack = CLng(a("AttributeValue"))
            Exit For
        End If
    Next a
    On Error GoTo 0
    
        '========================
        ' new: extract all packaging attribute values
        '========================
        PackType = ""
        On Error Resume Next
        For Each a In attrs
            If InStr(1, CStr(a("AttributeName")), "Packaging", vbTextCompare) > 0 Then
                If PackType = "" Then
                    PackType = CStr(a("AttributeValue"))
                Else
                    PackType = PackType & ", " & CStr(a("AttributeValue"))
                End If
            End If
        Next a
        On Error GoTo 0
        '========================
        ' end: mouser packaging
        '========================
    
        ParseMouserJson = d
        Exit Function
    
Fail:
    d.Found = False
    ParseMouserJson = d
End Function

Private Function ParseMouserStock(ByVal availability As String) As Double
    availability = Replace(availability, ",", "")
    ParseMouserStock = Val(availability)
End Function

'=========================================================
' TOKEN
'=========================================================
Public Function GetAccessToken() As String
    Dim http As Object
    Dim url As String
    Dim response As String

    url = "https://api.digikey.com/v1/oauth2/token"

    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.Open "POST", url, False
    http.setRequestHeader "Content-Type", "application/x-www-form-urlencoded"

    Dim postData As String
    postData = "client_id=" & DIGIKEY_CLIENT_ID & _
               "&client_secret=" & DIGIKEY_CLIENT_SECRET & _
               "&grant_type=client_credentials"

    http.send postData
    response = http.responseText

    GetAccessToken = response

    Set http = Nothing
End Function

'=========================================================
' CACHE HELPERS (FIXES YOUR ISSUE #2)
'=========================================================
Private Function CacheFileName(ByVal distributor As String, ByVal key As String) As String
    key = SanitizeFileKey(key)
    'cachefilename = distributor & "__" & key & ".json"
    CacheFileName = key & ".json"
End Function

Private Function SanitizeFileKey(ByVal key As String) As String
    key = Replace(key, "/", "_")
    key = Replace(key, "\", "_")
    key = Replace(key, ":", "_")
    key = Replace(key, "*", "_")
    key = Replace(key, "?", "_")
    key = Replace(key, """", "_")
    key = Replace(key, "<", "_")
    key = Replace(key, ">", "_")
    key = Replace(key, "|", "_")
    SanitizeFileKey = key
End Function

Private Function ReadCachedJsonSmart(ByVal folderPath As String, ByVal distributor As String, ByVal key As String, ByVal forceApi As Boolean) As String
    If forceApi Then
        ReadCachedJsonSmart = ""
        Exit Function
    End If

    Dim filePath As String
    filePath = folderPath & CacheFileName(distributor, key)

    ' Use your existing reader (it already bypasses cache when response1=Yes, but here we control it)
    ReadCachedJsonSmart = ReadJSONFromFile(filePath, vbNo)
    If ReadCachedJsonSmart <> "" Then
        dt = GetFileModifiedDate(filePath)
        dt = ConvertToCanadianDateTime(dt)
    End If
End Function

Private Sub SaveCachedJsonDual(ByVal jsonText As String, ByVal folderPath As String, ByVal distributor As String, ByVal canonicalKey As String, ByVal queryKey As String)
    If Len(jsonText) = 0 Then Exit Sub
    If Len(canonicalKey) = 0 Then canonicalKey = queryKey

    Call SaveJSONToFile(jsonText, folderPath, CacheFileName(distributor, canonicalKey))

    If LCase$(canonicalKey) <> LCase$(queryKey) Then
        Call SaveJSONToFile(jsonText, folderPath, CacheFileName(distributor, queryKey))
    End If
End Sub

'=========================================================
' URL ENCODE (DigiKey key only needs "/" fix in your original,
' but we'll keep it safe for that case)
'=========================================================
Private Function UrlEncodeDigikeyKey(ByVal s As String) As String
    ' Minimal: DigiKey needs "/" encoded for path segment
    UrlEncodeDigikeyKey = Replace(s, "/", "%2F")
End Function

'=========================================================
' YOUR EXISTING FILE FUNCTIONS (KEEP / REUSE)
'=========================================================
Public Function SaveJSONToFile(jsonResponse As String, folderPath As String, Optional fileName As String = "") As String
    Dim filePath As String
    Dim fileNum As Integer

    If Right(folderPath, 1) <> "\" Then folderPath = folderPath & "\"

    If fileName = "" Then
        fileName = "api_response_" & Format(Now, "yyyymmdd_hhnnss") & ".json"
    End If

    filePath = folderPath & fileName

    If Dir(folderPath, vbDirectory) = "" Then
        MkDir folderPath
    End If

    fileNum = FreeFile
    Open Replace(filePath, "/", "_") For Output As #fileNum
        Print #fileNum, jsonResponse
    Close #fileNum
    
    dt = GetCanadianDateTime()

    SaveJSONToFile = filePath
End Function

Public Function ReadJSONFromFile(filePath As String, response1 As VbMsgBoxResult) As String
    Dim fileNum As Integer
    Dim fileContent As String

    If Dir(filePath) = "" Then
        ReadJSONFromFile = ""
        Exit Function
    End If

    ' If response1 is Yes -> force API -> bypass cache
    If response1 = vbYes Then
        ReadJSONFromFile = ""
        Exit Function
    End If

    fileNum = FreeFile
    Open filePath For Input As #fileNum
        fileContent = Input$(LOF(fileNum), fileNum)
    Close #fileNum

    ReadJSONFromFile = fileContent
    
    Dim jsonObj As Object
    Set jsonObj = JsonConverter.ParseJson(ReadJSONFromFile)
    
    If jsonObj("status") = 401 Then
        ReadJSONFromFile = ""
        Exit Function
    End If
    
End Function

Public Function ExtractFolderName(ByVal fullPath As String) As String
    Dim folders() As String
    Dim folderName As String

    folders = Split(fullPath, "\")

    If UBound(folders) >= 2 Then
        folderName = folders(UBound(folders) - 2)
    Else
        folderName = ""
    End If

    ExtractFolderName = folderName
End Function

Public Function LeadTimeStringToWeeks(ByVal LeadTimeText As String) As Long
    Dim days As Long
    
    ' Extract the numeric part (assumes format like "42 Days")
    days = CLng(Val(LeadTimeText))
    
    ' Convert days to whole weeks
    LeadTimeStringToWeeks = days \ 7
End Function


Public Function GetCanadianDateTime() As Date
    ' Gets Canadian Eastern Time (Toronto, Ottawa, Montreal)
    ' Works from anywhere in the world
    
    Dim utcST As SYSTEMTIME
    Dim utcDate As Date
    Dim canadianOffset As Double
    
    ' Get true UTC time from Windows
    GetSystemTime utcST
    
    ' Convert to VBA Date
    utcDate = DateSerial(utcST.wYear, utcST.wMonth, utcST.wDay) + _
              TimeSerial(utcST.wHour, utcST.wMinute, utcST.wSecond)
    
    ' Canadian Eastern Time offset from UTC
    ' Standard Time (Nov-Mar): UTC-5
    ' Daylight Time (Mar-Nov): UTC-4
    If IsCanadianDST(utcDate) Then
        canadianOffset = -4 / 24  ' EDT (Daylight)
    Else
        canadianOffset = -5 / 24  ' EST (Standard)
    End If
    
    GetCanadianDateTime = utcDate + canadianOffset
End Function
'=========================================================
' CONVERT ANY DATE TO CANADIAN EASTERN TIME
'=========================================================
Private Function ConvertToCanadianDateTime(ByVal localDate As Date) As Date
    Dim utcST As SYSTEMTIME
    Dim utcDate As Date
    Dim canadianOffset As Double
    Dim localOffset As Double
    
    GetSystemTime utcST
    utcDate = DateSerial(utcST.wYear, utcST.wMonth, utcST.wDay) + _
              TimeSerial(utcST.wHour, utcST.wMinute, utcST.wSecond)
    
    localOffset = (Now - utcDate)
    utcDate = localDate - localOffset
    
    If IsCanadianDST(utcDate) Then
        canadianOffset = -4 / 24
    Else
        canadianOffset = -5 / 24
    End If
    
    ConvertToCanadianDateTime = utcDate + canadianOffset
End Function
Private Function IsCanadianDST(utcDate As Date) As Boolean
    ' Canadian DST: 2nd Sunday of March to 1st Sunday of November
    Dim yr As Integer
    Dim dstStart As Date
    Dim dstEnd As Date
    
    yr = Year(utcDate)
    
    ' Find 2nd Sunday of March
    dstStart = DateSerial(yr, 3, 1)
    Do While Weekday(dstStart) <> vbSunday
        dstStart = dstStart + 1
    Loop
    dstStart = dstStart + 7  ' 2nd Sunday
    dstStart = dstStart + TimeSerial(2, 0, 0)  ' 2 AM
    
    ' Find 1st Sunday of November
    dstEnd = DateSerial(yr, 11, 1)
    Do While Weekday(dstEnd) <> vbSunday
        dstEnd = dstEnd + 1
    Loop
    dstEnd = dstEnd + TimeSerial(2, 0, 0)  ' 2 AM
    
    IsCanadianDST = (utcDate >= dstStart And utcDate < dstEnd)
End Function


'=========================================================
' GET FILE MODIFIED DATE
'=========================================================
Private Function GetFileModifiedDate(ByVal filePath As String) As Date
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    If fso.FileExists(filePath) Then
        GetFileModifiedDate = fso.GetFile(filePath).DateLastModified
    Else
        GetFileModifiedDate = 0
    End If
    
    Set fso = Nothing
End Function


