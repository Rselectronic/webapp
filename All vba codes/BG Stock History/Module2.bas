Attribute VB_Name = "Module2"
Sub newAddition()

    Dim cpc As String
    Dim feederType As String
    Dim qty As Long
    
    cpc = Application.InputBox("Please enter LANKA CPC. (Required)", "Addition", Type:=2)
    If cpc = "" Then
        MsgBox "Please enter correct CPC.", , "Operational Canceled"
        Exit Sub
    End If
    
    feederType = Application.InputBox("Please enter Feeder Type. Valid values are ""BG"" or ""SS"" (Required)", "Addition", Type:=2)
    If feederType = "" Or (feederType <> "BG" And feederType <> "SS") Then
        MsgBox "Please enter correct Feeder Type. Valid values are ""BG"" or ""SS"""
        Exit Sub
    End If
    
    qty = Application.InputBox("Please enter the Quantity (Optional).", "Addition", Type:=1, Default:=0)
    
    Dim wsBGstockHistory As Worksheet
    Dim wbDMfile As Workbook
    Dim wsDMproc As Worksheet
    
    Dim fullPath As String
    Dim folders() As String
    Dim masterFolderName As String, masterFolderPath As String
    Dim dmFolderName As String
    Dim dmFileName As String
    Dim dmFolderPath As String
    
    fullPath = GetLocalPath(ThisWorkbook.FullName)
    folders = Split(fullPath, "\")
    'masterFolderName = folders(UBound(folders) - 2)
    masterFolderName = folders(UBound(folders) - 3)
    dmFolderName = "2. DM FILE"
    dmFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName) + Len(masterFolderName)) & dmFolderName & "\"
    dmFileName = Dir(dmFolderPath & "DM Common*", vbDirectory)
    
    Set wsBGstockHistory = ThisWorkbook.Sheets("Sheet1")
    Set wbDMfile = Workbooks.Open(dmFolderPath & dmFileName)
    Set wsDMproc = wbDMfile.Sheets("Procurement")
    
    Dim wsBGstockHistoryLR As Long
    wsBGstockHistoryLR = wsBGstockHistory.Cells(wsBGstockHistory.Rows.count, "A").End(xlUp).Row
    
    Dim foundCell As Range
    On Error Resume Next
    Set foundCell = wsDMproc.Range("A:A").Find(What:=cpc, LookAt:=xlWhole, MatchCase:=False)
    On Error GoTo 0
    
    If Not foundCell Is Nothing Then
        wsBGstockHistory.Cells(wsBGstockHistoryLR + 1, "A") = cpc
        wsBGstockHistory.Cells(wsBGstockHistoryLR + 1, "F") = feederType
        
        wsDMproc.Cells(foundCell.Row, "W") = feederType
        wsDMproc.Cells(foundCell.Row, "S") = qty
    Else
        MsgBox "CPC not found in DM File Procurement Worksheet. Please check CPC and try again", , "Operation Canceled"
        Exit Sub
    End If
    
End Sub
