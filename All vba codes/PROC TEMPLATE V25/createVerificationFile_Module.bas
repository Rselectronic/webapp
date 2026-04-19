Attribute VB_Name = "createVerificationFile_Module"
Option Explicit

Sub createVerificationFile()

Application.ScreenUpdating = False
Application.Calculation = xlCalculationManual

Dim ProcWS As Worksheet
Set ProcWS = ThisWorkbook.Sheets("Proc")

Dim fullPath As String
fullPath = GetLocalPath(ThisWorkbook.FullName)

Dim folders() As String
folders() = Split(fullPath, "\")

Dim masterFolderName As String
Dim masterFolderPath As String
Dim procBatchCode As String
Dim procfolderPath As String

masterFolderName = folders(UBound(folders) - 3)
masterFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName, vbTextCompare) + Len(masterFolderName))
procBatchCode = folders(UBound(folders) - 1)
procfolderPath = Left(fullPath, InStrRev(fullPath, "\"))

Dim procVerificationWB As Workbook
Dim procVerificationWS As Worksheet
Dim procVerificationFileName As String

procVerificationFileName = Dir(masterFolderPath & "4. PROC FILE\" & "PROC Verification Template*")

Dim newProcverificationFilePath As String
newProcverificationFilePath = procfolderPath & Split(procVerificationFileName, ".")(0) & " " & procBatchCode & ".xlsm"

' copy proc verification file template to proc folder
CopyFile masterFolderPath & "4. PROC FILE\" & procVerificationFileName, newProcverificationFilePath


Set procVerificationWB = Workbooks.Open(newProcverificationFilePath)
Set procVerificationWS = procVerificationWB.Sheets("Data Verification")

initialiseHeaders , , , ProcWS


Dim i As Long, j As Long, lr As Long
lr = ProcWS.Cells(ProcWS.Rows.count, "B").End(xlUp).Row
j = 5

For i = 5 To lr
    procVerificationWS.Cells(j, "A") = ProcWS.Cells(i, Procsheet_CPC_Column)
    procVerificationWS.Cells(j, "B") = ProcWS.Cells(i, Procsheet_CustomerDescription_Column)
    procVerificationWS.Cells(j, "C") = ProcWS.Cells(i, Procsheet_CustomerMPN_Column)
    procVerificationWS.Cells(j, "D") = ProcWS.Cells(i, Procsheet_CustomerMFR_Column)
    procVerificationWS.Cells(j, "E") = ProcWS.Cells(i, Procsheet_Placetobuy_Column)
    procVerificationWS.Cells(j, "F") = ProcWS.Cells(i, Procsheet_PNTOUSE_Column)
    procVerificationWS.Cells(j, "G") = ProcWS.Cells(i, Procsheet_MFRtoUse_Column)
    procVerificationWS.Cells(j, "H") = ProcWS.Cells(i, Procsheet_DistName_Column)
    procVerificationWS.Cells(j, "I") = ProcWS.Cells(i, Procsheet_DistPN_Column)
    procVerificationWS.Cells(j, "M") = ProcWS.Cells(i, Procsheet_LCSCPN_Column)
    j = j + 1
Next i

'apply border
'procVerificationWS.Range(procVerificationWS.Cells(4, 1), procVerificationWS.Cells(j - 1, "M")).Borders.LineStyle = xlContinuous


Application.ScreenUpdating = True
Application.Calculation = xlCalculationAutomatic


'save the workbook
procVerificationWB.Save

End Sub

