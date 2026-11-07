import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Finn den absolutte mappen til der dette skriptet ligger
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lag absolutte filveier til filene dine
const manifestPath = path.join(__dirname, 'manifest.json');
const packagePath = path.join(__dirname, 'package.json');
const versionsPath = path.join(__dirname, 'versions.json');

function bumpVersion() {
    // Les manifest.json via absolutt vei
    let manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const oldVersion = manifest.version;

    // Øk patch-versjonen (1.0.0 → 1.0.1)
    const [major, minor, patch] = oldVersion.split('.').map(Number);
    const newVersion = `${major}.${minor}.${patch + 1}`;

    console.log(`🔄 Bumper versjon: ${oldVersion} → ${newVersion}`);

    // Oppdater manifest.json via absolutt vei
    manifest.version = newVersion;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

    // Oppdater package.json hvis den finnes
    try {
        let pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
        pkg.version = newVersion;
        writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
    } catch (e) {
        console.log('⚠️  package.json ble ikke funnet på ' + packagePath);
    }

    // Oppdater versions.json
    let versions = {};
    try {
        versions = JSON.parse(readFileSync(versionsPath, 'utf8'));
    } catch (e) {
        console.log('📄 Oppretter ny versions.json på ' + versionsPath);
    }

    // Legg til ny versjon med minAppVersion fra manifest
    versions[newVersion] = manifest.minAppVersion || "1.13.0";
    
    writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n');

    console.log(`✅ Ferdig! Versjon oppdatert til ${newVersion}`);
    console.log(`📌 versions.json oppdatert med "${newVersion}": "${manifest.minAppVersion}"`);
}

bumpVersion();
