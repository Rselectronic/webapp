Attribute VB_Name = "LCSC_Tracking"
Sub GetAllLCSCTrackingInfo()
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
    
    Debug.Print "Order No", "Tracking No", "Courier"
    
    For i = 1 To Items.Count
        If TypeOf Items(i) Is Outlook.MailItem Then
            Set Mail = Items(i)
            If Mail.ReceivedTime >= FilterDate Then
                If Mail.Subject = "LCSC Order Shipped Notification" And _
                   LCase(Mail.SenderEmailAddress) = "support@lcsc.com" Then
                    
                    BodyText = Mail.body
                    OrderNumber = ExtractOrderNumbers(BodyText)
                    TrackingNumber = ExtractTrackingNumber(BodyText)
                    Courier = ExtractCourier(BodyText)
                    
                    If OrderNumber <> "" And TrackingNumber <> "" And Courier <> "" Then
                        On Error Resume Next
                        ws.Cells(ws.Range("D:D").Find(What:=OrderNumber, LookAt:=xlWhole, MatchCase:=False).Row, "F").NumberFormat = "@"
                        ws.Cells(ws.Range("D:D").Find(What:=OrderNumber, LookAt:=xlWhole, MatchCase:=False).Row, "F") = TrackingNumber
                        ws.Cells(ws.Range("D:D").Find(What:=OrderNumber, LookAt:=xlWhole, MatchCase:=False).Row, "G") = Courier
                        Debug.Print OrderNumber
                        On Error GoTo 0
                    End If
                    
                End If
            Else
                Exit For
            End If
        End If
    Next i
    
    MsgBox "LCSC Tracking Inported Successfully", vbInformation
End Sub

Function ExtractCourier(body As String) As String
    Dim startPos As Long, endPos As Long
    startPos = InStr(body, "Shipping method: ")
    If startPos > 0 Then
        startPos = startPos + Len("Shipping method: ")
        endPos = InStr(startPos, body, ".")
        If endPos > startPos Then
            ExtractCourier = Trim(Mid(body, startPos, endPos - startPos))
            If ExtractCourier Like "DHL*" Then
                ExtractCourier = "DHL"
            ElseIf ExtractCourier Like "FedEx*" Then
                ExtractCourier = "FedEx"
            End If
        Else
            ExtractCourier = Trim(Mid(body, startPos))
            If ExtractCourier Like "DHL*" Then
                ExtractCourier = "DHL"
            ElseIf ExtractCourier Like "FedEx*" Then
                ExtractCourier = "FedEx"
            End If
        End If
    Else
        ExtractCourier = "Not found"
    End If
End Function

Function ExtractTrackingNumber(body As String) As String
    Dim startPos As Long, endPos As Long
    startPos = InStr(body, "Tracking number: ")
    If startPos > 0 Then
        startPos = startPos + Len("Tracking number: ")
        endPos = InStr(startPos, body, ".")
        If endPos > startPos Then
            ExtractTrackingNumber = Trim(Mid(body, startPos, endPos - startPos))
        Else
            ExtractTrackingNumber = Trim(Mid(body, startPos))
        End If
    Else
        ExtractTrackingNumber = "Not found"
    End If
End Function

Function ExtractOrderNumbers(body As String) As String
    Dim lines() As String
    Dim i As Long
    
    lines = Split(body, vbCrLf)
    
    For i = LBound(lines) To UBound(lines)
        If Trim(lines(i)) Like "WM##########" Then
            ExtractOrderNumbers = Trim(lines(i))
            Exit For
        End If
    Next i
    
End Function


