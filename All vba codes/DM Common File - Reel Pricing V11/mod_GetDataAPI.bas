Attribute VB_Name = "mod_GetDataAPI"
Sub LCSCAPIDataRequest()
    '=================================================================================
    ' PROCEDURE: LCSCAPIDataRequest
    ' PURPOSE:   Fetches component data from LCSC API and populates MasterSheet
    '            Supports both cached JSON files and fresh API calls
    '            Handles primary LCSC part numbers and alternative part numbers
    ' MODIFIED:  - JSON files only saved for primary LCSC PN searches
    '            - Alternative searches read from cache but don't create new files
    '=================================================================================
    
    '------- API Configuration Variables -------
    Dim LCSC_KEY As String          ' LCSC API access key
    Dim LCSC_SECRET As String       ' LCSC API secret key
    Dim url As String               ' API endpoint URL
    Dim nonce As String             ' Security nonce for API authentication
    Dim timestamp As String         ' Timestamp for API authentication
    Dim signature As String         ' Generated signature for API authentication
    Dim newPayload As String        ' Payload data for API request
    Dim response As String          ' API response data (JSON)
    
    '------- Exchange Rate Variables -------
    Dim exchangeRate As Double      ' Current exchange rate
    Dim defaultRate As Double       ' Default/fallback exchange rate
    
    '------- Worksheet References -------
    Dim mfrWs As Worksheet          ' Reference to MFR_TmpSheet (Manufacturer Temporary Sheet)
    Dim mfrLR As Long               ' Last row in MFR_TmpSheet
    Dim ms As Worksheet             ' Reference to MasterSheet (main data sheet)
    Dim msLR As Long                ' Last row in MasterSheet
    
    '------- Loop and Progress Variables -------
    Dim j As Long                   ' Loop counter for row iteration
    Dim totalRecords As Long        ' Total number of records to process
    Dim processedRecords As Long    ' Count of records processed so far
    Dim useAPIDirectly As Boolean   ' Flag: True=Always use API, False=Check cache first
    
    '------- File Path Variables -------
    Dim JsonFolderPath As String    ' Path to folder where JSON files are stored
    Dim fullPath As String          ' Full path of current workbook
    Dim parentFolderName As String  ' Parent folder name extracted from path

    '=================================================================================
    ' STEP 1: INITIALIZE WORKSHEETS AND SETUP PATHS
    '=================================================================================
    
    ' Set reference to MasterSheet where main data is stored
    Set ms = ThisWorkbook.Sheets("MasterSheet")
    
    ' Set reference to MFR_TmpSheet for temporary manufacturer data
    Set mfrWs = ThisWorkbook.Sheets("MFR_TmpSheet")
    
    
    ' Find the next available row in MFR_TmpSheet (one row after last used row)
    mfrLR = mfrWs.Cells(mfrWs.Rows.count, 1).End(xlUp).Row + 1
    
    ' Clear previous data from MFR_TmpSheet (rows 2 to 10000)
    mfrWs.Range("A2:F10000").ClearContents
    
    '------- Setup JSON Cache Folder Path -------
    ' Get the local file path of this workbook
    fullPath = GetLocalPath(ThisWorkbook.fullName)
    
    ' Extract the parent folder name from the path
    parentFolderName = ExtractFolderName(fullPath)
    
    ' Construct path to JSON data folder: ...\6. BACKEND\JSON DATA\
    JsonFolderPath = Left(fullPath, InStr(1, fullPath, parentFolderName, vbTextCompare) + Len(parentFolderName)) & "6. BACKEND\JSON DATA\"
    
    ' Output path to Immediate Window for debugging
    'Debug.Print JsonFolderPath
    
    '=================================================================================
    ' STEP 2: SET API CREDENTIALS
    '=================================================================================
    
    ' LCSC API credentials for authentication
    LCSC_KEY = "7Fu3OUGZ4KlEfU5l0QzGXAEG7b"
    LCSC_SECRET = "Le8WX2RgLQvYpia9xSQLJRxeUztbm7xoUex"

    '=================================================================================
    ' STEP 3: ASK USER FOR API ACCESS PREFERENCE
    '=================================================================================
    
    ' Show message box asking if user wants to access API
    ' Returns: vbYes, vbNo, or vbCancel
    Dim response1 As VbMsgBoxResult
    response1 = MsgBox("Access data from API?" & vbCrLf & vbCrLf & _
                       "Yes = Always use fresh API data" & vbCrLf & _
                       "No = Use cached JSON files (if available)", _
                       vbYesNoCancel + vbQuestion, "Confirmation")
    
    ' If user clicks Cancel, exit the procedure immediately
    If response1 = vbCancel Then Exit Sub
    
    ' Set flag based on user response:
    ' - vbYes (True)  ? Always make fresh API calls, ignore cached JSON
    ' - vbNo (False)  ? Check cached JSON first, only call API if cache missing
    useAPIDirectly = (response1 = vbYes)

    '=================================================================================
    ' STEP 4: INITIALIZE WORKSHEET REFERENCES AND HEADERS
    '=================================================================================
    
    ' Get references to input and calculation worksheets
    Dim inputWS As Worksheet
    Dim priceCalcWS As Worksheet
    Set inputWS = ThisWorkbook.Sheets("DataInputSheets")
    Set priceCalcWS = ThisWorkbook.Sheets("Price Calc")

    ' Initialize column headers in worksheets
    initialiseHeaders inputWS, , ms
    
    ' Find the last row with data in MasterSheet (using CPC column as reference)
    msLR = ms.Cells(ms.Rows.count, Master_CPC_Column).End(xlUp).Row

    ' Calculate total records to process (excluding header rows 1-3)
    totalRecords = msLR - 3
    ' clearning existing colors on  LCSC MFR column
    ms.Range(ms.Cells(4, Master_LCSCMFR_Column), ms.Cells(totalRecords, Master_LCSCMFR_Column)).Interior.Color = xlNone
    
    
    
    '=================================================================================
    ' STEP 5: INITIALIZE PROGRESS USER FORM
    '=================================================================================
    
    ' Display progress form without blocking user interaction
    UserForm1.Show vbModeless
    
    ' Configure UserForm appearance
    UserForm1.Caption = "LCSC API"              ' Window title
    UserForm1.width = 246                       ' Form width
    UserForm1.Height = 187.4                    ' Form height
    UserForm1.ProgressFrame.Caption = "Progress Status"
    
    ' Set main progress labels
    UserForm1.lblmainProgCaption.Caption = "Processing LCSC Data"
    UserForm1.lblsubProgCaption.Caption = "Initializing..."
    
    ' Reset progress bars to 0%
    UserForm1.lblmainProgPerc.width = 0         ' Main progress bar width = 0
    UserForm1.lblmainProgPercDisp.Caption = "0%"    ' Main progress percentage text
    UserForm1.lblsubProgPerc.width = 0          ' Sub progress bar width = 0
    
    ' Force UI update
    DoEvents

    '=================================================================================
    ' STEP 6: MAIN PROCESSING LOOP - ITERATE THROUGH EACH ROW
    '=================================================================================
    
    ' Initialize processed records counter
    processedRecords = 0

    ' Loop through each row in MasterSheet (starting from row 4)
    For j = 4 To msLR
        '------- Get LCSC Part Number from Current Row -------
        Dim lcscPN As String
        '------- Reset validation flag for each row -------
        Dim dataIsValid As Boolean
        dataIsValid = False
        lcscPN = ms.Cells(j, Master_LCSCPN_Column).value

        '------- Validate LCSC Part Number -------
        ' Only process if:
        ' 1. Part number starts with "C" (LCSC format)
        ' 2. Part number is not empty
        ' If invalid, skip to alternative columns section
        If Not Left(lcscPN, 1) = "C" Or lcscPN = "" Or lcscPN = "NOLCSC" Then
            GoTo AlternateColumns
        Else
            '=======================================================================
            ' STEP 6A: PROCESS PRIMARY LCSC PART NUMBER
            '=======================================================================
            
            ' Update progress form to show current part number being processed
            UserForm1.lblsubProgCaption.Caption = "LCSC PN: " & lcscPN
            DoEvents

            '------- Initialize response variable -------
            response = ""
            
            '------- DECISION: Use API directly OR check cache first -------
            If useAPIDirectly Then
                '*** USER CHOSE "YES" - ALWAYS USE FRESH API DATA ***
                
                ' Build API URL for specific LCSC part number
                url = "https://ips.lcsc.com/rest/wmsc2agent/product/info/" & lcscPN
                
                ' Make API call and save response to JSON file
                ' This will OVERWRITE existing cache file if it exists
                response = MakeLCSCAPICall(url, LCSC_KEY, LCSC_SECRET, JsonFolderPath, lcscPN & ".json")
            Else
                '*** USER CHOSE "NO" - CHECK CACHE FIRST ***
                
                ' Try to read existing JSON file from cache folder
                response = ReadJSONFromFile(JsonFolderPath & lcscPN & ".json", vbNo)
                
                ' If JSON file not found (response is empty)
                If response = "" Then
                    ' Build API URL and make fresh API call
                    url = "https://ips.lcsc.com/rest/wmsc2agent/product/info/" & lcscPN
                    
                    ' Make API call and save response to JSON file for future use
                    response = MakeLCSCAPICall(url, LCSC_KEY, LCSC_SECRET, JsonFolderPath, lcscPN & ".json")
                End If
            End If

            '=======================================================================
            ' STEP 6B: PARSE PRIMARY API RESPONSE DATA
            '=======================================================================
            
            ' Variables to store parsed data
            Dim Stockquantity As Long       ' Available stock quantity
            Dim manufacturerName As String  ' Manufacturer name
            Dim mPN As String               ' Manufacturer Part Number
            
            ' Check if we received any response data
                If response <> "" Then
                    ' Enable error handling to prevent crashes from JSON parsing errors
                    On Error Resume Next
                    
                    ' Parse JSON string into object
                    Dim jsonObject As Object
                    Set jsonObject = JsonConverter.ParseJson(response)
                
                    ' Check if JSON was parsed successfully AND API returned success code (200)
                    If Not jsonObject Is Nothing And jsonObject("code") = 200 Then
                        ' Extract data from JSON response
                        manufacturerName = jsonObject("result")("manufacturer")("name")
                        mPN = jsonObject("result")("mpn")
                        Stockquantity = jsonObject("result")("quantity")
                        
                        ' Mark that we found valid data for this LCSC PN
                        dataIsValid = True
                        
                        ' Write data to MasterSheet columns (even if stock is 0)
                        ms.Cells(j, Master_LCSCStock_Column).value = Stockquantity
                        ms.Cells(j, Master_LCSCMPN_Column).value = mPN
                        ms.Cells(j, Master_LCSCMFR_Column).value = manufacturerName
                    Else
                        ' API call failed or returned error code - mark as invalid
                        ms.Cells(j, Master_LCSCStock_Column).value = ""
                        dataIsValid = False
                    End If
                    
                    ' Restore normal error handling
                    On Error GoTo 0
                Else
                    ' No response received from API - mark as invalid
                    dataIsValid = False
                    ms.Cells(j, Master_LCSCStock_Column).value = ""
                End If

