Attribute VB_Name = "PrintAveryLabels_V1"
Option Explicit

Function FillAveryLabelsAndSavePDF(templatePath As String, boardLabels As Variant, xLabel As Boolean, mcodeLabel As Variant, procBatchCode As String, stickerLabelFileName As String) As Variant
    Dim lastRow As Long, dataRow As Long
    Dim wordApp As Object
    Dim wordDoc As Object
    Dim t As Object ' Word.Table
    Dim r As Long, c As Long
    Dim labelText As String
    Dim done As Boolean
    
    ' === SETTINGS TO EDIT ===
    
    ' Start Word (late binding – no reference needed)
    On Error Resume Next
    Set wordApp = GetObject(, "Word.Application")
    On Error GoTo 0
    If wordApp Is Nothing Then
        Set wordApp = CreateObject("Word.Application")
    End If
    
    If wordApp Is Nothing Then
        MsgBox "Could not start Word.", vbCritical
        Exit Function
    End If
    
    wordApp.Visible = False ' set True if you want to watch it
    
    ' Open the Avery template
    Set wordDoc = wordApp.Documents.Open(templatePath, ReadOnly:=True)
    
    If wordDoc Is Nothing Then
        MsgBox "Could not open Word template: " & templatePath, vbCritical
        GoTo Cleanup
    End If
    
    ' Use the first table (Avery labels are laid out as a table)
    If wordDoc.Tables.count = 0 Then
        MsgBox "Template has no tables. Cannot find label layout.", vbCritical
        GoTo Cleanup
    End If
    
    Set t = wordDoc.Tables(1)
    
    'dataRow = 2   ' first data row
    done = False
    Dim lastPage As Long
    'lastPage = 2
    Dim i As Long, labelCount As Long
    i = 0
    labelCount = 0
    
    ' Loop over the table cells (labels)
    For r = 1 To t.Rows.count
        For c = 1 To t.Columns.count
            ' Stop if we ran out of data
            If i = UBound(boardLabels) - LBound(boardLabels) + 1 Then
                done = True
                Exit For
            End If
            
            ' Build label text from up to 4 columns (A:D)
            labelText = boardLabels(i)
            
            ' Write into the label cell
            With t.cell(r, c).Range
                .Text = labelText
                labelCount = labelCount + 1
                ' Remove the extra end-of-cell marker formatting
                '.Characters.Last.Previous = ""
            End With
            
            i = i + 1
        Next c
    If done Then Exit For
    Next r
        
        If xLabel Then
            labelText = "X" & vbCrLf & procBatchCode
            
            ' Write into the label cell
            With t.cell(r, c).Range
                .Text = labelText
                labelCount = labelCount + 1
                ' Remove the extra end-of-cell marker formatting
                '.Characters.Last.Previous = ""
            End With
            
            If c Mod 2 = 0 Then
                r = r + 1
                c = 1
            Else
                r = r
                c = 2
            End If
            
        End If
        
    i = 0
    done = False
    For r = r To t.Rows.count
        For c = c To t.Columns.count
            If i = UBound(mcodeLabel) - LBound(mcodeLabel) + 1 Then
                done = True
                Exit For
            End If
            
            ' Build label text from up to 4 columns (A:D)
            labelText = mcodeLabel(i)
            
            
            ' Write into the label cell
            With t.cell(r, c).Range
                .Text = labelText
                labelCount = labelCount + 1
                ' Remove the extra end-of-cell marker formatting
                '.Characters.Last.Previous = ""
            End With
            
            i = i + 1
        Next c
    If done Then Exit For
    c = 1
    Next r
    
    lastPage = (labelCount + 13) \ 14
        
        
        
    
    
'    ' === Export to PDF ===
'    Const wdExportFormatPDF As Long = 17
'
'    wordDoc.ExportAsFixedFormat _
'        OutputFileName:=stickerLabelFileName, _
'        ExportFormat:=wdExportFormatPDF, _
'        OpenAfterExport:=False, _
'        OptimizeFor:=0, _
'        Range:=3, _
'        From:=1, To:=lastPage, _
'        Item:=0, _
'        IncludeDocProps:=True, _
'        KeepIRM:=True, _
'        CreateBookmarks:=0, _
'        DocStructureTags:=True, _
'        BitmapMissingFonts:=True, _
'        UseISO19005_1:=False
    
    
    
    ' === Save filled labels as a Word document instead of PDF ===
    wordDoc.SaveAs2 _
        FileName:=stickerLabelFileName, _
        FileFormat:=12   ' this is .docx
        
        
    'MsgBox "Labels filled and saved as PDF:" & vbCrLf & pdfPath, vbInformation

Cleanup:
    On Error Resume Next
    If Not wordDoc Is Nothing Then wordDoc.Close SaveChanges:=False
    If Not wordApp Is Nothing Then wordApp.Quit
    Set wordDoc = Nothing
    Set wordApp = Nothing
End Function




