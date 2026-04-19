Attribute VB_Name = "Combined_API_RUN"
Option Explicit
Public progressBar1
Sub getIndividualPricing()

'Application.ScreenUpdating = False
'Application.DisplayAlerts = False

Dim ProcWS As Worksheet, ws As Worksheet
Dim wsNames() As String
Dim count As Integer
Dim i, lr As Long


Set ProcWS = ThisWorkbook.Sheets("Proc")
initialiseHeaders , , , ProcWS
lr = ProcWS.Cells(ProcWS.Rows.count, DM_GlobalMFRPackage_Column).End(xlUp).Row


    ' Initialize UserForm and ProgressBar (Label)
    Dim UserForm As Object
    UserForm1.Show vbModeless
    UserForm1.Caption = "Digikey & Mouser API"
    UserForm1.Width = 246
    UserForm1.Height = 187.4
    
    ' Create and format the Label to simulate a progress bar
    Set progressBar1 = UserForm1.Controls.Add("Forms.Label.1", , True)
    progressBar1.Name = "ProgressBar1" '
    UserForm1.ProgressFrame.Caption = "Progress Status"
    UserForm1.lblmainProgCaption.Caption = "Getting Data"
    UserForm1.lblsubProgCaption.Caption = "Part Number"
    UserForm1.lblmainProgPerc.Width = 0
    UserForm1.lblmainProgPercDisp.Caption = 0 & "%"
    UserForm1.lblsubProgPerc.Width = 0
    UserForm1.lblsubProgPercDisp.Caption = 0 & "%"
    progressBar1.Caption = ""
    'ProgressBar1.BackColor = RGB(0, 0, 255) ' Blue color
    'ProgressBar1.Height = 40 ' Adjust height as needed
    'ProgressBar1.Width = 0 ' Initialize the width to 0
    
    
    
    UserForm1.Show vbModeless






count = 0


    For i = 6 To lr
        ' Check if the value in column Active Qty of the current row is 1
        If ProcWS.Cells(i, DM_ActiveQty_Column).Value > 0 Then
            ' Increase the count and add the worksheet name to the array
            count = count + 1
            ReDim Preserve wsNames(1 To count)
            wsNames(count) = ProcWS.Cells(i, DM_GlobalMFRPackage_Column).Value
        End If
    Next i


    If count > 0 Then
        ' Access the worksheet names in the array
        For i = 1 To count
            'Debug.Print wsNames(i)
            
            ' add the API Code here
            
            ThisWorkbook.Sheets(wsNames(i)).Activate
            UserForm1.lblmainProgCaption.Caption = "Processing Sheet - " & wsNames(i)
            
            
            Call GetPriceBreakDown
            
                ' Update progress bar by changing Label's width
                UserForm1.Caption = "Digikey & Mouser API"
                UserForm1.lblmainProgPercDisp.Caption = Format(i / count, "0.00%")
                UserForm1.lblmainProgPerc.Width = (i / count) * 180
                'UserForm1.lblsubProgPercDisp.Caption = Format((r - 3) / (lr - 3), "0.00%")
                'UserForm1.lblsubProgPerc.Width = ((r - 3) / (lr - 3)) * 180
                
                
                'UserForm1.Caption = "Progress (" & r - 3 & "/" & lr - 3 & ")....." & Format((r - 3) / (lr - 3), "0.00%")
                'ProgressBar1.Width = (r / lr) * (UserForm1.Width) ' Adjust the width calculation
                DoEvents ' Allow the UserForm to update
            
        Next i
    Else
        MsgBox "No matching worksheets found."
    End If

    ProcWS.Activate

    ' Close the UserForm at the end of the macro
    Unload UserForm1

Application.ScreenUpdating = True
Application.DisplayAlerts = True
End Sub
