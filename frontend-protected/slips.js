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

// Voter Information Slip Generator

// BJP logo as base64 (lotus symbol with saffron background)
const BJP_LOGO = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPGRlZnM+CiAgICA8cmFkaWFsR3JhZGllbnQgaWQ9ImJnR3JhZGllbnQiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdHlsZT0ic3RvcC1jb2xvcjojRkY5OTMzO3N0b3Atb3BhY2l0eToxIiAvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNGRjY2MDA7c3RvcC1vcGFjaXR5OjEiIC8+CiAgICA8L3JhZGlhbEdyYWRpZW50PgogIDwvZGVmcz4KICA8Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0OCIgZmlsbD0idXJsKCNiZ0dyYWRpZW50KSIgc3Ryb2tlPSIjODAwMDAwIiBzdHJva2Utd2lkdGg9IjIiLz4KICA8IS0tIExvdHVzIHBldGFscyAtLT4KICA8cGF0aCBkPSJNIDUwIDI1IFEgNDAgMzAgNDAgNDUgUSA0MCA1NSA1MCA2MCBRIDYwIDU1IDYwIDQ1IFEgNjAgMzAgNTAgMjUgWiIgZmlsbD0iI0ZGRiIgb3BhY2l0eT0iMC45Ii8+CiAgPHBhdGggZD0iTSAzNSAzNSBRIDMwIDQwIDMwIDUwIFEgMzAgNjAgNDAgNjUgUSA0NSA2MCA0NSA1MCBRIDQ1IDQwIDM1IDM1IFoiIGZpbGw9IiNGRkYiIG9wYWNpdHk9IjAuOSIvPgogIDxwYXRoIGQ9Ik0gNjUgMzUgUSA3MCA0MCA3MCA1MCBRIDcwIDYwIDYwIDY1IFEgNTUgNjAgNTUgNTAgUSA1NSA0MCA2NSAzNSBaIiBmaWxsPSIjRkZGIiBvcGFjaXR5PSIwLjkiLz4KICA8cGF0aCBkPSJNIDUwIDcwIFEgNDAgNjUgMzUgNTUgUSAzNSA1MCA0MCA0NSBRIDQ1IFEgNTAgNTAgNTUgNDUgSCA2MCBRIDY1IDUwIDY1IDU1IFEgNjAgNjUgNTAgNzAgWiIgZmlsbD0iI0ZGRiIgb3BhY2l0eT0iMC45Ii8+CiAgPGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iOCIgZmlsbD0iI0ZGQzkzMyIvPgo8L3N2Zz4=';

// Load voter data from sessionStorage
let voterData = [];
let pollingStationInfo = {};

window.addEventListener('DOMContentLoaded', () => {
    loadVoterData();
    generateSlips();
    
    // Setup event listeners
    document.getElementById('printBtn').addEventListener('click', () => {
        window.print();
    });
    
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = 'index.html';
    });
});

function loadVoterData() {
    try {
        const storedData = sessionStorage.getItem('voterSlipData');
        const storedStation = sessionStorage.getItem('pollingStationInfo');
        
        if (!storedData) {
            alert('വോട്ടർ ഡാറ്റ കണ്ടെത്തിയില്ല. ദയവായി മുൻപേജിൽ നിന്ന് വീണ്ടും തിരഞ്ഞെടുക്കുക.');
            window.location.href = 'index.html';
            return;
        }
        
        voterData = JSON.parse(storedData);
        pollingStationInfo = storedStation ? JSON.parse(storedStation) : {
            district: '',
            localBody: '',
            ward: '',
            station: ''
        };
        
        console.log('Loaded voter data:', voterData.length, 'voters');
    } catch (error) {
        console.error('Error loading voter data:', error);
        alert('ഡാറ്റ ലോഡ് ചെയ്യുന്നതിൽ പിശക്');
    }
}

function generateSlips() {
    const slipsContainer = document.getElementById('slipsContainer');
    slipsContainer.innerHTML = '';

    // Check for 6 slips per page mode (e.g., from sessionStorage or a setting)
    let slipsPerPage = 5;
    if (sessionStorage.getItem('slipsPerPage') === '6') {
        slipsPerPage = 6;
    }
    const totalPages = Math.ceil(voterData.length / slipsPerPage);

    for (let pageNum = 0; pageNum < totalPages; pageNum++) {
        const page = document.createElement('div');
        page.className = 'page' + (slipsPerPage === 6 ? ' six-per-page' : '');

        const startIdx = pageNum * slipsPerPage;
        const endIdx = Math.min(startIdx + slipsPerPage, voterData.length);

        for (let i = startIdx; i < endIdx; i++) {
            const voter = voterData[i];
            createVoterSlipAsync(voter, i + 1).then(slip => {
                page.appendChild(slip);
            });
        }

        slipsContainer.appendChild(page);
    }

    console.log(`Generated ${totalPages} pages with ${voterData.length} slips`);
}

