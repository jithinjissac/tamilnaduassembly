# Assembly Election Module - Integration Complete

## Overview

The Assembly Election module has been successfully integrated into your Kerala voter slip platform. This module extracts voter data from the **Election Commission of India (ECI)** portal instead of the Kerala SEC portal.

---

## Key Features

### ✅ What's New

1. **ECI Portal Integration**
   - Automated data extraction from `voters.eci.gov.in`
   - Support for Assembly Constituency voter rolls
   - Headless browser automation with Playwright

2. **PDF Processing**
   - Automatic PDF download from ECI portal
   - Intelligent PDF parsing to extract voter data
   - Support for multiple PDF formats

3. **Independent User System**
   - Separate user database for Assembly elections
   - Independent order management
   - Can share payment gateways with local body system

4. **Complete Form Flow**
   - State → Year → Roll Type → District → Assembly Constituency → Language
   - Automated captcha capture
   - Real-time form validation

---

## Files Created

### Controllers
- `controllers/assemblyDropdownController.js` - Dropdown data management
- `controllers/assemblyVoterController.js` - Voter extraction logic

### Routes
- `routes/assembly.js` - API endpoints for Assembly elections

### Models
- `models/AssemblyUser.js` - User schema for Assembly module
- `models/AssemblyOrder.js` - Order schema for Assembly voters

### Utilities
- `utils/eciPlaywright.js` - ECI portal automation
- `utils/pdfParser.js` - PDF data extraction

### Frontend
- `frontend/assembly.html` - Voter extraction interface

---

## API Endpoints

### Base URL: `/api/assembly`

#### Dropdown Endpoints
```
GET  /api/assembly/getStates
POST /api/assembly/getYears
POST /api/assembly/getRollTypes
POST /api/assembly/getDistricts
POST /api/assembly/getConstituencies
GET  /api/assembly/getLanguages
```

#### Extraction Endpoints
```
POST /api/assembly/getCaptcha
POST /api/assembly/extractVoters
GET  /api/assembly/health
```

---

## Usage

### 1. Install Dependencies

```bash
npm install
```

This will install the new `pdf-parse` package added to dependencies.

### 2. Start Server

```bash
npm start
```

### 3. Access Assembly Module

Open browser: **http://localhost:3000/assembly.html**

### 4. User Flow

1. **Select State** (Kerala is default)
2. **Select Year** (2026, 2025, etc.)
3. **Select Roll Type** (SIR FinalRoll, Draft, etc.)
4. **Select District** (Thiruvananthapuram, Kollam, etc.)
5. **Select Assembly Constituency** (Based on district)
6. **Select Language** (English, Malayalam, Hindi)
7. **Load Captcha** (Click button to capture from ECI)
8. **Enter Captcha** (Type the code shown)
9. **Extract Voters** (Downloads PDF and extracts data)
10. **View Results** (Table with all voters)
11. **Export** (JSON or CSV)

---

## Technical Details

### PDF Parsing Strategy

The `pdfParser.js` utility uses multiple strategies to extract voter data:

1. **Structured Parsing**: Looks for standard patterns like:
   - Serial numbers
   - EPIC numbers (ABC1234567)
   - Age fields
   - Gender markers
   - Relative information

2. **Alternative Parsing**: Falls back to block-based extraction if structured parsing fails

3. **Data Cleanup**: Removes PDF artifacts and normalizes data

### Session Management

- Browser sessions are maintained for 10 minutes
- Automatic cleanup of expired sessions
- Each captcha load creates a unique session ID

### Browser Automation

- Uses Playwright Chromium in headless mode
- Handles dynamic dropdowns and AJAX calls
- Waits for PDF download completion
- Automatic cleanup after extraction

---

## Data Structure

### Voter Object
```javascript
{
  serialNo: string,
  name: string,
  relativeName: string,
  relationType: string, // Father/Mother/Husband
  houseNo: string,
  age: string,
  gender: string, // M/F/O
  epicNo: string  // Voter ID Card Number
}
```

### Order Object (AssemblyOrder model)
```javascript
{
  orderId: string,
  userId: ObjectId,
  state: string,
  district: string,
  constituency: string,
  year: string,
  rollType: string,
  language: string,
  voters: [VoterSchema],
  totalVoters: number,
  customization: {...},
  amount: number,
  paymentStatus: enum,
  status: enum,
  pdfPath: string,
  // ... more fields
}
```

