Attribute VB_Name = "Generate_PurchaseOrder"
Option Explicit

'Module which generate PO of suppliers
'Development Date  - 11/01/2025
'Developver Name - Anil choudhary

Dim PO_WbOutputPath As String

Public jobqueueWB_SupplierSheet As Worksheet
Public Findrng As Range, jobqueueWB_SupplierSheettargetrow As Double, jobqueueWB_SupplierSheetlrow As Double

Public Sub GeneratePO()
Application.DisplayAlerts = False
Application.ScreenUpdating = False
Application.enableEvents = False

Dim StatusGeneratePO As String
StatusGeneratePO = GeneratePO_Function()

If StatusGeneratePO <> "" Then
  MsgBox "Macro Fails : " & StatusGeneratePO, vbExclamation, "Macro"
Else
  MsgBox "PO Generated Successfully", vbInformation, "Macro"
End If

Application.DisplayAlerts = True
Application.ScreenUpdating = True
Application.enableEvents = True
End Sub

Private Function GeneratePO_Function() As String
On Error GoTo errhandler

Dim selectedItem As String
Dim ProcSheet As Worksheet, ProcSheetlrow As Double
Dim dataRange As Range
Dim selectedItemCompanyname As String

PO_WbOutputPath = ""
Set ProcSheet = ThisWorkbook.Sheets("Proc")
initialiseHeaders , , , ProcSheet
ProcSheetlrow = ProcSheet.Cells(Rows.count, Procsheet_Placetobuy_Column).End(xlUp).Row

If ProcSheetlrow < 5 Then
   GeneratePO_Function = "No Supplier found in Proc to Continue"
   Exit Function
End If

Set dataRange = ProcSheet.Range(ProcSheet.Cells(Procsheet_Header_Row + 1, Procsheet_Placetobuy_Column), ProcSheet.Cells(ProcSheetlrow, Procsheet_Placetobuy_Column))
selectedItem = GetUserSelection(dataRange)

If selectedItem = "" Then
    GeneratePO_Function = "User Opt Cancel - Process Terminated"
    Exit Function
End If

''Job queue Work Start ---------------------------------------------------

Dim fullPath As String
Dim folders() As String
Dim masterFolderName As String
Dim masterFolderPath As String
Dim procBatchCode As String
Dim jobQueueFolderPath As String
Dim jobQueuePath As String
Dim jobqueueFileName As String
Dim jobqueueWB As Workbook

fullPath = GetLocalPath(ThisWorkbook.FullName)
folders() = Split(fullPath, "\")
masterFolderName = folders(UBound(folders) - 3)
masterFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName, vbTextCompare) + Len(masterFolderName))
jobQueueFolderPath = masterFolderPath & "3. JOB QUEUE\"
jobqueueFileName = Dir(jobQueueFolderPath & "Job Queue*.xlsm")
jobQueuePath = jobQueueFolderPath & jobqueueFileName
Set jobqueueWB = Workbooks.Open(jobQueuePath, False, False)
Set jobqueueWB_SupplierSheet = jobqueueWB.Sheets("Supplier")
initialiseHeaders , , , , , , , , , , , , , , , , jobqueueWB_SupplierSheet

''----------------------------Update anil - 11/03/2025
jobqueueWB_SupplierSheetlrow = jobqueueWB_SupplierSheet.Cells(Rows.count, jobQueue_SupplierSheet_CompanyFullName).End(xlUp).Row

If jobqueueWB_SupplierSheetlrow < 2 Then
   GeneratePO_Function = "No Data found in Job Queue : " & jobqueueWB_SupplierSheet.Name & " Sheet"
   Exit Function
End If

Set dataRange = jobqueueWB_SupplierSheet.Range(jobqueueWB_SupplierSheet.Cells(2, jobQueue_SupplierSheet_CompanyFullName), jobqueueWB_SupplierSheet.Cells(jobqueueWB_SupplierSheetlrow, jobQueue_SupplierSheet_CompanyFullName))
selectedItemCompanyname = GetUserSelection_Company(dataRange)

If selectedItemCompanyname = "" Then
    GeneratePO_Function = "User Opt Cancel - Process Terminated"
    jobqueueWB.Close False
    Exit Function
End If
''-----------------------------''

Set Findrng = jobqueueWB_SupplierSheet.Cells(1, jobQueue_SupplierSheet_CompanyFullName).EntireColumn.Find(What:=selectedItemCompanyname, after:=jobqueueWB_SupplierSheet.Cells(1, jobQueue_SupplierSheet_CompanyFullName), LookIn:=xlFormulas, LookAt:=xlWhole)
jobqueueWB_SupplierSheettargetrow = Findrng.Row

''Job queue Work End ---------------------------------------------------

''PO Template Start ---------------------------------------------------

Dim POTemplateFileName As String, POPath As String, POTemplateFolderPath As String
Dim PO_Wb As Workbook, PO_WbSheet As Worksheet
Dim i As Double
Dim PoIndex As Double, SerialNoIndex As Double

fullPath = GetLocalPath(ThisWorkbook.FullName)
folders() = Split(fullPath, "\")
masterFolderName = folders(UBound(folders) - 3)
masterFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName, vbTextCompare) + Len(masterFolderName))
POTemplateFolderPath = masterFolderPath & "6. BACKEND\PO TEMPLATE\"
POTemplateFileName = Dir(POTemplateFolderPath & "PO_Template*.xlsm")
POPath = POTemplateFolderPath & POTemplateFileName
Set PO_Wb = Workbooks.Open(POPath, False, True)
Set PO_WbSheet = PO_Wb.Sheets(1)

