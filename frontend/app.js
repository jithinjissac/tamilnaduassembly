// Console Logging Control (Global)
(function() {
    let enabled = localStorage.getItem('consoleLoggingEnabled');
    if (enabled === null) enabled = 'true';
    enabled = enabled !== 'false';

    const originalConsole = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info
    };

    function updateConsoleState() {
        if (enabled) {
            console.log = originalConsole.log;
            console.error = originalConsole.error;
            console.warn = originalConsole.warn;
            console.info = originalConsole.info;
        } else {
            console.log = function(){};
            console.warn = function(){};
            console.info = function(){};
            console.error = originalConsole.error;
        }
    }

    window.toggleGlobalConsoleLogs = function(on) {
        enabled = !!on;
        localStorage.setItem('consoleLoggingEnabled', enabled);
        updateConsoleState();
    };

    updateConsoleState();

    // Listen for changes from other tabs/windows
    window.addEventListener('storage', function(e) {
        if (e.key === 'consoleLoggingEnabled') {
            enabled = e.newValue !== 'false';
            updateConsoleState();
        }
    });
})();

// Pre-warm captcha session on page load for instant captcha
let prewarmSessionId = null;

(function prewarmCaptchaOnLoad() {
    // Wait for page to fully load before prewarming
    window.addEventListener('load', async () => {
        try {
            console.log('🔥 Pre-warming captcha session...');
            const response = await fetch('/api/prewarm-captcha');
            const data = await response.json();
            
            if (data.success && data.sessionId) {
                prewarmSessionId = data.sessionId;
                sessionStorage.setItem('prewarmSessionId', prewarmSessionId);
                console.log('✅ Captcha pre-warmed:', prewarmSessionId);
            } else {
                console.log('⚠️ Captcha pre-warm skipped:', data.message);
            }
        } catch (error) {
            console.log('⚠️ Pre-warm failed (captcha will load on demand):', error.message);
        }
    });
})();

// API Base URL
const API_BASE = '/api';

// DOM Elements
const form = document.getElementById('voterForm');
const districtSelect = document.getElementById('district');
const localBodySelect = document.getElementById('localBody');
const wardSelect = document.getElementById('ward');
const pollingStationSelect = document.getElementById('pollingStation');
const languageSelect = document.getElementById('language');
const captchaInput = document.getElementById('captcha');
const captchaImage = document.getElementById('captchaImage');
const captchaLoader = document.getElementById('captchaLoader');
const refreshCaptchaBtn = document.getElementById('refreshCaptcha');
const submitBtn = document.getElementById('submitBtn');
const resetBtn = document.getElementById('resetBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const resultsContainer = document.getElementById('resultsContainer');
const resultsSummary = document.getElementById('resultsSummary');
const resultsTable = document.getElementById('resultsTable');
const exportJsonBtn = document.getElementById('exportJson');
const exportCsvBtn = document.getElementById('exportCsv');
const generateSlipsBtn = document.getElementById('generateSlips');

// State
let voterData = null;
let currentSessionId = null;

// Initialize - Load districts AND captcha in PARALLEL for maximum speed
(async function initializeApp() {
    console.log('🚀 Initializing app - loading districts and captcha in parallel...');
    
    // Setup event listeners first
    setupEventListeners();
    
    // Load districts AND captcha simultaneously (don't wait for each other)
    // This ensures captcha loads as fast as possible
    loadDistricts(); // Non-blocking
    loadCaptchaSession(); // Non-blocking - starts immediately
    
    console.log('✅ Both requests started in parallel for instant loading');
})();

// Fallback for DOMContentLoaded if script loads early
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM ready');
});

// Setup Event Listeners
function setupEventListeners() {
    districtSelect.addEventListener('change', handleDistrictChange);
    localBodySelect.addEventListener('change', handleLocalBodyChange);
    wardSelect.addEventListener('change', handleWardChange);
    pollingStationSelect.addEventListener('change', handlePollingStationChange);
    form.addEventListener('submit', handleSubmit);
    resetBtn.addEventListener('click', resetForm);
    exportJsonBtn.addEventListener('click', exportToJson);
    exportCsvBtn.addEventListener('click', exportToCsv);
    generateSlipsBtn.addEventListener('click', generateSlips);
}

