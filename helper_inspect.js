
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const MYTIME_API_KEY = process.env.VITE_MYTIME_API_KEY;
const LOCATION_ID = process.env.MYTIME_LOCATION_ID;

async function partnerApiRequest(method, endpoint, params = null) {
    const url = `https://partners-api.mytime.com/api${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Api-Key': MYTIME_API_KEY
    };

    try {
        const response = await axios({
            method,
            url,
            params,
            headers
        });
        return response.data;
    } catch (error) {
        console.error(`Partner API Error: ${method} ${endpoint}`, error.response?.data || error.message);
        throw error;
    }
}

async function run() {
    try {
        console.log('--- EMPLOYEES ---');
        const employeesResult = await partnerApiRequest('GET', '/employees', {
            location_mytime_id: LOCATION_ID
        });

        const employees = Array.isArray(employeesResult) ? employeesResult : (employeesResult.employees || []);

        if (employees.length === 0 && !Array.isArray(employeesResult)) {
            console.log('Raw Employees Result:', JSON.stringify(employeesResult, null, 2));
        }

        employees.forEach(e => {
            console.log(`- ${e.first_name} ${e.last_name || ''} (ID: ${e.id}) Variations: ${JSON.stringify(e.variation_ids)}`);
        });

        console.log('\n--- RESOURCES ---');
        const resourcesResult = await partnerApiRequest('GET', '/resources', {
            location_mytime_ids: LOCATION_ID
        });

        const resources = Array.isArray(resourcesResult) ? resourcesResult : (resourcesResult.resources || []);

        if (resources.length === 0 && !Array.isArray(resourcesResult)) {
            console.log('Raw Resources Result:', JSON.stringify(resourcesResult, null, 2));
        }

        resources.forEach(r => {
            console.log(`- ${r.name} (ID: ${r.id})`);
        });

        console.log('\n--- VARIATIONS ---');
        const variationsResult = await partnerApiRequest('GET', '/variations', {
            location_mytime_id: LOCATION_ID
        });

        const variations = Array.isArray(variationsResult) ? variationsResult : (variationsResult.variations || []);

        variations.forEach(v => {
            console.log(`- ${v.name} (ID: ${v.id}) [Deal: ${v.deal_name}]`);
        });

    } catch (err) {
        console.error('Error:', err.message);
    }
}

run();
