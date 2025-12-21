
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
        const staffId = '295287'; // Daycare
        const date = process.argv[2] || '2025-12-22';

        console.log(`Checking schedule for staff ${staffId} on ${date}...`);

        const schedule = await partnerApiRequest('GET', '/staff_schedule', {
            employee_mytime_id: staffId,
            location_mytime_id: LOCATION_ID,
            start_date: date,
            end_date: date
        });

        console.log(JSON.stringify(schedule, null, 2));

    } catch (err) {
        console.error('Error:', err.message);
    }
}

run();
