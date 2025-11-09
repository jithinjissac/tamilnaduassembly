# Multiple Polling Stations Feature

## Overview
Extract voter data from ALL polling stations within a ward in one go, with manual captcha solving for each station.

## How It Works

### User Flow
1. **Select Location**: Choose District → Local Body → Ward
2. **Enable Bulk Mode**: Check the "Extract ALL Polling Stations in this Ward" checkbox
3. **Start Extraction**: Click "Extract ALL X Stations" button
4. **Solve Captchas**: For each polling station:
   - A modal dialog appears showing:
     - Progress (Station X of Y)
     - Station name
     - Captcha image
   - Enter captcha and press Enter or click Continue
   - Or click "Skip Station" to move to next
5. **Automatic Order Creation**: After all stations processed, order is created automatically

### Features
- ✅ **Sequential Processing**: Extracts one station at a time
- ✅ **Manual Captcha**: User solves captcha for each station (required by SEC portal)
- ✅ **Progress Tracking**: Shows "Station X of Y" during extraction
- ✅ **Skip Option**: Can skip problematic stations
- ✅ **Summary Display**: Shows success/failure count before order creation
- ✅ **Combined Order**: All voters from all stations in single PDF

## UI Changes

### Checkbox Added
```html
☐ Extract ALL Polling Stations in this Ward
```
- Appears below polling station dropdown
- Enabled only when ward has multiple stations
- Disables polling station selector when checked

### Button Text Updates
- **Normal mode**: "🎫 Create Voter Slip"
- **Bulk mode**: "🎫 Extract ALL 5 Stations" (dynamic count)

### Captcha Modal
- **Full-screen overlay** with dialog box
- Shows:
  - Progress indicator (Station 2 of 5)
  - Station name
  - Captcha image (auto-loaded)
  - Input field
  - Continue button
  - Skip Station button
- **Keyboard shortcut**: Press Enter to submit

## Technical Implementation

### New Variables
```javascript
let allPollingStations = [];  // Store all stations for bulk extraction
let extractAllMode = false;   // Flag for bulk extraction mode
```

### New Functions

#### `toggleAllStations()`
- Toggles between single/bulk mode
- Updates UI (disables dropdown, changes button text)

#### `extractAllPollingStations()`
- Main bulk extraction logic
- Loops through all polling stations
- Loads captcha for each station
- Shows captcha dialog
- Collects all voters
- Creates single order with combined data

#### `loadCaptchaForBulk()`
- Loads captcha without displaying on page
- Stores in `window.currentCaptchaImage`

#### `showCaptchaDialog(stationName, current, total)`
- Returns Promise with captcha input
- User-friendly modal interface
- Skip/Continue options

### Order Data Format (Bulk Mode)
```javascript
{
  location: {
    pollingStation: "5 Polling Stations (Ward Name)"
  },
  voters: [...], // Combined from all stations
  voterCount: 1234 // Total across all stations
}
```

## User Benefits

### Time Savings
- **Before**: Create 5 separate orders (5 × 3 steps = 15 actions)
- **After**: Create 1 order (1 setup + 5 captchas = 6 actions)
- **Savings**: ~60% less work

### PDF Consolidation
- Single PDF with all polling stations
- Easier to print and distribute
- No need to merge multiple PDFs

### Flexibility
- Can still extract single station (default behavior)
- Can skip problematic stations
- Can cancel mid-process

## Error Handling

### Failed Stations
- Logged to console
- Continue to next station
- Summary shows success/failure count
- Order still created if at least 1 station succeeds

### User Cancellation
- Click "Skip Station" to move to next
- Close browser to cancel entire process
- No partial data saved (all-or-nothing per station)

## Example Use Cases

### District Campaign
**Scenario**: Need slips for entire ward (8 polling stations)
1. Check "Extract ALL" box
2. Solve 8 captchas (2-3 minutes)
3. Get single PDF with ~3000 voters
4. Print and distribute

### Backup/Fallback
**Scenario**: One station fails (wrong captcha)
1. Click "Skip Station"
2. Continue with remaining stations
3. Order created with available data
4. Can create separate order for skipped station later

## Limitations

### Why Captchas Can't Be Auto-Solved
- SEC portal uses server-side validation
- Each extraction requires fresh captcha
- No API/automation allowed by SEC
- Manual solving ensures compliance

### Performance
- Speed depends on user captcha-solving speed
- Typical: ~20-30 seconds per station
- 5 stations: ~2-3 minutes total
- Still much faster than 5 separate orders

## Testing Checklist

- [x] Checkbox appears when ward selected
- [x] Checkbox disabled until ward loaded
- [x] Button text updates when checkbox toggled
- [x] Polling station dropdown disabled in bulk mode
- [ ] Captcha modal appears for each station
- [ ] Enter key submits captcha
- [ ] Skip button moves to next station
- [ ] Progress counter accurate (X of Y)
- [ ] All voters combined correctly
- [ ] Order location shows "X Polling Stations"
- [ ] Failed stations logged but don't stop process
- [ ] Order created successfully with bulk data

## Future Enhancements (Optional)

### Possible Improvements
1. **Captcha Queue**: Pre-load captchas in background
2. **Parallel Extraction**: Extract multiple stations simultaneously (if SEC allows)
3. **Resume Capability**: Save progress, resume later
4. **Station Selection**: Pick specific stations (not all)
5. **Retry Failed**: Auto-retry failed stations at end

---

**Status**: ✅ Implemented and ready to test (Nov 8, 2025)
**Location**: `frontend/create-slip.html`
**Server**: Running at http://localhost:3000
