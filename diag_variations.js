import axios from 'axios';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

const MYTIME_API_KEY = process.env.MYTIME_API_KEY;
const LOCATION_ID = '158078';

async function checkVariations() {
    try {
        console.log('Fetching variations from Partner API...');
        const response = await axios.get('https://partners-api.mytime.com/api/variations', {
            params: { location_mytime_id: LOCATION_ID },
            headers: { 'X-Api-Key': MYTIME_API_KEY }
        });

        const variations = response.data.variations || [];
        console.log(`Found ${variations.length} variations total.`);

        const boardingVariations = variations.filter(v =>
            v.name?.toLowerCase().includes('boarding') ||
            v.service_name?.toLowerCase().includes('boarding')
        );

        console.log('\n--- Boarding Variations ---');
        boardingVariations.forEach(v => {
            console.log(`ID: ${v.id}, Name: "${v.name}", Service: "${v.service_name}", Duration: ${v.duration} min`);
        });

    } catch (error) {
        console.error('Error Details:', JSON.stringify(error.response?.data || error.message, null, 2));
    }
}

checkVariations();
