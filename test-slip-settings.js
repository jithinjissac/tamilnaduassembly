import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Settings from './models/Settings.js';

dotenv.config();

async function testSlipSettings() {
    try {
        console.log('🔌 Connecting to database...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to database');
        
        console.log('\n📋 Checking slip settings...');
        const slipSettings = await Settings.getSettings('slip');
        
        if (slipSettings) {
            const settingsObj = Object.fromEntries(slipSettings);
            console.log('\n✅ Slip settings found:');
            console.log(JSON.stringify(settingsObj, null, 2));
            
            if (settingsObj.fiveSlips) {
                console.log('\n📄 5 Slips per page settings:');
                console.log(JSON.stringify(settingsObj.fiveSlips, null, 2));
            }
            
            if (settingsObj.sixSlips) {
                console.log('\n📄 6 Slips per page settings:');
                console.log(JSON.stringify(settingsObj.sixSlips, null, 2));
            }
        } else {
            console.log('❌ No slip settings found - they will be created with defaults on first use');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
        process.exit(0);
    }
}

testSlipSettings();
