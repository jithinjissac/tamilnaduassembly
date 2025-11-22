const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

// Minimal safe obfuscation for production
const safeObfuscatorOptions = {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    debugProtectionInterval: 0,
    disableConsoleOutput: false, // Keep console working
    identifierNamesGenerator: 'mangled', // Safer than hex
    log: false,
    renameGlobals: false,
    rotateStringArray: true,
    selfDefending: false,
    shuffleStringArray: true,
    splitStrings: false, // Disabled for stability
    stringArray: true,
    stringArrayThreshold: 0.5, // Reduced for stability
    transformObjectKeys: false, // Disabled to prevent object issues
    unicodeEscapeSequence: false,
    target: 'browser',
    reservedNames: [
        // Preserve important globals that shouldn't be renamed
        'window', 'document', 'console', 'localStorage', 'sessionStorage',
        'fetch', 'XMLHttpRequest', 'Promise', 'Array', 'Object', 'JSON',
        'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'
    ]
};

// Create protected directory
const protectedDir = path.join(__dirname, '..', 'frontend-protected');
if (!fs.existsSync(protectedDir)) {
    fs.mkdirSync(protectedDir, { recursive: true });
}

function minimalObfuscation(htmlContent, filename) {
    console.log(`🔧 Processing ${filename} with safe obfuscation...`);
    
    // Extract all <script> blocks that are not external
    const scriptRegex = /<script(?![^>]*src=)([^>]*)>([\s\S]*?)<\/script>/gi;
    let scriptCounter = 0;
    
    // Replace inline scripts with safely obfuscated versions
    const processedHTML = htmlContent.replace(scriptRegex, (match, attributes, scriptContent) => {
        // Skip if empty or just whitespace
        if (!scriptContent.trim()) {
            return match;
        }
        
        // Skip JSON-LD or other non-JavaScript content
        if (attributes.includes('application/ld+json') || attributes.includes('type="application/ld+json"')) {
            return match;
        }
        
        scriptCounter++;
        console.log(`  📜 Processing script block ${scriptCounter} (${scriptContent.length} chars)`);
        
        try {
            // Apply minimal safe obfuscation
            const obfuscated = JavaScriptObfuscator.obfuscate(scriptContent, safeObfuscatorOptions);
            const obfuscatedCode = obfuscated.getObfuscatedCode();
            
            console.log(`  ✅ Safely obfuscated script block ${scriptCounter} (${obfuscatedCode.length} chars)`);
            
            // Return the script with obfuscated content
            return `<script${attributes}>${obfuscatedCode}</script>`;
            
        } catch (error) {
            console.error(`  ❌ Error obfuscating script block ${scriptCounter}:`, error.message);
            console.log(`  ⚠️  Using original code for script block ${scriptCounter}`);
            // Return original on error
            return match;
        }
    });
    
    console.log(`  🎯 Processed ${scriptCounter} script blocks in ${filename}`);
    return processedHTML;
}

function processHTMLFile(inputPath, outputPath) {
    try {
        const htmlContent = fs.readFileSync(inputPath, 'utf8');
        const filename = path.basename(inputPath);
        
        const processedHTML = minimalObfuscation(htmlContent, filename);
        
        // Write the processed HTML to the protected directory
        fs.writeFileSync(outputPath, processedHTML, 'utf8');
        
        console.log(`✅ Safe version saved: ${outputPath}`);
        
    } catch (error) {
        console.error(`❌ Error processing ${inputPath}:`, error.message);
    }
}

// Process main HTML files
const htmlFiles = [
    'index.html',
    'preview.html', 
    'admin.html',
    'admin-settings.html',
    'admin-user-tracking.html',
    'dashboard.html',
    'login.html',
    'register.html',
    'create-slip.html',
    'settings.html',
    'contact.html',
    'privacy-policy.html',
    'terms-and-conditions.html',
    'refund-policy.html',
    'shipping-policy.html',
    'email-settings.html',
    'forgot-password.html',
    'landing-kerala.html',
    'landing-v2.html',
    'landing-v3.html',
    'landing-v4.html',
    'landing-v5.html',
    'order-success.html',
    'payment-settings.html',
    'reset-password.html',
    'slip-settings.html',
    'slips.html',
    'test-correct-download.html',
    'token-diagnostic.html'
];

console.log('🛡️  Starting SAFE frontend code protection...\n');

htmlFiles.forEach(filename => {
    const inputPath = path.join(__dirname, '..', 'frontend', filename);
    const outputPath = path.join(protectedDir, filename);
    
    if (fs.existsSync(inputPath)) {
        processHTMLFile(inputPath, outputPath);
    } else {
        console.log(`⚠️  File not found: ${filename}`);
    }
});

// Copy CSS files and other assets without obfuscation
console.log('\n📁 Copying CSS and asset files...');

const assetFiles = [
    'kerala-theme.css',
    'styles.css',
    'slips.css',
    'robots.txt',
    'sitemap.xml',
    'logo.png',
    'logo-dark.png',
    'sample.png',
    'sample1.png'
];

assetFiles.forEach(filename => {
    const sourcePath = path.join(__dirname, '..', 'frontend', filename);
    const destPath = path.join(protectedDir, filename);
    
    if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`  ✅ Copied: ${filename}`);
    }
});

// Copy favicon directory
const faviconSourceDir = path.join(__dirname, '..', 'frontend', 'favicon');
const faviconDestDir = path.join(protectedDir, 'favicon');

if (fs.existsSync(faviconSourceDir)) {
    if (!fs.existsSync(faviconDestDir)) {
        fs.mkdirSync(faviconDestDir, { recursive: true });
    }
    
    const faviconFiles = fs.readdirSync(faviconSourceDir);
    faviconFiles.forEach(filename => {
        const sourcePath = path.join(faviconSourceDir, filename);
        const destPath = path.join(faviconDestDir, filename);
        fs.copyFileSync(sourcePath, destPath);
        console.log(`  ✅ Copied favicon: ${filename}`);
    });
}

// Copy JavaScript files with minimal obfuscation
const jsFiles = ['console-control.js', 'activity-tracker.js', 'symbol-picker.js', 'slips.js', 'app.js'];

jsFiles.forEach(filename => {
    const sourcePath = path.join(__dirname, '..', 'frontend', filename);
    const destPath = path.join(protectedDir, filename);
    
    if (fs.existsSync(sourcePath)) {
        try {
            const jsContent = fs.readFileSync(sourcePath, 'utf8');
            
            // Skip obfuscation for these files to prevent issues
            fs.copyFileSync(sourcePath, destPath);
            console.log(`  ✅ Copied (unobfuscated): ${filename}`);
            
        } catch (error) {
            // Fallback to regular copy
            fs.copyFileSync(sourcePath, destPath);
            console.log(`  ⚠️  Copied (fallback): ${filename}`);
        }
    }
});

console.log('\n🎉 SAFE frontend code protection completed!');
console.log(`📂 Protected files are in: ${protectedDir}`);
console.log('\n🔒 Safe protection features applied:');
console.log('  ✅ Variable name mangling');
console.log('  ✅ String array obfuscation (reduced)');
console.log('  ✅ Code compaction');
console.log('  ❌ Debug protection (disabled for stability)');
console.log('  ❌ Control flow flattening (disabled for stability)');
console.log('  ❌ Dead code injection (disabled to prevent debugger)');
console.log('\n✅ Production-safe obfuscation applied!');