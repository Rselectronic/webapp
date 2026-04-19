Attribute VB_Name = "Headers"
Option Explicit
Public VF_CPC_Column As Long
Public VF_Description_Column As Long
Public VF_CustomerMPN_Column As Long
Public VF_MFRName_Column As Long
Public VF_MFR_Column As Long
Public VF_PlacetoBuy_Column As Long
Public VF_PNtoUse_Column As Long
Public VF_PNtoUseMRF_Column As Long
Public VF_DistName_Column As Long
Public VF_DistPN_Column As Long
Public VF_DistMPN_Column As Long
Public VF_DistMFR_Column As Long
Public VF_DistDescription_Column As Long
Public VF_LCSCpn_Column As Long
Public VF_LCSCmpn_Column As Long
Public VF_LCSCmfr_Column As Long
Public VF_LCSCDescription_Column As Long
Public VF_MPNmatch_Column As Long
Public VF_AttributeMatch_Column As Long


Sub initialiseHeaders(ws As Worksheet)

Dim findrow As Integer
findrow = 4


VF_CPC_Column = ws.Rows(findrow).Find(What:="CPC", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_Description_Column = ws.Rows(findrow).Find(What:="Description", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_CustomerMPN_Column = ws.Rows(findrow).Find(What:="MPN", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_MFRName_Column = ws.Rows(findrow).Find(What:="Manufacturer Name", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_PlacetoBuy_Column = ws.Rows(findrow).Find(What:="Place to Buy", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_PNtoUse_Column = ws.Rows(findrow).Find(What:="PN# to Use", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_PNtoUseMRF_Column = ws.Rows(findrow).Find(What:="PN# to Use MFR", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_DistName_Column = ws.Rows(findrow).Find(What:="Dist1", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_DistPN_Column = ws.Rows(findrow).Find(What:="Dist PN", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_DistMPN_Column = ws.Rows(findrow).Find(What:="Dist MPN", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_DistMFR_Column = ws.Rows(findrow).Find(What:="Dist MFR", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_DistDescription_Column = ws.Rows(findrow).Find(What:="Dist Description", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_LCSCpn_Column = ws.Rows(findrow).Find(What:="LCSC PN", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_LCSCmpn_Column = ws.Rows(findrow).Find(What:="LCSC MPN", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_LCSCmfr_Column = ws.Rows(findrow).Find(What:="LCSC MFR", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_LCSCDescription_Column = ws.Rows(findrow).Find(What:="LCSC Description", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_MPNmatch_Column = ws.Rows(findrow).Find(What:="MPN Match", LookIn:=xlValues, LookAt:=xlWhole).Column
VF_AttributeMatch_Column = ws.Rows(findrow).Find(What:="Attribute Match", LookIn:=xlValues, LookAt:=xlWhole).Column
End Sub

