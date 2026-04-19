VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} Generate_PO_Userform 
   Caption         =   "Generate PO"
   ClientHeight    =   3020
   ClientLeft      =   105
   ClientTop       =   450
   ClientWidth     =   6510
   OleObjectBlob   =   "Generate_PO_Userform.frx":0000
   StartUpPosition =   1  'CenterOwner
End
Attribute VB_Name = "Generate_PO_Userform"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False

Option Explicit

Private selectedValue As String
Private cancelled As Boolean

Public Sub LoadData(dataRange As Range)
    Dim c As Range
    Dim dict As Object

    cmbItems.Clear
    Set dict = CreateObject("Scripting.Dictionary")

    For Each c In dataRange
        If Not IsEmpty(c.Value) Then
            If Not dict.Exists(CStr(c.Value)) Then dict.Add CStr(c.Value), 1
        End If
    Next c

    Dim key As Variant
    For Each key In dict.Keys
        cmbItems.AddItem key
    Next key
End Sub

Private Sub btnOK_Click()
    If cmbItems.ListIndex = -1 Then
        MsgBox "Please select an Supplier From List before continuing.", vbExclamation
        Exit Sub
    End If
    selectedValue = cmbItems.Value
    cancelled = False
    Me.Hide
End Sub

Private Sub btnCancel_Click()
    cancelled = True
    Me.Hide
End Sub

Public Function GetSelectedValue() As String
    If cancelled Then
        GetSelectedValue = ""
    Else
        GetSelectedValue = selectedValue
    End If
End Function


Private Sub UserForm_Click()

End Sub
