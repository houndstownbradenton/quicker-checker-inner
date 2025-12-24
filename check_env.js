import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

console.log('MYTIME_LOCATION_ID from .env:', process.env.MYTIME_LOCATION_ID);
console.log('VITE_MYTIME_LOCATION_ID from .env:', process.env.VITE_MYTIME_LOCATION_ID);
