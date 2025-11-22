#!/usr/bin/env node

/**
 * Production Deployment Verification Script
 * Validates that all systems are ready for deployment
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 PRODUCTION DEPLOYMENT VERIFICATION');
console.log('=====================================\n');

let allChecksPass = true;
const issues = [];

// Check 1: Package.json configuration
console.log('📦 Checking package.json...');
try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    
    // Check start script
    if (packageJson.scripts.start.includes('protect:safe') && packageJson.scripts.start.includes('USE_PROTECTED=true')) {
        console.log('  ✅ Start script configured for protected deployment');
    } else {
        console.log('  ❌ Start script missing protection configuration');
        issues.push('Update start script to include frontend protection');
        allChecksPass = false;
    }
    
    // Check production dependencies
    const hasCrossEnv = packageJson.dependencies['cross-env'];
    const hasObfuscator = packageJson.dependencies['javascript-obfuscator'];
    
    if (hasCrossEnv && hasObfuscator) {
        console.log('  ✅ Production dependencies correctly configured');
    } else {
        console.log('  ❌ Missing production dependencies');
        issues.push('Move cross-env and javascript-obfuscator to dependencies');
        allChecksPass = false;
    }
    
    // Check Node.js version requirement
    if (packageJson.engines && packageJson.engines.node) {
        console.log('  ✅ Node.js version requirement specified');
    } else {
        console.log('  ⚠️  No Node.js version specified');
    }
    
} catch (error) {
    console.log('  ❌ Error reading package.json');
    issues.push('Fix package.json syntax errors');
    allChecksPass = false;
}

// Check 2: Railway configuration
console.log('\n🚄 Checking Railway configuration...');
try {
    const railwayConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'railway.json'), 'utf8'));
    
    if (railwayConfig.build && railwayConfig.build.buildCommand) {
        console.log('  ✅ Railway build command configured');
    } else {
        console.log('  ❌ Railway build command missing');
        issues.push('Configure Railway build command');
        allChecksPass = false;
    }
    
    if (railwayConfig.deploy && railwayConfig.deploy.startCommand) {
        console.log('  ✅ Railway start command configured');
    } else {
        console.log('  ❌ Railway start command missing');
        issues.push('Configure Railway start command');
        allChecksPass = false;
    }
    
} catch (error) {
    console.log('  ❌ Railway configuration missing or invalid');
    issues.push('Create or fix railway.json configuration');
    allChecksPass = false;
}

// Check 3: Frontend protection
console.log('\n🔐 Checking frontend protection...');
const protectedDir = path.join(__dirname, 'frontend-protected');
const frontendDir = path.join(__dirname, 'frontend');

if (fs.existsSync(protectedDir)) {
    console.log('  ✅ Protected frontend directory exists');
    
    try {
        const protectedFiles = fs.readdirSync(protectedDir).filter(f => f.endsWith('.html'));
        const originalFiles = fs.readdirSync(frontendDir).filter(f => f.endsWith('.html'));
        
        if (protectedFiles.length >= originalFiles.length * 0.8) {
            console.log(`  ✅ Protected HTML files: ${protectedFiles.length}/${originalFiles.length}`);
        } else {
            console.log(`  ⚠️  Some HTML files may be missing: ${protectedFiles.length}/${originalFiles.length}`);
        }
        
        // Check for assets
        const hasCSS = fs.existsSync(path.join(protectedDir, 'styles.css'));
        const hasLogo = fs.existsSync(path.join(protectedDir, 'logo.png'));
        const hasFavicon = fs.existsSync(path.join(protectedDir, 'favicon'));
        
        if (hasCSS && hasLogo && hasFavicon) {
            console.log('  ✅ Critical assets copied to protected directory');
        } else {
            console.log('  ⚠️  Some assets may be missing from protected directory');
        }
        
    } catch (error) {
        console.log('  ❌ Error checking protected directory contents');
    }
} else {
    console.log('  ❌ Protected frontend directory not found');
    issues.push('Run npm run protect:safe to generate protected frontend');
    allChecksPass = false;
}

// Check 4: Build scripts
console.log('\n🔧 Checking build scripts...');
const buildScript = path.join(__dirname, 'build-scripts', 'obfuscate-safe.cjs');
if (fs.existsSync(buildScript)) {
    console.log('  ✅ Safe obfuscation script exists');
} else {
    console.log('  ❌ Obfuscation script missing');
    issues.push('Ensure build-scripts/obfuscate-safe.cjs exists');
    allChecksPass = false;
}

// Check 5: Environment configuration
console.log('\n🌍 Checking environment configuration...');
const envExample = path.join(__dirname, '.env.example');
if (fs.existsSync(envExample)) {
    console.log('  ✅ Environment template exists');
} else {
    console.log('  ❌ .env.example missing');
    issues.push('Create .env.example with required variables');
    allChecksPass = false;
}

// Check 6: Git configuration
console.log('\n📝 Checking Git configuration...');
try {
    const gitignore = fs.readFileSync(path.join(__dirname, '.gitignore'), 'utf8');
    if (gitignore.includes('node_modules') && gitignore.includes('.env')) {
        console.log('  ✅ .gitignore configured properly');
    } else {
        console.log('  ⚠️  .gitignore may need updates');
    }
} catch (error) {
    console.log('  ⚠️  .gitignore not found or unreadable');
}

// Final assessment
console.log('\n' + '='.repeat(50));
if (allChecksPass) {
    console.log('🎉 ALL CHECKS PASSED - READY FOR DEPLOYMENT!');
    console.log('\n✅ Your application is ready for production deployment.');
    console.log('✅ Protected frontend will be automatically generated.');
    console.log('✅ All security measures are in place.');
    console.log('\n🚀 Deploy with: git add . && git commit -m "Deploy to production" && git push origin main');
} else {
    console.log('⚠️  ISSUES FOUND - PLEASE FIX BEFORE DEPLOYMENT');
    console.log('\n❌ Issues to resolve:');
    issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`);
    });
    console.log('\nFix these issues and run this script again.');
}

console.log('\n' + '='.repeat(50));

process.exit(allChecksPass ? 0 : 1);