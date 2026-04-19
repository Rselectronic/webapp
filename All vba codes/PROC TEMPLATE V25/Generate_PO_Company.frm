VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} Generate_PO_Company 
   Caption         =   "Company full name"
   ClientHeight    =   4070
   ClientLeft      =   105
   ClientTop       =   450
   ClientWidth     =   6030
   OleObjectBlob   =   "Generate_PO_Company.frx":0000
   StartUpPosition =   1  'CenterOwner
End
Attribute VB_Name = "Generate_PO_Company"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Explicit

Private selectedValue As String
Private cancelled As Boolean

Public Sub LoadDataCompany(dataRange As Range)
    Dim c As Range
    Dim dict As Object

    cmbItems_Company.Clear
    Set dict = CreateObject("Scripting.Dictionary")

    For Each c In dataRange
        If Not IsEmpty(c.Value) Then
            If Not dict.Exists(CStr(c.Value)) Then dict.Add CStr(c.Value), 1
        End If
    Next c

    Dim key As Variant
    For Each key In dict.Keys
        cmbItems_Company.AddItem key
    Next key
End Sub


Private Sub btnOK_Company_Click()
    If cmbItems_Company.ListIndex = -1 Then
        MsgBox "Please select an Company name From List before continuing.", vbExclamation
        Exit Sub
    End If
    selectedValue = cmbItems_Company.Value
    cancelled = False
    Me.Hide
End Sub

Private Sub btnCancel_Company_Click()
    cancelled = True
    Me.Hide
End Sub

Public Function GetSelectedValue_Company() As String
    If cancelled Then
        GetSelectedValue_Company = ""
    Else
        GetSelectedValue_Company = selectedValue
    End If
End Function

Private Sub cmbItems_Company_Change()

Dim Findrng As Range

Set Findrng = jobqueueWB_SupplierSheet.Cells(1, jobQueue_SupplierSheet_CompanyFullName).EntireColumn.Find(What:=cmbItems_Company.Value, after:=jobqueueWB_SupplierSheet.Cells(1, jobQueue_SupplierSheet_CompanyFullName), LookIn:=xlFormulas, LookAt:=xlWhole)
If Not Findrng Is Nothing Then
  Label_Supplier.Caption = "Supplier : " & jobqueueWB_SupplierSheet.Cells(Findrng.Row, jobQueue_SupplierSheet_SupplierName).Value
End If

End Sub



Private Sub UserForm_Click()

End Sub