PoIndex = 22
SerialNoIndex = 1

For i = 5 To ProcSheetlrow
  If Trim(UCase(ProcSheet.Cells(i, Procsheet_Placetobuy_Column).Value)) <> Trim(UCase(selectedItem)) Then GoTo skipitem
  'Serial No
  PO_WbSheet.Cells(PoIndex, "A").Value = SerialNoIndex
  'MANUFACTURER PN
  PO_WbSheet.Cells(PoIndex, "B").Value = ProcSheet.Cells(i, Procsheet_PNTOUSE_Column).Value
  'MANUFACTURER
  PO_WbSheet.Cells(PoIndex, "K").Value = ProcSheet.Cells(i, Procsheet_MFRtoUse_Column).Value
  'DC
  PO_WbSheet.Cells(PoIndex, "S").Value = ""
  'QTY
  PO_WbSheet.Cells(PoIndex, "V").Value = ProcSheet.Cells(i, Procsheet_ORDERQTY_Column).Value

  PoIndex = PoIndex + 1: SerialNoIndex = SerialNoIndex + 1
  If PoIndex > 42 Then
    GeneratePO_Function = "Supplies Count Exceed the limit of 20 , in PO Template , Process Terminated"
    jobqueueWB.Close False
    PO_Wb.Close False
    Exit Function
  End If
  
skipitem:
Next i

''PO Template End ---------------------------------------------------

''Taking data from Job queue

Dim PO_Split() As String, termsList As String

PO_Split = Split(ThisWorkbook.Name, " ")
If UBound(PO_Split) < 2 Then
    GeneratePO_Function = "Proc File Naming convention not supported to fill in PO name Under Template"
    Exit Function
End If

PO_WbSheet.Cells(4, "AE").Value = FillDateTimeInCanada
PO_WbSheet.Cells(4, "AE").Value = Format(PO_WbSheet.Cells(4, "AE").Value, "MM/DD/YYYY")
PO_WbSheet.Cells(5, "AE").Value = Replace(PO_Split(2), ".xlsm", "", , , vbTextCompare)
PO_WbSheet.Cells(11, "A").Value = jobqueueWB_SupplierSheet.Cells(jobqueueWB_SupplierSheettargetrow, jobQueue_SupplierSheet_SupplierName).Value
PO_WbSheet.Cells(12, "A").Value = jobqueueWB_SupplierSheet.Cells(jobqueueWB_SupplierSheettargetrow, jobQueue_SupplierSheet_CompanyFullName).Value
PO_WbSheet.Cells(13, "A").Value = jobqueueWB_SupplierSheet.Cells(jobqueueWB_SupplierSheettargetrow, jobQueue_SupplierSheet_StreetAddress).Value
PO_WbSheet.Cells(14, "A").Value = jobqueueWB_SupplierSheet.Cells(jobqueueWB_SupplierSheettargetrow, jobQueue_SupplierSheet_City).Value & ", " & jobqueueWB_SupplierSheet.Cells(jobqueueWB_SupplierSheettargetrow, jobQueue_SupplierSheet_ProvinceState).Value & ", " & jobqueueWB_SupplierSheet.Cells(jobqueueWB_SupplierSheettargetrow, jobQueue_SupplierSheet_PostalCode).Value & ", " & jobqueueWB_SupplierSheet.Cells(jobqueueWB_SupplierSheettargetrow, jobQueue_SupplierSheet_Country).Value
PO_WbSheet.Cells(15, "A").Value = jobqueueWB_SupplierSheet.Cells(jobqueueWB_SupplierSheettargetrow, jobQueue_SupplierSheet_EmailID).Value
PO_WbSheet.Cells(16, "A").Value = jobqueueWB_SupplierSheet.Cells(jobqueueWB_SupplierSheettargetrow, jobQueue_SupplierSheet_ContactNo).Value

termsList = jobqueueWB_SupplierSheet.Cells(jobqueueWB_SupplierSheettargetrow, jobQueue_SupplierSheet_PaymentTerms).Value
If termsList <> "" Then
    With PO_WbSheet.Cells(19, "AC").Validation
        .Delete
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, _
             Operator:=xlBetween, Formula1:=termsList
        .IgnoreBlank = True
        .InCellDropdown = True
    End With
End If

'' Job queue End --------------------------------------

''Save file
fullPath = GetLocalPath(ThisWorkbook.FullName)
folders() = Split(fullPath, "\")
masterFolderName = folders(UBound(folders) - 1)
masterFolderPath = Left(fullPath, InStr(1, fullPath, masterFolderName, vbTextCompare) + Len(masterFolderName))
PO_WbOutputPath = masterFolderPath & "3. PO for Components\" & "PO " & selectedItem & " " & PO_WbSheet.Cells(5, "AE").Value & ".xlsm"
PO_Wb.SaveAs PO_WbOutputPath
PO_Wb.Activate
''-----------------

Exit Function
errhandler:
GeneratePO_Function = Err.description
End Function

Private Function GetUserSelection(dataRange As Range) As String
    With Generate_PO_Userform
        .LoadData dataRange
        .Show
        GetUserSelection = .GetSelectedValue
        Unload Generate_PO_Userform
    End With
End Function

Private Function GetUserSelection_Company(dataRange As Range) As String
    With Generate_PO_Company
        .LoadDataCompany dataRange
        .Show
        GetUserSelection_Company = .GetSelectedValue_Company
        Unload Generate_PO_Company
    End With
End Function


