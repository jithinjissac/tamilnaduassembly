# Malayalam Polling Station Name - Complete Solution

## Problem
Polling station names were appearing in **English** in PDFs despite setting `language=M` in the voter extraction form. The dropdown APIs were returning English-only station names.

## Root Cause
The SEC Kerala portal's **dropdown APIs** (`/public/getps/byward`) return English station names regardless of locale settings. However, when you **submit the voter extraction form** with `view_voters_list[language]=M`, the **HTML response** contains the station name in **Malayalam** in the header section.

## Solution Architecture

### 1. **Capture Malayalam Name from Form Response**
When the form is submitted with `language=M`, the HTML response includes:
```html
<td>POLLING STATION:</td>
<td class="ubuntuB fs-3">001 - മലയാളം സ്റ്റേഷൻ പേര്</td>
```

### 2. **Enhanced Parser** (`utils/parser.js`)
The `extractPollingStationName()` function now:
- **Strategy 1**: Looks for "POLLING STATION:" label and extracts adjacent cell value
- **Strategy 2**: Searches for station pattern (3 digits + dash) **with Malayalam characters** (`\u0D00-\u0D7F`)
- **Strategy 3**: Falls back to English station pattern if Malayalam not found
- **Strategy 4**: Scans all table cells as last resort

### 3. **Prioritization Change** (`frontend/create-slip.html`)
Changed priority from:
```javascript
// OLD: Dropdown text (English) → SEC extracted (Malayalam) → Fallback
const pollingStationName = selectedStationText || extractData.pollingStationName || 'Fallback';
```

To:
```javascript
// NEW: SEC extracted (Malayalam) → Dropdown text → Fallback
const pollingStationName = extractData.pollingStationName || selectedStationText || 'Fallback';
```

### 4. **Multi-Method Locale Enforcement**
Although the dropdown APIs still return English, we enforce Malayalam at every possible layer:

#### Playwright Stations Controller (`playwrightStationsController.js`)
- Browser launch: `--lang=ml-IN`
- Context: `locale: 'ml-IN'`, `extraHTTPHeaders: { 'Accept-Language': 'ml-IN,ml;q=0.9' }`
- Cookies: `set_locale=ml`, `device_view=full`, `language=ml`
- URL: `?locale=ml&lang=ml`
- Dropdown: Explicitly select `language='M'` before and after ward selection

#### Dropdown Controller (`dropdownController.js`)
- Accept-Language header: `'ml-IN,ml;q=0.9,en-US;q=0.6,en;q=0.4'`
- URL params: `?locale=ml&lang=ml`
- Form payload: `locale=ml`, `language=M`
- Cookies: `set_locale=ml`
- Referer: `?locale=ml`

#### Captcha Controller (`captchaController.js`)
- Pre-set cookies: `set_locale=ml`, `device_view=full`
- Form field: `view_voters_list[language]=M`
- Extracts and returns `pollingStationName` from HTML response

## Data Flow

```
1. User selects District → Local Body → Ward → Polling Station(s)
   ↓
2. User enters captcha and clicks "Create Voter Information Slip"
   ↓
3. Frontend calls /api/submitWithCaptcha with:
   - view_voters_list[language] = M
   - view_voters_list[pollingStation] = <value>
   ↓
4. Captcha controller submits form via Playwright
   ↓
5. SEC returns HTML response with:
   - Voter table (names, addresses in Malayalam)
   - Header with: "POLLING STATION: 001 - മലയാളം പേര്"
   ↓
6. Parser extracts polling station name from HTML
   ↓
7. Frontend receives:
   {
     status: 'success',
     html: '<table>...</table>',
     pollingStationName: '001 - മലയാളം സ്റ്റേഷൻ പേര്',  ← Malayalam!
     pollingStationValue: 'anZblN5X65'
   }
   ↓
8. Frontend prioritizes pollingStationName (Malayalam) over dropdown text (English)
   ↓
9. Each voter object gets:
   {
     ...voterData,
     polling_station_name: '001 - മലയാളം സ്റ്റേഷൻ പേര്',  ← Used in PDF
     polling_station_value: 'anZblN5X65'
   }
   ↓
10. Order created with Malayalam station name
    ↓
11. PDF generated with Malayalam station name in header
```

## Verification Steps

