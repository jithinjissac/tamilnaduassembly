import { chromium } from 'playwright';
import { parseVotersTable } from './parser.js';
import { getProxyConfigWithFallback } from './proxyConfig.js';

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
    const proxyConfig = getProxyConfigWithFallback();
    const launchOptions = { 
      headless: false, // Set to false to see browser GUI
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    if (proxyConfig) {
      launchOptions.proxy = proxyConfig;
    }
    
    browser = await chromium.launch(launchOptions);

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
    });

    page = await context.newPage();

    // First, navigate to home page with Malayalam locale parameter to set cookie
    console.log('Setting locale to Malayalam via URL parameter...');
    await page.goto(`${SEC_BASE_URL}/?set_locale=ml`, { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });
    
    console.log('Malayalam locale set via URL, waiting...');
    await page.waitForTimeout(2000);
    
    // Verify cookie is set
    const cookies = await context.cookies();
    const localeCookie = cookies.find(c => c.name === 'set_locale');
    console.log('📍 Locale cookie:', localeCookie ? localeCookie.value : 'NOT SET');
    
    // Now navigate to the voter list page - it will be in Malayalam
    console.log('Navigating to SEC voter list page (should be in Malayalam now)...');
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
    const submitResult = await page.evaluate(async (params) => {
      const response = await fetch(params.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Cookie': 'set_locale=ml' // Include Malayalam locale in request
        },
        body: params.data,
        credentials: 'include' // Include cookies in request
      });
      return {
        ok: response.ok,
        status: response.status,
        html: await response.text()
      };
    }, { url: `${SEC_BASE_URL}/public/voters/list`, data: formData.toString() });

    if (!submitResult.ok) {
      throw new Error(`Form submission failed with status ${submitResult.status}`);
    }

    console.log('Form submitted successfully via XHR');
    
    // Save the response HTML for debugging
    const fs = await import('fs');
    await fs.promises.writeFile('response.html', submitResult.html, 'utf-8');
    console.log('Response HTML saved to response.html');
    
    // Inject the response HTML into the page to see the rendered form with Malayalam
    try {
      console.log('Injecting response HTML into page for screenshot...');
      await page.evaluate((html) => {
        // Create a container for the response
        const container = document.createElement('div');
        container.id = 'response-preview';
        container.innerHTML = html;
        document.body.appendChild(container);
      }, submitResult.html);
      
      await page.waitForTimeout(2000); // Wait for page to fully render
      
      // Take screenshot after form submission and page load
      const timestamp = Date.now();
      await page.screenshot({ path: `after-submit-${timestamp}.png`, fullPage: true });
      console.log(`📸 Screenshot saved after submission: after-submit-${timestamp}.png`);
    } catch (screenshotError) {
      console.error('Failed to save screenshot:', screenshotError);
    }
    
    // The response should contain the voter list HTML
    // Parse it directly instead of waiting for page reload
    const voters = parseVotersTable(submitResult.html);

    if (voters.length === 0) {
      // Check for error messages in the response
      if (submitResult.html.includes('captcha') || submitResult.html.includes('Invalid')) {
        throw new Error('Invalid captcha. Please try again with correct captcha.');
      }
      
      // Log a snippet of the response for debugging
      const snippet = submitResult.html.substring(0, 500);
      console.log('Response HTML snippet:', snippet);
      
      return {
        error: 'No voters found',
        details: 'The form was submitted but no voter data could be extracted. Please verify your selections. Check response.html for the full response.'
      };
    }

    console.log(`Successfully extracted ${voters.length} voters`);

    // Extract Malayalam polling station name from the response HTML
    let pollingStationMalayalam = null;
    try {
      const cheerio = await import('cheerio');
      const $ = cheerio.load(submitResult.html);
      
      console.log('Attempting to extract Malayalam polling station from response...');
      
      // Method 1: Look for polling station in headings or strong text
      const headings = $('h1, h2, h3, h4, h5, strong, b').toArray();
      for (const heading of headings) {
        const text = $(heading).text().trim();
        // Look for text that contains polling station patterns
        if (text.includes('പോളിംഗ്') || text.match(/^\d{3}\s*-\s*/)) {
          pollingStationMalayalam = text;
          console.log('📍 Found Malayalam polling station in heading:', pollingStationMalayalam);
          break;
        }
      }
      
      // Method 2: Look for the form with the selected polling station
      if (!pollingStationMalayalam) {
        const selectedOption = $('#view_voters_list_pollingStation option[selected]');
        if (selectedOption.length > 0) {
          pollingStationMalayalam = selectedOption.text().trim();
          console.log('📍 Found Malayalam polling station in selected option:', pollingStationMalayalam);
        } else {
          // Try to find it by matching the polling_station value
          const allOptions = $('#view_voters_list_pollingStation option');
          allOptions.each((i, el) => {
            const optionValue = $(el).attr('value');
            if (optionValue === polling_station) {
              pollingStationMalayalam = $(el).text().trim();
              console.log('📍 Found Malayalam polling station by matching value:', pollingStationMalayalam);
              return false; // break
            }
          });
        }
      }
      
      // Method 3: Look in table caption or station info elements
      if (!pollingStationMalayalam) {
        const caption = $('table caption, .polling-station-name, .station-info').text().trim();
        if (caption && caption.length > 0) {
          pollingStationMalayalam = caption;
          console.log('📍 Found Malayalam polling station in caption:', pollingStationMalayalam);
        }
      }
      
      if (!pollingStationMalayalam) {
        console.log('⚠️ Could not find Malayalam polling station name in response');
        console.log('Response HTML snippet:', submitResult.html.substring(0, 1000));
      }
    } catch (parseError) {
      console.error('Failed to parse Malayalam polling station:', parseError);
    }

    return { 
      voters,
      pollingStationMalayalam // Return the Malayalam polling station name from response
    };

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
