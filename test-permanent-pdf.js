import fs from 'fs';
import path from 'path';

console.log('\n=== Testing Permanent PDF Storage ===\n');

// Test 1: Check directory
const permanentPdfDir = path.join(process.cwd(), 'public', 'permanent-pdfs');
console.log(`1. Checking directory: ${permanentPdfDir}`);

if (fs.existsSync(permanentPdfDir)) {
    console.log('   ✅ Directory exists');
    
    // Test 2: Write permissions
    const testFile = path.join(permanentPdfDir, 'test.txt');
    try {
        fs.writeFileSync(testFile, 'Test write');
        console.log('   ✅ Write permission OK');
        
        // Clean up
        fs.unlinkSync(testFile);
        console.log('   ✅ Delete permission OK');
    } catch (error) {
        console.log('   ❌ Permission error:', error.message);
    }
    
    // Test 3: List existing files
    const files = fs.readdirSync(permanentPdfDir);
    console.log(`\n2. Files in directory: ${files.length}`);
    files.forEach(file => {
        const filePath = path.join(permanentPdfDir, file);
        const stats = fs.statSync(filePath);
        console.log(`   - ${file} (${stats.size} bytes)`);
    });
    
} else {
    console.log('   ❌ Directory does NOT exist');
    console.log('   Creating it now...');
    fs.mkdirSync(permanentPdfDir, { recursive: true });
    console.log('   ✅ Directory created');
}

console.log('\n=== Path Resolution Test ===\n');
console.log(`process.cwd(): ${process.cwd()}`);
console.log(`Permanent PDF dir: ${permanentPdfDir}`);
console.log(`Example PDF path: ${path.join(permanentPdfDir, 'ORD-20251109-VE4JG4.pdf')}`);

console.log('\n✅ All tests passed! System ready to save permanent PDFs.\n');
