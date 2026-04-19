Attribute VB_Name = "sendStencilNametoDMFile_Moduke"
Option Explicit
Sub sendStencilNametoDMFile()

Dim procPCBws As Worksheet
Set procPCBws = ThisWorkbook.Sheets("PCB + Stencils Orders")

Dim fullPath As String
fullPath = GetLocalPath(ThisWorkbook.FullName)

Dim folders() As String
folders() = Split(fullPath, "\")

Dim masterFolderName As String
Dim masterFolderPath As String
Dim procBatchCode As String
Dim DMFolderPath As String

masterFolderName = folders(UBound(folders) - 3)
masterFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName, vbTextCompare) + Len(masterFolderName))
procBatchCode = folders(UBound(folders) - 1)
DMFolderPath = masterFolderPath & "2. DM FILE\"

Dim wbOpened As Boolean
wbOpened = False


Dim DMPath As String
Dim dmFileName As String

dmFileName = Dir(DMFolderPath & "DM*.xlsm")
DMPath = DMFolderPath & dmFileName

Dim dmWB As Workbook
Dim DataInputWS As Worksheet

' check if dm file is already open
On Error Resume Next
    Set dmWB = Workbooks(dmFileName)
On Error GoTo 0

' If the workbook is not already open, open it
If dmWB Is Nothing Then
    Set dmWB = Workbooks.Open(DMPath)
    wbOpened = True
End If

Set DataInputWS = dmWB.Sheets("DataInputSheets")



procPCBws.Activate

initialiseHeaders DataInputWS, , , , , , procPCBws

Dim procPCBwsLR As Long
procPCBwsLR = procPCBws.Cells(procPCBws.Rows.count, PCB_ProcSheet_GMP__Column).End(xlUp).Row

Dim i As Integer
Dim gmpName As String
Dim rStencilName As String

For i = 2 To procPCBwsLR
    gmpName = procPCBws.Cells(i, PCB_ProcSheet_GMP__Column)
    Dim dmGMProw As Integer
    dmGMProw = DataInputWS.Columns(DM_GlobalMFRPackage_Column).Find(What:=gmpName, LookIn:=xlValues, LookAt:=xlWhole).Row
    
    rStencilName = procPCBws.Cells(i, PCB_ProcSheet_PCBStencil__Column)
    DataInputWS.Cells(dmGMProw, DM_StencilName_Column) = rStencilName
    
Next i

' If the workbook was opened by this macro, close it
If wbOpened Then
    dmWB.Close SaveChanges:=True
End If

End Sub