AlternateColumns:

            '=======================================================================
            ' STEP 6C: CHECK ALTERNATIVE PART NUMBERS IF PRIMARY FAILED
            '=======================================================================
            
                ' Skip alternative search if primary LCSC PN was found successfully
                    If dataIsValid Then GoTo SkipAlternatives
            
            
                '------- Setup Alternative Column Arrays -------
                ' Define which columns contain alternative part numbers
                Dim altColumns As Variant
                Dim altColumnNames As Variant
                altColumns = Array(Master_PNTOUSE_Column, Master_MFRHas_Column)
                altColumnNames = Array("PN to Use", "MFR#")  ' User-friendly names for display
                
                '------- Variables for Alternative Processing -------
                Dim alt As Integer              ' Loop counter for alternative columns
                Dim altPN As String             ' Alternative part number
                Dim altURL As String            ' API URL for alternative search
                Dim altResponse As String       ' API response for alternative
                Dim altSuccess As Boolean       ' Flag: did we find valid alternative?
                Dim CPCNo As String             ' CPC number for current component
                Dim altMRF As String            ' Alternative manufacturer name
                Dim checkMFR As String          ' Manufacturer name to match against
                Dim result As Variant           ' Array result from match function
                Dim jsonFileName As String      ' JSON filename for alternative
                
                ' Initialize alternative success flag
                altSuccess = False

                '------- Loop Through Each Alternative Column -------
                For alt = 0 To UBound(altColumns)
                    ' If we already found valid alternative, exit loop
                    If altSuccess Then Exit For
                    
                    '------- Get Alternative Part Number and Related Data -------
                    altPN = Trim(ms.Cells(j, altColumns(alt)).value)  ' Remove whitespace
                    CPCNo = ms.Cells(j, Master_CPC_Column).value      ' Get CPC number
                    checkMFR = ms.Cells(j, Master_MFR_Column).value   ' Get manufacturer to match
                    
                    ' For second alternative (alt=1), use different manufacturer column
                    If alt = 1 Then
                        checkMFR = ms.Cells(j, Master_ManufacturerName_Column).value
                    End If
                    
                    '------- Process Alternative Only If Part Number Exists -------
                    If altPN <> "" Then
                        ' Update progress form to show which alternative is being checked
                        UserForm1.lblsubProgCaption.Caption = "Checking " & altColumnNames(alt) & ": " & altPN
                        DoEvents

                        '------- Set JSON Filename -------
                        jsonFileName = altPN & ".json"

                        '------- Initialize response -------
                        altResponse = ""
                        
                        '=======================================================================
                        ' Alternative searches read cache but don't save
                        '=======================================================================
                        
                        If useAPIDirectly Then
                            '*** USER CHOSE "YES" - USE API BUT DON'T SAVE FOR ALTERNATIVES ***
                            
                            ' Build search API URL (different endpoint than primary)
                            altURL = "https://ips.lcsc.com/rest/wmsc2agent/search/product?keyword=" & altPN
                            
                            ' Make API call with empty filename to prevent saving
                            altResponse = MakeLCSCSearchCall(altURL, LCSC_KEY, LCSC_SECRET, JsonFolderPath, "")
                        Else
                            '*** USER CHOSE "NO" - CHECK CACHE ONLY, DON'T CREATE NEW FILES ***
                            
                            ' Try to read existing JSON file (won't error if not found)
                            altResponse = ReadJSONFromFile(JsonFolderPath & jsonFileName, vbNo)
                            
                            ' If JSON file not found, make API call WITHOUT saving
                            If altResponse = "" Then
                                ' Build search API URL
                                altURL = "https://ips.lcsc.com/rest/wmsc2agent/search/product?keyword=" & altPN
                                
                                ' Make API call with empty filename to prevent saving
                                altResponse = MakeLCSCSearchCall(altURL, LCSC_KEY, LCSC_SECRET, JsonFolderPath, "")
                            End If
                        End If

                        '=======================================================================
                        ' STEP 6D: PARSE ALTERNATIVE API RESPONSE
                        '=======================================================================
                        
                        ' Check if we received response data
                        If altResponse <> "" Then
                            ' Enable error handling
                            On Error Resume Next
                            
                            ' Parse JSON response
                            Dim altJsonObject As Object
                            Set altJsonObject = JsonConverter.ParseJson(altResponse)

                            ' Check if parsing successful AND API returned success code
                            If Not altJsonObject Is Nothing And altJsonObject("code") = 200 Then
                                '------- Variables for Alternative Data -------
                                Dim altLCSCpn As String     ' Alternative LCSC part number
                                Dim altStock As Long        ' Alternative stock quantity
                                Dim altMPN As String        ' Alternative MPN
                                Dim matchType As String     ' Match quality (FullyMatched/PartialMatched)
                                
                                '------- Check if Product List Exists in Response -------
                                ' Search endpoint returns array of products
                                If Not IsEmpty(altJsonObject("result")("product_list")) Then
                                    ' Check if array has at least one product
                                    If UBound(altJsonObject("result")("product_list")) >= 0 Then
                                        '------- Find Best Manufacturer Match -------
                                        ' Call custom function to find product with best matching manufacturer
                                        ' Returns array: [LCSC_PN, Manufacturer, MPN, Stock, MatchType]
                                        result = FindBestMfrMatch(checkMFR, altJsonObject, CPCNo)
                                        
                                        '------- Extract Results from Array -------
                                        altLCSCpn = result(0)   ' LCSC Part Number
                                        altMRF = result(1)      ' Manufacturer name
                                        altMPN = result(2)      ' Manufacturer Part Number
                                        altStock = result(3)
                                        matchType = result(4)   ' Match type flag

                                        '------- Validate Alternative (must have stock) -------
                                        If altStock > 0 And matchType <> "NoMatch" Then
                                            ' Mark alternative as successful
                                            altSuccess = True
                                            
                                            '------- Apply Color Coding Based on Match Quality -------
                                            If matchType = "FullyMatched" Then
                                                ' GREEN = Perfect manufacturer match (Priority 1: Exact match)
                                                ms.Cells(j, Master_LCSCMFR_Column).Interior.Color = RGB(144, 238, 144)  ' Light Green
                                            ElseIf matchType = "PartialMatched" Or matchType = "NormalizedPartial" Or matchType = "NormalizedMatch" Then
                                                ' LIGHT GREEN/ORANGE = All other matches
                                                ' Includes: PartialMatched, NormalizedPartial, NormalizedMatch
                                                ' You can choose either Light Green or Orange:
                                                
                                                ' OPTION 1: Light Green (subtle difference)
                                                'ms.Cells(j, Master_LCSCMFR_Column).Interior.Color = RGB(152, 251, 152)  ' Pale Green
                                                
                                                ' OPTION 2: Orange (more distinct)
                                                 ms.Cells(j, Master_LCSCMFR_Column).Interior.Color = RGB(255, 200, 120)  ' Light Orange
                                                
                                                ' OPTION 3:  Yellow
                                                ' ms.Cells(j, Master_LCSCMFR_Column).Interior.Color = RGB(224, 255, 64)  ' Yellow
                                            End If
                                            
                                            
                                            
                                            '------- Write Alternative Data to MasterSheet -------
                                            ms.Cells(j, Master_LCSCPN_Column).value = altLCSCpn
                                            ms.Cells(j, Master_LCSCStock_Column).value = altStock
                                            ms.Cells(j, Master_LCSCMPN_Column).value = altMPN
                                            ms.Cells(j, Master_LCSCMFR_Column).value = altMRF
                                            
                                            
                                            
                                            '------- Mark Which Alternative Source Was Used -------
                                            'ms.Cells(j, Master_AltSource_Column).value = "Alt " & (alt + 1) & ": " & altColumnNames(alt)
                                        Else
                                            ms.Cells(j, Master_LCSCPN_Column).value = "NOLCSC"
                                            ms.Cells(j, Master_LCSCStock_Column).value = ""
                                        End If
                                    End If
                                End If
                            End If
                            
                            ' Restore normal error handling
                            On Error GoTo 0
                        End If
                    End If
                Next alt

                '=======================================================================
                ' STEP 6E: HANDLE CASE WHERE ALL ALTERNATIVES FAILED
                '=======================================================================
                
                ' If no alternative provided valid data
                If Not altSuccess Then
                    ' Update progress form
                    UserForm1.lblsubProgCaption.Caption = "No stock found for any alternative"
                    
                    ' Mark LCSC PN column as "NOLCSC" to indicate no LCSC source available
                    'ms.Cells(j, Master_LCSCPN_Column).value = "NOLCSC"
                    ' Clear stock column when no match found
                    'ms.Cells(j, Master_LCSCStock_Column).ClearContents
                End If
            
