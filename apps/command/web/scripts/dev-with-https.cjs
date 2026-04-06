#!/usr/bin/env node

/**
 * Smart Development Server Launcher
 * Automatically sets up HTTPS certificates if needed and starts Vite
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const CERTS_DIR = path.join(__dirname, '..', 'certs');
const KEY_FILE = path.join(CERTS_DIR, 'localhost-key.pem');
const CERT_FILE = path.join(CERTS_DIR, 'localhost-cert.pem');

console.log('🚀 Starting development server...\n');

// Check if HTTPS should be enabled
const forceHttps = process.env.VITE_ENFORCE_HTTPS === 'true';
const httpsPreferred = process.env.VITE_PREFER_HTTPS === 'true' || forceHttps;

// Load base .env, then profile overlay if ENV_PROFILE is set
try {
  const ROOT_ENV = path.join(__dirname, '..', '..', '..', '..', '.env');
  if (fs.existsSync(ROOT_ENV)) {
    dotenv.config({ path: ROOT_ENV });
  }

  const profile = process.env.ENV_PROFILE;
  if (profile) {
    const profileEnv = path.join(__dirname, '..', '..', '..', '..', `.env.${profile}`);
    if (fs.existsSync(profileEnv)) {
      dotenv.config({ path: profileEnv, override: true });
      console.log(`📄 Loaded profile overlay: .env.${profile}`);
    } else {
      console.warn(`⚠️  Profile requested but .env.${profile} not found`);
    }
  }
} catch (e) {
  // Non-fatal if .env is missing
}

if (httpsPreferred) {
  console.log('🔒 HTTPS mode requested');
  
  // Check if certificates exist and are valid
  const needsCertificates = !fs.existsSync(KEY_FILE) || !fs.existsSync(CERT_FILE);
  
  if (needsCertificates) {
    console.log('📝 Setting up HTTPS certificates (one-time setup)...');
    try {
      execSync('node scripts/setup-https-dev.cjs', { 
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });
      console.log('✅ HTTPS certificates ready!\n');
    } catch (error) {
      console.error('❌ Failed to setup HTTPS certificates:', error.message);
      if (forceHttps) {
        console.error('   HTTPS is required but certificate setup failed. Exiting...');
        process.exit(1);
      } else {
        console.warn('   Falling back to HTTP mode...\n');
      }
    }
  } else {
    console.log('✅ HTTPS certificates found\n');
  }
}

// Prepare environment variables
const env = { ...process.env };
if (httpsPreferred && fs.existsSync(KEY_FILE) && fs.existsSync(CERT_FILE)) {
  env.VITE_ENFORCE_HTTPS = 'true';
  const httpsPort = process.env.VITE_HTTPS_PORT || '7543';
  console.log(`🌐 Starting Vite with HTTPS on https://localhost:${httpsPort}`);
} else {
  // Default to 9001 for dev unless explicitly overridden
  const httpPort = process.env.VITE_WEB_PORT || process.env.WEB_PORT || '9001';
  console.log(`🌐 Starting Vite with HTTP on http://localhost:${httpPort}`);
}

// Start Vite development server (pass --mode for profile overlay)
const viteArgs = ['vite'];
if (process.env.ENV_PROFILE) {
  viteArgs.push('--mode', process.env.ENV_PROFILE);
}
const viteProcess = spawn('npx', viteArgs, {
  stdio: 'inherit',
  env,
  cwd: path.join(__dirname, '..')
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down development server...');
  viteProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  viteProcess.kill('SIGTERM');
});

viteProcess.on('close', (code) => {
  process.exit(code);
});
