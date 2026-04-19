Attribute VB_Name = "ScreenUpdate"
Option Explicit

Sub turnOffUpdates_Calculation()

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    Application.DisplayAlerts = False
    'Application.EnableEvents = False
    
End Sub


Sub turnOnUpdates_Calculation()

    Application.ScreenUpdating = True
    Application.Calculation = xlCalculationAutomatic
    Application.DisplayAlerts = True
    'Application.EnableEvents = True

End Sub


