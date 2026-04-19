Attribute VB_Name = "Module6"
Sub get_folder_path()

Dim path As String
Dim pathOnly As String

Debug.Print TransferURL(ThisWorkbook.FullName)

path = GetLocalPath(ThisWorkbook.FullName)


Dim lastBackslash As Integer
    lastBackslash = InStrRev(path, "\")
    
    ' Check if a backslash is found
    If lastBackslash > 0 Then
        ' Extract the path portion
        pathOnly = Left(path, lastBackslash)
        
        ' Display the result (you can replace this with any action you want)
    Else
        ' Handle the case where no backslash is found
    End If

Debug.Print pathOnly

End Sub



'
Function TransferURL(wbkURL As String) As String
' Converts the URL of a OneDrive into a path.
' Returns the path's name.
    
    Dim oFs As Object
    Dim oFl As Object
    Dim oSubFl As Object
 
    Dim pos As Integer
    Dim pathPart As String
    Dim oneDrive As String
    Dim subFl As String
        
    Set oFs = CreateObject("Scripting.FileSystemObject")
        
    ' Check the version of OneDrive.
    If VBA.InStr(1, _
                 VBA.UCase(wbkURL), "MY.SHAREPOINT.COM") = 0 Then
        
        oneDrive = "OneDriveConsumer"
        
    Else
        
        oneDrive = "OneDriveCommercial"
        
    End If
    
    Set oFl = oFs.GetFolder(Environ(oneDrive))
    
    ' Iteration over OneDrive's subfolders.
    For Each oSubFl In oFl.SubFolders
        
        subFl = "/" & VBA.Mid(oSubFl.path, _
                              VBA.Len(Environ(oneDrive)) + 2) & "/"
    
        ' Check if part of the URL.
        If VBA.InStr(1, _
                     wbkURL, subFl) > 0 Then
                
            ' Determine the path after OneDrive's folder.
            pos = VBA.InStr(1, _
                            wbkURL, subFl)
        
            pathPart = VBA.Mid(VBA.Replace(wbkURL, "/", _
                                           Application.PathSeparator), pos)
        
        End If
    
    Next
    
    TransferURL = Environ(oneDrive) & pathPart

End Function

