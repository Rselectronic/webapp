Attribute VB_Name = "RefreshStencils"
Option Explicit

''Anil 10/30/2025" Module which refresh stencils name in production schedule from dm file stencils template data on the basis of GMP

Sub RefreshStencilsSub()
Application.ScreenUpdating = False
Application.EnableEvents = False
Application.Calculation = xlCalculationManual
Application.DisplayAlerts = False

Dim Status_FunctionRefreshStencils As String

Status_FunctionRefreshStencils = FunctionRefreshStencils

If FunctionRefreshStencils <> "" Then
  MsgBox FunctionRefreshStencils, vbExclamation, "Macro Status"
Else
  MsgBox "Stencils Details Refresh Successfully", vbInformation, "Macro Status"
End If

Application.ScreenUpdating = True
Application.EnableEvents = True
Application.Calculation = xlCalculationAutomatic
Application.DisplayAlerts = False
End Sub

Private Function FunctionRefreshStencils()
On Error GoTo errHandler

Dim folders() As String
Dim masterfolderName As String
Dim masterfolderPath As String
Dim prodSchWBpath As String
Dim prodSchWBname As String
Dim fullPath As String
Dim DMfileWB As Workbook
Dim DMWBname As String, DMWBnamePath As String
Dim wsProductionSchedule As Worksheet, productionScheduleLR As Double
Dim k As Double
Dim wsStencilsPositions As Worksheet
Dim wsStencilsPositionslrow As Double, jj As Double
Dim wsStencilsPositions_Gmp As String, wsStencilsPositions_Stencil As String
Dim wsStencilsPositions_ArrayGmp() As String, Arrayloop As Double
Dim wsStencilsPositions_ConcateStencil As String
Dim GMP As String
Dim prodSchPONumber As String
Dim prodSchPartNumber As String

fullPath = GetLocalPath(ThisWorkbook.FullName)
folders = Split(fullPath, "\")
masterfolderName = folders(UBound(folders) - 2)
masterfolderPath = Left(fullPath, InStr(1, fullPath, masterfolderName, vbTextCompare) + Len(masterfolderName))
DMWBname = Dir(masterfolderPath & "2. DM FILE\" & "DM Common File - Reel Pricing*", vbDirectory)
DMWBnamePath = masterfolderPath & "2. DM FILE\" & DMWBname
Set DMfileWB = Workbooks.Open(DMWBnamePath)
Set wsStencilsPositions = DMfileWB.Sheets("Stencils Positions")
Set wsProductionSchedule = ThisWorkbook.Sheets("Project schedule - Detailed")
initaliseHeaders wsProductionSchedule, , , , , wsStencilsPositions
productionScheduleLR = wsProductionSchedule.Cells(wsProductionSchedule.Rows.Count, prodSch_Task_Column).End(xlUp).Row
wsStencilsPositionslrow = wsStencilsPositions.Cells(Rows.Count, wsStencilsPositions_StencilName_Column).End(xlUp).Row

    For k = 8 To productionScheduleLR
        
        wsStencilsPositions_ConcateStencil = ""
        prodSchPONumber = wsProductionSchedule.Cells(k, prodSch_PoNumber_Column)
        prodSchPartNumber = wsProductionSchedule.Cells(k, prodSch_Task_Column)
    
        If prodSchPONumber <> "" Then
                GMP = prodSchPartNumber
                For jj = 2 To wsStencilsPositionslrow
                    wsStencilsPositions_Gmp = wsStencilsPositions.Cells(jj, wsStencilsPositions_GMPName_Column).Value
                    wsStencilsPositions_Stencil = wsStencilsPositions.Cells(jj, wsStencilsPositions_StencilName_Column).Value
    
                    If wsStencilsPositions_Gmp = "" Or wsStencilsPositions_Stencil = "" Then GoTo skipthis
                    wsStencilsPositions_ArrayGmp = Split(wsStencilsPositions_Gmp, ";")
    
                    For Arrayloop = LBound(wsStencilsPositions_ArrayGmp) To UBound(wsStencilsPositions_ArrayGmp)
                        If Trim(UCase(wsStencilsPositions_ArrayGmp(Arrayloop))) = Trim(UCase(GMP)) Then
                           wsStencilsPositions_ConcateStencil = wsStencilsPositions_ConcateStencil & wsStencilsPositions.Cells(jj, wsStencilsPositions_PositionNo_Column).Value & ", " & wsStencilsPositions.Cells(jj, wsStencilsPositions_StencilName_Column).Value & " and "
                        End If
                    Next Arrayloop
skipthis:
                Next jj
    
                If wsStencilsPositions_ConcateStencil <> "" Then
                  wsProductionSchedule.Cells(k, prodSch_StencilName_Column) = Mid(wsStencilsPositions_ConcateStencil, 1, Len(wsStencilsPositions_ConcateStencil) - 5)
                End If
        End If
        
    Next k
    
    ThisWorkbook.Activate
    wsProductionSchedule.Activate
    wsProductionSchedule.Range("A1").Select
    
Exit Function
errHandler:
 FunctionRefreshStencils = Err.Description
End Function
