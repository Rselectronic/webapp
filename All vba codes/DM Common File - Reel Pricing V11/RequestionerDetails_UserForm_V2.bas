Attribute VB_Name = "RequestionerDetails_UserForm_V2"
Sub CheckAndInitializeUserForm(customerAbb As String, jobQueueSh As Worksheet)
    Dim reqList As Object
    Dim cell As Range
    Dim reqName As Variant
    Dim countReq As Integer
    Dim i As Long
    Dim foundRow As Long
    

    ' Create an ArrayList object to store unique requestioner names
    Set reqList = CreateObject("System.Collections.ArrayList")

    ' Find all rows with matching customerAbb in column B
    On Error Resume Next
    For Each cell In jobQueueSh.Columns("B").Cells
        If cell.value = customerAbb Then
            reqName = jobQueueSh.Cells(cell.Row, "D").value
            foundRow = cell.Row
            If reqName <> "" And Not reqList.Contains(reqName) Then
                reqList.Add reqName ' Add unique names to the ArrayList
                
            End If
        End If
    Next cell
    On Error GoTo 0

    ' Sort the ArrayList in ascending order
    reqList.Sort

    ' Count the unique requestioners
    countReq = reqList.count

    ' If there are multiple requestioners, show the UserForm
    If countReq > 1 Then
        ' Populate the UserForm dropdown with sorted values
        With UserForm3
            .ComboBox1.Clear
            For i = 0 To reqList.count - 1
                .ComboBox1.AddItem reqList(i)
            Next i
            
            ' Populate customer name in User Form
            .Label3.Caption = customerAbb
            ' Show the UserForm
            .Show
        End With
    ElseIf countReq = 1 Then
        ' Assign the single requestioner name to the global variable cx1
        cx1 = reqList(0)
        cx2 = jobQueueSh.Cells(foundRow, "A")                                                  ' Company Name
        cx3 = jobQueueSh.Cells(foundRow, "F")                                                  ' Street Address
        cx4 = jobQueueSh.Cells(foundRow, "G") & ", " & jobQueueSh.Cells(foundRow, "H") & ", " & jobQueueSh.Cells(foundRow, "I") & ", " & jobQueueSh.Cells(foundRow, "J")            ' City & Province, Postal Code & Country Code
        cx5 = jobQueueSh.Cells(foundRow, "K")                                                  ' email ID
        cx6 = jobQueueSh.Cells(foundRow, "L")                                                   ' contact number
        
        
    Else
        MsgBox "No requestioners found for customer: " & customerAbb, vbExclamation, "Error"
        turnonscreenUpdate
        Exit Sub
    End If
End Sub