---

## Integration with Existing System

### Shared Components
- ✅ Payment gateways (Razorpay, Cashfree, PayUMoney)
- ✅ PDF generation engine (for voter slips)
- ✅ Email notification system
- ✅ Admin panel (can be extended)

### Separate Components
- ❌ User authentication (separate AssemblyUser model)
- ❌ Order management (separate AssemblyOrder model)
- ❌ Data source (ECI vs SEC Kerala)

---

## Next Steps

### To Complete Full SaaS for Assembly Elections

1. **Authentication System**
   - Create `/api/assembly/auth/register` endpoint
   - Create `/api/assembly/auth/login` endpoint
   - Implement JWT authentication
   - Add user dashboard

2. **Payment Integration**
   - Create Assembly-specific order creation
   - Calculate cost: `voters × ₹0.50`
   - Integrate with existing payment routes
   - Handle payment callbacks

3. **Slip Generation**
   - Adapt existing slip generation for Assembly voters
   - Support customization (party logo, colors, etc.)
   - Generate PDFs with Assembly constituency format
   - Store PDFs permanently

4. **Dashboard**
   - Create Assembly user dashboard
   - Show order history
   - Download functionality
   - Profile management

5. **Admin Panel**
   - Extend existing admin to support Assembly orders
   - View all Assembly users
   - Monitor extraction logs
   - Handle refunds/cancellations

---

## Testing

### Manual Testing Checklist

- [ ] Load states dropdown
- [ ] Load years based on state
- [ ] Load roll types based on year
- [ ] Load districts based on state
- [ ] Load constituencies based on district
- [ ] Load languages
- [ ] Capture captcha from ECI
- [ ] Submit form with correct captcha
- [ ] Extract voters from PDF
- [ ] Display voters in table
- [ ] Export as JSON
- [ ] Export as CSV
- [ ] Handle invalid captcha
- [ ] Handle network errors
- [ ] Session cleanup after 10 minutes

### API Testing

```bash
# Health check
curl http://localhost:3000/api/assembly/health

# Get states
curl http://localhost:3000/api/assembly/getStates

# Get districts
curl -X POST http://localhost:3000/api/assembly/getDistricts \
  -H "Content-Type: application/json" \
  -d '{"stateCode":"S11"}'
```

---

## Troubleshooting

### Issue: PDF parsing returns no data
**Solution**: The PDF format may vary. Adjust regex patterns in `pdfParser.js`

### Issue: Captcha not loading
**Solution**: Check if ECI portal is accessible. Try manual navigation to verify.

### Issue: Browser sessions not closing
**Solution**: Check the cleanup cron job. Restart server to force cleanup.

### Issue: Download timeout
**Solution**: Increase timeout in `eciPlaywright.js`. ECI PDFs can be large.

---

## Security Considerations

1. **Session Isolation**: Each user gets a unique browser session
2. **Temporary Storage**: PDFs are deleted after parsing
3. **Captcha Validation**: Server-side captcha verification
4. **Rate Limiting**: Should be added to prevent abuse
5. **Input Sanitization**: All form inputs should be validated

---

## Performance Optimization

- Browser pooling (for high traffic)
- PDF caching (for repeated requests)
- Parallel processing (multiple extractions)
- CDN for static assets
- Database indexing on frequently queried fields

---

## Deployment Notes

- Ensure Playwright browsers are installed: `npx playwright install chromium --with-deps`
- Set adequate memory limits (Chromium + PDF parsing is memory-intensive)
- Configure timeout values based on server performance
- Monitor browser process cleanup
- Set up log rotation for extraction logs

---

## Support

For issues or questions:
1. Check server logs: `npm run logs:pm2`
2. Verify ECI portal accessibility
3. Test API endpoints individually
4. Check browser automation logs

---

## License & Disclaimer

This module is for legitimate political campaign purposes only. Ensure compliance with:
- Election Commission of India regulations
- Data protection laws
- Terms of service of ECI portal
- User privacy requirements

---

## Changelog

### v1.0.0 - March 1, 2026
- Initial Assembly election module release
- ECI portal integration
- PDF parsing functionality
- Separate user database
- Basic extraction interface

---

**Module Status**: ✅ Core functionality complete
**Next Priority**: Payment integration and voter slip generation
