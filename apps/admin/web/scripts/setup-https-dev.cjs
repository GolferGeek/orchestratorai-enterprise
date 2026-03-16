#!/usr/bin/env node

/**
 * HTTPS Development Setup Script
 * Creates self-signed certificates for localhost HTTPS development
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CERTS_DIR = path.join(__dirname, '..', 'certs');
const KEY_FILE = path.join(CERTS_DIR, 'localhost-key.pem');
const CERT_FILE = path.join(CERTS_DIR, 'localhost-cert.pem');

console.log('🔒 Setting up HTTPS for localhost development...\n');

// Create certs directory if it doesn't exist
if (!fs.existsSync(CERTS_DIR)) {
  fs.mkdirSync(CERTS_DIR, { recursive: true });
  console.log('✅ Created certs directory');
}

// Check if certificates already exist
if (fs.existsSync(KEY_FILE) && fs.existsSync(CERT_FILE)) {
  console.log('✅ SSL certificates already exist');
  console.log(`   Key: ${KEY_FILE}`);
  console.log(`   Cert: ${CERT_FILE}`);
  
  // Check if certificates are still valid (not expired)
  try {
    const certInfo = execSync(`openssl x509 -in "${CERT_FILE}" -noout -dates`, { encoding: 'utf8' });
    console.log('📅 Certificate validity:');
    console.log(`   ${certInfo.trim()}`);
    
    // Check if certificate is valid for at least 30 more days
    const endDate = execSync(`openssl x509 -in "${CERT_FILE}" -noout -enddate`, { encoding: 'utf8' });
    const endDateMatch = endDate.match(/notAfter=(.+)/);
    if (endDateMatch) {
      const expiryDate = new Date(endDateMatch[1]);
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      
      if (expiryDate < thirtyDaysFromNow) {
        console.log('⚠️  Certificate expires soon, regenerating...');
        generateCertificates();
      } else {
        console.log('✅ Certificates are valid and not expiring soon');
        printUsageInstructions();
        process.exit(0);
      }
    }
  } catch (error) {
    console.log('⚠️  Could not verify certificate validity, regenerating...');
    generateCertificates();
  }
} else {
  console.log('📝 Generating new SSL certificates...');
  generateCertificates();
}

function generateCertificates() {
  try {
    // Check if OpenSSL is available
    execSync('openssl version', { stdio: 'ignore' });
  } catch (error) {
    console.error('❌ OpenSSL is not installed or not in PATH');
    console.error('   Please install OpenSSL to generate SSL certificates');
    console.error('   macOS: brew install openssl');
    console.error('   Ubuntu: sudo apt-get install openssl');
    console.error('   Windows: Download from https://slproweb.com/products/Win32OpenSSL.html');
    process.exit(1);
  }

  // Create OpenSSL config file for localhost
  const configContent = `
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
CN = localhost
O = Orchestrator AI Development
OU = Development
L = Local
ST = Development
C = US

[v3_req]
subjectAltName = @alt_names
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
`;

  const configFile = path.join(CERTS_DIR, 'localhost.conf');
  fs.writeFileSync(configFile, configContent.trim());

  try {
    // Generate private key
    console.log('🔑 Generating private key...');
    execSync(`openssl genrsa -out "${KEY_FILE}" 2048`, { stdio: 'inherit' });

    // Generate certificate signing request and self-signed certificate
    console.log('📜 Generating self-signed certificate...');
    execSync(
      `openssl req -new -x509 -key "${KEY_FILE}" -out "${CERT_FILE}" -days 365 -config "${configFile}"`,
      { stdio: 'inherit' }
    );

    // Clean up config file
    fs.unlinkSync(configFile);

    console.log('\n✅ SSL certificates generated successfully!');
    console.log(`   Key: ${KEY_FILE}`);
    console.log(`   Cert: ${CERT_FILE}`);

    // Set appropriate permissions
    if (process.platform !== 'win32') {
      fs.chmodSync(KEY_FILE, '600');
      fs.chmodSync(CERT_FILE, '644');
      console.log('🔐 Set secure file permissions');
    }

    printUsageInstructions();

  } catch (error) {
    console.error('❌ Failed to generate SSL certificates:', error.message);
    process.exit(1);
  }
}

function printUsageInstructions() {
  console.log('\n📋 Usage Instructions:');
  console.log('');
  console.log('1. Update your .env file:');
  console.log('   VITE_ENFORCE_HTTPS=true');
  console.log('   VITE_HTTPS_PORT=9443');
  console.log('   VITE_API_BASE_URL=https://localhost:9443');
  console.log('');
  console.log('2. Update your Vite config to use HTTPS:');
  console.log('   Add to vite.config.ts:');
  console.log('   server: {');
  console.log('     https: {');
  console.log(`       key: fs.readFileSync('${KEY_FILE}'),`);
  console.log(`       cert: fs.readFileSync('${CERT_FILE}')`);
  console.log('     },');
  console.log('     port: 9443');
  console.log('   }');
  console.log('');
  console.log('3. Trust the certificate in your browser:');
  console.log('   - Navigate to https://localhost:9443');
  console.log('   - Click "Advanced" → "Proceed to localhost (unsafe)"');
  console.log('   - Or add the certificate to your system trust store');
  console.log('');
  console.log('4. For backend API, ensure it also runs on HTTPS:');
  console.log('   - Configure your API server to use the same certificates');
  console.log('   - Or set up a reverse proxy with HTTPS termination');
  console.log('');
  console.log('⚠️  Note: These are self-signed certificates for development only.');
  console.log('   Browsers will show security warnings until you trust them.');
}
