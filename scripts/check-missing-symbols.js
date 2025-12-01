import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Symbol from '../models/Symbol.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function checkMissingSymbols() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Get all symbols from database
        const symbols = await Symbol.find({}).select('name imageUrl isActive createdAt').lean();
        console.log(`📊 Total symbols in database: ${symbols.length}\n`);

        const symbolsDir = path.join(__dirname, '..', 'public', 'symbols');
        
        // Check if symbols directory exists
        if (!fs.existsSync(symbolsDir)) {
            console.log('❌ Symbols directory does not exist!');
            console.log(`   Expected: ${symbolsDir}\n`);
            fs.mkdirSync(symbolsDir, { recursive: true });
            console.log('✅ Created symbols directory\n');
        }

        // Get all files in symbols directory
        const filesOnDisk = fs.existsSync(symbolsDir) 
            ? fs.readdirSync(symbolsDir)
            : [];
        
        console.log(`📁 Files on disk: ${filesOnDisk.length}\n`);

        let missingCount = 0;
        let foundCount = 0;

        console.log('🔍 Checking each symbol:\n');
        console.log('=' .repeat(80));

        symbols.forEach((symbol, index) => {
            // Extract filename from imageUrl (e.g., /symbols/symbol-123.png -> symbol-123.png)
            const filename = symbol.imageUrl.split('/').pop();
            const filePath = path.join(symbolsDir, filename);
            const exists = fs.existsSync(filePath);

            const status = exists ? '✅ FOUND' : '❌ MISSING';
            const statusColor = exists ? foundCount++ : missingCount++;

            console.log(`${index + 1}. ${status} - ${symbol.name}`);
            console.log(`   URL: ${symbol.imageUrl}`);
            console.log(`   File: ${filename}`);
            console.log(`   Active: ${symbol.isActive ? 'Yes' : 'No'}`);
            console.log(`   Created: ${new Date(symbol.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
            console.log('');
        });

        console.log('=' .repeat(80));
        console.log('\n📈 Summary:');
        console.log(`   ✅ Found: ${foundCount}`);
        console.log(`   ❌ Missing: ${missingCount}`);
        console.log(`   📊 Total: ${symbols.length}`);
        console.log(`   📁 Files on disk: ${filesOnDisk.length}`);

        if (missingCount > 0) {
            console.log('\n⚠️  Action Required:');
            console.log('   - Implement AWS S3 storage (see SYMBOL_STORAGE_ISSUE.md)');
            console.log('   - OR ask admin to re-upload missing symbols');
            console.log('   - Current users see placeholder image for missing symbols');
        }

        // List orphaned files (files on disk not in database)
        const symbolUrls = symbols.map(s => s.imageUrl.split('/').pop());
        const orphanedFiles = filesOnDisk.filter(file => !symbolUrls.includes(file));
        
        if (orphanedFiles.length > 0) {
            console.log('\n🗑️  Orphaned files (on disk but not in database):');
            orphanedFiles.forEach(file => {
                console.log(`   - ${file}`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

checkMissingSymbols();