SkipAlternatives:
            '=======================================================================
            ' STEP 6F: UPDATE PROGRESS TRACKING
            '=======================================================================
            
            ' Increment processed records counter
            processedRecords = processedRecords + 1
            
            ' Update next available row in MFR temp sheet
            mfrLR = mfrWs.Cells(mfrWs.Rows.count, 1).End(xlUp).Row + 1
            
            '------- Update Main Progress Bar -------
            Dim mainProgress As Double
            mainProgress = processedRecords / totalRecords  ' Calculate percentage (0 to 1)
            
            ' Update progress percentage text (e.g., "45%")
            UserForm1.lblmainProgPercDisp.Caption = Format(mainProgress, "0%")
            
            ' Update progress bar width (180 = max width)
            UserForm1.lblmainProgPerc.width = mainProgress * 180
            
            ' Force UI update
            DoEvents
        End If
    Next j

    '=================================================================================
    ' STEP 7: CLEANUP AND COMPLETION
    '=================================================================================
    
    ' Close and unload the progress form
    Unload UserForm1

    ' Show completion message with summary
    MsgBox "API data request completed!" & vbCrLf & _
           "Processed " & processedRecords & " Records.", vbInformation

End Sub


' ============================================================================
' HELPER FUNCTION: Make LCSC API Call (Direct Product Lookup)
' ============================================================================
' PURPOSE: Get detailed product info for a specific LCSC part number
' PARAMETERS:
'   - url: API endpoint URL
'   - apiKey/apiSecret: Authentication credentials
'   - jsonPath: Folder path to save JSON cache
'   - fileName: Cache file name (e.g., "C12345.json")
' RETURNS: JSON response string
' NOTE: This function SAVES to cache (for primary LCSC searches only)
' ============================================================================
Private Function MakeLCSCAPICall(url As String, apiKey As String, apiSecret As String, _
                                 jsonPath As String, fileName As String) As String
    Dim nonce As String
    Dim timestamp As String
    Dim signature As String
    Dim newPayload As String
    Dim response As String
    Dim y As Integer
    
    ' Generate random nonce (16 lowercase letters)
    Randomize
    nonce = ""
    For y = 1 To 16
        nonce = nonce & Chr(asc("a") + Int((asc("z") - asc("a") + 1) * Rnd))
    Next y

    ' Generate Unix timestamp (seconds since 1970-01-01)
    timestamp = Round(DateDiff("s", DateSerial(1970, 1, 1), ConvertToUtc(Now)))

    ' Generate signature hash for authentication
    newPayload = "key=" & apiKey & "&nonce=" & nonce & "&secret=" & apiSecret & "&timestamp=" & timestamp
    signature = SHA1(newPayload)
    newPayload = "key=" & apiKey & "&nonce=" & nonce & "&timestamp=" & timestamp

    ' Make HTTP request to LCSC API
    response = SendRequest(url, newPayload, signature)

    ' Retry logic: Try up to 3 times if request fails
    Dim jsonResponse As Object
    Set jsonResponse = JsonConverter.ParseJson(response)
    Dim responseCode As Integer
    responseCode = jsonResponse("code")
    Dim retryCount As Integer
    retryCount = 0

    Do While responseCode <> 200 And retryCount < 3
        Application.Wait (Now + TimeValue("0:00:01"))
        response = SendRequest(url, newPayload, signature)
        Set jsonResponse = JsonConverter.ParseJson(response)
        responseCode = jsonResponse("code")
        retryCount = retryCount + 1
    Loop

    ' Save to cache file if successful (only for primary LCSC searches)
    If responseCode = 200 And fileName <> "" Then
        SaveJSONToFile response, jsonPath, fileName
    End If
    
    MakeLCSCAPICall = response
