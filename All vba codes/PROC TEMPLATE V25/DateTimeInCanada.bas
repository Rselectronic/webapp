Attribute VB_Name = "DateTimeInCanada"
Option Explicit

Public Function FillDateTimeInCanada() As Date
    Dim currentTime As Variant
    Dim canadaTime As Variant
    Dim currentOffset As Double
    Dim canadaOffset As Double
    Dim timeZone As String
    Dim Json As Object
    Dim httpRequest As Object
    Dim utc_datetime As Variant
    Dim utc_offset As String
    

    ' Get the current date and time
    currentTime = Now
    
    ' Get the user's time zone and current time using WorldTimeAPI
    Set httpRequest = CreateObject("MSXML2.XMLHTTP")
    'httpRequest.Open "GET", "http://worldtimeapi.org/api/ip", False
    httpRequest.Open "GET", "https://api.ipgeolocation.io/timezone?apiKey=38fd3eb66f7c49c885b88165ec79a842&tz=America/Toronto", False
    httpRequest.Send
    Set Json = JsonConverter.ParseJson(httpRequest.responseText)
    
'    timeZone = json("timezone")
    
'    currentTime = json("datetime")
'    utc_datetime = json("utc_datetime")
    
    Dim utc_Date As Date
'    utc_Date = Split(utc_datetime, "T")(0) & " " & Left(Split(utc_datetime, "T")(1), 8)
'    canadaTime = utc_Date - 4 * (1 / 24)
    canadaTime = Json("date_time")
        
    FillDateTimeInCanada = canadaTime
    
End Function

Function GetTimeZoneOffset(timeZone As String) As Double
    Dim offsetStr As String
    Dim hours As Integer
    Dim minutes As Integer
    
    ' Extract the offset from the time zone
    offsetStr = Right(timeZone, 6)
    
    ' Parse the offset string to extract hours and minutes
    hours = Val(Mid(offsetStr, 1, 3))
    minutes = Val(Mid(offsetStr, 5, 2))
    
    ' Calculate the total offset in hours
    GetTimeZoneOffset = hours + minutes / 60
End Function

