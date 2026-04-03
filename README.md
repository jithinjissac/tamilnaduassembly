# Kerala SEC Voter List Extraction API

🗳️ **Automated voter list extraction from State Election Commission, Kerala (SEC) portal**

This system automates the extraction of voter list data from the Kerala SEC website using headless browser automation with Playwright. It provides a complete API backend and web interface that replicates the official voter search form.

## 🚀 Features

- **Cascading Dropdown System**: District → Local Body → Ward → Polling Station
- **Headless Browser Automation**: Uses Playwright (Chromium) for reliable extraction
- **Session-Based Captcha Handling**: Persistent browser sessions with screenshot capture
- **Data Parsing**: Converts HTML tables to structured JSON with section filtering
- **Export Options**: Download results as JSON or CSV
- **Voter Information Slip Generator**: Create print-ready voter information slips (5 per A4 page) with party branding
- **RESTful API**: Clean API endpoints for integration
- **Modern UI**: Responsive web interface with real-time feedback
- **Malayalam Support**: Default Malayalam language with proper font rendering

## 📋 Prerequisites

- **Node.js** 16.x or higher
- **npm** or **yarn**
- Internet connection (to access SEC portal)

## 🛠️ Installation

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Install Playwright Browsers**:
   ```bash
   npx playwright install chromium
   ```

3. **Configure Environment** (optional):
   Edit `.env` file to customize:
   ```
   PORT=3000
   NODE_ENV=development
   SEC_BASE_URL=https://sec.kerala.gov.in
   ```

## 🎯 Usage

### Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

The server will start on `http://localhost:3000`

### Using the Web Interface

1. Open your browser and navigate to `http://localhost:3000`
2. Select **District** from the dropdown
3. Select **Local Body** (auto-populated after district selection)
4. Select **Ward** (auto-populated after local body selection)
5. Select **Polling Station** (auto-populated after ward selection)
6. Wait for **Captcha** to load automatically and enter the code
7. Click **Extract Voters**
8. View results in the table
9. **Export** as JSON or CSV, or **Generate Voter Information Slips** for printing

### Using the Voter Information Slip Generator

After extracting voter data:

1. Click **"🎫 Generate Voter Information Slips"** button in the results section
2. Review the generated slips (5 per A4 page) with:
   - Party logo and branding
   - Voter details (name, SEC ID, address, guardian)
   - Polling station information
3. Click **"🖨️ Print Slips"** to print on A4 paper
4. Distribute slips to voters during election campaigns

See [VOTER_SLIPS_GUIDE.md](./VOTER_SLIPS_GUIDE.md) for detailed documentation.

## 📡 API Endpoints

### 1. Get Districts

```http
GET /api/getDistricts
```

**Response:**
```json
{
  "status": "success",
  "districts": [
    { "value": "01", "text": "Thiruvananthapuram" },
    { "value": "12", "text": "Wayanad" }
  ]
}
```

### 2. Get Local Bodies

```http
POST /api/getLocalBodies
Content-Type: application/json

{
  "district_id": "12"
}
```

**Response:**
```json
{
  "status": "success",
  "local_bodies": [
    { "value": "pnNXD5bL4J", "text": "G03001-ആനിക്കാട്" }
  ]
}
```

### 3. Get Wards

```http
POST /api/getWards
Content-Type: application/json

{
  "local_body_id": "pnNXD5bL4J"
}
```

**Response:**
```json
{
  "status": "success",
  "wards": [
    { "value": "MOZ4EKJBAD", "text": "001 - NALLOORPPADAVU" }
  ]
}
```

### 4. Get Polling Stations

```http
POST /api/getPollingStations
Content-Type: application/json

{
  "ward_id": "MOZ4EKJBAD"
}
```

**Response:**
```json
{
  "status": "success",
  "polling_stations": [
    { "value": "S8J4PDLKMN", "text": "Polling Station 1 - Nalloorpadavu UP School" }
  ]
}
```

### 5. Extract Voters

```http
POST /api/extractVoters
Content-Type: application/json

{
  "district": "12",
  "local_body": "pnNXD5bL4J",
  "ward": "MOZ4EKJBAD",
  "polling_station": "S8J4PDLKMN",
  "language": "E",
  "captcha": "K4B7C"
}
```

**Response:**
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

## 📁 Project Structure

```
project/
├── server.js                      # Express server entry point
├── controllers/
│   ├── dropdownController.js      # Dropdown API endpoints
│   ├── voterController.js         # Voter extraction endpoint (deprecated)
│   └── captchaController.js       # Session-based captcha management
├── utils/
│   ├── playwright.js              # Browser automation logic
│   └── parser.js                  # HTML table parser
├── frontend/
│   ├── index.html                 # Main extraction interface
│   ├── styles.css                 # Main page styling
│   ├── app.js                     # Frontend JavaScript
│   ├── slips.html                 # voter information slip generator page
│   ├── slips.css                  # Print-ready slip styling
│   └── slips.js                   # Slip generation logic
├── public/
│   └── captcha-cache/             # Temporary captcha screenshots
├── package.json
├── .env
├── .gitignore
├── README.md
├── API_EXAMPLES.md
├── QUICKSTART.md
├── SETUP_COMPLETE.md
└── VOTER_SLIPS_GUIDE.md          # voter information slip feature documentation
```

## 🔧 Technology Stack

| Layer        | Technology             | Purpose                            |
|--------------|------------------------|------------------------------------|
| Backend      | Node.js + Express      | REST API server                    |
| Automation   | Playwright (Chromium)  | Headless browser automation        |
| Parsing      | Cheerio                | HTML parsing and data extraction   |
| Frontend     | Vanilla HTML/CSS/JS    | User interface                     |
| HTTP Client  | Axios                  | External API requests              |

## ⚙️ Configuration

### Environment Variables

Create or modify `.env` file:

```env
PORT=3000
NODE_ENV=development
SEC_BASE_URL=https://sec.kerala.gov.in
```

### Playwright Options

Edit `utils/playwright.js` to customize browser settings:

```javascript
const browser = await chromium.launch({ 
  headless: true,  // Set to false for debugging
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
```

## 🐛 Troubleshooting

### Captcha Error

- **Problem**: "Invalid captcha" message
- **Solution**: Ensure captcha is entered correctly. Refresh captcha if unclear.

### No Data Extracted

- **Problem**: Form submits but no voters are found
- **Solution**: Verify all dropdown selections are correct. Check SEC website availability.

### Playwright Installation Issues

- **Problem**: Browser binaries not found
- **Solution**: Run `npx playwright install chromium`

### Port Already in Use

- **Problem**: Port 3000 is occupied
- **Solution**: Change `PORT` in `.env` or stop the other process

## 📝 Notes

- **Captcha**: Must be entered manually. Consider integrating a captcha solver API for automation.
- **Rate Limiting**: Be respectful of SEC servers. Avoid excessive requests.
- **Data Accuracy**: Always verify extracted data against official sources.
- **Legal**: Ensure compliance with data usage policies and regulations.

## 🔒 Security Considerations

- Do not store or misuse voter data
- Implement rate limiting in production
- Use HTTPS in production environments
- Sanitize all user inputs
- Keep dependencies updated

## 📄 License

ISC

## 👤 Author

Kerala SEC Voter List Extraction API

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## 📞 Support

For issues or questions, please open a GitHub issue.

---

**Disclaimer**: This tool is for educational and authorized purposes only. Ensure compliance with all applicable laws and regulations regarding voter data access and usage.
