Attribute VB_Name = "CPC_Shortner_V2"
Option Explicit
Sub shortenCPC()

Dim ws As Worksheet
Set ws = ThisWorkbook.Sheets("Proc")

Dim i As Long
Dim lr As Long

initialiseHeaders , , , ws

lr = ws.Cells(ws.Rows.count, Procsheet_CPC_Column).End(xlUp).Row

Dim cpc As String


For i = 5 To lr
    cpc = ws.Cells(i, Procsheet_CPC_Column)
    If Left(cpc, 8) = "TL-IC000" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Replace(cpc, "TL-IC000", "TL-IC", 1)
    ElseIf Left(cpc, 7) = "TL-A000" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Replace(cpc, "TL-A000", "TL-A", 1)
    ElseIf Left(cpc, 7) = "TL-B000" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Replace(cpc, "TL-B000", "TL-B", 1)
    ElseIf Left(cpc, 7) = "TL-C000" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Replace(cpc, "TL-C000", "TL-C", 1)
    ElseIf Left(cpc, 7) = "TL-D000" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Replace(cpc, "TL-D000", "TL-D", 1)
    ElseIf Left(cpc, 7) = "TL-E000" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Replace(cpc, "TL-E000", "TL-E", 1)
    ElseIf Left(cpc, 7) = "TL-F000" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Replace(cpc, "TL-F000", "TL-F", 1)
    ElseIf Left(cpc, 7) = "TL-G000" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Replace(cpc, "TL-G000", "TL-G", 1)
    ElseIf Left(cpc, 7) = "TL-H000" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Replace(cpc, "TL-H000", "TL-H", 1)
    ElseIf Left(cpc, 7) = "TL-I000" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Replace(cpc, "TL-I000", "TL-I", 1)
    ElseIf Left(cpc, 7) = "TL-J000" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Replace(cpc, "TL-J000", "TL-J", 1)
    ElseIf Left(cpc, 7) = "TL-K000" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Replace(cpc, "TL-K000", "TL-K", 1)
    ElseIf Left(cpc, 7) = "TL-L000" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Replace(cpc, "TL-L000", "TL-L", 1)
    ElseIf Left(cpc, 7) = "TL-M000" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Replace(cpc, "TL-M000", "TL-M", 1)
    ElseIf Left(cpc, 7) = "TL-Q000" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Replace(cpc, "TL-Q000", "TL-Q", 1)
    ElseIf Left(cpc, 7) = "TL-Z000" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Replace(cpc, "TL-Z000", "TL-Z", 1)
    ElseIf Right(cpc, 3) = "-00" Then
        ws.Cells(i, Procsheet_ShortenCPC_Column) = Left(ws.Cells(i, Procsheet_CPC_Column), Len(ws.Cells(i, Procsheet_CPC_Column)) - 3)
    Else
        ws.Cells(i, Procsheet_ShortenCPC_Column) = ws.Cells(i, Procsheet_CPC_Column)
    End If
Next i


End Sub
