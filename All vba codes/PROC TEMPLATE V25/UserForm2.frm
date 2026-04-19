VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} UserForm2 
   Caption         =   "Job Queue"
   ClientHeight    =   5620
   ClientLeft      =   105
   ClientTop       =   465
   ClientWidth     =   5895
   OleObjectBlob   =   "UserForm2.frx":0000
   StartUpPosition =   1  'CenterOwner
End
Attribute VB_Name = "UserForm2"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False


Public jobLanka As Worksheet
Public iSheet As Worksheet
Public jLastrow As Long
Public iRow As Long
Public GMP As String
Sub ShowForm(jLANKA As Worksheet, lastRow As Long, GMP As String, inputSheet As Worksheet, inputLastRow As Long)
    ' Initialize global variables
    Set jobLanka = jLANKA
    jLastrow = lastRow
    
    Set iSheet = inputSheet
    iRow = inputLastRow
    ' Show the UserForm
    TextBox1.Value = GMP
    
    Me.Show
End Sub



Private Sub UserForm_Initialize()
    ' Populate the ComboBox with values
    ComboBox1.List = Array("Turnkey", "Assy Only", "Consignment")
    
End Sub

Private Sub CommandButton1_Click()
    
    ' Transfer data to cells
    jobLanka.Cells(jLastrow + 1, "H") = TextBox1.Value  'Board Name
    jobLanka.Cells(jLastrow + 1, "A") = TextBox2.Value  'PO #
    jobLanka.Cells(jLastrow + 1, "B") = TextBox2.Value  'PO #
    jobLanka.Cells(jLastrow + 1, "C") = TextBox3.Value  'Line #
    jobLanka.Cells(jLastrow + 1, "D") = TextBox2.Value & " " & TextBox3.Value
    jobLanka.Cells(jLastrow + 1, "G") = ComboBox1.Value 'Order Type
    jobLanka.Cells(jLastrow + 1, "F") = TextBox4.Value  'Quote #
    jobLanka.Cells(jLastrow + 1, "I") = TextBox5.Value  'Qty
    jobLanka.Cells(jLastrow + 1, "J") = TextBox6.Value  'Delivery Date
    jobLanka.Cells(jLastrow + 1, "J").NumberFormat = "[$-x-sysdate]dddd, mmmm dd, yyyy"
    jobLanka.Cells(jLastrow + 1, "L") = TextBox7.Value  '$ Rate in PO
    iSheet.Cells(iRow, "AJ") = Now()
    iSheet.Cells(iRow, "AJ").NumberFormat = "mm/dd/yyyy"
    
    ' Unload the UserForm
    Unload Me
End Sub

Private Sub CommandButton2_Click()
    ' Cancel the operation and unload the UserForm
    Unload Me
End Sub