End Function

' ============================================================================
' HELPER FUNCTION: Make LCSC Search API Call
' ============================================================================
' PURPOSE: Search for products by keyword (returns multiple results)
' PARAMETERS:
'   - baseUrl: Search endpoint URL with keyword
'   - apiKey/apiSecret: Authentication credentials
'   - jsonPath: Folder path (not used for alternatives)
'   - fileName: Cache file name (empty string for alternatives)
'   - saveToFile: TRUE = save to cache, FALSE = don't save (for alternatives)
' RETURNS: JSON response string
' NOTE: Alternatives use FALSE to prevent cache file creation
' ============================================================================
Private Function MakeLCSCSearchCall(baseUrl As String, apiKey As String, apiSecret As String, _
                                    jsonPath As String, fileName As String, _
                                    Optional saveToFile As Boolean = True) As String
    Dim nonce As String
    Dim timestamp As String
    Dim signature As String
    Dim authPayload As String
    Dim fullURL As String
    Dim response As String
    Dim y As Integer
    
    ' Generate random nonce (16 lowercase letters)
    Randomize
    nonce = ""
    For y = 1 To 16
        nonce = nonce & Chr(asc("a") + Int((asc("z") - asc("a") + 1) * Rnd))
    Next y

    ' Generate Unix timestamp
    timestamp = Round(DateDiff("s", DateSerial(1970, 1, 1), ConvertToUtc(Now)))

    ' Generate signature for authentication
    authPayload = "key=" & apiKey & "&nonce=" & nonce & "&secret=" & apiSecret & "&timestamp=" & timestamp
    signature = SHA1(authPayload)
    
    ' Append authentication parameters to URL (search endpoint uses GET with URL params)
    fullURL = baseUrl & "&key=" & apiKey & "&nonce=" & nonce & "&timestamp=" & timestamp & "&signature=" & signature
    
    ' Make GET request
    response = SendGetRequest(fullURL)

    ' Retry logic: Try up to 3 times if request fails
    Dim jsonResponse As Object
    Set jsonResponse = JsonConverter.ParseJson(response)
    Dim responseCode As Integer
    responseCode = jsonResponse("code")
    Dim retryCount As Integer
    retryCount = 0

    Do While responseCode <> 200 And retryCount < 3
        Application.Wait (Now + TimeValue("0:00:01"))
        
        ' Regenerate authentication for retry
        nonce = ""
        For y = 1 To 16
            nonce = nonce & Chr(asc("a") + Int((asc("z") - asc("a") + 1) * Rnd))
        Next y
        timestamp = Round(DateDiff("s", DateSerial(1970, 1, 1), ConvertToUtc(Now)))
        authPayload = "key=" & apiKey & "&nonce=" & nonce & "&secret=" & apiSecret & "&timestamp=" & timestamp
        signature = SHA1(authPayload)
        fullURL = baseUrl & "&key=" & apiKey & "&nonce=" & nonce & "&timestamp=" & timestamp & "&signature=" & signature
        
        response = SendGetRequest(fullURL)
        Set jsonResponse = JsonConverter.ParseJson(response)
        responseCode = jsonResponse("code")
        retryCount = retryCount + 1
    Loop

    ' Only save to cache if:
    '   - Response successful (code 200)
    '   - saveToFile = TRUE (FALSE for alternatives)
    '   - fileName is provided (empty for alternatives)
    If responseCode = 200 And saveToFile And fileName <> "" Then
        SaveJSONToFile response, jsonPath, fileName
    End If
    
    MakeLCSCSearchCall = response
