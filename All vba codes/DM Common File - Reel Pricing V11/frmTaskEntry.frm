VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} frmTaskEntry 
   Caption         =   "Project Name"
   ClientHeight    =   2595
   ClientLeft      =   105
   ClientTop       =   465
   ClientWidth     =   7350
   OleObjectBlob   =   "frmTaskEntry.frx":0000
   StartUpPosition =   2  'CenterScreen
End
Attribute VB_Name = "frmTaskEntry"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False

Private Sub btnPROC_Click()
    Dim procCode As String
    procCode = InputBox("Enter Proc Batch Code", "Proc Input")

    If Trim(procCode) = "" Then
        MsgBox "No Proc Batch Code entered. Exiting.", vbExclamation
        End ' ?? Exits everything including the main macro
    Else
        ThisWorkbook.Sheets("MasterSheet").Range("W1").value = procCode
        ThisWorkbook.Sheets("MasterSheet").Range("X1").value = ""
    End If

    Unload Me
End Sub


Private Sub btnQUOTE_Click()
    
    Dim response As VbMsgBoxResult
    response = MsgBox("Is this a new RFQ?", vbYesNo + vbQuestion, "New RFQ Check")
    
    If response = vbYes Then
    
        Call sendtoQuoteLog ' This sets the public rfqRef variable
    
        If Trim(rfqRef) = "" Then
            MsgBox "No RFQ number was generated. Exiting.", vbExclamation
            End ' ?? Exits everything including the main macro
        Else
            ThisWorkbook.Sheets("MasterSheet").Range("W1").value = rfqRef
            ThisWorkbook.Sheets("MasterSheet").Range("X1").value = ""
        End If
    
        Unload Me
    
    Else
        ' do nothing
        Unload Me
    End If
    
        
        
        
End Sub



Private Sub btnOTHER_Click()
    Dim details As String
    details = InputBox("Please enter more details", "Other Details")

    If details = "" Then
        MsgBox "No details entered. Exiting.", vbExclamation
        End ' ?? Exits everything including the main macro
    Else
        With ThisWorkbook.Sheets("MasterSheet")
            .Range("W1").value = "Others"
            .Range("X1").value = "Notes: " & details
        End With
    End If
    Unload Me
End Sub



