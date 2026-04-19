Attribute VB_Name = "backOrderEmailNotification"
Option Explicit
Sub SendEmailNotification_backorder()
    Dim ws As Worksheet
    Dim cell As Range
    Dim deliveryDate As Date
    Dim outlookApp As Object
    Dim outlookMail As Object
    Dim emailBody As String
    Dim components As String
    Dim i As Integer
    Dim signature As String
    Dim disclaimer As String
    Dim lineCount As Integer
    Dim emailSentCount As Integer
    
    Set ws = ThisWorkbook.Sheets("Backorder Schedule Shipment") ' Change "Sheet1" to your sheet name
    Set outlookApp = CreateObject("Outlook.Application")
    
    components = "<table style='border-collapse:collapse; width:100%;' border='1'><tr><th style = text-align:left>Proc Name</th><th style = text-align:left>Order Type</th><th style = text-align:left>Distributor</th><th style = text-align:left>Order ID</th><th style = text-align:left>Distributor PN</th><th style = text-align:left>MPN</th><th style = text-align:left>MFR</th><th style = text-align:left>Qty</th><th style = text-align:left>Unit Price</th><th style = text-align:left>Ext Price</th><th style = text-align:left>Scheduled Delivery Date</th><th style = text-align:left>Notes/Comments</th></tr>"

    For Each cell In ws.Range("K2:K" & ws.Cells(ws.Rows.Count, "J").End(xlUp).row)
        deliveryDate = cell.Value
        emailSentCount = ws.Cells(cell.row, "M").Value
        
        If deliveryDate - Date <= 5 Then
            components = components & "<tr>"
            For i = 1 To 12 ' Columns 1 to 12
                Dim cellValue As Variant
                cellValue = ws.Cells(cell.row, i).Value
                    
                ' Format currency columns
                If i = 9 Or i = 10 Then ' Unit Price or Ext Price
                    If IsNumeric(cellValue) Then
                        components = components & "<td style='text-align:right;'>$" & Format(cellValue, "#,##0.00") & "</td>"
                    Else
                        components = components & "<td>" & cellValue & "</td>"
                    End If
                ElseIf i = 8 Then
                    components = components & "<td style='text-align:right;'>" & Format(cellValue, "#,##0") & "</td>"
                Else
                    components = components & "<td>" & cellValue & "</td>"
                End If
            Next i
            lineCount = lineCount + 1
            components = components & "</tr>"
            ws.Cells(cell.row, "M").Value = emailSentCount + 1 ' Mark email as sent
        End If
    Next cell


    
    If lineCount = 0 Then
        Exit Sub
    End If
    components = components & "</table>"
    
    ' write email
    emailBody = "Hi Anas, " & "<br><br>" & "This is a reminder that components mentioned below are scheduled to be delivered tomorrow:" & "<br><br>" & components
        
    signature = "<br><br>Thanks," & "<br>" & "Piyush Tayal"
    
    disclaimer = "This message was sent automatically and any files transmitted with it are intended solely for the use of the individual or entity to whom they are addressed and may contain confidential or privileged information. If you have received this email in error, please notify the sender and delete it from your system."
            
    Set outlookMail = outlookApp.CreateItem(0)
    With outlookMail
        .To = "apatel@rspcbassembly.com" ' Change to the recipient's email address
        .Cc = "orders@rspcbassembly.com"
        .Subject = "Scheduled Delivery Reminder"
        .HTMLBody = emailBody & signature & "<br><br><i>" & disclaimer & "</i>"
        .send
        '.display
    End With
End Sub

