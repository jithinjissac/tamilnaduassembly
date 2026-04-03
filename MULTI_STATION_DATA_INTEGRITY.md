# Multi-Station Data Integrity

## Overview
When extracting voters from multiple polling stations, the system preserves the original data from each station exactly as received from the Kerala SEC portal.

## Data Preservation Guarantees

### 1. Serial Numbers (ക്രമ നമ്പർ)
- **Preserved from SEC**: Each voter's `sl_no` is kept exactly as it appears in the SEC voter list
- **Not recalculated**: Serial numbers are NOT renumbered sequentially across stations
- **Station-specific**: Station 1 might have voters 1-500, Station 2 might have voters 1-400, etc.

**Example:**
```
Polling Station 001:
  - Voter sl_no: 1, 2, 3, ..., 500
  
Polling Station 002:  
  - Voter sl_no: 1, 2, 3, ..., 400

Combined PDF:
  - Station 001 voters show sl_no 1-500
  - Station 002 voters show sl_no 1-400
  - Each retains ORIGINAL numbering from SEC
```

### 2. Polling Station Names
- **Per-voter metadata**: Each voter record includes which polling station they came from
- **Displayed on slip**: The polling station name appears at the bottom of each voter information slip
- **Multi-station support**: PDF can contain voters from different stations with correct labels

### 3. Voter Data Fields
All fields preserved exactly from SEC portal:
- `sl_no` - Original serial number from station's voter list
- `name` - Voter name in Malayalam
- `guardian_name` - Father/Mother/Husband name
- `house_no` - House number
- `house_name` - House name in Malayalam
- `gender_age` - Gender (M/F) and age
- `sec_id` - SEC voter ID card number
- `polling_station_name` - Station name (added during extraction)
- `polling_station_value` - Station ID value (added during extraction)

## Implementation Details

### Frontend: Data Collection
```javascript
// In extractAllPollingStations() function
const votersWithStation = voters.map(voter => ({
    ...voter,  // Preserve all original SEC data
    polling_station_name: station.text,  // Add station metadata
    polling_station_value: station.value
}));
```

### Backend: PDF Generation
```javascript
// In generateSlipHTML() function
const serialNo = voter.sl_no || (fallback);  // Use original sl_no
const voterPollingStation = voter.polling_station_name || pollingStation;

// Displays on slip:
// ക്രമ നമ്പർ: 127  (original from SEC, not recalculated)
// പോളിംഗ് സ്റ്റേഷൻ: 001 - SCHOOL NAME
```

## Why This Matters

### For Users
- **Verification**: Voters can verify their slip against official SEC list using original serial numbers
- **Authenticity**: Data matches exactly what's on the SEC portal
- **Clarity**: Each slip clearly shows which polling station the voter belongs to

### For Multi-Station Orders
When a user selects 3 polling stations:
1. Each station's data is extracted independently
2. Serial numbers remain as-is from each station
3. Voters are grouped by station in the PDF
4. Each slip shows the correct polling station name

### Example Scenario
**User selects:**
- Station A: 001 - SCHOOL NORTH (250 voters)
- Station B: 002 - SCHOOL SOUTH (180 voters)
- Station C: 003 - COMMUNITY HALL (320 voters)

**PDF contains:**
- 750 total slips (250 + 180 + 320)
- Station A slips: Serial 1-250, labeled "001 - SCHOOL NORTH"
- Station B slips: Serial 1-180, labeled "002 - SCHOOL SOUTH"
- Station C slips: Serial 1-320, labeled "003 - COMMUNITY HALL"

## Data Flow

```
SEC Portal
    ↓
[Extract Station A]
    → Voters with sl_no 1, 2, 3, ..., 250
    → Add metadata: polling_station_name = "Station A"
    ↓
[Extract Station B]
    → Voters with sl_no 1, 2, 3, ..., 180
    → Add metadata: polling_station_name = "Station B"
    ↓
[Combine Arrays]
    → allVoters = [Station A voters] + [Station B voters]
    → NO renumbering, NO modification
    ↓
[Generate PDF]
    → For each voter:
        - Display voter.sl_no (original)
        - Display voter.polling_station_name
    ↓
Final PDF
    → 430 slips total
    → First 250: sl_no 1-250, Station A
    → Next 180: sl_no 1-180, Station B
```

## Validation

### What is NOT done:
- ❌ Renumbering voters sequentially (1, 2, 3, ..., 750)
- ❌ Modifying any SEC data
- ❌ Changing serial numbers
- ❌ Merging duplicate voters
- ❌ Sorting voters differently

### What IS done:
- ✅ Preserve original sl_no from each station
- ✅ Add polling_station_name metadata
- ✅ Display correct station on each slip
- ✅ Maintain original voter list order
- ✅ Keep all SEC fields unchanged

## Technical Notes

### Database Storage
The `Order` model stores voters array with all fields:
```javascript
voters: [{
    sl_no: String,           // ORIGINAL from SEC
    name: String,
    guardian_name: String,
    house_no: String,
    house_name: String,
    gender_age: String,
    sec_id: String,
    polling_station_name: String,    // ADDED during extraction
    polling_station_value: String    // ADDED during extraction
}]
```

### PDF Template
Each slip shows:
- **ക്രമ നമ്പർ** (Serial Number): `voter.sl_no` - directly from SEC
- **പോളിംഗ് സ്റ്റേഷൻ** (Polling Station): `voter.polling_station_name` - from extraction metadata

## Benefits

1. **Data Integrity**: Matches official SEC portal exactly
2. **Audit Trail**: Users can cross-reference with SEC website
3. **Legal Compliance**: No modification of government data
4. **User Trust**: Transparent, verifiable information
5. **Multi-Station Support**: Scalable to any number of stations

## Future Considerations

### Optional Enhancements:
- Add station separator pages in PDF
- Group voters by station in output
- Add station summary at start (e.g., "Station A: 250 voters")
- Option to generate separate PDFs per station
- Station-wise voter count in order details

### Current Status:
✅ Original serial numbers preserved  
✅ Polling station metadata added  
✅ Per-voter station display  
✅ Multi-station support working  
✅ Data integrity maintained  
