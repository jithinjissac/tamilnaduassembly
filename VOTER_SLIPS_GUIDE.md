# Voter Slip Generator Feature

## Overview
A print-ready voter slip generator that creates BJP party-branded slips with voter details. The system generates 5 slips per A4 page for efficient printing and distribution during election campaigns.

## Features
- **Print-Ready Layout**: Optimized for A4 paper with 5 slips per page
- **Party Branding**: BJP lotus logo with Malayalam party name (ഭാരതീയ ജനതാ പാർട്ടി)
- **Complete Voter Information**:
  - Serial Number (ക്രമ നമ്പർ)
  - SEC ID/Card Number (കാർഡ് നമ്പർ)
  - Voter Name with Gender and Age
  - House Address (വിലാസം)
  - Guardian Name (രക്ഷിതാവ്)
  - Polling Station Details (പോളിംഗ് സ്റ്റേഷൻ)
- **Malayalam Font Support**: Uses Noto Sans Malayalam for proper rendering
- **Responsive Design**: Preview on screen, print perfectly on A4

## How to Use

### Step 1: Extract Voter Data
1. Navigate to the main extraction page (`http://localhost:3000`)
2. Select District → Local Body → Ward → Polling Station
3. Enter captcha and submit form
4. View extracted voter list

### Step 2: Generate Slips
1. Click the "🎫 Generate Voter Slips" button in the results section
2. System will automatically:
   - Store voter data in browser session
   - Store polling station information
   - Navigate to the slip generator page

### Step 3: Print Slips
1. Review the generated slips on screen
2. Click "🖨️ Print Slips" button
3. Use browser print dialog to print:
   - Select printer
   - Choose A4 paper size
   - Portrait orientation
   - No margins adjustment needed (auto-optimized)

## Technical Implementation

### Files Created
- **frontend/slips.html** - Main slip generator page
- **frontend/slips.css** - A4 print layout styling
- **frontend/slips.js** - Slip generation logic

### File Structure
```
frontend/
├── index.html       (Main extraction page)
├── app.js           (Modified - added generateSlips() function)
├── slips.html       (NEW - Slip generator page)
├── slips.css        (NEW - Print styling)
└── slips.js         (NEW - Slip generation logic)
```

### Data Flow
```
Main Page (index.html)
    ↓ Extract voters
Voter Data Array
    ↓ Click "Generate Slips"
sessionStorage:
  - voterSlipData (voter array with gender_age field)
  - pollingStationInfo (district, localBody, ward, station)
    ↓ Navigate to slips.html
Slip Generator Page
    ↓ Load from sessionStorage
Generate 5 slips per A4 page
    ↓ Click Print
Browser Print Dialog → Physical Slips
```

## Slip Layout Specifications

### Single Slip Dimensions
- **Width**: 100% of page width
- **Height**: 55mm (5 slips × 55mm = 275mm < 297mm A4 height)
- **Border**: 2px solid black
- **Gap**: 5mm between slips

### Left Section (25mm)
- BJP lotus logo (20mm × 20mm)
- Party name in Malayalam (10pt bold)
- Separated by dotted border

### Right Section (Remaining width)
- Header: Serial number + SEC ID (9pt)
- Voter info: Name, Address, Guardian (10pt)
- Footer: Polling station details (8pt, border-top)

### Print CSS
```css
@media print {
    .no-print { display: none; }
    .page {
        width: 210mm;
        height: 297mm;
        page-break-after: always;
    }
    .voter-slip {
        page-break-inside: avoid;
    }
}
@page {
    size: A4;
    margin: 0;
}
```

## Session Storage Schema

### voterSlipData (Array)
```json
[
    {
        "sl_no": "1",
        "name": "രാജേഷ് കുമാർ",
        "guardian_name": "സുരേഷ് കുമാർ",
        "house_no": "123",
        "house_name": "കൃഷ്ണ ഭവൻ",
        "gender_age": "പുരുഷൻ/45",
        "sec_id": "ABC1234567"
    }
]
```

### pollingStationInfo (Object)
```json
{
    "district": "Thiruvananthapuram",
    "localBody": "Thiruvananthapuram Corporation",
    "ward": "Ward 1 - കാരക്കോണം",
    "station": "123 - Government High School"
}
```

## Customization Options

### Change Party Branding
Edit `slips.js`:
```javascript
// Replace BJP_LOGO with custom SVG base64
const BJP_LOGO = 'data:image/svg+xml;base64,...';

// Update party name in createVoterSlip()
<div class="party-name-ml">Your Party Name</div>
```

### Adjust Slip Layout
Edit `slips.css`:
```css
/* Change slips per page (adjust height accordingly) */
.voter-slip {
    height: 55mm; /* 5 per page */
    /* height: 90mm; */ /* 3 per page */
}
```

### Modify Field Labels
Edit `slips.js` in `createVoterSlip()` function:
```javascript
<span class="info-label">Your Label:</span>
```

## Browser Compatibility
- ✅ Chrome/Edge: Full support
- ✅ Firefox: Full support
- ✅ Safari: Full support (requires print dialog settings adjustment)

## Troubleshooting

### Issue: Slips not printing correctly
**Solution**: Ensure printer settings:
- Paper: A4 (210mm × 297mm)
- Orientation: Portrait
- Scale: 100% (no scaling)
- Margins: Default

### Issue: Malayalam text not displaying
**Solution**: 
- Browser must have internet connection to load Noto Sans Malayalam font
- Or install font locally and update CSS to use local font

### Issue: Page breaks in wrong places
**Solution**: 
- Check that exactly 5 slips are generated per page
- Verify `.page` container has `page-break-after: always`
- Ensure `.voter-slip` has `page-break-inside: avoid`

### Issue: "No voter data available" error
**Solution**:
- Ensure you extracted voter data first
- sessionStorage is cleared when browser closes - re-extract if needed
- Check that "Generate Slips" button was clicked (not direct navigation to slips.html)

## Future Enhancements
- [ ] Select specific voters to print (checkboxes)
- [ ] Custom logo upload
- [ ] QR code with voter details
- [ ] Bulk print preview (show all pages before printing)
- [ ] Export slips as PDF
- [ ] Multi-party support (color themes)
- [ ] Slip templates (different layouts)

## API Integration
No new API endpoints required. Uses existing:
- `GET /api/getDistricts`
- `POST /api/getLocalBodies`
- `POST /api/getWards`
- `POST /api/getPollingStations`
- `GET /api/initCaptchaSession`
- `POST /api/submitWithCaptcha`

## License
Part of Kerala SEC Voter List Extraction API project.
