import { chromium } from 'playwright';
import { parseVotersTable } from './parser.js';

const SEC_BASE_URL = process.env.SEC_BASE_URL || 'https://sec.kerala.gov.in';

/**
 * Extract voter list from SEC website using Playwright
 * @param {Object} params - Extraction parameters
 * @param {string} params.district - District ID
 * @param {string} params.local_body - Local body ID
 * @param {string} params.ward - Ward ID
 * @param {string} params.polling_station - Polling station ID
 * @param {string} params.language - Language (E or M)
 * @param {string} params.captcha - Captcha value
 * @returns {Object} - Extracted voter data
 */
export async function extractVoterList(params) {
  const { district, local_body, ward, polling_station, language, captcha } = params;

  let browser;
  let page;

  try {
    console.log('Launching browser...');
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
    });

    page = await context.newPage();

    // Set cookies including Malayalam locale BEFORE navigating
    console.log('Setting cookies with Malayalam locale...');
    await context.addCookies([
      {
        name: 'set_locale',
        value: 'ml',
        domain: '.sec.kerala.gov.in',
        path: '/'
      },
      {
        name: 'device_view',
        value: 'full',
        domain: '.sec.kerala.gov.in',
        path: '/'
      }
    ]);

    console.log('Navigating to SEC voter list page with Malayalam locale...');
    await page.goto(`${SEC_BASE_URL}/public/voters/list`, { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });
    
    // Wait for the page to be fully loaded and interactive
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000); // Give extra time for JavaScript to initialize
    console.log('Page loaded with Malayalam locale');

    // Wait for the district dropdown to be visible and enabled
    console.log('Waiting for district dropdown to be visible...');
    await page.waitForSelector('#view_voters_list_district', { state: 'visible', timeout: 10000 });
    
    // Take screenshot after page load to verify language
    await page.screenshot({ path: 'page-loaded.png', fullPage: true });
    console.log('Screenshot saved: page-loaded.png');

    console.log('Filling form fields...');
    
    // Check if element is visible, if not, try to make it visible
    const districtVisible = await page.isVisible('#view_voters_list_district');
    if (!districtVisible) {
      console.log('District dropdown not visible, attempting to show it...');
      // Try to scroll into view and remove any potential overlays
      await page.evaluate(() => {
        const select = document.querySelector('#view_voters_list_district');
        if (select) {
          select.scrollIntoView();
          select.style.display = 'block';
          select.style.visibility = 'visible';
        }
      });
      await page.waitForTimeout(1000);
    }

    // Select district
    console.log('Selecting district...');
    await page.selectOption('#view_voters_list_district', district);
    console.log('District selected, waiting for local bodies...');
    await page.waitForTimeout(2000);

    // Wait for local body options to load
    await page.waitForSelector('#view_voters_list_localBody option:not([value=""])', { timeout: 15000 });
    await page.selectOption('#view_voters_list_localBody', local_body);
    console.log('Local body selected, waiting for wards...');
    await page.waitForTimeout(2000);

    // Wait for ward options to load
    await page.waitForSelector('#view_voters_list_ward option:not([value=""])', { timeout: 15000 });
    await page.selectOption('#view_voters_list_ward', ward);
    console.log('Ward selected, waiting for polling stations...');
    await page.waitForTimeout(2000);

    // Wait for polling station options to load
    await page.waitForSelector('#view_voters_list_pollingStation option:not([value=""])', { timeout: 15000 });
    await page.selectOption('#view_voters_list_pollingStation', polling_station);
    console.log('Polling station selected');
    await page.waitForTimeout(1000);

    // Select language
    await page.selectOption('#view_voters_list_language', language);
    await page.waitForTimeout(500);

    // Fill captcha
    await page.fill('#view_voters_list_captcha', captcha);
    console.log('Captcha entered');
    await page.waitForTimeout(500);

    // Take screenshot before submitting
    await page.screenshot({ path: 'before-submit.png', fullPage: true });
    console.log('Screenshot saved: before-submit.png');

    console.log('Submitting form...');
    
    // Get the CSRF token from the form
    const csrfToken = await page.$eval('#view_voters_list__token', el => el.value).catch(() => '');
    console.log('CSRF Token obtained:', csrfToken ? 'Yes' : 'No');

    // Instead of clicking the button, submit via fetch API with exact format
    const formData = new URLSearchParams({
      'view_voters_list[district]': district,
      'view_voters_list[localBody]': local_body,
      'view_voters_list[ward]': ward,
      'view_voters_list[pollingStation]': polling_station,
      'view_voters_list[language]': language,
      'view_voters_list[captcha]': captcha,
      'view_voters_list[_token]': csrfToken
    });

    console.log('Submitting form data...');
    
    // Submit the form using page.evaluate to make XHR request
    const submitResult = await page.evaluate(async (url, data) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: data
      });
      return {
        ok: response.ok,
        status: response.status,
        html: await response.text()
      };
    }, `${SEC_BASE_URL}/public/voters/list`, formData.toString());

    if (!submitResult.ok) {
      throw new Error(`Form submission failed with status ${submitResult.status}`);
    }

    console.log('Form submitted successfully via XHR');
    
    // The response should contain the voter list HTML
    // Parse it directly instead of waiting for page reload
    const voters = parseVotersTable(submitResult.html);

    if (voters.length === 0) {
      // Check for error messages in the response
      if (submitResult.html.includes('captcha') || submitResult.html.includes('Invalid')) {
        throw new Error('Invalid captcha. Please try again with correct captcha.');
      }
      return {
        error: 'No voters found',
        details: 'The form was submitted but no voter data could be extracted. Please verify your selections.'
      };
    }

    console.log(`Successfully extracted ${voters.length} voters`);

    return { voters };

  } catch (error) {
    console.error('Playwright extraction error:', error);
    
    // Take screenshot for debugging if possible
    if (page) {
      try {
        await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
        console.log('Error screenshot saved as error-screenshot.png');
      } catch (screenshotError) {
        console.error('Could not save screenshot:', screenshotError);
      }
    }

    return {
      error: error.message || 'Failed to extract voter list',
      details: error.stack
    };

  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
  }
}
