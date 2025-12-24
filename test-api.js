import axios from 'axios';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

const MYTIME_API_KEY = process.env.MYTIME_API_KEY;
const LOCATION_ID = '158078';

async function testVariations() {
    const url = 'https://partners-api.mytime.com/api/variations';
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Api-Key': MYTIME_API_KEY || '',
        'User-Agent': 'QuickerChecker/1.0.0 (HoundsTownBradenton; Node/axios)'
    };

    try {
        console.log('Testing GET /variations...');
        const response = await axios.get(url, {
            headers,
            params: {
                location_mytime_id: parseInt(LOCATION_ID)
            }
        });
        console.log('Success! Status:', response.status);
        console.log('Variations count:', response.data.variations?.length);
    } catch (error) {
        console.error('Failed! Status:', error.response?.status);
        console.error('Data:', error.response?.data);
    }
}

testVariations();
