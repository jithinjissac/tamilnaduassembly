# Multi-Select Polling Stations Feature

## Overview
This feature allows users to manually select specific polling stations within a ward for voter data extraction, replacing the previous "all-or-nothing" approach with granular control.

## User Experience

### Step-by-Step Flow

1. **Select District, Local Body, and Ward**
   - User selects their location hierarchy as before
   - When ward is selected, polling stations load as checkbox list

2. **View Available Polling Stations**
   - All polling stations in the ward appear as checkboxes
   - Each checkbox shows the full polling station name
   - Visual feedback: white boxes with borders

3. **Select Stations**
   - User can check individual stations they want to extract
   - Checked stations show green border and background
   - Selected count badge appears: "X station(s) selected"
   - Button text updates dynamically:
     - No selection: "🎫 Create Voter Slip"
     - 1 station: "🎫 Extract 1 Station"
     - Multiple: "🎫 Extract X Stations"

4. **Quick Selection Tools**
   - **Select All** button: Checks all polling stations
   - **Clear All** button: Unchecks all stations
   - Buttons only visible when stations are available

5. **Extract Voters**
   - Click extract button to start
   - For single station: One captcha solve
   - For multiple stations: Sequential captcha for each station
   - Progress shown: "Extracting station X of Y"

6. **Combined Order**
   - All selected stations' voters combined into single order
   - One PDF with all voters from all selected stations
   - Summary: "X/Y stations successful, Z total voters"

## Technical Implementation

### Frontend Components

#### HTML Structure
```html
<div id="pollingStationList" class="form-group" style="display:none;">
    <label>📍 Select Polling Stations</label>
    
    <!-- Quick selection buttons -->
    <div class="polling-station-controls">
        <button type="button" class="btn-link" onclick="selectAllPS()">Select All</button>
        <button type="button" class="btn-link" onclick="clearAllPS()">Clear All</button>
    </div>
    
    <!-- Checkbox list -->
    <div id="pollingStationCheckboxes" class="polling-station-checkboxes">
        <!-- Populated dynamically -->
    </div>
    
    <!-- Empty state -->
    <div id="pollingStationEmpty" class="polling-station-empty">
        <p>No polling stations available</p>
    </div>
    
    <!-- Selected count badge (added dynamically) -->
    <div class="selected-count">X stations selected</div>
</div>
```

#### CSS Styling
- `.btn-link`: Text buttons with purple hover
- `.polling-station-checkbox`: White box, border, cursor pointer
  - Hover: Purple border
  - Checked: Green border + light green background
- `.selected-count`: Gradient purple badge, rounded corners

#### JavaScript Functions

**`selectAllPS()`**
- Checks all `.ps-checkbox` elements
- Adds `.checked` class to parent labels
- Calls `updateSelectedStations()`

**`clearAllPS()`**
- Unchecks all `.ps-checkbox` elements
- Removes `.checked` class from parent labels
- Calls `updateSelectedStations()`

**`togglePSCheckbox(checkbox)`**
- Toggles `.checked` class based on checkbox state
- Calls `updateSelectedStations()`

**`updateSelectedStations()`**
- Collects all checked checkboxes into `selectedStations[]` array
- Each entry: `{ value: "ps_id", text: "Station Name" }`
- Updates button text based on count
- Shows/updates selected count badge
- Logs selection count

### Variables

```javascript
let allPollingStations = [];  // All stations from API
let selectedStations = [];    // User-selected stations
```

### Extraction Flow

1. **Single Station Mode** (1 selected)
   - Uses existing single extraction flow
   - One captcha solve
   - Standard order creation

2. **Multi-Station Mode** (2+ selected)
   - Calls `extractAllPollingStations()`
   - Sequential loop through `selectedStations` array
   - For each station:
     - Load new captcha
     - Show modal dialog with captcha
     - User solves captcha
     - Extract voters via `/api/submitWithCaptcha`
     - Combine voters into `allVoters[]`
   - Create single order with all voters
   - Show summary: success count, failed stations, total voters

### API Endpoints Used

- `POST /api/getPollingStations` - Get stations for ward
- `GET /api/initCaptchaSession` - Initialize captcha session
- `POST /api/submitWithCaptcha` - Extract voters with captcha
- `POST /api/orders/create` - Create order with voter data

## Benefits vs. Previous Approach

### Old: All-or-Nothing Checkbox
- ❌ User must extract ALL stations or just ONE
- ❌ No control over specific stations
- ❌ Can't skip problematic stations
- ❌ All-or-nothing means more captchas always

### New: Multi-Select Checkboxes
- ✅ Pick exactly which stations to extract
- ✅ Skip stations with issues
- ✅ Control captcha burden (select fewer = fewer captchas)
- ✅ Combine any subset of stations into one order
- ✅ Visual feedback of selections
- ✅ Quick Select All / Clear All tools

## Example Use Cases

### Use Case 1: Extract 3 out of 8 Stations
- Ward has 8 polling stations
- User only needs stations PS001, PS003, PS005
- User checks those 3 boxes
- Button shows "🎫 Extract 3 Stations"
- User solves 3 captchas (one per station)
- Gets single PDF with voters from all 3 stations

### Use Case 2: Skip Problematic Station
- Ward has 5 stations
- User tries "Select All" first
- Station PS004 fails extraction (SEC portal issue)
- User goes back, unchecks PS004
- Re-extracts only the 4 working stations
- Successful order with 4 stations' voters

### Use Case 3: Single Station (Backwards Compatible)
- User checks only one station
- Works exactly like old single-station mode
- One captcha, standard flow
- No change in UX

## Performance Considerations

- **Captcha Load**: One captcha per selected station
- **Network**: Sequential API calls (not parallel to avoid captcha conflicts)
- **Order Size**: Combined PDF can be large if many stations selected
- **User Time**: ~30-60 seconds per station (captcha solve + extract)

## Edge Cases Handled

1. **No stations available**: Shows empty state
2. **Zero stations selected**: Button text default, validation error
3. **One station selected**: Single-station flow (no multi-station loop)
4. **All stations selected**: Same as old "Extract ALL" behavior
5. **User cancels mid-extraction**: Failed stations logged, partial order created
6. **Station extraction fails**: Continues to next station, logs failure
7. **No voters found in station**: Logs as failed, continues

## Future Enhancements (Optional)

- Search/filter polling stations by name
- Remember last selected stations (localStorage)
- Keyboard shortcuts (Ctrl+A for select all)
- Station-level voter count preview
- Parallel captcha solving (advanced)
- Export failed stations list

## Testing Checklist

- [ ] Load ward with 1 station → should hide multi-select
- [ ] Load ward with multiple stations → should show checkbox list
- [ ] Click Select All → all checkboxes checked
- [ ] Click Clear All → all checkboxes unchecked
- [ ] Check 1 station → button shows "Extract 1 Station"
- [ ] Check 3 stations → button shows "Extract 3 Stations"
- [ ] Extract 2 stations → 2 captcha dialogs, combined order
- [ ] Cancel mid-extraction → partial order created
- [ ] Extract with no selection → validation error
- [ ] Selected count badge updates correctly
- [ ] Checked stations have green border
- [ ] Switch wards → selections reset correctly
