Attribute VB_Name = "Module2"
Option Explicit

Sub CopyData(ByVal i As Integer)
    Dim sourceSheet As Worksheet
    Dim targetSheet As Worksheet
    Dim adminSheet As Worksheet
    Dim leadfreeCertificate As Worksheet
    
    ' Set source and target sheets
    Set sourceSheet = ThisWorkbook.Sheets("PackingSlip")
    Set targetSheet = ThisWorkbook.Sheets("DoNotModifyCopy")
    Set adminSheet = ThisWorkbook.Sheets("Admin")
    Set leadfreeCertificate = ThisWorkbook.Sheets("Lead Free Certificate Template")
    
    
    sourceSheet.Activate
    
    ' find BOM Name and Gerber Name from Admin Sheet
    
    Dim GMP As String
    Dim BOM As String
    Dim Gerber As String
    Dim solderType As String
    Dim ipcClass As String
    GMP = ActiveCell.Offset(0, 2).Value
    BOM = adminSheet.Cells(adminSheet.Columns("A").Find(what:=GMP, LookIn:=xlValues, LookAt:=xlWhole).Row, "B")
    Gerber = adminSheet.Cells(adminSheet.Columns("A").Find(what:=GMP, LookIn:=xlValues, LookAt:=xlWhole).Row, "C")
    solderType = adminSheet.Cells(adminSheet.Columns("A").Find(what:=GMP, LookIn:=xlValues, LookAt:=xlWhole).Row, "D")
    ipcClass = adminSheet.Cells(adminSheet.Columns("A").Find(what:=GMP, LookIn:=xlValues, LookAt:=xlWhole).Row, "E")
    
    
    
    
    
    
    ' Copy data from source to target
    targetSheet.Range("D18").Value = adminSheet.Range("I2").Value                       'client Name
    targetSheet.Range("D20").Value = sourceSheet.Range("I4").Value                      'PO Number
    targetSheet.Range("D22").Value = solderType                                         'solder type
    targetSheet.Range("D24").Value = "IPC Class " & ipcClass                            'ipc class
    targetSheet.Range("D26").Value = GMP                                                'GMP
    targetSheet.Range("D28").Value = BOM                                                'BOM Name
    targetSheet.Range("D30").Value = Gerber                                             'Gerber Name
    targetSheet.Range("D32").Value = ActiveCell.Offset(0, 9).Value                      'Qty Shipped
    targetSheet.Range("A38").Value = Format(sourceSheet.Range("I2").Value, "m/d/yyyy")  'Date
    
    ' Copy data from target to source
    ActiveCell.Offset(0, 3).Formula = "='" & targetSheet.Name & "'!D34"
    
    Dim baseName As String
    baseName = ActiveCell.Offset(0, 2).Value
    
    targetSheet.Activate
    
    Dim newName As String
    newName = i & " CC " & baseName
    newName = Left(newName, 31)
    
    ActiveSheet.Name = Left(newName, 31)
            
        
        ' Increment the counter and try again
        
        
    ' generate leadfree certificate
    If solderType = "Lead-Free" Then
        leadfreeCertificate.Copy After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count)
        ActiveSheet.Name = Left(i & " LFC " & baseName, 31)
        
        ' add data to lead free certificate
        
        Range("E17") = adminSheet.Range("I2").Value
        Range("P17") = GMP
        Range("AA17") = targetSheet.Range("D32").Value
        Range("E20") = targetSheet.Range("D20").Value
        Range("P20") = targetSheet.Range("A38").Value
        Range("AA20") = targetSheet.Range("D32").Value
    End If
    
    
End Sub


