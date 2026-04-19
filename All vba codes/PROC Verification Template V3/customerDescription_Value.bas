Attribute VB_Name = "customerDescription_Value"
Function ExtractComponentAsJson(ByVal customerDescription As String) As String
    Dim txt As String: txt = Trim(customerDescription)
    txt = Replace(txt, ",", "")
    txt = Replace(txt, "OHM", "")
    txt = Replace(txt, "Ohms", "")
    txt = Replace(txt, "Resistor", "")
    txt = Replace(txt, "Capacitor", "")
    txt = Application.WorksheetFunction.Trim(txt)
    
    

    Dim regex As Object: Set regex = CreateObject("VBScript.RegExp")
    Dim pkg As String, resistance As String, wattText As String, watt_mw As String
    Dim tol As String, resOhm As Variant
    Dim capacitance As String, voltage As String, tempCoeff As String
    Dim allMatches As Object, m As Object, matchText As String

    Dim isCapacitor As Boolean, isResistor As Boolean
    
    If InStr(LCase(customerDescription), "capacitor") > 0 Then
        isCapacitor = True
    ElseIf InStr(LCase(customerDescription), "cap cer") > 0 Then
        isCapacitor = True
    End If
    
    If InStr(LCase(customerDescription), "resistor") > 0 Then
        isResistor = True
    ElseIf InStr(LCase(customerDescription), "res ") > 0 Then
        isResistor = True
    End If
    

    ' ===== Package =====
    regex.Pattern = "\b(0201|0402|0603|0805|1206|1210|2010|2512|1812)\b"
    regex.Global = False
    If regex.Test(txt) Then pkg = regex.Execute(txt)(0) Else pkg = ""

    If isCapacitor Then
        ' ===== Capacitance =====
        regex.Pattern = "\b\d+(\.\d+)?\s?(pF|nF|uF|µF|PF|UF|NF)\b"
        If regex.Test(txt) Then capacitance = regex.Execute(txt)(0)

        ' ===== Voltage =====
        regex.Pattern = "\b\d+(\.\d+)?\s?(KV|V|kV)\b"
        If regex.Test(txt) Then voltage = regex.Execute(txt)(0)

        ' ===== Tolerance =====
        regex.Pattern = "[±]?\d+(\.\d+)?%"
        If regex.Test(txt) Then tol = Replace(regex.Execute(txt)(0), "±", "")

        ' ===== Temp Coefficient =====
        regex.Pattern = "\b(NPO|X7R|C0G|Y5V|Z5U|X5R|X6S)\b"
        regex.IgnoreCase = True
        If regex.Test(txt) Then tempCoeff = UCase(regex.Execute(txt)(0))

        ExtractComponentAsJson = _
            "{""type"":""capacitor""," & _
            """package"":""" & pkg & """," & _
            """capacitance"":""" & capacitance & """," & _
            """voltage"":""" & voltage & """," & _
            """tolerance"":""" & tol & """," & _
            """tempCoeff"":""" & tempCoeff & """}"
        Exit Function
    End If

    If isResistor Then
        ' ===== Resistance =====
        Set regex = CreateObject("VBScript.RegExp")
        regex.Global = True
        regex.IgnoreCase = True
        regex.Pattern = "\b\d+(\.\d+)?[RKM]?\b|\b\d+R\d+\b"
        Set allMatches = regex.Execute(txt)
        resistance = ""

        For Each m In allMatches
            matchText = UCase(Trim(m.value))
            If matchText = pkg Then GoTo SkipMatch
            Dim words() As String: words = Split(txt, " ")
            Dim j As Long
            For j = 0 To UBound(words) - 1
                If UCase(words(j)) = matchText Then
                    Dim nextToken As String: nextToken = UCase(words(j + 1))
                    If nextToken = "K" Or nextToken = "M" Or nextToken = "R" Then
                        matchText = matchText & nextToken
                    End If
                    Exit For
                End If
            Next j
            
            ' Clean up trailing zeroes like 2.00K -> 2K
            Dim unit As String, numberPart As String
            unit = ""
            numberPart = matchText
            
            If Right(matchText, 1) Like "[KMR]" Then
                unit = Right(matchText, 1)
                numberPart = Left(matchText, Len(matchText) - 1)
            End If
            
            If IsNumeric(numberPart) Then
                numberPart = Format(Val(numberPart), "0.###")
                ' Remove trailing decimal if present
                If Right(numberPart, 1) = "." Then
                    numberPart = Left(numberPart, Len(numberPart) - 1)
                End If
            End If
            
            resistance = numberPart & unit

            
            Exit For
SkipMatch:
        Next

        ' ===== Wattage =====
        regex.Pattern = "\b(\d+/\d+|\d+\.\d+|\d+)\s*w(att)?\b"
        If regex.Test(txt) Then wattText = Replace(regex.Execute(txt)(0), " ", "")

        ' ===== Tolerance =====
        regex.Pattern = "\b\d+(\.\d+)?%"
        If regex.Test(txt) Then tol = regex.Execute(txt)(0)

        ' ===== Resistance in Ohms =====
        If InStr(resistance, "K") > 0 Then
            resOhm = Val(Replace(resistance, "K", "")) * 1000
        ElseIf InStr(resistance, "M") > 0 Then
            resOhm = Val(Replace(resistance, "M", "")) * 1000000
        ElseIf InStr(resistance, "R") > 0 Then
            resOhm = Val(Replace(resistance, "R", "."))
        Else
            resOhm = Val(resistance)
        End If

        ' ===== Wattage in mW =====
        watt_mw = ""
        If InStr(wattText, "/") > 0 Then
            Dim wattSplit() As String
            wattSplit = Split(Replace(wattText, "W", ""), "/")
            If IsNumeric(wattSplit(0)) And IsNumeric(wattSplit(1)) Then
                watt_mw = (Val(wattSplit(0)) / Val(wattSplit(1))) * 1000 & " mW"
            End If
        ElseIf Right(wattText, 1) = "W" And IsNumeric(Left(wattText, Len(wattText) - 1)) Then
            watt_mw = Val(Left(wattText, Len(wattText) - 1)) * 1000 & " mW"
        End If

        ExtractComponentAsJson = _
            "{""type"":""resistor""," & _
            """package"":""" & pkg & """," & _
            """resistance"":""" & resistance & """," & _
            """resistance_ohm"":""" & resOhm & """," & _
            """wattage"":""" & wattText & """," & _
            """wattage_mw"":""" & watt_mw & """," & _
            """tolerance"":""" & tol & """}"
        Exit Function
    End If

    ' ===== Fallback =====
    ExtractComponentAsJson = "{}"
End Function

Function NormalizeResistanceDisplay(ByVal rawResistance As String) As String
    Dim txt As String
    txt = Trim(rawResistance)
    
    ' Clean OHM symbols and variants
    txt = Replace(txt, "Ohms", "")
    txt = Replace(txt, "OHMS", "")
    txt = Replace(txt, "OHM", "")
    txt = Replace(txt, "Ohm", "")
    txt = Replace(txt, "O", "")
    txt = Replace(txt, "o", "")
    
    
    ' Handle common misformats like "kO", "KO", "MO"
    Dim lastChar As String
    On Error Resume Next
    lastChar = Right(txt, 1)
    If asc(lastChar) = 79 Or asc(lastChar) = 937 Then ' 79 = "O", 937 = "O"
        txt = Left(txt, Len(txt) - 1)
    End If
    
    ' handle the miliOhm (mO)
    If Right(txt, 1) = "m" Then
        txt = Trim(Left(txt, Len(txt) - 1)) / 1000
    End If

    
    txt = UCase(Replace(txt, " ", ""))

    ' === Match things like 20.5K, 2.2M, 4R7, 430 ===
    Dim regex As Object: Set regex = CreateObject("VBScript.RegExp")
    regex.Global = False
    regex.IgnoreCase = True
    regex.Pattern = "^\d+(\.\d+)?[KMRm]?$|^\d+R\d+$"

    If regex.Test(txt) Then
        NormalizeResistanceDisplay = txt
    Else
        NormalizeResistanceDisplay = ""
    End If
    On Error GoTo 0
End Function

Function NormalizeTolerance(ByVal rawTolerance As String) As String
    Dim txt As String
    txt = Trim(rawTolerance)
    
    ' Remove any leading ±, +/-, whitespace, etc.
    txt = Replace(txt, "±", "")
    txt = Replace(txt, "+/-", "")
    txt = Replace(txt, ChrW(&H177), "") ' Just in case: Arabic ±
    txt = Replace(txt, " ", "")
    
    ' Ensure it ends with % (optional: enforce only digits before %)
    If Right(txt, 1) = "%" Then
        NormalizeTolerance = txt
    Else
        NormalizeTolerance = ""
    End If
End Function

Function CompareMilliwatts(w1 As String, w2 As String) As Integer
    Dim n1 As Double, n2 As Double
    n1 = Val(Replace(UCase(w1), "MW", ""))
    n2 = Val(Replace(UCase(w2), "MW", ""))

    If n1 < n2 Then
        CompareMilliwatts = -1
    ElseIf n1 > n2 Then
        CompareMilliwatts = 1
    Else
        CompareMilliwatts = 0
    End If
End Function


Function NormalizeCapacitanceToPF(cap As String) As Double
    Dim txt As String: txt = UCase(Trim(cap))
    txt = Replace(txt, " ", "")
    
    Dim unit As String, value As Double
    Dim regex As Object: Set regex = CreateObject("VBScript.RegExp")
    
    ' Match number + unit (e.g., 1.8nF, 1000pF, etc.)
    regex.Pattern = "^(\d+(\.\d+)?)(PF|NF|UF|µF)$"
    regex.IgnoreCase = True
    regex.Global = False
    
    If regex.Test(txt) Then
        Dim matches As Object: Set matches = regex.Execute(txt)
        value = Val(matches(0).SubMatches(0))
        unit = matches(0).SubMatches(2)
        
        Select Case unit
            Case "PF"
                NormalizeCapacitanceToPF = value
            Case "NF"
                NormalizeCapacitanceToPF = value * 1000
            Case "UF", "µF"
                NormalizeCapacitanceToPF = value * 1000000
            Case Else
                NormalizeCapacitanceToPF = value ' fallback to PF
        End Select
    Else
        NormalizeCapacitanceToPF = Val(txt) ' fallback if no unit, assume PF
    End If
End Function

Function NormalizeTempCoefficient(code As String) As String
    Dim txt As String, parts() As String, PART As Variant
    txt = UCase(Replace(Trim(code), "O", "0")) ' Normalize O to 0
    txt = Replace(txt, ",", " ") ' Replace comma with space for uniform splitting
    parts = Split(txt, " ")

    For Each PART In parts
        PART = Trim(PART)
        Select Case PART
            Case "NP0", "NPO", "C0G", "CG0"
                NormalizeTempCoefficient = "C0G"
                Exit Function
            Case "X7R"
                NormalizeTempCoefficient = "X7R"
                Exit Function
            Case "X5R"
                NormalizeTempCoefficient = "X5R"
                Exit Function
            Case "Y5V"
                NormalizeTempCoefficient = "Y5V"
                Exit Function
            Case "Z5U"
                NormalizeTempCoefficient = "Z5U"
                Exit Function
            Case "X6S"
                NormalizeTempCoefficient = "X6S"
                Exit Function
        End Select
    Next PART

    NormalizeTempCoefficient = txt ' Return raw normalized string if no match
End Function


Function watt_to_mWatt(wattText As String) As String
    ' ===== Wattage in mW =====
        watt_to_mWatt = ""
        If InStr(wattText, "/") > 0 Then
            Dim wattSplit() As String
            wattSplit = Split(Replace(wattText, "W", ""), "/")
            If IsNumeric(wattSplit(0)) And IsNumeric(wattSplit(1)) Then
                watt_to_mWatt = (Val(wattSplit(0)) / Val(wattSplit(1))) * 1000 & " mW"
            End If
        ElseIf Right(wattText, 1) = "W" And IsNumeric(Left(wattText, Len(wattText) - 1)) Then
            watt_to_mWatt = Val(Left(wattText, Len(wattText) - 1)) * 1000 & " mW"
        End If

End Function