End Function

' ============================================================================
' HELPER FUNCTION: Send GET Request
' ============================================================================
' PURPOSE: Make simple HTTP GET request
' PARAMETERS: url - Full URL with all parameters
' RETURNS: Response text from server
' ============================================================================
Private Function SendGetRequest(url As String) As String
    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP")
    
    http.Open "GET", url, False
    http.setRequestHeader "Accept", "application/json"
    http.send
    
    SendGetRequest = http.responseText
End Function

' ============================================================================
' FUNCTION: Find Best Manufacturer Match
' ============================================================================
' PURPOSE:
'   1. Search through all products returned by API
'   2. Find the best match based on manufacturer name
'   3. Write all products to MFR_TmpSheet for review
'   4. Return the best matching product data
'
' MATCHING LOGIC:
'   STEP 1: Try exact manufacturer name match (e.g., "Texas Instruments")
'   STEP 2: If no exact match, try partial matches:
'           - First word only (e.g., "Texas")
'           - Name without dashes (e.g., "STMicroelectronics")
'           - First word after removing dashes
'   STEP 3: If still no match, use first product as fallback
'
' PARAMETERS:
'   - checkMFR: Expected manufacturer name from MasterSheet
'   - jsonObject: Full API response with product list
'   - CPCNo: CPC number for logging to MFR_TmpSheet
'
' RETURNS: Array with 5 elements:
'   (0) LCSC Part Number
'   (1) Manufacturer Name
'   (2) Manufacturer Part Number (MPN)
'   (3) Stock Quantity
'   (4) Match Type: "FullyMatched" / "PartialMatched" / "NoMatch"
' ============================================================================



