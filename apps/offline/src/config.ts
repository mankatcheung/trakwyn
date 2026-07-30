import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';

const CONFIG_DIR = join(homedir(), '.job-finder');
const ENV_FILE = join(CONFIG_DIR, '.env');
const DATA_DIR = join(CONFIG_DIR, 'data');
const UPLOADS_DIR = join(CONFIG_DIR, 'uploads');

export interface Config {
  configDir: string;
  dataDir: string;
  uploadsDir: string;
  envFile: string;
  databaseUrl: string;
  port: number;
}

function generateSecret(length = 32): string {
  return randomBytes(length).toString('hex');
}

export function ensureConfig(): Config {
  // Create config directory if it doesn't exist
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Create data and uploads directories
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  // Generate .env file if it doesn't exist
  if (!existsSync(ENV_FILE)) {
    const databasePath = join(DATA_DIR, 'job-finder.db');
    const envContent = `# Job Finder Offline Mode Configuration
# Generated automatically on first run

# Database
DATABASE_URL=file:${databasePath}

# Authentication (required even in offline mode for internal use)
JWT_SECRET=${generateSecret()}
JWT_REFRESH_SECRET=${generateSecret()}
TOTP_ENCRYPTION_KEY=${generateSecret()}

# Offline mode settings
OFFLINE_MODE=true
PORT=3000
NODE_ENV=development

# Storage
STORAGE_PROVIDER=local

# CORS (allow local web app)
CORS_ORIGIN=http://localhost:3000

# Disable external services
# BREVO_API_KEY=
# GOOGLE_OAUTH_CLIENT_ID=
# GOOGLE_OAUTH_CLIENT_SECRET=
# GITHUB_OAUTH_CLIENT_ID=
# GITHUB_OAUTH_CLIENT_SECRET=
# AXIOM_TOKEN=
`;

    writeFileSync(ENV_FILE, envContent, 'utf-8');
    console.log(`Created configuration at ${ENV_FILE}`);
  }

  // Load environment variables from .env file
  const envContent = readFileSync(ENV_FILE, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  // Ensure DATABASE_URL is set
  const databasePath = join(DATA_DIR, 'job-finder.db');
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = `file:${databasePath}`;
  }

  return {
    configDir: CONFIG_DIR,
    dataDir: DATA_DIR,
    uploadsDir: UPLOADS_DIR,
    envFile: ENV_FILE,
    databaseUrl: process.env.DATABASE_URL,
    port: parseInt(process.env.PORT || '3000', 10),
  };
}