### 1. Test Single Station Extraction
1. Go to http://localhost:3000/create-slip.html
2. Select District → Local Body → Ward → One Polling Station
3. Load captcha and enter it
4. Click "Create Voter Information Slip"
5. **Check server console** for:
   ```
   [PARSER] Found polling station from label: 001 - മലയാളം പേര്
   [PARSER] Extracted polling station: "001 - മലയാളം പേര്" (Malayalam: true)
   [CAPTCHA] Extracted polling station name: 001 - മലയാളം പേര്
   ```
6. **Check browser console** for:
   ```
   Using polling station name - SEC extracted: 001 - മലയാളം പേര്, Dropdown: 001 - ENGLISH NAME, Final: 001 - മലയാളം പേര്
   ```

### 2. Verify PDF Content
1. After order creation, go to preview
2. Check "Polling Station" field shows Malayalam name
3. Download PDF and verify Malayalam station name in header

### 3. Test Multi-Station Extraction
1. Select multiple polling stations
2. Solve captcha for each
3. Verify server logs show Malayalam extraction for each:
   ```
   Station 1: Using name - SEC extracted: 001 - സ്റ്റേഷൻ 1, Dropdown: ..., Final: 001 - സ്റ്റേഷൻ 1
   Station 2: Using name - SEC extracted: 002 - സ്റ്റേഷൻ 2, Dropdown: ..., Final: 002 - സ്റ്റേഷൻ 2
   ```

## Important Notes

### Why Dropdown Still Shows English
The SEC dropdown APIs (`/public/getps/byward`) are **server-side hardcoded** or use a different data source that doesn't respect locale settings. Despite our multi-method locale enforcement:
- Cookies: `set_locale=ml`
- Headers: `Accept-Language: ml-IN`
- URL params: `?locale=ml`
- Payload: `locale=ml`, `language=M`

The **dropdown response** still returns English. This is a **SEC portal limitation**, not our implementation issue.

### Why This Solution Works
We **bypass the dropdown limitation** by using the **form submission response**, which:
1. Is generated **after** the user explicitly selects `language=M`
2. Contains the **actual rendered page HTML** with Malayalam content
3. Includes the station name in the **header section** of the voter list
4. Respects the language parameter in the form submission

### Fallback Strategy
If SEC response doesn't contain Malayalam (rare cases):
1. Parser tries multiple extraction strategies
2. Falls back to dropdown text (English)
3. Falls back to "Station N" generic label
4. System still functions, just without Malayalam station name

## Files Modified

1. **`utils/parser.js`**
   - Enhanced `extractPollingStationName()` with 4-strategy approach
   - Added Malayalam Unicode detection
   - Added detailed logging

2. **`frontend/create-slip.html`**
   - Changed priority: SEC extracted → Dropdown → Fallback
   - Updated logging to show source of station name
   - Applied to both single and multi-station flows

3. **`controllers/playwrightStationsController.js`**
   - Added browser-level Malayalam locale
   - Added URL query params
   - Added explicit language dropdown selection
   - Enhanced logging

4. **`controllers/dropdownController.js`**
   - Added locale to URL params and form payload
   - Enhanced Accept-Language headers
   - Added language dropdown selection in Playwright fallback

5. **`controllers/captchaController.js`**
   - (Already) Extracts and returns `pollingStationName` from HTML
   - (Already) Sets `language=M` in form submission

## Success Indicators

✅ Server logs show: `[PARSER] Extracted polling station: "..." (Malayalam: true)`
✅ Browser logs show: `SEC extracted: <Malayalam text>`
✅ Preview page displays Malayalam station name
✅ Downloaded PDF contains Malayalam station name in header
✅ `voter.polling_station_name` in database contains Malayalam text

## Troubleshooting

### If station name is still English:
1. Check server console for `[PARSER]` logs
2. If parser finds English only, the SEC response didn't contain Malayalam
3. Possible causes:
   - CAPTCHA session expired before form submission
   - SEC server returned cached English response
   - Language dropdown value was reset during cascade
4. Solution: Retry extraction; new captcha session will have fresh language state

### If parser logs show no station found:
1. SEC response HTML structure may have changed
2. Check raw HTML in server logs (first 500 chars printed)
3. Update parser strategies in `utils/parser.js` based on new structure

## Maintenance

If SEC changes their HTML structure:
1. Update `extractPollingStationName()` in `utils/parser.js`
2. Common patterns to look for:
   - `<td>POLLING STATION:</td>` label
   - Cells with class `ubuntuB` or `fs-3`
   - Pattern: `^\d{3}[\s-]` (3 digits + dash/space)
   - Malayalam Unicode range: `\u0D00-\u0D7F`

---

**Last Updated**: November 9, 2025  
**Status**: ✅ Production Ready