// Load Districts
async function loadDistricts() {
    try {
        const response = await fetch(`${API_BASE}/getDistricts`);
        const data = await response.json();

        if (data.status === 'success') {
            populateSelect(districtSelect, data.districts, 'Select District');
        }
    } catch (error) {
        showError('Failed to load districts: ' + error.message);
    }
}

// Handle District Change
async function handleDistrictChange() {
    const districtId = districtSelect.value;

    // Reset dependent fields
    resetSelect(localBodySelect, 'Loading...');
    resetSelect(wardSelect, 'Select Local Body First');
    resetSelect(pollingStationSelect, 'Select Ward First');
    captchaImage.src = '';

    if (!districtId) return;

    try {
        const response = await fetch(`${API_BASE}/getLocalBodies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ district_id: districtId })
        });

        const data = await response.json();

        if (data.status === 'success') {
            populateSelect(localBodySelect, data.local_bodies, 'Select Local Body');
            localBodySelect.disabled = false;
        } else {
            showError('Failed to load local bodies');
        }
    } catch (error) {
        showError('Error loading local bodies: ' + error.message);
    }
}

// Handle Local Body Change
async function handleLocalBodyChange() {
    const localBodyId = localBodySelect.value;

    // Reset dependent fields
    resetSelect(wardSelect, 'Loading...');
    resetSelect(pollingStationSelect, 'Select Ward First');
    captchaImage.src = '';

    if (!localBodyId) return;

    try {
        const response = await fetch(`${API_BASE}/getWards`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ local_body_id: localBodyId })
        });

        const data = await response.json();

        if (data.status === 'success') {
            populateSelect(wardSelect, data.wards, 'Select Ward');
            wardSelect.disabled = false;
        } else {
            showError('Failed to load wards');
        }
    } catch (error) {
        showError('Error loading wards: ' + error.message);
    }
}

// Handle Ward Change
async function handleWardChange() {
    const wardId = wardSelect.value;

    // Reset dependent fields
    resetSelect(pollingStationSelect, 'Loading...');
    captchaImage.src = '';

    if (!wardId) return;

    try {
        const response = await fetch(`${API_BASE}/getPollingStations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ward_id: wardId })
        });

        const data = await response.json();

        if (data.status === 'success') {
            populateSelect(pollingStationSelect, data.polling_stations, 'Select Polling Station');
            pollingStationSelect.disabled = false;
        } else {
            showError('Failed to load polling stations');
        }
    } catch (error) {
        showError('Error loading polling stations: ' + error.message);
    }
}

// Handle Polling Station Change
function handlePollingStationChange() {
    if (pollingStationSelect.value) {
        loadCaptchaSession();
    }
}