' ========================================================================
' FUNCTION: FindBestMfrMatch
' PURPOSE:  Find the best manufacturer match from JSON data using multiple matching strategies
' ========================================================================
' ========================================================================
' FUNCTION: FindBestMfrMatch
' PURPOSE:  Find the best manufacturer match from JSON data using multiple matching strategies
' ========================================================================
Function FindBestMfrMatch(checkMFR As String, jsonObject As Object, CPCNo As String) As Variant
    On Error GoTo ErrorHandler
    
    ' Variables for JSON navigation
    Dim productList As Object
    Dim product As Object
    Dim bestMatch As Object
    Dim i As Long
    Dim matchFound As Boolean
    Dim searchTerms As Variant
    Dim searchTerm As Variant
    Dim mfrName As String
    
    ' Variables for MFR_TmpSheet
    Dim ws As Worksheet
    Dim lastRow As Long
    Dim writeRow As Long
    
    ' Variables for return data
    Dim altLCSCpn As String
    Dim altMfr As String
    Dim altMPN As String
    Dim altStock As String
    Dim matchType As String
    
    ' Variables for normalized matching
    Dim normalizedCheckMFR As String
    Dim normalizedMfrName As String
    
    ' DEBUG: Initial output
'    Debug.Print String(50, "=")
'    Debug.Print "FINDING MATCH FOR: """ & checkMFR & """ (CPC: " & CPCNo & ")"
'    Debug.Print String(50, "=")
    
    ' ========================================================================
    ' STEP 1: VALIDATE JSON STRUCTURE
    ' ========================================================================
    
    If Not jsonObject.Exists("result") Then
        FindBestMfrMatch = Array("No result found", "", "", "", "NoMatch")
        Exit Function
    End If
    
    If Not jsonObject("result").Exists("product_list") Then
        FindBestMfrMatch = Array("No product_list found", "", "", "", "NoMatch")
        Exit Function
    End If
    
    Set productList = jsonObject("result")("product_list")
    
    If productList.count = 0 Then
        FindBestMfrMatch = Array("No products found", "", "", "", "NoMatch")
        Exit Function
    End If
    
    ' DEBUG: Show total products
    'Debug.Print "Total products in JSON: " & productList.count
    
    matchFound = False
    matchType = "NoMatch"
    
    ' ========================================================================
    ' STEP 2: PREPARE SEARCH TERMS AND NORMALIZED VERSION
    ' ========================================================================
    
    ReDim searchTerms(0 To 3)
    searchTerms(0) = Trim(checkMFR)
    searchTerms(1) = Split(Trim(checkMFR), " ")(0)
    searchTerms(2) = Replace(Trim(checkMFR), "-", "")
    
    If InStr(checkMFR, "-") > 0 Then
        searchTerms(3) = Split(Replace(Trim(checkMFR), "-", " "), " ")(0)
    Else
        searchTerms(3) = searchTerms(1)
    End If
    
    ' Pre-calculate normalized version for later use
    normalizedCheckMFR = NormalizeText(checkMFR)
    
    ' DEBUG: Show search terms
'    Debug.Print vbCrLf & "SEARCH TERMS PREPARED:"
'    Debug.Print "  Term 0 (Original): """ & searchTerms(0) & """"
'    Debug.Print "  Term 1 (First word): """ & searchTerms(1) & """"
'    Debug.Print "  Term 2 (No hyphens): """ & searchTerms(2) & """"
'    Debug.Print "  Term 3 (First word, no hyphens): """ & searchTerms(3) & """"
'    Debug.Print "  Normalized (alphabets only): """ & normalizedCheckMFR & """"
    
    ' ========================================================================
    ' STEP 3: FIRST PASS - EXACT MANUFACTURER MATCH (HIGHEST PRIORITY)
    ' ========================================================================
    
'    Debug.Print vbCrLf & "STEP 3: EXACT MATCH SEARCH (Priority 1)"
'    Debug.Print "Comparing: """ & Trim(checkMFR) & """"
    
    For i = 1 To productList.count
        Set product = productList(i)
        
        If product.Exists("manufacturer") Then
            If product("manufacturer").Exists("name") Then
                mfrName = product("manufacturer")("name")
                
                ' DEBUG: Show comparison for first few products
                If i <= 3 Then ' Show first 3 only to avoid clutter
                    'Debug.Print "  Product " & i & ": """ & mfrName & """"
                End If
                
                If StrComp(Trim(mfrName), Trim(checkMFR), vbTextCompare) = 0 Then
                    Set bestMatch = product
                    matchFound = True
                    matchType = "FullyMatched"
                    
                    ' DEBUG: Found match
'                    Debug.Print "  ? EXACT MATCH FOUND at product " & i
'                    Debug.Print "    Original: """ & checkMFR & """"
'                    Debug.Print "    JSON: """ & mfrName & """"
'
                    Exit For
                End If
            End If
        End If
    Next i
    
    'If i > 3 Then Debug.Print "  ... and " & (productList.count - 3) & " more products"
    
    ' ========================================================================
    ' STEP 4: SECOND PASS - NORMALIZED EXACT MATCH (PRIORITY 2)
    ' ========================================================================
    ' NEW PRIORITY: Moved before partial matching
    
    If Not matchFound Then
'        Debug.Print vbCrLf & "STEP 4: NORMALIZED EXACT MATCH (Priority 2)"
'        Debug.Print "  Normalized search term: """ & normalizedCheckMFR & """"
        
        ' Skip if normalized text is empty or too short
        If Len(normalizedCheckMFR) >= 3 Then
            
            For i = 1 To productList.count
                Set product = productList(i)
                
                If product.Exists("manufacturer") Then
                    If product("manufacturer").Exists("name") Then
                        mfrName = product("manufacturer")("name")
                        
                        ' Normalize the JSON manufacturer name
                        normalizedMfrName = NormalizeText(mfrName)
                        
                        ' DEBUG: Show normalized comparison for first few products
                        If i <= 3 Then
'                            Debug.Print "  Product " & i & ":"
'                            Debug.Print "    Original: """ & mfrName & """"
'                            Debug.Print "    Normalized: """ & normalizedMfrName & """"
                        End If
                        
                        ' Compare normalized versions (exact match)
                        If normalizedCheckMFR = normalizedMfrName Then
                            Set bestMatch = product
                            matchFound = True
                            matchType = "NormalizedMatch"
                            
                            ' DEBUG: Found normalized match
