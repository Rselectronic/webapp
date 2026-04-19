VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} selectNcrCategory 
   Caption         =   "NCR Category"
   ClientHeight    =   4035
   ClientLeft      =   105
   ClientTop       =   450
   ClientWidth     =   5235
   OleObjectBlob   =   "selectNcrCategory.frx":0000
   StartUpPosition =   1  'CenterOwner
End
Attribute VB_Name = "selectNcrCategory"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
'== selectNcrCategory code module ==
Option Explicit

' Returned values
Private mCategory As String
Private mSubCategory As String
Private mDescription As String

' Lookups
Private dictCatToSubs As Object         ' Category -> Dictionary of SubCats
Private dictPairToDesc As Object        ' (Category ? SubCat) -> Description   (?=vbTab)

' -------- Helpers --------
Private Sub LoadLookups(Optional reselect As Boolean = False, _
                        Optional selCat As String = "", _
                        Optional selSub As String = "")
    Dim lastRow As Long, i As Long
    Dim cat As String, subc As String, desc As String

    Set dictCatToSubs = CreateObject("Scripting.Dictionary")
    Set dictPairToDesc = CreateObject("Scripting.Dictionary")
    dictCatToSubs.CompareMode = vbTextCompare
    dictPairToDesc.CompareMode = vbTextCompare

    lastRow = wsNCRcategory.Cells(wsNCRcategory.Rows.Count, "A").End(xlUp).row
    For i = 2 To lastRow
        cat = Trim$(CStr(wsNCRcategory.Cells(i, 1).Value))
        subc = Trim$(CStr(wsNCRcategory.Cells(i, 2).Value))
        desc = Trim$(CStr(wsNCRcategory.Cells(i, 3).Value))
        If Len(cat) > 0 Then
            If Len(subc) = 0 Then subc = "(General)"
            If Not dictCatToSubs.Exists(cat) Then
                dictCatToSubs.Add cat, CreateObject("Scripting.Dictionary")
                dictCatToSubs(cat).CompareMode = vbTextCompare
            End If
            If Not dictCatToSubs(cat).Exists(subc) Then dictCatToSubs(cat).Add subc, True
            dictPairToDesc(cat & vbTab & subc) = desc
        End If
    Next i

    ' Populate Category combo
    With comboboxNcrCategory
        .Clear
        If dictCatToSubs.Count > 0 Then .List = dictCatToSubs.Keys
        If reselect And Len(selCat) > 0 Then .Value = selCat Else .ListIndex = -1
        .MatchRequired = True
    End With

    ' Populate Sub Category combo for selected cat (if any)
    With comboBoxSubCategory
        .Clear: .Enabled = False: .MatchRequired = True
        If reselect And Len(selCat) > 0 And dictCatToSubs.Exists(selCat) Then
            .List = dictCatToSubs(selCat).Keys
            If Len(selSub) > 0 Then .Value = selSub Else .ListIndex = -1
            .Enabled = True
        End If
    End With
End Sub

Private Function RowOfPair(ByVal cat As String, ByVal subc As String) As Long
    Dim lastRow As Long, i As Long
    lastRow = wsNCRcategory.Cells(wsNCRcategory.Rows.Count, "A").End(xlUp).row
    For i = 2 To lastRow
        If StrComp(Trim$(wsNCRcategory.Cells(i, 1).Value), cat, vbTextCompare) = 0 _
        And StrComp(Trim$(wsNCRcategory.Cells(i, 2).Value), subc, vbTextCompare) = 0 Then
            RowOfPair = i: Exit Function
        End If
    Next i
    RowOfPair = 0
End Function

Private Function UpsertCategoryPair(ByVal cat As String, ByVal subc As String, ByVal desc As String) As Long
    If Len(subc) = 0 Then subc = "(General)"
    Dim r As Long
    r = RowOfPair(cat, subc)
    If r = 0 Then
        r = wsNCRcategory.Cells(wsNCRcategory.Rows.Count, "A").End(xlUp).row + 1
        wsNCRcategory.Cells(r, 1).Value = cat
        wsNCRcategory.Cells(r, 2).Value = subc
    End If
    wsNCRcategory.Cells(r, 3).Value = desc
    UpsertCategoryPair = r
    On Error Resume Next
    wsNCRcategory.Parent.Save    'persist to NCR LOGS.xlsx
    On Error GoTo 0
End Function

' -------- Form lifecycle --------
Private Sub UserForm_Initialize()
    If wsNCRcategory Is Nothing Then
        MsgBox "wsNCRcategory is not set by the caller.", vbExclamation
        Unload Me: Exit Sub
    End If

    LoadLookups

    txtNcrDescription.Value = "Please select the category"

    btnConfirm.Default = True
    btnCancel.Cancel = True
End Sub

