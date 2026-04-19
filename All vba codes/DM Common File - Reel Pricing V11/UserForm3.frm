VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} UserForm3 
   Caption         =   "Select Requestioner Name"
   ClientHeight    =   5430
   ClientLeft      =   105
   ClientTop       =   465
   ClientWidth     =   5730
   OleObjectBlob   =   "UserForm3.frx":0000
   StartUpPosition =   2  'CenterScreen
End
Attribute VB_Name = "UserForm3"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False

Private Sub btnCancel_Click()
    ' Show a cancellation message
    MsgBox "Operation cancelled by the user.", vbInformation, "Cancelled"
    
    turnonscreenUpdate
    
    ' Set the cancellation flag
    Dim isCancelled As Boolean
    isCancelled = True
    Me.Hide
End Sub

Private Sub btnSubmit_Click()
    ' Check if a value is selected in the dropdown
    If Me.ComboBox1.value = "" Then
        MsgBox "Please select a requestioner before submitting.", vbExclamation, "Error"
        Exit Sub
    End If

    ' Assign selected requestioner to the global variable cx1
    cx1 = Me.ComboBox1.value
    Me.Hide ' Close the user form
End Sub

Private Sub ComboBox1_Change()
    Dim selectedName As String
    Dim cell As Range
    Dim rowNum As Long
    Dim billingAddress As String
    Dim shippingAddress As String
    Dim jobQueueSh As Worksheet

    ' Set the worksheet (replace with your actual sheet name if needed)
    For Each Workbook In Application.Workbooks
        Debug.Print Workbook.Name
        If Workbook.Name Like "Job Queue*.xlsm" Then
            Set jobQueueSh = Workbook.Sheets("Admin")
            Exit For
        End If
    Next Workbook
    
    ' Get the selected requester name
    selectedName = Me.ComboBox1.value
    
    ' Find the row corresponding to the selected name
    On Error Resume Next
    rowNum = 0 ' Initialize rowNum to 0
    For Each cell In jobQueueSh.Columns("D").Cells
        If cell.value = selectedName And jobQueueSh.Cells(cell.Row, "B").value = Me.Label3.Caption Then
            rowNum = cell.Row
            Exit For
        End If
    Next cell
    On Error GoTo 0

    
    ' If rowNum is valid, retrieve and format the addresses
    If rowNum > 0 Then
        ' get the customer details
        cx2 = jobQueueSh.Cells(rowNum, "A")                                                  ' Company Name
        cx3 = jobQueueSh.Cells(rowNum, "F")                                                  ' Street Address
        cx4 = jobQueueSh.Cells(rowNum, "G") & ", " & jobQueueSh.Cells(rowNum, "H") & ", " & jobQueueSh.Cells(rowNum, "I") & ", " & jobQueueSh.Cells(rowNum, "J")            ' City & Province, Postal Code & Country Code
        cx5 = jobQueueSh.Cells(rowNum, "K")                                                  ' email ID
        cx6 = jobQueueSh.Cells(rowNum, "L")
        
        ' Billing address
        billingAddress = jobQueueSh.Cells(rowNum, "N").value & vbNewLine & _
                         jobQueueSh.Cells(rowNum, "O").value & ", " & jobQueueSh.Cells(rowNum, "P").value & ", " & jobQueueSh.Cells(rowNum, "Q").value & vbNewLine & _
                         jobQueueSh.Cells(rowNum, "R").value & vbNewLine & _
                         jobQueueSh.Cells(rowNum, "S").value & vbNewLine & _
                         jobQueueSh.Cells(rowNum, "T").value

        ' Shipping address
        shippingAddress = jobQueueSh.Cells(rowNum, "F").value & vbNewLine & _
                          jobQueueSh.Cells(rowNum, "G").value & ", " & jobQueueSh.Cells(rowNum, "H").value & ", " & jobQueueSh.Cells(rowNum, "I").value & vbNewLine & _
                          jobQueueSh.Cells(rowNum, "J").value & vbNewLine & _
                          jobQueueSh.Cells(rowNum, "K").value & vbNewLine & _
                          jobQueueSh.Cells(rowNum, "L").value

        ' Update the labels in the UserForm
        Me.Label4.Caption = billingAddress
        Me.Label5.Caption = shippingAddress
    Else
        ' If no row is found, clear the labels
        Me.Label4.Caption = "Billing address not found."
        Me.Label5.Caption = "Shipping address not found."
    End If
End Sub
