Attribute VB_Name = "Create_CX_File_V1"
Sub Create_File_For_LANKA()

Dim dis As Worksheet, cxWS As Worksheet
Dim cxWB As Workbook

' define paths
Dim fullPath As String
Dim localPath As String
Dim parentFolderName As String
Dim cxTemplateFolderPath As String
Dim cxTemplateFileName As String
Dim cxTemplatePath As String

fullPath = GetLocalPath(ThisWorkbook.fullName)
parentFolderName = ExtractFolderName(fullPath)
localPath = Left(fullPath, InStrRev(fullPath, "\"))
cxTemplateFolderPath = Left(localPath, InStr(1, localPath, parentFolderName, vbTextCompare) + Len(parentFolderName)) & "6. BACKEND\CX TEMPLATE\"
cxTemplateFileName = Dir(cxTemplateFolderPath & "CX File Template*")
cxTemplatePath = cxTemplateFolderPath & cxTemplateFileName

Set dis = ThisWorkbook.Sheets("DataInputSheets")
initialiseHeaders dis


Set cxWB = Workbooks.Open(cxTemplatePath, ReadOnly:=True)
Set cxWS = cxWB.Sheets(1)
cxWB.Windows(1).Visible = True

Dim HeaderRow As Integer
HeaderRow = 3

initilizeCXfileHeader cxWS, HeaderRow



' fill data in new workbook

Dim i, j, lr As Long
j = 4
lr = dis.Cells(dis.Rows.count, DM_GlobalMFRPackage_Column).End(xlUp).Row
For i = 6 To lr
    If dis.Cells(i, "D") > 0 Then
        cxWS.Cells(j, cxfile_gmp_column) = dis.Cells(i, DM_GlobalMFRPackage_Column)    'Global Manufacturing Package Name
        cxWS.Cells(j, cxfile_bomName_column) = dis.Cells(i, DM_BomName_Column)    'Bom Name
        cxWS.Cells(j, cxfile_bomRev_column) = dis.Cells(i, DM_BOMRev_Column)    'Bom REV
        cxWS.Cells(j, cxfile_pcbName_column) = dis.Cells(i, DM_PCBName_Column)    'PCB Name
        cxWS.Cells(j, cxfile_pcbRev_column) = dis.Cells(i, DM_PCBRev_Column)    'PCB REV
        cxWS.Cells(j, cxfile_Qty1_column) = dis.Cells(i, DM_QTY1_Column)    'QTY #1
'        cxWS.Cells(j, "I") = dis.Cells(i, DM_UnitPrice1_Column)    'Unit Price 1
        cxWS.Cells(j, cxfile_Qty2_column) = dis.Cells(i, DM_QTY2_Column)    'QTY #2
'        cxWS.Cells(j, "K") = dis.Cells(i, DM_UnitPrice2_Column)    'Unit Price 2
        cxWS.Cells(j, cxfile_Qty3_column) = dis.Cells(i, DM_QTY3_Column)    'QTY #3
'        cxWS.Cells(j, "M") = dis.Cells(i, DM_UnitPrice3_Column)    'Unit Price 3
        cxWS.Cells(j, cxfile_Qty4_column) = dis.Cells(i, DM_QTY4_Column)    'QTY #4
'        cxWS.Cells(j, "O") = dis.Cells(i, DM_UnitPrice4_Column)    'Unit Price 4
        cxWS.Cells(j, cxfile_nre1_column) = dis.Cells(i, DM_NRE1_Column)    'NRE 1
'        cxWS.Cells(j, "T") = dis.Cells(i, DM_Status_Column)    'Comments(if any)/Status
    
        ''recheck colums
        cxWS.Cells(j, cxfile_quoteNo_column) = dis.Cells(i, DM_QTEwithRevisions_Column)   'Quote #
        
'        cxWS.Cells(j, "G") = dis.Cells(i, DM_LastQuoteDate_Column)   'Last Quote Date
        cxWS.Cells(j, cxfile_nre2_column) = dis.Cells(i, DM_NRE2_Column)    'NRE 2
        cxWS.Cells(j, cxfile_nre3_column) = dis.Cells(i, DM_NRE3_Column)   'NRE 3
        cxWS.Cells(j, cxfile_nre4_column) = dis.Cells(i, DM_NRE4_Column)   'NRE 4
        
        cxWS.Cells(j, cxfile_assy1_column) = dis.Cells(i, DM_Assembly1_Column)
        cxWS.Cells(j, cxfile_comp1_column) = dis.Cells(i, DM_Assembly1_Column + 1)
        cxWS.Cells(j, cxfile_pcb1_column) = dis.Cells(i, DM_Assembly1_Column + 2)
        cxWS.Cells(j, cxfile_total1_column) = dis.Cells(i, DM_Assembly1_Column + 3)
        
        
        cxWS.Cells(j, cxfile_assy2_column) = dis.Cells(i, DM_Assembly1_Column + 4)
        cxWS.Cells(j, cxfile_comp2_column) = dis.Cells(i, DM_Assembly1_Column + 5)
        cxWS.Cells(j, cxfile_pcb2_column) = dis.Cells(i, DM_Assembly1_Column + 6)
        cxWS.Cells(j, cxfile_total2_column) = dis.Cells(i, DM_Assembly1_Column + 7)
        
        
        cxWS.Cells(j, cxfile_assy3_column) = dis.Cells(i, DM_Assembly1_Column + 8)
        cxWS.Cells(j, cxfile_comp3_column) = dis.Cells(i, DM_Assembly1_Column + 9)
        cxWS.Cells(j, cxfile_pcb3_column) = dis.Cells(i, DM_Assembly1_Column + 10)
        cxWS.Cells(j, cxfile_total3_column) = dis.Cells(i, DM_Assembly1_Column + 11)
        
        
        cxWS.Cells(j, cxfile_assy4_column) = dis.Cells(i, DM_Assembly1_Column + 12)
        cxWS.Cells(j, cxfile_comp4_column) = dis.Cells(i, DM_Assembly1_Column + 13)
        cxWS.Cells(j, cxfile_pcb4_column) = dis.Cells(i, DM_Assembly1_Column + 14)
        cxWS.Cells(j, cxfile_total4_column) = dis.Cells(i, DM_Assembly1_Column + 15)
        
        
        'add the extended prices
        cxWS.Cells(j, cxfile_totalAssy1_column).FormulaR1C1 = "=RC[-4]*RC[-5]"
        cxWS.Cells(j, cxfile_totalMat1_column).FormulaR1C1 = "=(RC[-3]+RC[-4])*RC[-6]"
        cxWS.Cells(j, cxfile_totalCost1_column).FormulaR1C1 = "=RC[-3]*RC[-7]"
        cxWS.Cells(j, cxfile_totalAssy2_column).FormulaR1C1 = "=RC[-4]*RC[-5]"
        cxWS.Cells(j, cxfile_totalMat2_column).FormulaR1C1 = "=(RC[-3]+RC[-4])*RC[-6]"
        cxWS.Cells(j, cxfile_totalCost2_column).FormulaR1C1 = "=RC[-3]*RC[-7]"
        cxWS.Cells(j, cxfile_totalAssy3_column).FormulaR1C1 = "=RC[-4]*RC[-5]"
        cxWS.Cells(j, cxfile_totalMat3_column).FormulaR1C1 = "=(RC[-3]+RC[-4])*RC[-6]"
        cxWS.Cells(j, cxfile_totalCost3_column).FormulaR1C1 = "=RC[-3]*RC[-7]"
        cxWS.Cells(j, cxfile_totalAssy4_column).FormulaR1C1 = "=RC[-4]*RC[-5]"
        cxWS.Cells(j, cxfile_totalMat4_column).FormulaR1C1 = "=(RC[-3]+RC[-4])*RC[-6]"
        cxWS.Cells(j, cxfile_totalCost4_column).FormulaR1C1 = "=RC[-3]*RC[-7]"
        
        
        ' cell formatting
        cxWS.Range(cxWS.Cells(j, cxfile_Qty1_column), cxWS.Cells(j, cxfile_nre4_column)).NumberFormat = "#,###.00 $"
        cxWS.Cells(j, cxfile_Qty1_column).NumberFormat = "General"
        cxWS.Cells(j, cxfile_Qty2_column).NumberFormat = "General"
        cxWS.Cells(j, cxfile_Qty3_column).NumberFormat = "General"
        cxWS.Cells(j, cxfile_Qty4_column).NumberFormat = "General"
        
'        cxWS.Cells(j, "G").NumberFormat = "mm/dd/yyyy"
'        cxWS.Range(cxWS.Cells(j, "U"), cxWS.Cells(j, "AV")).NumberFormat = "#,###.00 $"
'        cxWS.Range("U1:AA2").Interior.Color = RGB(146, 208, 80)
'        cxWS.Range("AB1:AH2").Interior.Color = RGB(216, 109, 205)
'        cxWS.Range("AI1:AO2").Interior.Color = RGB(68, 179, 225)
'        cxWS.Range("AP1:AV2").Interior.Color = RGB(190, 80, 20)
        
        
        j = j + 1
    End If
Next i

    Dim lastColumn As Long
    
    ' Find the last column with data in the active sheet
    lastColumn = cxWS.Cells(HeaderRow, Columns.count).End(xlToLeft).Column
    
    ' AutoFit columns from column A to the last column
    cxWS.Columns("A:AP").AutoFit

    ' define last row for boarder
    lr = j - 1
    
    ' Define the range from A1 to the last row and last column
    Dim rng As Range
    Set rng = cxWS.Range(cxWS.Cells(HeaderRow, "A"), (cxWS.Cells(lr, lastColumn)))
       
    
    ' Apply borders to the range
    With rng.Borders
        .LineStyle = xlContinuous
        .Color = vbBlack
        .Weight = xlThin
    End With
    
    
    ' hide pcb name, gerber name and revision columns
    cxWS.Columns(cxfile_bomName_column).Hidden = True
    cxWS.Columns(cxfile_bomRev_column).Hidden = True
    cxWS.Columns(cxfile_pcbName_column).Hidden = True
    cxWS.Columns(cxfile_pcbRev_column).Hidden = True
        
End Sub



Function ExtractFolderName(ByVal fullPath As String) As String
    Dim folders() As String
    Dim folderName As String
    
    ' Split the path string using backslash as delimiter
    folders = Split(fullPath, "\")
    
    ' Check if there are at least three elements in the array
    If UBound(folders) >= 2 Then
        ' Get the third element which corresponds to the folder name
        folderName = folders(UBound(folders) - 2)
    Else
        ' If the path is invalid, return empty string
        folderName = ""
    End If
    
    ' Return the folder name
    ExtractFolderName = folderName
End Function