// Load Captcha Session (initializes headless browser and gets captcha screenshot)
async function loadCaptchaSession() {
    try {
        console.log('Loading captcha session...');
        captchaImage.style.display = 'none';
        captchaLoader.style.display = 'flex';
        captchaImage.src = '';
        loadingIndicator.classList.remove('hidden');
        hideMessages();
        
        // Check if we have a pre-warmed session
        const sessionId = sessionStorage.getItem('prewarmSessionId');
        const url = sessionId 
            ? `${API_BASE}/initCaptchaSession?sessionId=${sessionId}`
            : `${API_BASE}/initCaptchaSession`;
        
        if (sessionId) {
            console.log('⚡ Using pre-warmed session for instant load!');
            sessionStorage.removeItem('prewarmSessionId'); // Use once
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        loadingIndicator.classList.add('hidden');
        
        if (data.status === 'success') {
            currentSessionId = data.sessionId;
            captchaImage.src = data.captchaUrl + '?t=' + Date.now();
            captchaImage.onload = () => {
                captchaLoader.style.display = 'none';
                captchaImage.style.display = 'block';
            };
            captchaInput.value = '';
            console.log('Captcha session initialized:', currentSessionId);
        } else {
            captchaLoader.style.display = 'none';
            showError('Failed to load captcha: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        loadingIndicator.classList.add('hidden');
        captchaLoader.style.display = 'none';
        showError('Error loading captcha: ' + error.message);
        console.error('Captcha load error:', error);
    }
}

// Load Captcha (kept for refresh button compatibility)
function loadCaptcha() {
    loadCaptchaSession();
}

// Parse HTML table to voter array
function parseTableToVoters(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const voters = [];
    
    // Find the table with voters-list tbody
    const rows = doc.querySelectorAll('tbody.voters-list tr');
    
    let skipSection = false; // Flag to skip "ഒഴിവാക്കലുകൾ" section
    
    rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        
        // Check if this is a section header row
        if (cells.length === 1 || cells[0?.getAttribute('colspan')]) {
            const headerText = row.textContent.trim();
            
            // Start skipping if we encounter "ഒഴിവാക്കലുകൾ" (Deletions)
            if (headerText.includes('ഒഴിവാക്കലുകൾ')) {
                skipSection = true;
                return;
            }
            
            // Stop skipping if we encounter other sections after deletions
            if (skipSection && (headerText.includes('കൂട്ടിച്ചേർക്കലുകൾ') || 
                                headerText.includes('തിരുത്തലുകൾ') || 
                                headerText.includes('പ്രവാസി വോട്ടർപട്ടിക'))) {
                skipSection = false;
            }
            
            return; // Skip header rows themselves
        }
        
        // Skip rows in the deletion section
        if (skipSection) {
            return;
        }
        
        // Parse data rows with 7 columns
        if (cells.length >= 7) {
            const genderAge = cells[5]?.textContent.trim() || '';
            const genderAgeParts = genderAge.split('/').map(s => s.trim());
            const voterName = cells[1]?.textContent.trim() || '';
            
            // Skip rows where name contains "DELETED" or "SHIFTED"
            if (voterName.toUpperCase().includes('DELETED') || 
                voterName.toUpperCase().includes('SHIFTED')) {
                return;
            }
            
            voters.push({
                sl_no: cells[0]?.textContent.trim().replace(/\D/g, '') || '',
                name: voterName,
                guardian_name: cells[2]?.textContent.trim() || '',
                house_no: cells[3]?.textContent.trim() || '',
                house_name: cells[4]?.textContent.trim() || '',
                gender: genderAgeParts[0] || '',
                age: genderAgeParts[1] || '',
                sec_id: cells[6]?.textContent.trim() || ''
            });
        }
    });
    
    return voters;
}

// Handle Form Submit
async function handleSubmit(e) {
    e.preventDefault();

    hideMessages();
    resultsContainer.classList.add('hidden');

    // Validate session ID
    if (!currentSessionId) {
        showError('Please wait for captcha to load or refresh it');
        return;
    }

    const formData = {
        sessionId: currentSessionId,
        district: districtSelect.value,
        local_body: localBodySelect.value,
        ward: wardSelect.value,
        polling_station: pollingStationSelect.value,
        language: languageSelect.value,
        captcha: captchaInput.value.trim()
    };

    // Validate
    if (!formData.captcha) {
        showError('Please enter the captcha');
        return;
    }

    submitBtn.disabled = true;
    loadingIndicator.classList.remove('hidden');

    try {
        const response = await fetch(`${API_BASE}/submitWithCaptcha`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.status === 'success') {
            // Parse the HTML response to extract voter data
            const voters = parseTableToVoters(data.html);
            voterData = {
                status: 'success',
                total_voters: voters.length,
                voters: voters
            };
            displayResults(voterData);
            showSuccess(`Successfully extracted ${voters.length} voters!`);
        } else {
            showError(data.message || 'Failed to extract voter data');
            loadCaptcha(); // Refresh captcha on error
        }
    } catch (error) {
        showError('Error extracting voters: ' + error.message);
        loadCaptcha(); // Refresh captcha on error
    } finally {
        submitBtn.disabled = false;
        loadingIndicator.classList.add('hidden');
    }
}

// Display Results
function displayResults(data) {
    // Summary
    resultsSummary.innerHTML = `
        <h3>📍 Location Details</h3>
        <p><strong>District:</strong> ${districtSelect.options[districtSelect.selectedIndex].text}</p>
        <p><strong>Local Body:</strong> ${localBodySelect.options[localBodySelect.selectedIndex].text}</p>
        <p><strong>Ward:</strong> ${wardSelect.options[wardSelect.selectedIndex].text}</p>
        <p><strong>Polling Station:</strong> ${pollingStationSelect.options[pollingStationSelect.selectedIndex].text}</p>
        <p><strong>Language:</strong> Malayalam</p>
        <p><strong>Total Voters:</strong> ${data.total_voters}</p>
    `;

    // Table
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>S.No</th>
                    <th>Name</th>
                    <th>Guardian</th>
                    <th>House No</th>
                    <th>House Name</th>
                    <th>Gender/Age</th>
                    <th>SEC ID</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.voters.forEach((voter, index) => {
        tableHTML += `
            <tr>
                <td>${voter.sl_no || index + 1}</td>
                <td>${voter.name || '-'}</td>
                <td>${voter.guardian_name || '-'}</td>
                <td>${voter.house_no || '-'}</td>
                <td>${voter.house_name || '-'}</td>
                <td>${voter.gender || '-'} / ${voter.age || '-'}</td>
                <td>${voter.sec_id || '-'}</td>
            </tr>
        `;
    });

    tableHTML += '</tbody></table>';
    resultsTable.innerHTML = tableHTML;
    resultsContainer.classList.remove('hidden');
}

// Export to JSON
function exportToJson() {
    if (!voterData) return;

    const dataStr = JSON.stringify(voterData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `voters_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

// Export to CSV
function exportToCsv() {
    if (!voterData) return;

    let csv = 'Serial,Name,Guardian,House No,House Name,Gender/Age,SEC ID\n';

    voterData.voters.forEach(voter => {
        csv += `"${voter.serial || ''}","${voter.name || ''}","${voter.guardian || ''}","${voter.house_no || ''}","${voter.house_name || ''}","${voter.gender_age || ''}","${voter.sec_id || ''}"\n`;
    });

    const dataBlob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `voters_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

// Generate Voter Slips
function generateSlips() {
    if (!voterData || !voterData.voters || voterData.voters.length === 0) {
        showError('No voter data available to generate slips');
        return;
    }

    // Prepare voter data with gender_age field for slips
    const slipData = voterData.voters.map(voter => ({
        sl_no: voter.sl_no,
        name: voter.name,
        guardian_name: voter.guardian_name,
        house_no: voter.house_no,
        house_name: voter.house_name,
        gender_age: `${voter.gender}/${voter.age}`,
        sec_id: voter.sec_id
    }));

    // Store data in sessionStorage
    sessionStorage.setItem('voterSlipData', JSON.stringify(slipData));
    
    // Store polling station info
    const pollingStationInfo = {
        district: districtSelect.options[districtSelect.selectedIndex].text,
        localBody: localBodySelect.options[localBodySelect.selectedIndex].text,
        ward: wardSelect.options[wardSelect.selectedIndex].text,
        station: pollingStationSelect.options[pollingStationSelect.selectedIndex].text
    };
    sessionStorage.setItem('pollingStationInfo', JSON.stringify(pollingStationInfo));

    // Navigate to slips page
    window.location.href = 'slips.html';
}

// Utility Functions
function populateSelect(selectElement, options, placeholder) {
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    options.forEach(option => {
        const optElement = document.createElement('option');
        optElement.value = option.value;
        optElement.textContent = option.text;
        selectElement.appendChild(optElement);
    });
}

function resetSelect(selectElement, placeholder) {
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    selectElement.disabled = true;
}

function resetForm() {
    form.reset();
    resetSelect(localBodySelect, 'Select District First');
    resetSelect(wardSelect, 'Select Local Body First');
    resetSelect(pollingStationSelect, 'Select Ward First');
    captchaImage.src = '';
    hideMessages();
    resultsContainer.classList.add('hidden');
    voterData = null;
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}

function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.classList.remove('hidden');
}

function hideMessages() {
    errorMessage.classList.add('hidden');
    successMessage.classList.add('hidden');
}
