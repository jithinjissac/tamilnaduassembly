# ECI Network Traffic Monitoring & API Discovery

## Overview

Instead of automating UI interactions (clicking dropdowns, filling autocompletes), we now monitor the **actual API calls** that the ECI portal makes and use those endpoints directly. This is:
- ✅ More reliable (no UI timing issues)
- ✅ Faster (direct API calls)
- ✅ More accurate (same data ECI portal uses)

## How It Works

1. **Monitor**: Opens ECI portal in visible browser and captures all network traffic
2. **Discover**: Identifies API endpoints, request payloads, and response formats
3. **Use**: Makes direct API calls to those endpoints (bypassing UI automation)

## Usage Methods

### Method 1: CLI Tool (Recommended for Testing)

```bash
node test-network-monitor.js [stateCode]
```

**Example:**
```bash
node test-network-monitor.js S11
```

**What it does:**
1. Opens visible browser window
2. Navigates to ECI portal with specified stateCode
3. Interacts with dropdowns to trigger API calls
4. Captures all requests and responses
5. Stays open for 30 seconds (you can manually interact)
6. Saves results to `network-capture.json`
7. Logs all discovered endpoints

### Method 2: API Endpoint

#### Start Network Monitoring

**Endpoint:** `POST /api/assembly/monitorNetwork`

**Request:**
```json
{
  "stateCode": "S11"
}
```

**Response:**
```json
{
  "status": "success",
  "stateCode": "S11",
  "requestsCaptured": 15,
  "responsesCaptured": 12,
  "endpoints": [
    "/api/getDistricts",
    "/api/getConstituencies", 
    "/api/getRollTypes"
  ],
  "results": {
    "requests": [...],
    "responses": [...]
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/assembly/monitorNetwork \
  -H "Content-Type: application/json" \
  -d '{"stateCode": "S11"}'
```

#### Get Discovered APIs

**Endpoint:** `GET /api/assembly/discoveredAPIs`

**Response:**
```json
{
  "status": "success",
  "lastDiscovered": "2026-03-01T10:30:00.000Z",
  "endpointCount": 5,
  "endpoints": [
    "/api/getDistricts",
    "/api/getConstituencies",
    "/api/getRollTypes",
    "/api/getYears",
    "/api/getLanguages"
  ]
}
```

### Method 3: Programmatic Use

```javascript
import { monitorECINetworkTraffic, getDiscoveredAPIs } from './utils/eciNetworkMonitor.js';

// Monitor and capture
const results = await monitorECINetworkTraffic('S11');

console.log(`Captured ${results.requests.length} requests`);
console.log(`Discovered endpoints:`, Object.keys(results.endpoints));

// Get discovered APIs
const apis = getDiscoveredAPIs();
console.log('Last discovered:', apis.lastDiscovered);
console.log('Endpoints:', apis.endpoints);
```

## What Gets Captured

### 1. Request Information
- URL and endpoint path
- HTTP method (GET, POST, etc.)
- Request headers
- POST payload data
- Resource type (fetch, xhr, document)

### 2. Response Information
- Status code
- Response headers
- Response body (JSON data)
- Correlation with request

### 3. Endpoint Grouping
All captured requests are grouped by endpoint path for easy analysis.

## Expected Output

### Console Output
```
🔍 Starting ECI network traffic monitoring...
🌐 Navigating to https://voters.eci.gov.in/download-eroll?stateCode=S11
✅ Page loaded
📤 REQUEST: POST /api/getDistricts
   Payload: {"stateCode":"S11","year":"2026"}
📥 RESPONSE: 200 /api/getDistricts
   Data: [{"code":"S1113","name":"Kollam"},{"code":"S1114","name":"Thiruvananthapuram"}...]
   
========== CAPTURED NETWORK TRAFFIC ==========
📊 Total Requests Captured: 15
📊 Total Responses Captured: 12

🔗 Discovered Endpoints:
  /api/getDistricts
    Method: POST
    Calls: 1
    Sample Payload: {"stateCode":"S11","year":"2026"}
```

### Saved File (network-capture.json)
```json
{
  "requests": [
    {
      "url": "https://voters.eci.gov.in/api/getDistricts",
      "method": "POST",
      "resourceType": "fetch",
      "headers": {...},
      "postData": "{\"stateCode\":\"S11\",\"year\":\"2026\"}"
    }
  ],
  "responses": [
    {
      "url": "https://voters.eci.gov.in/api/getDistricts",
      "method": "POST",
      "status": 200,
      "requestPayload": "{\"stateCode\":\"S11\",\"year\":\"2026\"}",
      "responseData": [
        {"code": "S1113", "name": "Kollam"},
        {"code": "S1114", "name": "Thiruvananthapuram"}
      ]
    }
  ],
  "endpoints": {
    "/api/getDistricts": [...]
  }
}
```

## Benefits Over UI Automation

| Aspect | UI Automation | Direct API Calls |
|--------|--------------|------------------|
| Speed | Slow (wait for page loads) | Fast (direct HTTP) |
| Reliability | Can break if UI changes | Stable (APIs rarely change) |
| Timing Issues | Yes (autocomplete, dropdowns) | No (synchronous) |
| Accuracy | May miss data | Same as portal |
| Debugging | Hard (hidden in UI) | Easy (see exact requests) |

## Next Steps

1. **Run Network Monitor:**
   ```bash
   node test-network-monitor.js S11
   ```

2. **Review Captured Data:**
   - Open `network-capture.json`
   - Identify API endpoints for:
     - Districts
     - Constituencies
     - Roll types
     - Years
     - Languages

3. **Implement Direct API Calls:**
   - Update `eciApiClient.js` to use discovered endpoints
   - Replace Playwright automation with `axios` calls
   - Add proper error handling

4. **Test & Verify:**
   - Compare data from direct API vs UI automation
   - Verify all constituencies are captured
   - Check data accuracy against ECI portal

## Troubleshooting

### No API Calls Captured
- **Cause:** ECI might use different endpoint paths
- **Solution:** Keep browser open longer, manually interact with all dropdowns

### Missing Constituencies
- **Cause:** Autocomplete endpoint not triggered
- **Solution:** Type in constituency field during monitoring

### Browser Closes Too Fast
- **Cause:** Default 30-second timeout
- **Solution:** Modify `test-network-monitor.js` to increase `waitForTimeout`

## Files Created

- `utils/eciNetworkMonitor.js` - Network traffic capture utility
- `test-network-monitor.js` - CLI tool for network monitoring
- `NETWORK_MONITORING_GUIDE.md` - This documentation
- `network-capture.json` - Generated output file

## API Routes Added

- `POST /api/assembly/monitorNetwork` - Start monitoring
- `GET /api/assembly/discoveredAPIs` - Get discovered endpoints

## Implementation Status

✅ **Complete:**
- Network traffic interception
- Request/response capture
- Endpoint discovery
- CLI tool
- API endpoints
- Documentation

⏳ **Next:**
- Analyze captured endpoints
- Implement direct API calls in `eciApiClient.js`
- Remove Playwright dependency for simple data fetching
- Test constituency accuracy

🎯 **Goal:**
Replace all Playwright-based dropdown fetching with direct API calls for faster, more reliable data extraction.
