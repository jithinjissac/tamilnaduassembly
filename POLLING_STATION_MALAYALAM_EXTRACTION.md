# Malayalam Polling Station Name Extraction

## Overview
Implemented extraction of Malayalam polling station names from the SEC website form by first setting the locale to Malayalam and then extracting the text from the response after form submission.

## Key Implementation: Locale Setting

Before navigating to the voter list page, the system must set the locale to Malayalam by:

1. **Navigate to home page**: `https://sec.kerala.gov.in/`
2. **Submit locale form**: POST with `set_locale=ml`
3. **Navigate to voter list**: `https://sec.kerala.gov.in/public/voters/list`

This ensures all form fields, including polling station names, are displayed in Malayalam.

### Locale Form Structure
```html
<form id="localeForm" method="POST" action="/">
    <select name="set_locale" id="changeLanguage">
        <option value="en">English</option>
        <option value="ml">മലയാളം</option>
    </select>
</form>
```

## Implementation Details

### 1. Set Malayalam Locale (`captchaController.js`)
```javascript
// First, navigate to home and set Malayalam locale
await page.goto(`${SEC_BASE_URL}/`, { 
  waitUntil: 'domcontentloaded',
  timeout: 60000 
});

// Submit locale form
await page.evaluate(async (baseUrl) => {
  const response = await fetch(baseUrl + '/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'set_locale=ml'
  });
  return response.ok;
}, SEC_BASE_URL);

await page.waitForTimeout(1000);

// Now navigate to voter list - will be in Malayalam
await page.goto(`${SEC_BASE_URL}/public/voters/list`, { 
  waitUntil: 'domcontentloaded',
  timeout: 60000 
});
```

### 2. Captcha Controller (`controllers/captchaController.js`)
- **Location**: Before form submission in `/api/submitWithCaptcha` endpoint
- **Method**: Extract Malayalam text from selected polling station option
- **Returns**: Polling station Malayalam name in API response
```javascript
{
  status: 'success',
  html: '...',
  pollingStationMalayalam: '001 - എസ് എ യു പി സ്കൂള്‍ തിരുനെല്ലി, വടക്ക് ഭാഗം'
}
```

### 3. Voter Controller (`controllers/voterController.js`)
- **Location**: `/api/extractVoters` endpoint response
- **Returns**: `pollingStationMalayalam` field in response
```javascript
{
  status: 'success',
  voters: [...],
  pollingStationMalayalam: '...'
}
```

### 4. Frontend Integration (`frontend/create-slip.html`)
- **Priority Order**:
  1. Frontend dropdown text (`selectedStations[0].text`)
  2. API response (`extractData.pollingStationMalayalam`)
  3. `null` if neither available

- **Code**:
```javascript
const malayalamPollingStationName = 
    (selectedStations.length === 1 ? selectedStations[0].text : null) || 
    extractData.pollingStationMalayalam || 
    null;
```

- **Sent to Order Creation**:
```javascript
location: {
    district: '...',
    localBody: '...',
    ward: '...',
    pollingStation: '...',
    pollingStationMalayalam: malayalamPollingStationName || null
}
```

### 5. Database Storage (`models/Order.js`)
- **Field**: `location.pollingStationMalayalam`
- **Type**: String (optional)
- **Schema**:
```javascript
location: {
    // ... other fields
    pollingStation: {
        type: String,
        required: true
    },
    pollingStationName: String,
    pollingStationMalayalam: String  // ✅ Stores Malayalam name
}
```

## Data Flow

```
SEC Website Form
    ↓
[User selects polling station]
    ↓
Option element: <option value="P3L6mwKXON">001 - എസ് എ യു പി സ്കൂള്‍ തിരുനെല്ലി, വടക്ക് ഭാഗം</option>
    ↓
Backend extracts: el.textContent.trim()
    ↓
API Response: { pollingStationMalayalam: "001 - എസ് എ യു പി സ്കൂള്‍ തിരുനെല്ലി, വടക്ക് ഭാഗം" }
    ↓
Frontend receives and sends to order
    ↓
Database: order.location.pollingStationMalayalam = "001 - എസ് എ യു പി സ്കൂള്‍ തിരുനെല്ലി, വടക്ക് ഭാഗം"
```

## Example Data

### Form HTML (from SEC website)
```html
<select id="view_voters_list_pollingStation" name="view_voters_list[pollingStation]">
    <option value="">-- തിരഞ്ഞെടുക്കുക --</option>
    <option value="P3L6mwKXON" selected="selected">001 - എസ് എ യു പി സ്കൂള്‍ തിരുനെല്ലി, വടക്ക് ഭാഗം</option>
</select>
```

### Extracted Value
```
value: "P3L6mwKXON"
text: "001 - എസ് എ യു പി സ്കൂള്‍ തിരുനെല്ലി, വടക്ക് ഭാഗം"
```

### Stored in Order
```json
{
    "location": {
        "pollingStation": "P3L6mwKXON",
        "pollingStationMalayalam": "001 - എസ് എ യു പി സ്കൂള്‍ തിരുനെല്ലി, വടക്ക് ഭാഗം"
    }
}
```

## Usage in PDF Generation

The Malayalam polling station name is used in `slipController.js` for PDF generation:

```javascript
const pollingStation = order.location.pollingStationMalayalam || 
                       order.location.pollingStationName || 
                       order.location.pollingStation;
```

This ensures:
1. **Priority**: Malayalam name → English name → value
2. **Fallback**: If Malayalam not available, use English or value
3. **PDF Display**: Shows proper Malayalam text on voter information slips

## Testing

To verify extraction works:

1. **Check Browser Console** during form submission:
```
[CAPTCHA] 📍 Polling Station Malayalam: 001 - എസ് എ യു പി സ്കൂള്‍ തിരുനെല്ലി, വടക്ക് ഭാഗം
```

2. **Check API Response**:
```json
{
    "status": "success",
    "html": "...",
    "pollingStationMalayalam": "001 - എസ് എ യു പി സ്കൂള്‍ തിരുനെല്ലി, വടക്ക് ഭാഗം"
}
```

3. **Check Database** after order creation:
```javascript
db.orders.findOne({ orderId: "ORD-..." }).location.pollingStationMalayalam
```

## Notes

- ✅ Malayalam text includes polling station number and full name
- ✅ Handles cases where Malayalam text might not be available (fallback to null)
- ✅ Frontend has priority: dropdown text → API response → null
- ✅ Already integrated with existing PDF generation system
- ✅ No breaking changes to existing orders (field is optional)
