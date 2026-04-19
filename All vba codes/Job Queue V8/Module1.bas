Attribute VB_Name = "Module1"
Function gst(subtotal As Double) As Double
    gst = Round(subtotal * 0.05, 2)
End Function

Function qst(subtotal As Double) As Double
    qst = Round(subtotal * 0.09975, 2)
End Function

