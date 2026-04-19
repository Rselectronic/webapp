Attribute VB_Name = "GetLastStatusWithTrackingID_V2"
Option Explicit

Private Const Deliveredstr As String = "Delivered"

Public Sub GetLastStatusWithTrackingIDSub()
Application.DisplayAlerts = False

Dim StatusofGetLastStatusWithTrackingIDFunction As String
StatusofGetLastStatusWithTrackingIDFunction = GetLastStatusWithTrackingIDFunction()

If StatusofGetLastStatusWithTrackingIDFunction <> "" Then
  MsgBox StatusofGetLastStatusWithTrackingIDFunction, , "Macro"
Else
  MsgBox "Status Updated Successfully", , "Macro"
End If

Application.DisplayAlerts = True
End Sub

Public Function GetLastStatusWithTrackingIDFunction()
On Error GoTo errhandler

Dim i As Double
Dim ProcFileTrackingSheet As Worksheet
Dim ProcFileTrackingSheetLrow As Double
Dim TrackingID As String
Dim StatusofAPICourier As String
Dim courierName As String

Set ProcFileTrackingSheet = ThisWorkbook.Sheets("Tracking")
ProcFileTrackingSheet.Activate
initialiseHeaders , , , , , , , , , , ProcFileTrackingSheet

'ProcFileTrackingSheet.Range(ProcFileTrackingSheet.Cells(3, ProcFile_Tracking_Sheet_Laststatus__Column), ProcFileTrackingSheet.Cells(10000, ProcFile_Tracking_Sheet_Laststatus__Column)).ClearContents
ProcFileTrackingSheetLrow = ProcFileTrackingSheet.Cells(Rows.Count, ProcFile_Tracking_Sheet_PROCBATCHCODE__Column).End(xlUp).Row
  
For i = 3 To ProcFileTrackingSheetLrow
   TrackingID = ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_TrackingID__Column).Value
   courierName = Trim(UCase(ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_CourierName__Column).Value))

  If LCase(ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_Laststatus__Column).Value) <> LCase(Deliveredstr) Then
        If courierName = "DHL" Then
           StatusofAPICourier = TrackDHLPackages(TrackingID, ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_EstimateDeliveryDate__Column))
           If LCase(StatusofAPICourier) Like "*" & LCase(Deliveredstr) & "*" Then
              ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_Laststatus__Column).Value = Deliveredstr
              ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_DeliveryDatestatus__Column).NumberFormat = "mm/dd/yyyy"
              ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_DeliveryDatestatus__Column).Value = Split(StatusofAPICourier, " On ", , vbTextCompare)(1)
              ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_DeliveryDatestatus__Column).Interior.ColorIndex = xlNone
           Else
              ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_Laststatus__Column).Value = StatusofAPICourier
              'ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_DeliveryDatestatus__Column).Value = ""
           End If
        ElseIf courierName = "FEDEX" Then
            If TrackingID <> "" Then
                StatusofAPICourier = TrackFedExPackage(TrackingID, ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_EstimateDeliveryDate__Column))
                If LCase(StatusofAPICourier) Like "*" & LCase(Deliveredstr) & "*" Then
                   ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_Laststatus__Column).Value = Deliveredstr
                   ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_DeliveryDatestatus__Column).NumberFormat = "mm/dd/yyyy"
                   ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_DeliveryDatestatus__Column).Value = Split(StatusofAPICourier, " On ", , vbTextCompare)(1)
                   ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_DeliveryDatestatus__Column).Interior.ColorIndex = xlNone
                Else
                   ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_Laststatus__Column).Value = StatusofAPICourier
                   'ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_DeliveryDatestatus__Column).Value = ""
                End If
            Else
                ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_Laststatus__Column).Value = "Invalid Tracking ID"
            End If
        ElseIf courierName = "UPS" Then
           StatusofAPICourier = TrackUPSPackage(TrackingID, ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_EstimateDeliveryDate__Column))
           If LCase(StatusofAPICourier) Like "*" & LCase(Deliveredstr) & "*" Then
              ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_Laststatus__Column).Value = Deliveredstr
              ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_DeliveryDatestatus__Column).NumberFormat = "mm/dd/yyyy"
              ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_DeliveryDatestatus__Column).Value = Split(StatusofAPICourier, " On ", , vbTextCompare)(1)
              ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_DeliveryDatestatus__Column).Interior.ColorIndex = xlNone
           Else
              ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_Laststatus__Column).Value = StatusofAPICourier
              'ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_DeliveryDatestatus__Column).Value = ""
           End If
        Else
           'ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_Laststatus__Column).Value = "No API Data Available for Mention Courier Name"
           'ProcFileTrackingSheet.Cells(i, ProcFile_Tracking_Sheet_DeliveryDatestatus__Column).Value = ""
        End If
  End If
 
Next i

Exit Function
errhandler:
GetLastStatusWithTrackingIDFunction = Err.Description
End Function


