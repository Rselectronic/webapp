Attribute VB_Name = "Module4"
Function GetMSL(ExtPrice As Double, Consumption As Double, PartType As String, SPQ As Double) As Variant
    If LCase(PartType) = "resistor" And ExtPrice < 100 And Consumption < 1000 Then
        GetMSL = 500 ' CAT7
    ElseIf ExtPrice > 100 And Consumption > 10000 Then
        GetMSL = SPQ / 4 ' CAT9
    ElseIf ExtPrice < 100 And Consumption > 7000 Then
        GetMSL = SPQ ' CAT13
    ElseIf ExtPrice > 2000 And Consumption < 1000 Then
        GetMSL = 50 ' CAT1
    ElseIf ExtPrice < 1000 And Consumption < 500 Then
        GetMSL = 100 ' CAT2
    ElseIf ExtPrice > 100 And Consumption > 500 And Consumption < 1000 Then
        GetMSL = 250 ' CAT3
    ElseIf ExtPrice > 100 And Consumption >= 1000 And Consumption < 5000 Then
        GetMSL = 500 ' CAT4
    ElseIf ExtPrice > 100 And Consumption >= 5000 Then
        GetMSL = 1000 ' CAT5
    ElseIf ExtPrice < 100 And Consumption > 7000 And Consumption < 10000 Then
        GetMSL = 200 ' CAT10
    ElseIf ExtPrice < 100 And Consumption > 5000 And Consumption <= 7000 Then
        GetMSL = 100 ' CAT11
    ElseIf ExtPrice < 100 And Consumption <= 5000 Then
        GetMSL = 100 ' CAT12
    ElseIf ExtPrice < 100 And Consumption < 500 Then
        GetMSL = 500 ' CAT6/CAT8 combined
    Else
        GetMSL = "Check Manually"
    End If
End Function

