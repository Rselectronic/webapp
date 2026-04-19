Attribute VB_Name = "Module1"
Sub GetDigikeyTrackingFromOutlook()
    Dim OutlookApp As Outlook.Application
    Dim ns As Outlook.Namespace
    Dim Inbox As Outlook.MAPIFolder
    Dim Items As Outlook.Items
    Dim Mail As Outlook.MailItem
    Dim i As Long
    Dim FilterDate As Date
    Dim BodyText As String
    Dim Courier As String
    Dim TrackingNumber As String
    Dim OrderNumber As String
    Dim ws As Worksheet
    
    Set OutlookApp = New Outlook.Application
    Set ns = OutlookApp.GetNamespace("MAPI")
    Set Inbox = ns.GetDefaultFolder(olFolderInbox)
    Set ws = ThisWorkbook.Sheets("Tracking")
    
    FilterDate = Now - 60 ' Last 30 days
    Set Items = Inbox.Items
    Items.Sort "[ReceivedTime]", True
    
    'Debug.Print "Order No", "Tracking No", "Courier"
    
    For i = 1 To Items.Count
        If TypeOf Items(i) Is Outlook.MailItem Then
            Set Mail = Items(i)
            If Mail.ReceivedTime >= FilterDate Then
            Debug.Print Mail.Subject
                If InStr(1, Mail.Subject, "DigiKey has shipped a package") > 0 Then
                'If Mail.Subject = "DigiKey has shipped a package" And _
                   LCase(Mail.SenderEmailAddress) = "orders@t.digikey.com" Then
                    
                    BodyText = Mail.body
                    OrderNumber = ExtractOrderNumbers(BodyText)
                    TrackingNumber = ExtractTrackingNumber(BodyText)
                    Courier = ExtractCourier(BodyText)
                    
                    If OrderNumber <> "" And TrackingNumber <> "" And Courier <> "" Then
                        On Error Resume Next
                        ws.Cells(ws.Range("D:D").Find(What:=OrderNumber, LookAt:=xlWhole, MatchCase:=False).Row, "F").NumberFormat = "@"
                        ws.Cells(ws.Range("D:D").Find(What:=OrderNumber, LookAt:=xlWhole, MatchCase:=False).Row, "F") = TrackingNumber
                        ws.Cells(ws.Range("D:D").Find(What:=OrderNumber, LookAt:=xlWhole, MatchCase:=False).Row, "G") = Courier
                        'Debug.Print OrderNumber
                        On Error GoTo 0
                    End If
                    
                End If
            Else
                Exit For
            End If
        End If
    Next i
    
    MsgBox "Digikey Tracking Inported Successfully", vbInformation
End Sub

Function ExtractCourier(body As String) As String
    Dim lines() As String
    Dim i As Long
    
    lines = Split(body, vbCrLf)
    
    For i = LBound(lines) To UBound(lines)
    'Debug.Print lines(i)
        If Trim(lines(i)) = "Shipping information" Then
            If InStr(1, Trim(lines(i + 2)), "Fedex", vbTextCompare) > 0 Then ExtractCourier = "Fedex": Exit For
            If InStr(1, Trim(lines(i + 2)), "UPS", vbTextCompare) > 0 Then ExtractCourier = "UPS": Exit For
            If InStr(1, Trim(lines(i + 2)), "DHL", vbTextCompare) > 0 Then ExtractCourier = "DHL": Exit For
        End If
    Next i
End Function

Function ExtractTrackingNumber(body As String) As String
    Dim lines() As String
    Dim i As Long
    
    lines = Split(body, vbCrLf)
    
    For i = LBound(lines) To UBound(lines)
    'Debug.Print lines(i)
        If Trim(lines(i)) = "Shipping information" Then
            ExtractTrackingNumber = Left(Trim(lines(i + 4)), InStr(1, lines(i + 4), " ") - 1)
            Exit For
        End If
    Next i
End Function

Function ExtractOrderNumbers(body As String) As String
    Dim lines() As String
    Dim i As Long
    
    lines = Split(body, vbCrLf)
    
    For i = LBound(lines) To UBound(lines)
    'Debug.Print lines(i)
        If Trim(lines(i)) = "Sales order number:" Then
            ExtractOrderNumbers = Trim(lines(i + 2))
            Exit For
        End If
    Next i
    
End Function