' -------- UX handlers --------
Private Sub comboboxNcrCategory_Change()
    Dim cat As String: cat = Trim$(CStr(comboboxNcrCategory.Value))

    comboBoxSubCategory.Clear: comboBoxSubCategory.Enabled = False
    mCategory = "": mSubCategory = "": mDescription = ""

    If Len(cat) = 0 Or Not dictCatToSubs.Exists(cat) Then
        txtNcrDescription.Value = "Please select the category"
        Exit Sub
    End If

    comboBoxSubCategory.List = dictCatToSubs(cat).Keys
    comboBoxSubCategory.ListIndex = -1
    comboBoxSubCategory.Enabled = True

    txtNcrDescription.Value = "Select the sub category"
End Sub

Private Sub comboBoxSubCategory_Change()
    Dim cat As String, subc As String, key As String
    cat = Trim$(CStr(comboboxNcrCategory.Value))
    subc = Trim$(CStr(comboBoxSubCategory.Value))
    If Len(cat) = 0 Or Len(subc) = 0 Then Exit Sub

    key = cat & vbTab & subc
    If dictPairToDesc.Exists(key) Then
        txtNcrDescription.Value = dictPairToDesc(key)
    Else
        txtNcrDescription.Value = ""
    End If
End Sub

' ---- Add buttons ----
Private Sub btnAddCategory_Click()
    Dim newCat As String, newSub As String, newDesc As String

    newCat = Trim$(InputBox("Enter new Category name:", "Add Category"))
    If Len(newCat) = 0 Then Exit Sub

    newSub = Trim$(InputBox("Enter Sub Category for '" & newCat & "':", "Add Sub Category", "(General)"))
    If Len(newSub) = 0 Then newSub = "(General)"

    newDesc = InputBox("Enter default Description for '" & newCat & "' - '" & newSub & "':", "Add Description")

    Call UpsertCategoryPair(newCat, newSub, newDesc)
    LoadLookups True, newCat, newSub
    txtNcrDescription.Value = newDesc
End Sub

Private Sub btnAddSubCategory_Click()
    If comboboxNcrCategory.ListIndex < 0 Then
        MsgBox "Select a Category first.", vbExclamation
        Exit Sub
    End If

    Dim baseCat As String, newSub As String, newDesc As String
    baseCat = Trim$(CStr(comboboxNcrCategory.Value))

    newSub = Trim$(InputBox("Enter new Sub Category under '" & baseCat & "':", "Add Sub Category"))
    If Len(newSub) = 0 Then Exit Sub

    newDesc = InputBox("Enter Description for '" & baseCat & "' - '" & newSub & "':", "Add Description")

    Call UpsertCategoryPair(baseCat, newSub, newDesc)
    LoadLookups True, baseCat, newSub
    txtNcrDescription.Value = newDesc
End Sub

Private Sub btnSaveDesc_Click()
    ' Update description for the currently selected pair (or create if missing)
    If comboboxNcrCategory.ListIndex < 0 Then
        MsgBox "Please select a Category.", vbExclamation: Exit Sub
    End If
    If comboBoxSubCategory.ListIndex < 0 Then
        MsgBox "Please select a Sub Category.", vbExclamation: Exit Sub
    End If

    Dim cat As String, subc As String, desc As String
    cat = Trim$(CStr(comboboxNcrCategory.Value))
    subc = Trim$(CStr(comboBoxSubCategory.Value))
    desc = CStr(txtNcrDescription.Value)

    Call UpsertCategoryPair(cat, subc, desc)
    LoadLookups True, cat, subc
    MsgBox "Saved.", vbInformation
End Sub

' ---- Confirm/Cancel (with required selections) ----
Private Sub btnConfirm_Click()
    If comboboxNcrCategory.ListIndex < 0 Then
        MsgBox "Please select a Category.", vbExclamation: Exit Sub
    End If
    If comboBoxSubCategory.ListIndex < 0 Then
        MsgBox "Please select a Sub Category.", vbExclamation: Exit Sub
    End If

    mCategory = Trim$(CStr(comboboxNcrCategory.Value))
    mSubCategory = Trim$(CStr(comboBoxSubCategory.Value))
    mDescription = Trim$(CStr(txtNcrDescription.Value))
    Me.Hide
End Sub

Private Sub btnCancel_Click()
    mCategory = "": mSubCategory = "": mDescription = ""
    Me.Hide
End Sub

Private Sub UserForm_QueryClose(Cancel As Integer, CloseMode As Integer)
    If CloseMode = 0 Then
        mCategory = "": mSubCategory = "": mDescription = ""
    End If
End Sub

' === Expose to caller ===
Public Property Get ResultCategory() As String: ResultCategory = mCategory: End Property
Public Property Get ResultSubCategory() As String: ResultSubCategory = mSubCategory: End Property
Public Property Get ResultDescription() As String: ResultDescription = mDescription: End Property
Public Property Get Result() As String: Result = mCategory: End Property


