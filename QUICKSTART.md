# Quick Start Guide

## Kerala SEC Voter List Extraction API

### ✅ Installation Complete!

Your Kerala SEC Voter List Extraction API is now set up and ready to use.

### 🚀 Server Status

The server is currently running on: **http://localhost:3000**

### 📝 How to Use

#### Option 1: Web Interface (Recommended)

1. Open your browser and go to: **http://localhost:3000**
2. Follow the form steps:
   - Select District
   - Select Local Body (auto-populated)
   - Select Ward (auto-populated)
   - Select Polling Station (auto-populated)
   - Select Language (English or Malayalam)
   - Enter Captcha code shown in the image
   - Click "Extract Voters"
3. View results and export as JSON or CSV

#### Option 2: API Endpoints

Use any HTTP client (Postman, curl, etc.) to call the API:

**Get Districts:**
```bash
curl http://localhost:3000/api/getDistricts
```

**Get Local Bodies:**
```bash
curl -X POST http://localhost:3000/api/getLocalBodies \
  -H "Content-Type: application/json" \
  -d "{\"district_id\":\"12\"}"
```

**Extract Voters:**
```bash
curl -X POST http://localhost:3000/api/extractVoters \
  -H "Content-Type: application/json" \
  -d "{\"district\":\"12\",\"local_body\":\"pnNXD5bL4J\",\"ward\":\"MOZ4EKJBAD\",\"polling_station\":\"S8J4PDLKMN\",\"language\":\"E\",\"captcha\":\"K4B7C\"}"
```

### 🛠️ Development Commands

**Start Server:**
```bash
npm start
```

**Start with Auto-Reload:**
```bash
npm run dev
```

**Stop Server:**
Press `Ctrl+C` in the terminal

### 📂 Project Structure

```
electionnew/
├── controllers/           # API controllers
│   ├── dropdownController.js
│   └── voterController.js
├── utils/                # Utility modules
│   ├── playwright.js     # Browser automation
│   └── parser.js         # HTML parsing
├── frontend/             # Web interface
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── server.js             # Main server file
├── package.json          # Dependencies
└── README.md             # Full documentation
```

### 🔍 Testing the API

1. **Health Check:**
   - Visit: http://localhost:3000/health
   - Should return: `{"status":"OK","message":"Kerala SEC Voter API is running"}`

2. **Web Interface:**
   - Visit: http://localhost:3000
   - You should see the voter extraction form

3. **Extract Data:**
   - Fill in all form fields
   - Enter captcha correctly
   - Submit and view results

### ⚠️ Important Notes

1. **Captcha Required**: You must enter the captcha manually for each extraction
2. **Internet Connection**: Required to access SEC Kerala portal
3. **Valid Selections**: Ensure all dropdown selections are valid
4. **Rate Limiting**: Be respectful of SEC servers

### 🐛 Troubleshooting

**Server not starting?**
- Check if port 3000 is available
- Change PORT in `.env` file if needed

**Captcha errors?**
- Ensure captcha is entered correctly
- Try refreshing the captcha image

**No data extracted?**
- Verify dropdown selections
- Check SEC website availability
- Look at browser console for errors

**Playwright issues?**
- Run: `npx playwright install chromium`

### 📚 Full Documentation

See `README.md` for complete documentation including:
- Detailed API reference
- Configuration options
- Security considerations
- Advanced usage

### 🎉 You're All Set!

Start extracting voter data by visiting:
👉 **http://localhost:3000**

Enjoy using the Kerala SEC Voter List Extraction API! 🚀
