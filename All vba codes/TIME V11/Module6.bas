Attribute VB_Name = "Module6"
Sub ListFolders()
    Dim tb As OLEObject
    Dim folderPath As String
    Dim fileSystem As Object
    Dim SubFolder As Object
    Dim ws As Worksheet
    Dim rowNum As Long
    
    ' Set the worksheet where you want to list the folder names
    Set ws = ThisWorkbook.Sheets("Folders List") ' Change "Sheet1" to your desired sheet name
    ws.Range("A2:C10000").ClearContents
    
    
    
    ' Set the embedded textbox object
    On Error Resume Next
    Set tb = ws.OLEObjects("TextBox1") ' Change "TextBox1" to the name of your embedded textbox
    On Error GoTo 0
    
    If Not tb Is Nothing Then
        folderPath = tb.Object.Text
        ' Remove trailing spaces or line breaks
        folderPath = Trim(folderPath)
        
        ' Create a FileSystemObject
        Set fileSystem = CreateObject("Scripting.FileSystemObject")
        
        ' Check if the folder exists
        If fileSystem.FolderExists(folderPath) Then
            ' Get the folder object
            Set SubFolder = fileSystem.GetFolder(folderPath)
            
            ' Initialize the row number
            rowNum = 2
            
            ' Loop through each subfolder and write its name to the worksheet if it starts with "QTE"
            For Each SubFolder In SubFolder.SubFolders
                If Left(SubFolder.Name, 3) = "QTE" Or Left(SubFolder.Name, 2) = "TL" Or Left(SubFolder.Name, 2) = "KP" Then
                    ws.Cells(rowNum, 1).Value = SubFolder.Name
                    rowNum = rowNum + 1
                End If
            Next SubFolder
        Else
            MsgBox "Folder not found."
        End If
        
        ' Clean up
        Set fileSystem = Nothing
        Set SubFolder = Nothing
    Else
        MsgBox "Embedded textbox not found."
    End If
    
    Set ws = Nothing
End Sub


