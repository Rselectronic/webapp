Attribute VB_Name = "Module1"
Option Explicit

Sub getAPIdata()

Dim ws As Worksheet
Dim lr As Long, i As Long
Dim distPN As String, distName As String, LCSCpn As String, placeToBuy As String, PNtoUse As String, customerPN As String

Set ws = ThisWorkbook.Sheets(1)
lr = ws.Cells(ws.Rows.Count, "A").End(xlUp).Row

initialiseHeaders ws

' Initialize UserForm and ProgressBar (Label)
Dim UserForm As Object
UserForm1.Show vbModeless
UserForm1.Caption = "LCSC API"
UserForm1.Width = 246
UserForm1.Height = 187.4

' Create and format the Label to simulate a progress bar
Dim ProgressBar1 As Object
Set ProgressBar1 = UserForm1.Controls.Add("Forms.Label.1", , True)
ProgressBar1.Name = "ProgressBar1" '
UserForm1.ProgressFrame.Caption = "Progress Status"
UserForm1.lblmainProgCaption.Caption = "Getting Data"
UserForm1.lblsubProgCaption.Caption = "Part Number"
UserForm1.lblmainProgPerc.Width = 0
UserForm1.lblmainProgPercDisp.Caption = 0 & "%"
UserForm1.lblsubProgPerc.Width = 0
UserForm1.lblsubProgPercDisp.Caption = 0 & "%"
ProgressBar1.Caption = ""

UserForm1.Show vbModeless

For i = 5 To lr
    
    If ws.Cells(i, VF_MPNmatch_Column) = "" Then
    
        distPN = ws.Cells(i, VF_DistPN_Column)
        distName = ws.Cells(i, VF_DistName_Column)
        LCSCpn = ws.Cells(i, VF_LCSCpn_Column)
        placeToBuy = ws.Cells(i, VF_PlacetoBuy_Column)
        PNtoUse = ws.Cells(i, VF_PNtoUse_Column)
        
        If placeToBuy Like "*Digikey*" And Right(distPN, 2) = "ND" Then
            ' add digikey api code here
            UserForm1.lblsubProgCaption.Caption = "Digikey PN " & """" & distPN & """"
            MakeDigikeyRequest ws, i, distPN, ws.Cells(i, VF_Description_Column), PNtoUse
        
        ElseIf placeToBuy = "Mouser" Then
            ' add mouser code here
            UserForm1.lblsubProgCaption.Caption = "Mouser PN " & """" & distPN & """"
            MakeMouserRequest ws, i, distPN, ws.Cells(i, VF_Description_Column), PNtoUse
        
        ElseIf placeToBuy = "LCSC" Then
            ' add LCSC code here
            UserForm1.lblsubProgCaption.Caption = "LCSC PN " & """" & LCSCpn & """"
            MakeLcscRequest ws, i, LCSCpn, ws.Cells(i, VF_Description_Column), PNtoUse
        
        Else
            ' for all other place to buy, use PN to use and get the description from Digikey using MPN
            UserForm1.lblsubProgCaption.Caption = "PN to Use " & """" & PNtoUse & """"
            MakeDigikeyRequest ws, i, PNtoUse, ws.Cells(i, VF_Description_Column)
        End If
        
        
        UserForm1.Caption = "API Data"
        UserForm1.lblsubProgPercDisp.Caption = Format((i - 4) / (lr - 4), "0.00%")
        UserForm1.lblsubProgPerc.Width = ((i - 4) / (lr - 4)) * 180
        
        DoEvents ' Allow the UserForm to update
    End If
    
Next i


UserForm1.Caption = "API Data"
UserForm1.lblmainProgPercDisp.Caption = Format(1 / 1, "0.00%")
UserForm1.lblmainProgPerc.Width = (1 / 1) * 180

DoEvents ' Allow the UserForm to update


Unload UserForm1


End Sub
