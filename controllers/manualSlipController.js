import express from 'express';
import * as cheerio from 'cheerio';

const router = express.Router();

/**
 * Parse HTML pasted by admin
 * POST /api/manual-slip/parse-html
 * Body: { html: string, pollingStation: string }
 */
router.post('/parse-html', async (req, res) => {
  try {
    const { html, pollingStation } = req.body;

    if (!html) {
      return res.status(400).json({
        status: 'error',
        message: 'HTML content is required'
      });
    }

    console.log('[MANUAL-SLIP] 📋 Parsing HTML for polling station:', pollingStation);
    console.log('[MANUAL-SLIP] 📄 HTML length:', html.length, 'characters');

    // Parse the HTML
    const parseResult = parseVoterHTML(html, pollingStation);

    if (!parseResult.voters || parseResult.voters.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No voters found in the HTML. Please check the HTML content.',
        voters: [],
        pollingStationName: parseResult.pollingStationName
      });
    }

    console.log('[MANUAL-SLIP] ✅ Successfully parsed', parseResult.voters.length, 'voters');

    res.json({
      status: 'success',
      voters: parseResult.voters,
      pollingStationName: parseResult.pollingStationName,
      count: parseResult.voters.length
    });

  } catch (error) {
    console.error('[MANUAL-SLIP] ❌ Error parsing HTML:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to parse HTML',
      errorType: error.constructor.name
    });
  }
});

/**
 * Parse voter HTML - same logic as frontend
 */
