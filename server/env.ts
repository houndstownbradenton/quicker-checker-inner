/**
 * Environment Variable Validation Module
 * 
 * Validates that all required environment variables are present before
 * the server starts. Provides clear error messages for missing variables.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from parent directory (root of repo)
const envPath = join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

// Define required environment variables with descriptions
interface EnvVarConfig {
    name: string;
    required: boolean;
    description: string;
    defaultValue?: string;
}

// Configuration for all environment variables used by the application
const ENV_VARS: EnvVarConfig[] = [
    // Required - MyTime API Configuration
    {
        name: 'MYTIME_API_KEY',
        required: true,
        description: 'API key for MyTime Booking/Partner API authentication'
    },
    {
        name: 'MYTIME_COMPANY_ID',
        required: true,
        description: 'MyTime company identifier'
    },
    // Optional with defaults - Server Configuration
    {
        name: 'MYTIME_BASE_URL',
        required: false,
        description: 'Base URL for MyTime API',
        defaultValue: 'https://www.mytime.com'
    },
    {
        name: 'PORT',
        required: false,
        description: 'Server port',
        defaultValue: '3000'
    },
    // Optional - Supabase Configuration (for pet photos feature)
    {
        name: 'SUPABASE_URL',
        required: false,
        description: 'Supabase project URL (enables pet photo feature)'
    },
    {
        name: 'SUPABASE_ANON_KEY',
        required: false,
        description: 'Supabase anonymous key (enables pet photo feature)'
    }
];

// Track validation errors
interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validates all required environment variables and logs warnings for optional ones
 * @returns ValidationResult with errors and warnings
 */
export function validateEnv(): ValidationResult {
    const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: []
    };

    console.log('\n[env] Validating environment variables...\n');

    for (const envVar of ENV_VARS) {
        const value = process.env[envVar.name];
        const hasValue = value !== undefined && value !== '';

        if (envVar.required && !hasValue) {
            // Required variable is missing
            result.isValid = false;
            result.errors.push(`❌ ${envVar.name} - MISSING (required): ${envVar.description}`);
        } else if (!envVar.required && !hasValue) {
            // Optional variable is missing
            if (envVar.defaultValue) {
                result.warnings.push(`⚠️  ${envVar.name} - not set, using default: ${envVar.defaultValue}`);
            } else {
                result.warnings.push(`⚠️  ${envVar.name} - not set (optional): ${envVar.description}`);
            }
        } else {
            // Variable is present
            console.log(`✅ ${envVar.name} - configured`);
        }
    }

    // Print errors
    if (result.errors.length > 0) {
        console.log('\n--- MISSING REQUIRED ENVIRONMENT VARIABLES ---\n');
        result.errors.forEach(err => console.error(err));
        console.log('\nPlease set these variables in your .env file.');
        console.log('See .env.example for reference.\n');
    }

    // Print warnings
    if (result.warnings.length > 0) {
        console.log('\n--- OPTIONAL ENVIRONMENT VARIABLES ---\n');
        result.warnings.forEach(warn => console.warn(warn));
        console.log('');
    }

    return result;
}

/**
 * Validates environment and exits process if required variables are missing
 * Call this at server startup before initializing services
 */
export function requireEnv(): void {
    const result = validateEnv();

    if (!result.isValid) {
        console.error('\n🚫 Server startup aborted due to missing required environment variables.\n');
        process.exit(1);
    }

    console.log('[env] Environment validation passed ✓\n');
}

/**
 * Get an environment variable with optional default value
 * Throws an error if the variable is required but not set
 */
export function getEnv(name: string, defaultValue?: string): string {
    const value = process.env[name];

    if (value !== undefined && value !== '') {
        return value;
    }

    if (defaultValue !== undefined) {
        return defaultValue;
    }

    throw new Error(`Environment variable ${name} is required but not set`);
}

/**
 * Get an optional environment variable
 * Returns undefined if not set
 */
export function getOptionalEnv(name: string): string | undefined {
    const value = process.env[name];
    return (value !== undefined && value !== '') ? value : undefined;
}

// Export configured values with defaults applied
export const config = {
    // MyTime API
    get MYTIME_API_KEY(): string {
        return getEnv('MYTIME_API_KEY');
    },
    get MYTIME_COMPANY_ID(): string {
        return getEnv('MYTIME_COMPANY_ID');
    },
    get MYTIME_BASE_URL(): string {
        return getEnv('MYTIME_BASE_URL', 'https://www.mytime.com');
    },
    // Server
    get PORT(): number {
        return parseInt(getEnv('PORT', '3000'), 10);
    },
    // Supabase (optional)
    get SUPABASE_URL(): string | undefined {
        return getOptionalEnv('SUPABASE_URL');
    },
    get SUPABASE_ANON_KEY(): string | undefined {
        return getOptionalEnv('SUPABASE_ANON_KEY');
    }
};
