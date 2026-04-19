Attribute VB_Name = "mod_Public_Functions"
'-----------The purpose of this function is to check active Products on DataInputsheets and return the active products
'----------- and the customer names
Public Function GetActiveProductsAndCustomer(Optional ByVal ReturnCustomer As Boolean = True) As Variant

    Dim lastR As Long
    Dim j As Long
    Dim col As Collection
    Dim temp(1 To 2) As String
    Dim ws As Worksheet
    Dim missingSheets As String
    Dim prodName As String
    Dim dataInputWS As Worksheet
    
    Set dataInputWS = ThisWorkbook.Worksheets("DataInputSheets")

    'initializing headers
    initialiseHeaders dataInputWS
    Set col = New Collection

   
    ' Find last row
    
    lastR = dataInputWS.Cells(dataInputWS.Rows.count, DM_ActiveQty_Column).End(xlUp).Row
    If lastR < 6 Then Exit Function

   
    ' Collect active rows

    For j = 6 To lastR
        If dataInputWS.Cells(j, DM_ActiveQty_Column).value > 0 Then
            temp(1) = dataInputWS.Cells(j, DM_Customer_Column).value
            temp(2) = dataInputWS.Cells(j, DM_GlobalMFRPackage_Column).value
            col.Add temp
        End If
    Next j

    If col.count = 0 Then
        MsgBox "No Active Product Found!", vbExclamation
        GetActiveProductsAndCustomer = Empty
        Exit Function
    End If

    
    ' Validate sheets exist
   
    For j = 1 To col.count
        prodName = col(j)(2)

        On Error Resume Next
        Set ws = ThisWorkbook.Sheets(prodName)
        On Error GoTo 0

        If ws Is Nothing Then
            If missingSheets <> "" Then missingSheets = missingSheets & vbCrLf
            missingSheets = missingSheets & "- " & prodName
        End If

        Set ws = Nothing
    Next j

    If missingSheets <> "" Then
        MsgBox "Sheet(s) not found:" & vbCrLf & missingSheets, vbCritical, "Missing Sheets"
        GetActiveProductsAndCustomer = Empty
        Exit Function
    End If

   
    ' Prepare return array
  
    Dim result As Variant
    Dim idx As Long

    If ReturnCustomer Then
        ReDim result(1 To col.count, 1 To 2)
        For idx = 1 To col.count
            result(idx, 1) = col(idx)(1)  ' Customer
            result(idx, 2) = col(idx)(2)  ' Product
        Next idx
    Else
        ReDim result(1 To col.count)
        For idx = 1 To col.count
            result(idx) = col(idx)(2)     ' Product only
        Next idx
    End If

    ' Assign result to the  function name
    GetActiveProductsAndCustomer = result

End Function

