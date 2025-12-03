import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import fs from 'fs';
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

  let page;

  try {
    console.log('Launching browser...');
    const proxyConfig = getProxyConfigWithFallback();
    const options = new chrome.Options();
    
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-setuid-sandbox');
    options.addArguments('--disable-blink-features=AutomationControlled');
    
    if (proxyConfig && proxyConfig.server) {
      options.addArguments(`--proxy-server=${proxyConfig.server}`);
    }
    
    page = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    // Execute anti-detection script
    await page.executeScript(`
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    `);

    // First, navigate to home page with Malayalam locale parameter to set cookie
    console.log('Setting locale to Malayalam via URL parameter...');
    await page.get(`${SEC_BASE_URL}/?set_locale=ml`);
    
    console.log('Malayalam locale set via URL, waiting...');
    await page.sleep(2000);
    
    // Verify cookie is set
    const cookies = await page.manage().getCookies();
    const localeCookie = cookies.find(c => c.name === 'set_locale');
    console.log('📍 Locale cookie:', localeCookie ? localeCookie.value : 'NOT SET');
    
    // Now navigate to the voter list page - it will be in Malayalam
    console.log('Navigating to SEC voter list page (should be in Malayalam now)...');
    await page.get(`${SEC_BASE_URL}/public/voters/list`);
    
    // Wait for the page to be fully loaded and interactive
    await page.sleep(3000); // Give extra time for JavaScript to initialize
    console.log('Page loaded with Malayalam locale');

    // Wait for the district dropdown to be visible and enabled
    console.log('Waiting for district dropdown to be visible...');
    await page.wait(until.elementLocated(By.id('view_voters_list_district')), 10000);
    
    // Take screenshot after page load to verify language
    const screenshot = await page.takeScreenshot();
    await fs.promises.writeFile('page-loaded.png', screenshot, 'base64');
    console.log('Screenshot saved: page-loaded.png');

    console.log('Filling form fields...');
    
    // Make district dropdown visible if needed
    await page.executeScript(`
      const select = document.querySelector('#view_voters_list_district');
      if (select) {
        select.scrollIntoView();
        select.style.display = 'block';
        select.style.visibility = 'visible';
      }
    `);
    await page.sleep(1000);

    // Select district
    console.log('Selecting district...');
    const districtSelect = await page.findElement(By.id('view_voters_list_district'));
    await page.executeScript(`arguments[0].value = '${district}'; arguments[0].dispatchEvent(new Event('change'));`, districtSelect);
    console.log('District selected, waiting for local bodies...');
    await page.sleep(2000);

    // Wait for local body options to load
    await page.wait(until.elementLocated(By.css('#view_voters_list_localBody option:not([value=""])')), 15000);
    const localBodySelect = await page.findElement(By.id('view_voters_list_localBody'));
    await page.executeScript(`arguments[0].value = '${local_body}'; arguments[0].dispatchEvent(new Event('change'));`, localBodySelect);
    console.log('Local body selected, waiting for wards...');
    await page.sleep(2000);

    // Wait for ward options to load
    await page.wait(until.elementLocated(By.css('#view_voters_list_ward option:not([value=""])')), 15000);
    const wardSelect = await page.findElement(By.id('view_voters_list_ward'));
    await page.executeScript(`arguments[0].value = '${ward}'; arguments[0].dispatchEvent(new Event('change'));`, wardSelect);
    console.log('Ward selected, waiting for polling stations...');
    await page.sleep(2000);

    // Wait for polling station options to load
    await page.wait(until.elementLocated(By.css('#view_voters_list_pollingStation option:not([value=""])')), 15000);
    const stationSelect = await page.findElement(By.id('view_voters_list_pollingStation'));
    await page.executeScript(`arguments[0].value = '${polling_station}'; arguments[0].dispatchEvent(new Event('change'));`, stationSelect);
    console.log('Polling station selected');
    await page.sleep(1000);

    // Select language
    const langSelect = await page.findElement(By.id('view_voters_list_language'));
    await page.executeScript(`arguments[0].value = '${language}'; arguments[0].dispatchEvent(new Event('change'));`, langSelect);
    await page.sleep(500);

    // Fill captcha
    const captchaInput = await page.findElement(By.id('view_voters_list_captcha'));
    await captchaInput.sendKeys(captcha);
    console.log('Captcha entered');
    await page.sleep(500);

    // Take screenshot before submitting
    const beforeSubmitImg = await page.takeScreenshot();
    await fs.promises.writeFile('before-submit.png', beforeSubmitImg, 'base64');
    console.log('Screenshot saved: before-submit.png');

    console.log('Submitting form...');
    
    // Get the CSRF token from the form
    const csrfToken = await page.executeScript(
      "return document.querySelector('#view_voters_list__token')?.value || '';"
    );
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
    
    // Submit the form using executeScript to make XHR request
    const submitResult = await page.executeScript(
      async (params) => {
        const response = await fetch(params.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': 'set_locale=ml'
          },
          body: params.data,
          credentials: 'include'
        });
        return {
          ok: response.ok,
          status: response.status,
          html: await response.text()
        };
      },
      { url: `${SEC_BASE_URL}/public/voters/list`, data: formData.toString() }
    );

    if (!submitResult.ok) {
      throw new Error(`Form submission failed with status ${submitResult.status}`);
    }

    console.log('Form submitted successfully via XHR');
    
    // Save the response HTML for debugging
    await fs.promises.writeFile('response.html', submitResult.html, 'utf-8');
    console.log('Response HTML saved to response.html');
    
    // Inject the response HTML into the page to see the rendered form with Malayalam
    try {
      console.log('Injecting response HTML into page for screenshot...');
      await page.executeScript(
        (html) => {
          const container = document.createElement('div');
          container.id = 'response-preview';
          container.innerHTML = html;
          document.body.appendChild(container);
        },
        submitResult.html
      );
      
      await page.sleep(2000);
      
      // Take screenshot after form submission and page load
      const timestamp = Date.now();
      const afterSubmitImg = await page.takeScreenshot();
      await fs.promises.writeFile(`after-submit-${timestamp}.png`, afterSubmitImg, 'base64');
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
        const errorImg = await page.takeScreenshot();
        await fs.promises.writeFile('error-screenshot.png', errorImg, 'base64');
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
    if (page) {
      await page.quit();
      console.log('Browser closed');
    }
  }
}
