VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} frmExistingData 
   Caption         =   "BOMUserform"
   ClientHeight    =   3045
   ClientLeft      =   105
   ClientTop       =   450
   ClientWidth     =   7320
   OleObjectBlob   =   "frmExistingData.frx":0000
   StartUpPosition =   2  'CenterScreen
End
Attribute VB_Name = "frmExistingData"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Explicit

Public BomName As String
Public RevBom As String
Public GerberName As String
Public RevGerber As String
Public Cancelled As Boolean

Public Function ShowForm(GMP As String, DefaultBom As String, DefaultRevBom As String, DefaultGerber As String, DefaultRevGerber As String) As Boolean
    Me.Caption = "Bom and Gerber Data for GMP: " & GMP
    txtBomName.value = DefaultBom
    txtRevBom.value = DefaultRevBom
    txtGerberName.value = DefaultGerber
    txtRevGerber.value = DefaultRevGerber
    Cancelled = False
    Me.Show vbModal
    ShowForm = Not Cancelled
End Function

Private Sub btnSubmit_Click()
    BomName = txtBomName.value
    RevBom = txtRevBom.value
    GerberName = txtGerberName.value
    RevGerber = txtRevGerber.value
    Me.Hide
End Sub

Private Sub btnTerminate_Click()
    Cancelled = True
    Me.Hide
End Sub

