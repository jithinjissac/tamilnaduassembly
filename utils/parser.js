import * as cheerio from 'cheerio';

/**
 * Parse voter list table HTML into structured JSON
 * @param {string} html - HTML table string
 * @returns {Array} - Array of voter objects
 */
export function parseVotersTable(html) {
  const $ = cheerio.load(html);
  const voters = [];

  // Debug: Log what tables we found
  const tables = $('table');
  console.log(`Found ${tables.length} table(s) in HTML`);
  
  // Try different selectors for voter rows
  const rowSelectors = [
    'tbody.voters-list tr',
    'tbody tr',
    'table.table tbody tr', // Bootstrap table
    'table.dataTable tbody tr', // DataTables
    'div.table-responsive table tbody tr', // Responsive tables
    '#votersTable tbody tr', // Specific ID
    'table tr:not(:first-child)', // Exclude header row
    'tr.voter-row'
  ];

  let rows = $([]);
  let usedSelector = '';
  
  for (const selector of rowSelectors) {
    rows = $(selector);
    if (rows.length > 0) {
      usedSelector = selector;
      console.log(`✅ Found ${rows.length} rows using selector: ${selector}`);
      break;
    }
  }
  
  if (rows.length === 0) {
    console.log('❌ No table rows found with standard selectors');
    console.log('HTML structure:', html.substring(0, 1000));
    return voters;
  }

  rows.each((index, element) => {
    const cols = $(element).find('td');
    
    if (cols.length === 0) {
      return; // Skip header rows or empty rows
    }
    
    // Debug first row to understand structure
    if (index === 0) {
      console.log(`First row has ${cols.length} columns`);
      const colContents = [];
      cols.each((i, col) => {
        colContents.push($(col).text().trim());
      });
      console.log('First row data:', colContents);
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