function parseVoterHTML(htmlString, pollingStationValue) {
  const $ = cheerio.load(htmlString);
  const voters = [];
  let pollingStationName = null;

  try {
    // Extract Malayalam polling station name using multiple strategies
    console.log('[MANUAL-SLIP] 🔍 Extracting Malayalam polling station name...');

    // PRIORITY 1: Try selected option in polling station dropdown
    pollingStationName = $('#view_voters_list_pollingStation option[selected="selected"]').text().trim();
    if (pollingStationName) {
      console.log('[MANUAL-SLIP] ✅ Found polling station from selected option:', pollingStationName);
    }

    // PRIORITY 2: Fallback to value match
    if (!pollingStationName && pollingStationValue) {
      pollingStationName = $(`#view_voters_list_pollingStation option[value="${pollingStationValue}"]`).text().trim();
      if (pollingStationName) {
        console.log('[MANUAL-SLIP] ✅ Found polling station from value match:', pollingStationName);
      }
    }

    // PRIORITY 3: Try .chosen-single .result-selected (for Chosen plugin)
    if (!pollingStationName) {
      const chosenText = $('.chosen-single .result-selected').text().trim()
        .replace(/\s+/g, ' '); // Normalize spaces
      if (chosenText && chosenText !== '-- തിരഞ്ഞെടുക്കുക --' && chosenText !== 'Select' && chosenText !== '--' && !chosenText.startsWith('--')) {
        pollingStationName = chosenText;
        console.log('[MANUAL-SLIP] ✅ Found polling station from chosen-results:', pollingStationName);
      }
    }

    // PRIORITY 4: Try breadcrumb or page header
    if (!pollingStationName) {
      $('.breadcrumb li, .page-title, h1, h2, h3').each((i, elem) => {
        const text = $(elem).text().trim();
        if (text.includes('പോളിംഗ്') || text.includes('പോളിങ്') || text.includes('സ്റ്റേഷൻ')) {
          pollingStationName = text;
          console.log('[MANUAL-SLIP] ✅ Found Malayalam polling station from header:', pollingStationName);
          return false; // break
        }
      });
    }

    if (!pollingStationName) {
      console.warn('[MANUAL-SLIP] ⚠️ Could not find Malayalam polling station name');
    }

  } catch (e) {
    console.error('[MANUAL-SLIP] ❌ Error extracting polling station name:', e);
  }

  // Section handling - same as frontend
  const INCLUDE_SECTIONS = new Set([
    'കൂട്ടിച്ചേർക്കലുകൾ',      // Additions
    'തിരുത്തലുകൾ',          // Corrections
    'പ്രവാസി വോട്ടർപട്ടിക'    // NRI / Overseas voters
  ]);
  const EXCLUDE_AFTER_SECTION = 'ഒഴിവാക്കലുകൾ'; // Deletions

  let currentIncludedSection = null;
  let stopParsing = false;

  // Try multiple selectors to find voter table rows
  const selectors = [
    'tbody.voters-list tr',
    'tbody tr',
    'table tr',
    '.voter-row',
    'tr'
  ];

  let rows = [];
  for (const selector of selectors) {
    const foundRows = $(selector);
    if (foundRows.length > 0) {
      rows = foundRows;
      console.log(`[MANUAL-SLIP] 📊 Found ${foundRows.length} rows using selector: ${selector}`);
      break;
    }
  }

  rows.each((index, row) => {
    if (stopParsing) return;

    const $row = $(row);

    // Detect section header rows with <h3>
    const header = $row.find('h3');
    if (header.length > 0) {
      const title = header.text().trim().replace(/\s+/g, ' ').trim();
      console.log('[MANUAL-SLIP] 📌 Section header detected:', title);

      if (title.startsWith(EXCLUDE_AFTER_SECTION)) {
        stopParsing = true;
        console.log('[MANUAL-SLIP] 🛑 Stopping parse after deletions section');
        return;
      }

      if (INCLUDE_SECTIONS.has(title)) {
        currentIncludedSection = title;
        console.log('[MANUAL-SLIP] ✅ Entering included section:', title);
      } else {
        currentIncludedSection = '__EXCLUDE__';
        console.log('[MANUAL-SLIP] ⏭️ Entering non-included section, skipping rows');
      }
      return;
    }

    const cols = $row.find('td');
    if (cols.length === 0) return;

    // Check if we should collect this row
    const inBaseList = currentIncludedSection === null;
    const inIncludedSection = currentIncludedSection && currentIncludedSection !== '__EXCLUDE__';
    if (!(inBaseList || inIncludedSection)) {
      return;
    }

    // Build voter object based on column count
    let voter = null;
    if (cols.length === 7) {
      voter = {
        sl_no: $(cols[0]).text().trim(),
        name: $(cols[1]).text().trim(),
        guardian_name: $(cols[2]).text().trim(),
        house_no: $(cols[3]).text().trim(),
        house_name: $(cols[4]).text().trim(),
        gender_age: $(cols[5]).text().trim(),
        sec_id: $(cols[6]).text().trim()
      };
    } else if (cols.length === 6) {
      voter = {
        sl_no: $(cols[0]).text().trim(),
        name: $(cols[1]).text().trim(),
        guardian_name: $(cols[2]).text().trim(),
        house_no: '',
        house_name: $(cols[3]).text().trim(),
        gender_age: $(cols[4]).text().trim(),
        sec_id: $(cols[5]).text().trim()
      };
    } else if (cols.length >= 4) {
      const remainingCols = [];
      for (let i = 4; i < cols.length; i++) {
        remainingCols.push($(cols[i]).text().trim());
      }
      voter = {
        sl_no: $(cols[0]).text().trim(),
        name: $(cols[1]).text().trim(),
        guardian_name: $(cols[2]) ? $(cols[2]).text().trim() : '',
        house_no: '',
        house_name: $(cols[3]) ? $(cols[3]).text().trim() : '',
        gender_age: '',
        sec_id: remainingCols.join(' | ')
      };
    }

    if (!voter) return;

    // Filter out DELETED or SHIFTED
    const upperName = voter.name.toUpperCase();
    if (upperName.includes('DELETED') || upperName.includes('SHIFTED')) {
      return;
    }

    // Basic validity check
    if (voter.name || voter.sec_id) {
      voters.push(voter);
    }
  });

  console.log(`[MANUAL-SLIP] ✅ Parsed ${voters.length} filtered voters`);
  return { voters, pollingStationName };
}

export default router;
