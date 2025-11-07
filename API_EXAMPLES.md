# API Examples

This file contains practical examples for using the Kerala SEC Voter List Extraction API.

## Using cURL

### 1. Get All Districts

```bash
curl http://localhost:3000/api/getDistricts
```

**Response:**
```json
{
  "status": "success",
  "districts": [
    {"value": "01", "text": "Thiruvananthapuram"},
    {"value": "02", "text": "Kollam"},
    {"value": "12", "text": "Wayanad"}
  ]
}
```

### 2. Get Local Bodies for Wayanad District

```bash
curl -X POST http://localhost:3000/api/getLocalBodies \
  -H "Content-Type: application/json" \
  -d "{\"district_id\":\"12\"}"
```

### 3. Get Wards for a Local Body

```bash
curl -X POST http://localhost:3000/api/getWards \
  -H "Content-Type: application/json" \
  -d "{\"local_body_id\":\"pnNXD5bL4J\"}"
```

### 4. Get Polling Stations for a Ward

```bash
curl -X POST http://localhost:3000/api/getPollingStations \
  -H "Content-Type: application/json" \
  -d "{\"ward_id\":\"MOZ4EKJBAD\"}"
```

### 5. Extract Voters (Complete Example)

```bash
curl -X POST http://localhost:3000/api/extractVoters \
  -H "Content-Type: application/json" \
  -d "{\"district\":\"12\",\"local_body\":\"pnNXD5bL4J\",\"ward\":\"MOZ4EKJBAD\",\"polling_station\":\"S8J4PDLKMN\",\"language\":\"E\",\"captcha\":\"AB12C\"}"
```

## Using JavaScript (fetch)

### Get Districts

```javascript
fetch('http://localhost:3000/api/getDistricts')
  .then(response => response.json())
  .then(data => console.log(data.districts));
```

### Get Local Bodies

```javascript
fetch('http://localhost:3000/api/getLocalBodies', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ district_id: '12' })
})
  .then(response => response.json())
  .then(data => console.log(data.local_bodies));
```

### Extract Voters

```javascript
const params = {
  district: '12',
  local_body: 'pnNXD5bL4J',
  ward: 'MOZ4EKJBAD',
  polling_station: 'S8J4PDLKMN',
  language: 'E',
  captcha: 'AB12C'
};

fetch('http://localhost:3000/api/extractVoters', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(params)
})
  .then(response => response.json())
  .then(data => {
    console.log(`Total Voters: ${data.total_voters}`);
    console.log('Voters:', data.voters);
  })
  .catch(error => console.error('Error:', error));
```

## Using Python (requests)

### Install requests

```bash
pip install requests
```

### Get Districts

```python
import requests

response = requests.get('http://localhost:3000/api/getDistricts')
data = response.json()
print(data['districts'])
```

### Get Local Bodies

```python
import requests

payload = {"district_id": "12"}
response = requests.post(
    'http://localhost:3000/api/getLocalBodies',
    json=payload
)
data = response.json()
print(data['local_bodies'])
```

### Extract Voters (Complete Flow)

```python
import requests

# Step 1: Get districts
districts = requests.get('http://localhost:3000/api/getDistricts').json()
print("Districts:", districts['districts'])

# Step 2: Get local bodies
local_bodies = requests.post(
    'http://localhost:3000/api/getLocalBodies',
    json={"district_id": "12"}
).json()
print("Local Bodies:", local_bodies['local_bodies'])

# Step 3: Get wards
wards = requests.post(
    'http://localhost:3000/api/getWards',
    json={"local_body_id": "pnNXD5bL4J"}
).json()
print("Wards:", wards['wards'])

# Step 4: Get polling stations
stations = requests.post(
    'http://localhost:3000/api/getPollingStations',
    json={"ward_id": "MOZ4EKJBAD"}
).json()
print("Polling Stations:", stations['polling_stations'])

# Step 5: Extract voters (with captcha)
voter_params = {
    "district": "12",
    "local_body": "pnNXD5bL4J",
    "ward": "MOZ4EKJBAD",
    "polling_station": "S8J4PDLKMN",
    "language": "E",
    "captcha": "AB12C"  # Replace with actual captcha
}

voters = requests.post(
    'http://localhost:3000/api/extractVoters',
    json=voter_params
).json()

if voters['status'] == 'success':
    print(f"Total Voters: {voters['total_voters']}")
    for voter in voters['voters']:
        print(f"Name: {voter['name']}, SEC ID: {voter['sec_id']}")
else:
    print(f"Error: {voters['message']}")
```

## Using Postman

### Setup

1. Create a new collection: "Kerala SEC Voter API"
2. Set base URL: `http://localhost:3000`

### Request 1: Get Districts

- Method: `GET`
- URL: `{{baseUrl}}/api/getDistricts`
- Headers: None required

### Request 2: Get Local Bodies

- Method: `POST`
- URL: `{{baseUrl}}/api/getLocalBodies`
- Headers: `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "district_id": "12"
}
```

### Request 3: Extract Voters

- Method: `POST`
- URL: `{{baseUrl}}/api/extractVoters`
- Headers: `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "district": "12",
  "local_body": "pnNXD5bL4J",
  "ward": "MOZ4EKJBAD",
  "polling_station": "S8J4PDLKMN",
  "language": "E",
  "captcha": "AB12C"
}
```

## Response Formats

### Success Response

```json
{
  "status": "success",
  "district": "12",
  "local_body": "G03001-ആനിക്കാട്",
  "ward": "001 - NALLOORPPADAVU",
  "polling_station": "Nalloorpadavu UP School",
  "language": "English",
  "total_voters": 2,
  "voters": [
    {
      "serial": "1",
      "name": "Mariyamma",
      "guardian": "Thomas",
      "house_no": "001/1",
      "house_name": "Poovathummoottil",
      "gender_age": "F / 74",
      "sec_id": "SEC023846719"
    }
  ]
}
```

### Error Response

```json
{
  "status": "error",
  "message": "Invalid captcha. Please try again with correct captcha."
}
```

## Notes

1. **Captcha**: Always required and changes with each request
2. **IDs**: Use the `value` field from dropdown responses, not `text`
3. **Language**: Use "E" for English or "M" for Malayalam
4. **Timing**: Extraction may take 10-30 seconds depending on data size

## Testing Workflow

```bash
# 1. Check server health
curl http://localhost:3000/health

# 2. Get districts
curl http://localhost:3000/api/getDistricts

# 3. Use web interface for full extraction
# Visit: http://localhost:3000
```

For more information, see `README.md` and `QUICKSTART.md`.
