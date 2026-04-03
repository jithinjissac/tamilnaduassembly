# Assembly Voter Information Slip Format Update

## Summary
Updated the assembly voter information slip generator to **exactly match** the existing local body election slip format used throughout the application.

## Changes Made

### 1. **Updated slipGenerator.js** (d:\electionnew - Copy\utils\slipGenerator.js)

Replaced the modern grid-based slip design with the **exact same format** used for local body elections:

#### Key Format Changes:

**Layout:**
- **5 slips per page** (A4: 210mm × 297mm with 5mm padding)
- Each slip: **52mm height** with **4mm gap** between slips
- **2-column layout**: Left column (35mm) + Right column (flexible)
- Grid template: `grid-template-columns: 35mm 1fr`

**Left Column (35mm width):**
- Contains serial number ("ക്രമ നമ്പർ")
- Large display: Label (12pt) + Number (20pt, bold)
- Centered layout with border-right: 2px solid #000

**Right Column:**
- **Ward/Constituency Info**: Border-bottom, centered
- **Header**: Card number ("കാർഡ് നമ്പർ")
- **Voter Info**: 
  - Name ("പേര്") - 13pt bold
  - House name ("വീട്ടുപേര്")
  - Guardian/Relation ("രക്ഷിതാവ്")
  - Part number ("ഭാഗം നമ്പർ")
- **Footer**: District info with border-top

#### Typography:
- **Malayalam Font**: 'Noto Sans Malayalam', 'Noto Sans'
- **Malayalam Labels**: All labels in Malayalam script
- **Font Sizes**: Matching local body settings
  - Serial number: 20pt
  - Voter name: 13pt
  - Other info: 11pt
  - Labels: 18mm min-width

#### Styling:
- Border: 2px solid #000
- Dotted line between slips: 2px dashed #999
- Clean, professional print layout
- No gradients, no modern UI elements
- Matches government document style

### 2. **Data Mapping**

The slip generator now handles multiple field name variations from PDF extraction:

```javascript
serialNo: voter.serialNo || voter.sl_no
epicNumber: voter.epicNo || voter.id_card_no || voter.epic_no
name: voter.name || voter.name_eng || voter.name_mal
houseName: voter.houseName || voter.house_name_eng || voter.house_name
houseNumber: voter.houseNumber || voter.house_no || voter.house_no_v1
relationName: voter.relativeName || voter.relation_name || voter.rln_name_eng
partNumber: voter.partNumber || voter.part_no
```

### 3. **Integration Points**

All integration points were already in place:

✅ **controllers/assemblyVoterController_v2.js** (line 13, 242):
- Imports: `import { saveVoterSlipsToFile } from '../utils/slipGenerator.js'`
- Usage: Passes voters array with metadata (constituency, district, stateCode, year)

✅ **frontend/assembly.html** (lines 946-955):
- Displays "🎫 View Voter Information Slips" link
- Auto-opens slip file in new tab after extraction

✅ **server.js** (line 342):
- Static file serving: `app.use('/voter-slips', express.static(...))`

## Visual Comparison

### Before (Modern Grid Design):
- 24 slips per page in 4×6 grid
- Gradient purple/blue header
- Rounded corners and shadows
- English labels
- Modern web UI styling

### After (Government Document Format):
- **5 slips per page in vertical rows**
- **Simple black borders**
- **Malayalam labels**
- **Clean print layout**
- **Matches local body election slips exactly**

## Format Specifications

```
Page Layout:
┌─────────────────────────────────────────┐ 210mm
│  5mm padding                            │
│  ┌──────────────────────────────────┐   │
│  │ Slip 1 (52mm height)             │   │
│  └──────────────────────────────────┘   │
│  ===== 4mm gap =====                    │
│  ┌──────────────────────────────────┐   │
│  │ Slip 2 (52mm height)             │   │
│  └──────────────────────────────────┘   │
│  ===== 4mm gap =====                    │
│  ... (3 more slips)                     │
└─────────────────────────────────────────┘
297mm total height
```

```
Individual Slip Layout:
┌──────────┬────────────────────────────┐ 52mm height
│ ക്രമ നമ്പർ │ നിയോജക മണ്ഡലം: [Name]       │
│    123   │ ─────────────────────────   │
│  (35mm)  │ കാർഡ് നമ്പർ: ABC1234567     │
│          │ പേര്: [Voter Name] (M/45)   │
│          │ വീട്ടുപേര്: [House] (123)    │
│          │ രക്ഷിതാവ്: [Guardian Name]   │
│          │ ഭാഗം നമ്പർ: 45              │
│          │ ─────────────────────────   │
│          │ ജില്ല: [District]            │
└──────────┴────────────────────────────┘
```

## Malayalam Labels Used

- **ക്രമ നമ്പർ** (Serial Number)
- **നിയോജക മണ്ഡലം** (Constituency)
- **കാർഡ് നമ്പർ** (Card Number / EPIC)
- **പേര്** (Name)
- **വീട്ടുപേര്** (House Name)
- **രക്ഷിതാവ്** (Guardian/Relation)
- **ഭാഗം നമ്പർ** (Part Number)
- **ജില്ല** (District)

## Files Modified

1. **d:\electionnew - Copy\utils\slipGenerator.js**
   - Complete rewrite from 378 lines → 327 lines
   - Changed from modern grid to government document format
   - Malayalam labels throughout
   - 5 slips per page matching local body format

## Testing Checklist

- [ ] Extract voters from any Kerala assembly constituency
- [ ] Verify slip file is generated in `voter-slips/` directory
- [ ] Check slip file auto-opens in new tab
- [ ] Verify 5 slips per page layout
- [ ] Confirm Malayalam labels render correctly
- [ ] Verify all voter fields display properly
- [ ] Test print layout (should fit A4 exactly)
- [ ] Compare visual design with local body election slips

## Benefits

1. **Consistency**: Assembly and local body election slips now look identical
2. **Professional**: Matches government document standards
3. **Familiar**: Users already know this format from local body elections
4. **Print-Ready**: Optimized for A4 paper with correct dimensions
5. **Malayalam Support**: Full native language support

## Technical Implementation

The format exactly mirrors **controllers/slipController.js** (local body election generator):

| Feature | Local Body Format | Assembly Format | Match? |
|---------|------------------|-----------------|---------|
| Slips per page | 5 | 5 | ✅ |
| Slip height | 52mm | 52mm | ✅ |
| Slip gap | 4mm | 4mm | ✅ |
| Left column width | 35mm | 35mm | ✅ |
| Border style | 2px solid #000 | 2px solid #000 | ✅ |
| Serial number font | 20pt bold | 20pt bold | ✅ |
| Malayalam labels | Yes | Yes | ✅ |
| Font family | Noto Sans Malayalam | Noto Sans Malayalam | ✅ |
| Layout grid | 35mm / 1fr | 35mm / 1fr | ✅ |
| Print optimization | Yes | Yes | ✅ |

## Result

Assembly voter information slips now use the **exact same format, styling, and layout** as the proven local body election slip system, ensuring consistency across all voter information slip generation features in the application.