async function createVoterSlipAsync(voter, serialNo) {
    const slip = document.createElement('div');
    slip.className = 'voter-slip';
    
    // Extract gender and age from gender/age field
    let gender = '';
    let age = '';
    if (voter.gender_age) {
        const match = voter.gender_age.match(/([^/]+)\/(\d+)/);
        if (match) {
            gender = match[1].trim();
            age = match[2].trim();
        }
    }
    
    // Get transliterated polling station info
    const pollingStationText = await formatPollingStationAsync();
    
    slip.innerHTML = `
        <div class="slip-left">
            <div class="symbol-text">നമ്മുടെ ചിഹ്നം</div>
            <img src="${BJP_LOGO}" alt="BJP Logo" class="party-logo">
            <div class="party-name-ml">ഭാരതീയ ജനതാ പാർട്ടി</div>
        </div>
        <div class="slip-right">
            <div class="slip-header">
                <div class="slip-number">ക്രമ നമ്പർ: ${serialNo}</div>
                <div class="sec-id">കാർഡ് നമ്പർ: ${voter.sec_id || 'N/A'}</div>
            </div>
            <div class="voter-info">
                <div class="info-row">
                    <span class="info-label">പേര്:</span>
                    <span class="info-value">${voter.name || 'N/A'} ${gender ? `(${gender})` : ''} ${age ? `${age} വയസ്സ്` : ''}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">വീട്ടുപേര് :</span>
                    <span class="info-value">${voter.house_name || ''} ${voter.house_no ? `(${voter.house_no})` : ''}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">രക്ഷിതാവ്:</span>
                    <span class="info-value">${voter.guardian_name || 'N/A'}</span>
                </div>
            </div>
            <div class="polling-station-info">
                <strong>പോളിംഗ് സ്റ്റേഷൻ:</strong> ${pollingStationText}
            </div>
        </div>
    `;
    
    return slip;
}

function formatPollingStation() {
    const parts = [];
    
    if (pollingStationInfo.station) {
        parts.push(transliterateToMalayalam(pollingStationInfo.station));
    }
    
    if (pollingStationInfo.ward) {
        parts.push(`വാർഡ്: ${transliterateToMalayalam(pollingStationInfo.ward)}`);
    }
    
    if (pollingStationInfo.localBody) {
        parts.push(transliterateToMalayalam(pollingStationInfo.localBody));
    }
    
    if (pollingStationInfo.district) {
        parts.push(transliterateToMalayalam(pollingStationInfo.district));
    }
    
    // Since transliterateToMalayalam is now async, we need to handle promises
    // Return a placeholder for now and update in generateSlips
    return parts.length > 0 ? parts.join(', ') : 'വിവരങ്ങൾ ലഭ്യമല്ല';
}

async function formatPollingStationAsync() {
    const parts = [];
    
    if (pollingStationInfo.station) {
        // Only transliterate the station name (remove number prefix if exists)
        const stationMatch = pollingStationInfo.station.match(/^(\d+\s*-\s*)?(.*)/);
        if (stationMatch) {
            const numberPrefix = stationMatch[1] || '';
            const stationName = stationMatch[2] || pollingStationInfo.station;
            const transliterated = await transliterateToMalayalam(stationName);
            parts.push(numberPrefix + transliterated);
        } else {
            parts.push(await transliterateToMalayalam(pollingStationInfo.station));
        }
    }
    
    return parts.length > 0 ? parts.join(', ') : 'വിവരങ്ങൾ ലഭ്യമല്ല';
}

// Transliterate English text to Malayalam using Google Input Tools API
async function transliterateToMalayalam(text) {
    if (!text) return '';
    
    // Check if text already contains Malayalam characters (more than 50% Malayalam)
    const malayalamChars = (text.match(/[\u0D00-\u0D7F]/g) || []).length;
    if (malayalamChars > text.length * 0.5) {
        return text; // Already mostly Malayalam, return as is
    }
    
    // Try using Google Input Tools API
    try {
        const response = await fetch('https://inputtools.google.com/request?text=' + encodeURIComponent(text) + '&itc=ml-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8');
        const data = await response.json();
        
        if (data && data[1] && data[1][0] && data[1][0][1] && data[1][0][1][0]) {
            return data[1][0][1][0];
        }
    } catch (error) {
        console.warn('Google Input Tools API failed, using fallback:', error);
    }
    
    // Fallback: Word-based translation
    return fallbackTransliteration(text);
}

