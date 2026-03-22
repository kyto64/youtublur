const fs = require('fs');
const path = require('path');

const packageJsonPath = path.resolve(__dirname, '../package.json');
const manifestJsonPath = path.resolve(__dirname, '../manifest.json');

const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const manifestData = JSON.parse(fs.readFileSync(manifestJsonPath, 'utf8'));

// Update manifest version
manifestData.version = packageData.version;

// Write back formatted
fs.writeFileSync(manifestJsonPath, JSON.stringify(manifestData, null, 2) + '\n', 'utf8');

console.log(`[sync-version] Synchronized manifest.json version to ${packageData.version}`);
