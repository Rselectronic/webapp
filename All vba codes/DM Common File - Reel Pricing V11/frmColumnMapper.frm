VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} frmColumnMapper 
   Caption         =   "Map Source Columns to Target Columns"
   ClientHeight    =   5625
   ClientLeft      =   105
   ClientTop       =   450
   ClientWidth     =   7785
   OleObjectBlob   =   "frmColumnMapper.frx":0000
   StartUpPosition =   1  'CenterOwner
End
Attribute VB_Name = "frmColumnMapper"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Explicit

Public SourceColumns As Collection
Public TargetColumns As Collection
Public Cancelled As Boolean

Private TargetHeaders() As String
Private SourceHeaders() As String
Private ComboList() As MSForms.ComboBox

Public Function ShowForm(SourceHeadersIn() As String, TargetHeadersIn() As String) As Boolean
    Dim i As Long, topPos As Long

    SourceHeaders = SourceHeadersIn
    TargetHeaders = TargetHeadersIn
    
    Dim ctrl As Control
    For Each ctrl In frmMapping.Controls
        frmMapping.Controls.Remove ctrl.Name
    Next ctrl
    
    frmMapping.ScrollBars = fmScrollBarsVertical
    frmMapping.Height = 180
    frmMapping.width = 350
    frmMapping.Top = 50
    frmMapping.Left = 20
    
    ReDim ComboList(LBound(TargetHeaders) To UBound(TargetHeaders))
    
    topPos = 10
    For i = LBound(TargetHeaders) To UBound(TargetHeaders)
        
        Dim lbl As MSForms.label
        Set lbl = frmMapping.Controls.Add("Forms.Label.1", "lblTarget" & i, True)
        lbl.Caption = TargetHeaders(i)
        lbl.Left = 10
        lbl.Top = topPos
        lbl.width = 150
       
        Dim cmb As MSForms.ComboBox
        Set cmb = frmMapping.Controls.Add("Forms.ComboBox.1", "cmbSource" & i, True)
        cmb.Left = 180
        cmb.Top = topPos - 2
        cmb.width = 150
        cmb.List = SourceHeaders
        
        ' Default selection = same index if exists; else leave blank
        If i <= UBound(SourceHeaders) Then
            cmb.ListIndex = i
        Else
            cmb.value = ""  ' leave blank
        End If

        Set ComboList(i) = cmb
        
        topPos = topPos + 25
    Next i
    
    Cancelled = False
    Me.Show vbModal
    ShowForm = Not Cancelled
End Function

Private Sub btnSubmit_Click()
    Dim i As Long
    Set SourceColumns = New Collection
    Set TargetColumns = New Collection
    
    For i = LBound(ComboList) To UBound(ComboList)
        SourceColumns.Add ComboList(i).value
        TargetColumns.Add TargetHeaders(i)
    Next i
    
    Me.Hide
End Sub

Private Sub btnTerminate_Click()
    Cancelled = True
    Me.Hide
End Sub


