import mongoose from 'mongoose';
import Settings from './models/Settings.js';
import dotenv from 'dotenv';

dotenv.config();

const initSlipSettings = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Check if slip settings already exist
        const existingSettings = await Settings.findOne({ category: 'slip' });
        
        if (existingSettings) {
            console.log('⚠️ Slip settings already exist in database');
            console.log('Do you want to update them? (This will overwrite existing settings)');
            console.log('If yes, delete the existing settings first using MongoDB Compass or shell');
            process.exit(0);
        }

        // Create default slip settings
        const slipSettings = {
            fiveSlips: {
                symbolHeader: '8pt',
                symbolImage: '24mm',
                symbolName: '9.5pt',
                slipNumber: '11pt',
                secId: '10pt',
                voterName: '11pt',
                infoRow: '10pt',
                infoLabel: '17mm',
                pollingStation: '10pt',
                wardMarginBottom: '1mm',
                headerMarginBottom: '1mm',
                voterNameMarginBottom: '1mm',
                infoRowMarginBottom: '0.8mm'
            },
            sixSlips: {
                symbolHeader: '7pt',
                symbolImage: '20mm',
                symbolName: '8.5pt',
                slipNumber: '9pt',
                secId: '9pt',
                voterName: '9pt',
                infoRow: '8pt',
                infoLabel: '14mm',
                pollingStation: '8.5pt',
                wardMarginBottom: '0.8mm',
                headerMarginBottom: '0.8mm',
                voterNameMarginBottom: '0.8mm',
                infoRowMarginBottom: '0.6mm'
            },
            fiveSlipsFree: {
                slipNumberLabel: '12pt',
                slipNumberValue: '20pt',
                secId: '11pt',
                voterName: '13pt',
                infoRow: '11pt',
                infoLabel: '18mm',
                pollingStation: '11pt',
                wardInfo: '11pt',
                wardMarginBottom: '0mm',
                wardPadding: '0mm 0 0.2mm 0',
                headerMarginBottom: '0.5mm',
                headerMarginTop: '0.5mm',
                voterNameMarginBottom: '1mm',
                infoRowMarginBottom: '0.6mm'
            },
            sixSlipsFree: {
                slipNumberLabel: '10pt',
                slipNumberValue: '18pt',
                secId: '10pt',
                voterName: '12pt',
                infoRow: '10pt',
                infoLabel: '16mm',
                pollingStation: '10pt',
                wardInfo: '10pt',
                wardMarginBottom: '0mm',
                wardPadding: '0mm 0 0.2mm 0',
                headerMarginBottom: '0.4mm',
                headerMarginTop: '0.4mm',
                voterNameMarginBottom: '0.8mm',
                infoRowMarginBottom: '0.5mm'
            }
        };

        // Create the settings document
        const settings = new Settings({
            category: 'slip',
            settings: new Map(Object.entries(slipSettings))
        });

        await settings.save();
        console.log('✅ Slip settings initialized successfully!');
        console.log('\n📋 Settings saved:');
        console.log(JSON.stringify(slipSettings, null, 2));
        console.log('\n🎉 You can now customize these settings in the admin panel!');
        
    } catch (error) {
        console.error('❌ Error initializing slip settings:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
        process.exit(0);
    }
};

initSlipSettings();