'                            Debug.Print "  ? NORMALIZED EXACT MATCH FOUND at product " & i
'                            Debug.Print "    Original search: """ & checkMFR & """"
'                            Debug.Print "    Original JSON: """ & mfrName & """"
'                            Debug.Print "    Normalized search: """ & normalizedCheckMFR & """"
'                            Debug.Print "    Normalized JSON: """ & normalizedMfrName & """"
                            
                            Exit For
                        End If
                    End If
                End If
            Next i
            
            If i > 3 Then Debug.Print "  ... and " & (productList.count - 3) & " more products"
        Else
            Debug.Print "  Skipped - normalized term too short: """ & normalizedCheckMFR & """"
        End If
    End If
    
    ' ========================================================================
    ' STEP 5: THIRD PASS - NORMALIZED PARTIAL MATCH (PRIORITY 3)
    ' ========================================================================
    ' NEW PRIORITY: Moved before original text partial matching
    
    If Not matchFound Then
        'Debug.Print vbCrLf & "STEP 5: NORMALIZED PARTIAL MATCH (Priority 3)"
        
        If Len(normalizedCheckMFR) >= 3 Then
            
            For i = 1 To productList.count
                Set product = productList(i)
                
                If product.Exists("manufacturer") Then
                    If product("manufacturer").Exists("name") Then
                        mfrName = product("manufacturer")("name")
                        normalizedMfrName = NormalizeText(mfrName)
                        
                        ' DEBUG: Show matching attempt for first few
                        If i <= 3 Then
'                            Debug.Print "  Checking product " & i & ":"
'                            Debug.Print "    JSON Original: """ & mfrName & """"
'                            Debug.Print "    JSON Normalized: """ & normalizedMfrName & """"
                        End If
                        
                        ' Check if normalized search term is contained in normalized manufacturer
                        If InStr(1, normalizedMfrName, normalizedCheckMFR, vbBinaryCompare) > 0 Then
                            Set bestMatch = product
                            matchFound = True
                            matchType = "NormalizedPartial"
                            
                            ' DEBUG: Found normalized partial match
'                            Debug.Print "  ? NORMALIZED PARTIAL MATCH FOUND at product " & i
'                            Debug.Print "    Normalized search: """ & normalizedCheckMFR & """"
'                            Debug.Print "    Normalized JSON: """ & normalizedMfrName & """"
'                            Debug.Print "    JSON contains search term"
                            
                            Exit For
                        End If
                        
                        ' Also check if normalized JSON is contained in search term
                        If InStr(1, normalizedCheckMFR, normalizedMfrName, vbBinaryCompare) > 0 And Len(normalizedMfrName) >= 3 Then
                            Set bestMatch = product
                            matchFound = True
                            matchType = "NormalizedPartial"
                            
                            ' DEBUG: Found reverse normalized partial match
'                            Debug.Print "  ? REVERSE NORMALIZED PARTIAL MATCH at product " & i
'                            Debug.Print "    Normalized search: """ & normalizedCheckMFR & """"
'                            Debug.Print "    Normalized JSON: """ & normalizedMfrName & """"
'                            Debug.Print "    Search term contains JSON"
                            
                            Exit For
                        End If
                    End If
                End If
            Next i
            
            'If i > 3 Then Debug.Print "  ... and " & (productList.count - 3) & " more products checked"
        Else
            'Debug.Print "  Skipped - normalized term too short: """ & normalizedCheckMFR & """"
        End If
    End If
    
    ' ========================================================================
    ' STEP 6: FOURTH PASS - PARTIAL MATCHES WITH ORIGINAL TEXT (LOWEST PRIORITY)
    ' ========================================================================
    ' NEW PRIORITY: Moved to last (lowest priority)
    
    If Not matchFound Then
        'Debug.Print vbCrLf & "STEP 6: PARTIAL MATCH WITH ORIGINAL TEXT (Priority 4 - Lowest)"
        
        For Each searchTerm In searchTerms
            If matchFound Then Exit For
            
            searchTerm = Trim(searchTerm)
            If Len(searchTerm) = 0 Then GoTo NextTerm
            
            Debug.Print "  Searching for: """ & searchTerm & """"
            
            For i = 1 To productList.count
                Set product = productList(i)
                
                If product.Exists("manufacturer") Then
                    If product("manufacturer").Exists("name") Then
                        mfrName = product("manufacturer")("name")
                        
                        If InStr(1, mfrName, searchTerm, vbTextCompare) > 0 Then
                            Set bestMatch = product
                            matchFound = True
                            matchType = "PartialMatched"
                            
                            ' DEBUG: Found partial match
'                            Debug.Print "  ? PARTIAL MATCH FOUND at product " & i
'                            Debug.Print "    Search term: """ & searchTerm & """"
'                            Debug.Print "    JSON text: """ & mfrName & """"
'                            Debug.Print "    Contains search term: YES"
                            
                            Exit For
                        End If
                    End If
                End If
            Next i
NextTerm:
        Next searchTerm
    End If
    
    ' ========================================================================
    ' STEP 7: FALLBACK - USE FIRST PRODUCT IF NO MATCH FOUND
    ' ========================================================================
    
    If Not matchFound Then
        'Debug.Print vbCrLf & "STEP 7: NO MATCH FOUND - USING FIRST PRODUCT"
        Set bestMatch = productList(1)
        matchFound = False
        matchType = "NoMatch"
    End If
    
    ' ========================================================================
    ' STEP 8: EXTRACT DATA FROM BEST MATCH
    ' ========================================================================
    
    Debug.Print vbCrLf & "FINAL RESULT:"
    
    If matchFound Then
        altLCSCpn = IIf(bestMatch.Exists("number"), bestMatch("number"), "")
        
        If bestMatch.Exists("manufacturer") Then
            altMfr = IIf(bestMatch("manufacturer").Exists("name"), bestMatch("manufacturer")("name"), "")
        Else
            altMfr = ""
        End If
        
        altMPN = IIf(bestMatch.Exists("mpn"), bestMatch("mpn"), "")
        altStock = IIf(bestMatch.Exists("quantity"), CStr(bestMatch("quantity")), "")
        
        ' DEBUG: Show match result
'        Debug.Print "  Match Type: " & matchType
'        Debug.Print "  Matched Manufacturer: """ & altMfr & """"
'        Debug.Print "  LCS CPN: " & altLCSCpn
'        Debug.Print "  MPN: " & altMPN
'        Debug.Print "  Stock: " & altStock
    Else
        altLCSCpn = "No match found"
        altMfr = ""
        altMPN = ""
        altStock = ""
        
        'Debug.Print "  Match Type: " & matchType
        'Debug.Print "  No match found, using first product as fallback"
    End If
    
    ' ========================================================================
    ' STEP 9: WRITE ALL PRODUCTS TO MFR_TmpSheet
    ' ========================================================================
    
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets("MFR_TmpSheet")
    On Error GoTo ErrorHandler
    
    'ws.Range("A2:G10000").ClearContents
    lastRow = ws.Cells(ws.Rows.count, 1).End(xlUp).Row
    
    If lastRow = 1 And ws.Range("A1").value = "CPC" Then
        lastRow = 1
    End If
   ' ws.Range("A2:F10000").ClearContents
    ' DEBUG: Writing to sheet
'    Debug.Print vbCrLf & "WRITING TO MFR_TmpSheet:"
'    Debug.Print "  Starting at row: " & (lastRow + 1)
'    Debug.Print "  Writing " & productList.count & " products"
    
    For i = 1 To productList.count
        Set product = productList(i)
        
        Dim productQty As Long
        productQty = 0
        
            If product.Exists("quantity") Then
                productQty = CLng(product("quantity"))
            End If
       If productQty > 0 Then
            ' Only write if we have valid product data
             If product.Exists("number") Or product.Exists("mpn") Then
       
                     lastRow = lastRow + 1
                     writeRow = lastRow
                        ws.Cells(writeRow, 1).value = CPCNo
                        ws.Cells(writeRow, 2).value = IIf(product.Exists("number"), product("number"), "")
                        ws.Cells(writeRow, 3).value = IIf(product.Exists("mpn"), product("mpn"), "")
                        
                        If product.Exists("manufacturer") Then
                            ws.Cells(writeRow, 4).value = IIf(product("manufacturer").Exists("name"), product("manufacturer")("name"), "")
                        Else
                            ws.Cells(writeRow, 4).value = ""
                        End If
                        
                        ws.Cells(writeRow, 5).value = IIf(product.Exists("quantity"), CStr(product("quantity")), "")
                        
                        If matchFound Then
                            If product.Exists("number") And bestMatch.Exists("number") Then
                                If product("number") = bestMatch("number") Then
                                    ws.Cells(writeRow, 6).value = "YES"
                                    
                '                    ' Color coding based on match type
                '                    Select Case matchType
                '                        Case "FullyMatched"
                '                            ws.Cells(writeRow, 6).Interior.Color = RGB(144, 238, 144)  ' Light Green
                '                            'Debug.Print "  ? Marked row " & writeRow & " as MATCH (Green)"
                '                        Case "NormalizedMatch"
                '                            ws.Cells(writeRow, 6).Interior.Color = RGB(173, 216, 230)  ' Light Blue
                '                            'Debug.Print "  ? Marked row " & writeRow & " as NORMALIZED MATCH (Blue)"
                '                        Case "NormalizedPartial"
                '                            ws.Cells(writeRow, 6).Interior.Color = RGB(255, 182, 193)  ' Light Pink
                '                            'Debug.Print "  ? Marked row " & writeRow & " as NORMALIZED PARTIAL (Pink)"
                '                        Case "PartialMatched"
                '                            ws.Cells(writeRow, 6).Interior.Color = RGB(255, 255, 153)  ' Light Yellow
                '                            'Debug.Print "  ? Marked row " & writeRow & " as PARTIAL MATCH (Yellow)"
                '                        Case Else
                '                            ws.Cells(writeRow, 6).Interior.ColorIndex = xlNone
                '                    End Select
                                Else
                                    ws.Cells(writeRow, 6).value = ""
                                End If
                            End If
                        End If
                End If
        End If
    Next i
    
    ' ========================================================================
    ' STEP 10: RETURN RESULT
    ' ========================================================================
    
'    Debug.Print vbCrLf & "RETURNING: [" & altLCSCpn & ", " & altMfr & ", " & altMPN & ", " & altStock & ", " & matchType & "]"
'    Debug.Print String(50, "=") & vbCrLf
    
    FindBestMfrMatch = Array(altLCSCpn, altMfr, altMPN, altStock, matchType)
    
    Exit Function
    
ErrorHandler:
    Debug.Print "ERROR: " & Err.Description
    FindBestMfrMatch = Array("Error: " & Err.Description, "", "", "", "NoMatch")
End Function


' ========================================================================
' HELPER FUNCTION: NormalizeText
' PURPOSE:  Remove all non-alphabetic characters and convert to lowercase
' ========================================================================
Private Function NormalizeText(ByVal txt As String) As String
    Dim i As Long
    Dim ch As String
    Dim result As String
    
    ' Convert to lowercase
    txt = LCase(Trim(txt))
    
    ' Remove non-alphabetic characters
    For i = 1 To Len(txt)
        ch = Mid(txt, i, 1)
        If ch Like "[a-z]" Then
            result = result & ch
        End If
    Next i
    
    NormalizeText = result
End Function

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


