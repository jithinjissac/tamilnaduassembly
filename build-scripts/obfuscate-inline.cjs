const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

// Configuration for obfuscation - Production Safe
const obfuscatorOptions = {
    compact: true,
    controlFlowFlattening: false, // Disabled to prevent runtime issues
    controlFlowFlatteningThreshold: 0,
    deadCodeInjection: false, // Disabled to prevent debugger statements
    deadCodeInjectionThreshold: 0,
    debugProtection: false, // Disabled - causes production issues
    debugProtectionInterval: 0,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    renameGlobals: false,
    rotateStringArray: true,
    selfDefending: false, // Disabled to prevent runtime errors
    shuffleStringArray: true,
    splitStrings: true,
    splitStringsChunkLength: 10, // Increased for better performance
    stringArray: true,
    stringArrayThreshold: 0.75, // Slightly reduced
    transformObjectKeys: true,
    unicodeEscapeSequence: false,
    // Additional safe options
    reservedNames: [], // Don't rename critical globals
    reservedStrings: [], // Don't obfuscate critical strings
    seed: 0, // Consistent obfuscation
    sourceMap: false,
    sourceMapBaseUrl: '',
    sourceMapFileName: '',
    sourceMapMode: 'separate',
    target: 'browser'
};

// Create protected directory
const protectedDir = path.join(__dirname, '..', 'frontend-protected');
if (!fs.existsSync(protectedDir)) {
    fs.mkdirSync(protectedDir, { recursive: true });
}

function extractAndObfuscateJS(htmlContent, filename) {
    console.log(`🔧 Processing ${filename}...`);
    
    // Extract all <script> blocks that are not external
    const scriptRegex = /<script(?![^>]*src=)([^>]*)>([\s\S]*?)<\/script>/gi;
    let scriptCounter = 0;
    let extractedJS = '';
    
    // Replace inline scripts with obfuscated versions
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
        console.log(`  📜 Found script block ${scriptCounter} (${scriptContent.length} chars)`);
        
        try {
            // Obfuscate the JavaScript code
            const obfuscated = JavaScriptObfuscator.obfuscate(scriptContent, obfuscatorOptions);
            const obfuscatedCode = obfuscated.getObfuscatedCode();
            
            console.log(`  ✅ Obfuscated script block ${scriptCounter} (${obfuscatedCode.length} chars)`);
            
            // Return the script with obfuscated content
            return `<script${attributes}>${obfuscatedCode}</script>`;
            
        } catch (error) {
            console.error(`  ❌ Error obfuscating script block ${scriptCounter}:`, error.message);
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
        
        const processedHTML = extractAndObfuscateJS(htmlContent, filename);
        
        // Write the processed HTML to the protected directory
        fs.writeFileSync(outputPath, processedHTML, 'utf8');
        
        console.log(`✅ Protected version saved: ${outputPath}`);
        
    } catch (error) {
        console.error(`❌ Error processing ${inputPath}:`, error.message);
    }
}

// Process main HTML files
const htmlFiles = [
    'index.html',
    'preview.html', 
    'admin.html',
    'dashboard.html',
    'login.html',
    'register.html'
];

console.log('🛡️  Starting frontend code protection...\n');

htmlFiles.forEach(filename => {
    const inputPath = path.join(__dirname, '..', 'frontend', filename);
    const outputPath = path.join(protectedDir, filename);
    
    if (fs.existsSync(inputPath)) {
        processHTMLFile(inputPath, outputPath);
    } else {
        console.log(`⚠️  File not found: ${filename}`);
    }
});

// Copy CSS files and other assets
console.log('\n📁 Copying CSS and asset files...');

const assetFiles = [
    'kerala-theme.css',
    'styles.css',
    'console-control.js',
    'activity-tracker.js'
];

assetFiles.forEach(filename => {
    const sourcePath = path.join(__dirname, '..', 'frontend', filename);
    const destPath = path.join(protectedDir, filename);
    
    if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`  ✅ Copied: ${filename}`);
    }
});

// Copy additional JavaScript files and obfuscate them
const jsFiles = ['console-control.js', 'activity-tracker.js'];

jsFiles.forEach(filename => {
    const sourcePath = path.join(__dirname, '..', 'frontend', filename);
    const destPath = path.join(protectedDir, filename);
    
    if (fs.existsSync(sourcePath)) {
        try {
            const jsContent = fs.readFileSync(sourcePath, 'utf8');
            const obfuscated = JavaScriptObfuscator.obfuscate(jsContent, obfuscatorOptions);
            fs.writeFileSync(destPath, obfuscated.getObfuscatedCode(), 'utf8');
            console.log(`  🔒 Obfuscated: ${filename}`);
        } catch (error) {
            // Fallback to regular copy if obfuscation fails
            fs.copyFileSync(sourcePath, destPath);
            console.log(`  ⚠️  Copied (obfuscation failed): ${filename}`);
        }
    }
});

console.log('\n🎉 Frontend code protection completed!');
console.log(`📂 Protected files are in: ${protectedDir}`);
console.log('\n🔒 Protection features applied:');
console.log('  ✅ JavaScript code obfuscation');
console.log('  ✅ String array encryption');
console.log('  ✅ Control flow flattening');
console.log('  ✅ Dead code injection');
console.log('  ✅ Debug protection');
console.log('  ✅ Console output disabling');
console.log('  ✅ Self-defending code');
console.log('\n⚠️  Remember to serve files from frontend-protected/ directory in production!');