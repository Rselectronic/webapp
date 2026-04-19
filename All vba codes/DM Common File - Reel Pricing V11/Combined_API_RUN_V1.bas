Attribute VB_Name = "Combined_API_RUN_V1"
Sub getIndividualPricing()

turnoffscreenUpdate

Dim inputWS As Worksheet, ws As Worksheet
Dim wsNames() As String
Dim count As Integer
Dim i, lr As Long

Set inputWS = ThisWorkbook.Sheets("DataInputSheets")
initialiseHeaders inputWS
lr = inputWS.Cells(inputWS.Rows.count, DM_GlobalMFRPackage_Column).End(xlUp).Row


    ' Initialize UserForm and ProgressBar (Label)
    Dim UserForm As Object
    UserForm1.Show vbModeless
    UserForm1.Caption = "Digikey & Mouser API"
    UserForm1.width = 246
    UserForm1.Height = 187.4
    
    ' Create and format the Label to simulate a progress bar
    Set ProgressBar1 = UserForm1.Controls.Add("Forms.Label.1", , True)
    ProgressBar1.Name = "ProgressBar1" '
    UserForm1.ProgressFrame.Caption = "Progress Status"
    UserForm1.lblmainProgCaption.Caption = "Getting Data"
    UserForm1.lblsubProgCaption.Caption = "Part Number"
    UserForm1.lblmainProgPerc.width = 0
    UserForm1.lblmainProgPercDisp.Caption = 0 & "%"
    UserForm1.lblsubProgPerc.width = 0
    UserForm1.lblsubProgPercDisp.Caption = 0 & "%"
    ProgressBar1.Caption = ""
    'ProgressBar1.BackColor = RGB(0, 0, 255) ' Blue color
    'ProgressBar1.Height = 40 ' Adjust height as needed
    'ProgressBar1.Width = 0 ' Initialize the width to 0
    
    
    
    UserForm1.Show vbModeless






count = 0


    For i = 6 To lr
        ' Check if the value in column Active Qty of the current row is 1
        If inputWS.Cells(i, DM_ActiveQty_Column).value > 0 Then
            ' Increase the count and add the worksheet name to the array
            count = count + 1
            ReDim Preserve wsNames(1 To count)
            wsNames(count) = inputWS.Cells(i, DM_GlobalMFRPackage_Column).value
        End If
    Next i


    If count > 0 Then
    
        Dim response As VbMsgBoxResult
        response = MsgBox("Access data from API?", vbYesNo + vbQuestion, "Confirmation")
    
        ' Access the worksheet names in the array
        For i = 1 To count
            'Debug.Print wsNames(i)
            
            ' add the API Code here
            
            'ThisWorkbook.Sheets(wsNames(i)).Activate
            UserForm1.lblmainProgCaption.Caption = "Processing Sheet - " & wsNames(i)
            
            
            Call GetPriceBreakDown(wsNames(i), response)
            
                ' Update progress bar by changing Label's width
                UserForm1.Caption = "Digikey & Mouser API"
                UserForm1.lblmainProgPercDisp.Caption = Format(i / count, "0.00%")
                UserForm1.lblmainProgPerc.width = (i / count) * 180
                'UserForm1.lblsubProgPercDisp.Caption = Format((r - 3) / (lr - 3), "0.00%")
                'UserForm1.lblsubProgPerc.Width = ((r - 3) / (lr - 3)) * 180
                
                
                'UserForm1.Caption = "Progress (" & r - 3 & "/" & lr - 3 & ")....." & Format((r - 3) / (lr - 3), "0.00%")
                'ProgressBar1.Width = (r / lr) * (UserForm1.Width) ' Adjust the width calculation
                DoEvents ' Allow the UserForm to update
            
        Next i
    Else
        MsgBox "No matching worksheets found."
    End If

    inputWS.Activate

    ' Close the UserForm at the end of the macro
    Unload UserForm1

turnonscreenUpdate

End Sub