// Fallback transliteration function
function fallbackTransliteration(text) {
    if (!text) return '';
    
    // Check if text already contains Malayalam characters (more than 50% Malayalam)
    const malayalamChars = (text.match(/[\u0D00-\u0D7F]/g) || []).length;
    if (malayalamChars > text.length * 0.5) {
        return text; // Already mostly Malayalam, return as is
    }
    
    // Common word mappings (case-insensitive)
    const wordMap = {
        // School types
        'school': 'സ്‌കൂൾ',
        'high school': 'ഹൈസ്‌കൂൾ',
        'higher secondary school': 'ഹയർ സെക്കൻഡറി സ്‌കൂൾ',
        'upper primary school': 'അപ്പർ പ്രൈമറി സ്‌കൂൾ',
        'lower primary school': 'ലോവർ പ്രൈമറി സ്‌കൂൾ',
        'up school': 'യു.പി സ്‌കൂൾ',
        'lp school': 'എൽ.പി സ്‌കൂൾ',
        'hss': 'എച്ച്.എസ്.എസ്',
        
        // Government/Organization
        'government': 'ഗവൺമെന്റ്',
        'govt': 'ഗവ.',
        'corporation': 'കോർപ്പറേഷൻ',
        'municipal': 'മുനിസിപ്പൽ',
        'municipality': 'മുനിസിപ്പാലിറ്റി',
        'panchayat': 'പഞ്ചായത്ത്',
        'grama panchayat': 'ഗ്രാമ പഞ്ചായത്ത്',
        'block panchayat': 'ബ്ലോക്ക് പഞ്ചായത്ത്',
        
        // Locations
        'ward': 'വാർഡ്',
        'polling station': 'പോളിംഗ് സ്റ്റേഷൻ',
        'booth': 'ബൂത്ത്',
        'north': 'നോർത്ത്',
        'south': 'സൗത്ത്',
        'east': 'ഈസ്റ്റ്',
        'west': 'വെസ്റ്റ്',
        'central': 'സെൻട്രൽ',
        
        // Buildings
        'office': 'ഓഫീസ്',
        'hall': 'ഹാൾ',
        'auditorium': 'ഓഡിറ്റോറിയം',
        'building': 'ബിൽഡിംഗ്',
        'complex': 'കോംപ്ലക്സ്',
        'center': 'സെന്റർ',
        'centre': 'സെന്റർ',
        
        // Religious places
        'temple': 'ക്ഷേത്രം',
        'church': 'പള്ളി',
        'mosque': 'മസ്ജിദ്',
        
        // Common words
        'upper': 'അപ്പർ',
        'lower': 'ലോവർ',
        'new': 'ന്യൂ',
        'old': 'ഓൾഡ്',
        'public': 'പബ്ലിക്',
        'private': 'പ്രൈവറ്റ്',
        'aided': 'എയ്ഡഡ്',
        'unaided': 'അൺഎയ്ഡഡ്',
        'primary': 'പ്രൈമറി',
        'secondary': 'സെക്കൻഡറി',
        'junior': 'ജൂനിയർ',
        'senior': 'സീനിയർ'
    };
    
    // Districts of Kerala
    const districts = {
        'thiruvananthapuram': 'തിരുവനന്തപുരം',
        'kollam': 'കൊല്ലം',
        'pathanamthitta': 'പത്തനംതിട്ട',
        'alappuzha': 'ആലപ്പുഴ',
        'kottayam': 'കോട്ടയം',
        'idukki': 'ഇടുക്കി',
        'ernakulam': 'എറണാകുളം',
        'thrissur': 'തൃശൂർ',
        'palakkad': 'പാലക്കാട്',
        'malappuram': 'മലപ്പുറം',
        'kozhikode': 'കോഴിക്കോട്',
        'wayanad': 'വയനാട്',
        'kannur': 'കണ്ണൂർ',
        'kasaragod': 'കാസർഗോഡ്'
    };
    
    let result = text;
    
    // Replace districts first (longer matches)
    for (const [eng, mal] of Object.entries(districts)) {
        const regex = new RegExp(`\\b${eng}\\b`, 'gi');
        result = result.replace(regex, mal);
    }
    
    // Replace common words
    for (const [eng, mal] of Object.entries(wordMap)) {
        const regex = new RegExp(`\\b${eng}\\b`, 'gi');
        result = result.replace(regex, mal);
    }
    
    return result;
}
