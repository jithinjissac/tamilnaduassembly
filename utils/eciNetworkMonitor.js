/**
 * ECI Network Traffic Monitor
 * Captures API endpoints and automates data extraction by using actual API calls
 */

import { chromium } from 'playwright';
import axios from 'axios';
import { logger } from './logger.js';

const ECI_BASE_URL = 'https://voters.eci.gov.in';

// Store discovered API endpoints
const discoveredAPIs = {
    endpoints: {},
    lastDiscovered: null
};

/**
 * Monitor network traffic and discover API endpoints
 */
export const monitorECINetworkTraffic = async (stateCode = 'S11') => {
    logger.info('🔍 Starting ECI network traffic monitoring...');
    
    const browser = await chromium.launch({ 
        headless: false, // Show browser to see what's happening
        slowMo: 500 
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const capturedRequests = [];
    const capturedResponses = [];
    
    // Intercept all requests
    page.on('request', request => {
        const url = request.url();
        const method = request.method();
        const resourceType = request.resourceType();
        
        // Capture API calls
        if (
            method === 'POST' || 
            url.includes('/api/') || 
            url.includes('eroll') ||
            url.includes('constituency') ||
            url.includes('district') ||
            url.includes('ac-') ||
            url.includes('year') ||
            url.includes('rolltype') ||
            resourceType === 'fetch' ||
            resourceType === 'xhr'
        ) {
            const requestData = {
                url,
                method,
                resourceType,
                headers: request.headers(),
                postData: request.postData()
            };
            
            capturedRequests.push(requestData);
            
            logger.info(`📤 REQUEST: ${method} ${url}`);
            if (request.postData()) {
                logger.info(`   Payload: ${request.postData()}`);
            }
        }
    });
    
    // Intercept all responses
    page.on('response', async response => {
        const url = response.url();
        const request = response.request();
        const status = response.status();
        
        // Capture API responses
        if (
            request.method() === 'POST' || 
            url.includes('/api/') || 
            url.includes('eroll') ||
            url.includes('constituency') ||
            url.includes('district') ||
            url.includes('ac-') ||
            request.resourceType() === 'fetch' ||
            request.resourceType() === 'xhr'
        ) {
            try {
                const contentType = response.headers()['content-type'] || '';
                
                if (contentType.includes('application/json')) {
                    const responseData = await response.json();
                    
                    const responseRecord = {
                        url,
                        method: request.method(),
                        status,
                        requestPayload: request.postData(),
                        responseData
                    };
                    
                    capturedResponses.push(responseRecord);
                    
                    logger.info(`📥 RESPONSE: ${status} ${url}`);
                    logger.info(`   Data: ${JSON.stringify(responseData).substring(0, 200)}...`);
                }
            } catch (e) {
                // Not JSON or couldn't parse
            }
        }
    });
    
    try {
        // Navigate to the page
        logger.info(`🌐 Navigating to ${ECI_BASE_URL}/download-eroll?stateCode=${stateCode}`);
        await page.goto(`${ECI_BASE_URL}/download-eroll?stateCode=${stateCode}`, { 
            waitUntil: 'networkidle', 
            timeout: 30000 
        });
        
        await page.waitForTimeout(3000);
        logger.info('✅ Page loaded');
        
        // Interact with dropdowns to trigger API calls
        logger.info('🔄 Interacting with page elements to trigger API calls...');
        
        // Select state
        try {
            await page.selectOption('select[aria-label="Select State"]', stateCode);
            await page.waitForTimeout(2000);
            logger.info(`✅ Selected state: ${stateCode}`);
        } catch (e) {
            logger.warn('State already selected or not needed');
        }
        
        // Select year
        try {
            const yearOptions = await page.$$('select[aria-label="Select Year of Revision"] option');
            if (yearOptions.length > 1) {
                const yearValue = await yearOptions[1].getAttribute('value');
                if (yearValue) {
                    await page.selectOption('select[aria-label="Select Year of Revision"]', yearValue);
                    await page.waitForTimeout(2000);
                    logger.info(`✅ Selected year: ${yearValue}`);
                }
            }
        } catch (e) {
            logger.warn('Could not select year:', e.message);
        }
        
        // Select roll type
        try {
            const rollTypeOptions = await page.$$('select[aria-label="Select Roll Type"] option');
            if (rollTypeOptions.length > 1) {
                const rollTypeValue = await rollTypeOptions[1].getAttribute('value');
                if (rollTypeValue) {
                    await page.selectOption('select[aria-label="Select Roll Type"]', rollTypeValue);
                    await page.waitForTimeout(2000);
                    logger.info(`✅ Selected roll type: ${rollTypeValue}`);
                }
            }
        } catch (e) {
            logger.warn('Could not select roll type:', e.message);
        }
        
        // Select district
        try {
            const districtOptions = await page.$$('select[aria-label="Select District"] option');
            if (districtOptions.length > 1) {
                const districtValue = await districtOptions[1].getAttribute('value');
                if (districtValue) {
                    await page.selectOption('select[aria-label="Select District"]', districtValue);
                    await page.waitForTimeout(2000);
                    logger.info(`✅ Selected district: ${districtValue}`);
                }
            }
        } catch (e) {
            logger.warn('Could not select district:', e.message);
        }
        
        // Try to interact with constituency autocomplete
        try {
            const constituencyInput = await page.$('input[aria-label*="Constituency"], input[placeholder*="Constituency"]');
            if (constituencyInput) {
                await constituencyInput.click();
                await page.waitForTimeout(1000);
                await constituencyInput.fill('');
                await page.keyboard.press('ArrowDown');
                await page.waitForTimeout(2000);
                logger.info('✅ Triggered constituency autocomplete');
            }
        } catch (e) {
            logger.warn('Could not interact with constituency field:', e.message);
        }
        
        logger.info('\n⏰ Keeping browser open for 30 seconds for manual interaction...');
        logger.info('💡 Try selecting different options to capture more API calls\n');
        await page.waitForTimeout(30000);
        
        await browser.close();
        
        // Analyze captured traffic
        logger.info('\n========== CAPTURED NETWORK TRAFFIC ==========');
        logger.info(`\n📊 Total Requests Captured: ${capturedRequests.length}`);
        logger.info(`📊 Total Responses Captured: ${capturedResponses.length}\n`);
        
        // Group by endpoint
        const endpointGroups = {};
        capturedRequests.forEach(req => {
            const url = new URL(req.url);
            const path = url.pathname;
            
            if (!endpointGroups[path]) {
                endpointGroups[path] = [];
            }
            endpointGroups[path].push(req);
        });
        
        logger.info('🔗 Discovered Endpoints:');
        Object.keys(endpointGroups).forEach(path => {
            const requests = endpointGroups[path];
            logger.info(`\n  ${path}`);
            logger.info(`    Method: ${requests[0].method}`);
            logger.info(`    Calls: ${requests.length}`);
            if (requests[0].postData) {
                logger.info(`    Sample Payload: ${requests[0].postData.substring(0, 100)}`);
            }
        });
        
        // Save detailed logs
        logger.info('\n📝 Detailed Request Logs:');
        capturedRequests.forEach((req, i) => {
            logger.info(`\n${i + 1}. ${req.method} ${req.url}`);
            if (req.postData) {
                logger.info(`   Payload: ${req.postData}`);
            }
        });
        
        logger.info('\n📝 Detailed Response Logs:');
        capturedResponses.forEach((res, i) => {
            logger.info(`\n${i + 1}. ${res.status} ${res.method} ${res.url}`);
            if (res.requestPayload) {
                logger.info(`   Request: ${res.requestPayload}`);
            }
            logger.info(`   Response: ${JSON.stringify(res.responseData, null, 2)}`);
        });
        
        // Store discovered APIs
        discoveredAPIs.endpoints = endpointGroups;
        discoveredAPIs.responses = capturedResponses;
        discoveredAPIs.lastDiscovered = new Date();
        
        logger.info('\n========== END OF CAPTURE ==========\n');
        
        return {
            requests: capturedRequests,
            responses: capturedResponses,
            endpoints: endpointGroups
        };
        
    } catch (error) {
        logger.error('Error during network monitoring:', error);
        await browser.close();
        throw error;
    }
};

/**
 * Use discovered API endpoints directly (if available)
 */
export const fetchDataFromDiscoveredAPI = async (endpointType, payload) => {
    // Check if we have discovered endpoints
    if (!discoveredAPIs.endpoints || Object.keys(discoveredAPIs.endpoints).length === 0) {
        throw new Error('No API endpoints discovered yet. Run monitorECINetworkTraffic() first.');
    }
    
    // Find matching endpoint
    const matchingResponse = discoveredAPIs.responses.find(res => 
        res.url.toLowerCase().includes(endpointType.toLowerCase())
    );
    
    if (!matchingResponse) {
        throw new Error(`No API endpoint found for: ${endpointType}`);
    }
    
    // Make direct API call
    try {
        const response = await axios({
            method: matchingResponse.method,
            url: matchingResponse.url,
            data: payload || matchingResponse.requestPayload,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        return response.data;
    } catch (error) {
        logger.error(`Error calling discovered API: ${error.message}`);
        throw error;
    }
};

/**
 * Get discovered API information
 */
export const getDiscoveredAPIs = () => {
    return discoveredAPIs;
};

export default {
    monitorECINetworkTraffic,
    fetchDataFromDiscoveredAPI,
    getDiscoveredAPIs
};
