import * as cheerio from 'cheerio';

/**
 * Extract polling station name from SEC response HTML
 * When language=M is submitted, the response HTML contains the station name in Malayalam
 * @param {string} html - Full HTML response from SEC
 * @returns {string} - Polling station name in the selected language (Malayalam if language=M)
 */
export function extractPollingStationName(html) {
  const $ = cheerio.load(html);
  
  let pollingStationName = null;
  
  // Strategy 1: Look for the POLLING STATION label and get its value
  // This appears in the header section of the voter list response
  // Format: <td>POLLING STATION:</td><td class="ubuntuB fs-3">001 - സ്റ്റേഷൻ നാമം</td>
  $('td').each((i, elem) => {
    const text = $(elem).text().trim();
    // Check for polling station label (English or Malayalam)
    if (text === 'POLLING STATION:' || 
        text === 'പോളിംഗ് സ്റ്റേഷൻ:' || 
        text.toUpperCase() === 'POLLING STATION:' ||
        text.includes('POLLING') ||
        text.includes('പോളിംഗ്')) {
      // Get the next sibling cell which contains the actual station name
      const nextCell = $(elem).next('td');
      if (nextCell.length > 0) {
        const stationText = nextCell.text().trim();
        if (stationText && stationText !== ':') {
          pollingStationName = stationText;
          console.log('[PARSER] Found polling station from label:', stationText);
          return false; // Break
        }
      }
    }
  });
  
  // Strategy 2: Look for station name pattern with Malayalam characters
  // Malayalam stations will have format: "001 - മലയാളം പേര്"
  if (!pollingStationName) {
    $('td.ubuntuB, td.fs-3, td[class*="ubuntu"]').each((i, elem) => {
      const text = $(elem).text().trim();
      // Station pattern: starts with 3 digits, dash/space, and contains Malayalam
      if (/^\d{3}[\s-]/.test(text) && /[\u0D00-\u0D7F]/.test(text)) {
        pollingStationName = text;
        console.log('[PARSER] Found Malayalam polling station:', text);
        return false; // Break
      }
    });
  }
  
  // Strategy 3: Look for station name pattern (English fallback)
  if (!pollingStationName) {
    $('td.ubuntuB, td.fs-3, strong, .station-name, h5, h6').each((i, elem) => {
      const text = $(elem).text().trim();
      // Station pattern: starts with 3 digits followed by dash or space
      if (/^\d{3}[\s-]/.test(text) && text.length > 5) {
        pollingStationName = text;
        console.log('[PARSER] Found polling station (English):', text);
        return false; // Break
      }
    });
  }
  
  // Strategy 4: Search all table cells for station-like content
  if (!pollingStationName) {
    $('table td, div.card-body td, .card-header, .card-title, .fs-3').each((i, elem) => {
      const text = $(elem).text().trim();
      if (/^\d{3}[\s-]/.test(text) && text.length > 10) {
        pollingStationName = text;
        console.log('[PARSER] Found station from table scan:', text);
        return false;
      }
    });
  }
  
  if (pollingStationName) {
    const hasMalayalam = /[\u0D00-\u0D7F]/.test(pollingStationName);
    console.log(`[PARSER] Extracted polling station: "${pollingStationName}" (Malayalam: ${hasMalayalam})`);
  } else {
    console.warn('[PARSER] Could not extract polling station name from HTML');
  }
  
  return pollingStationName;
}

/**
 * Parse voter list table HTML into structured JSON
 * @param {string} html - HTML table string
 * @returns {Array} - Array of voter objects
 */
export function parseVotersTable(html) {
  const $ = cheerio.load(html);
  const voters = [];

  // Try different selectors for voter rows
  const rowSelectors = [
    'tbody.voters-list tr',
    'tbody tr',
    'table tr:not(:first-child)', // Exclude header row
    'tr.voter-row'
  ];

  let rows = $([]);
  
  for (const selector of rowSelectors) {
    rows = $(selector);
    if (rows.length > 0) {
      console.log(`Found ${rows.length} rows using selector: ${selector}`);
      break;
    }
  }

  rows.each((index, element) => {
    const cols = $(element).find('td');
    
    if (cols.length === 0) {
      return; // Skip header rows or empty rows
    }

    // Standard 7-column format
    if (cols.length === 7) {
      const voter = {
        serial: $(cols[0]).text().trim(),
        name: $(cols[1]).text().trim(),
        guardian: $(cols[2]).text().trim(),
        house_no: $(cols[3]).text().trim(),
        house_name: $(cols[4]).text().trim(),
        gender_age: $(cols[5]).text().trim(),
        sec_id: $(cols[6]).text().trim()
      };

      // Only add if it has valid data (not empty)
      if (voter.name || voter.sec_id) {
        voters.push(voter);
      }
    } 
    // Alternative format with 6 columns
    else if (cols.length === 6) {
      const voter = {
        serial: $(cols[0]).text().trim(),
        name: $(cols[1]).text().trim(),
        guardian: $(cols[2]).text().trim(),
        house_name: $(cols[3]).text().trim(),
        gender_age: $(cols[4]).text().trim(),
        sec_id: $(cols[5]).text().trim()
      };

      if (voter.name || voter.sec_id) {
        voters.push(voter);
      }
    }
    // Handle other formats
    else if (cols.length > 3) {
      const colArray = [];
      cols.each((i, col) => {
        colArray.push($(col).text().trim());
      });
      
      const voter = {
        serial: colArray[0] || '',
        name: colArray[1] || '',
        guardian: colArray[2] || '',
        house_info: colArray[3] || '',
        additional: colArray.slice(4).join(' | ')
      };

      if (voter.name) {
        voters.push(voter);
      }
    }
  });

  console.log(`Parsed ${voters.length} voters from HTML table`);
  return voters;
}

/**
 * Parse voter data and extract additional information
 * @param {Array} voters - Array of voter objects
 * @returns {Object} - Statistics and enriched data
 */
export function analyzeVoters(voters) {
  const stats = {
    total: voters.length,
    male: 0,
    female: 0,
    other: 0,
    age_groups: {
      '18-30': 0,
      '31-50': 0,
      '51-70': 0,
      '70+': 0
    }
  };

  voters.forEach(voter => {
    // Extract gender and age from gender_age field (e.g., "F / 74")
    if (voter.gender_age) {
      const match = voter.gender_age.match(/([MFO])\s*\/\s*(\d+)/i);
      if (match) {
        const gender = match[1].toUpperCase();
        const age = parseInt(match[2]);

        // Count gender
        if (gender === 'M') stats.male++;
        else if (gender === 'F') stats.female++;
        else stats.other++;

        // Count age groups
        if (age >= 18 && age <= 30) stats.age_groups['18-30']++;
        else if (age >= 31 && age <= 50) stats.age_groups['31-50']++;
        else if (age >= 51 && age <= 70) stats.age_groups['51-70']++;
        else if (age > 70) stats.age_groups['70+']++;
      }
    }
  });

  return stats;
}
