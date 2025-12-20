
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const EMAIL = 'patti.jaeger@houndstownusa.com';
const PASSWORD = 'old_password';

// Daycare Variation IDs from server/index.js
const DAYCARE_VARIATIONS = {
    weekday: '91629241',
    saturday: '92628859'
};

async function testDaycare() {
    try {
        // 1. Login
        console.log('Logging in...');
        const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
            email: EMAIL,
            password: PASSWORD
        });
        const token = loginRes.data.token;
        console.log('Login successful. Token:', token.substring(0, 10) + '...');

        // 2. Check Availability for Next Monday (Weekday Daycare)
        // Calculate next Monday
        const d = new Date();
        d.setDate(d.getDate() + (1 + 7 - d.getDay()) % 7); // Next Monday
        const dateStr = d.toISOString().split('T')[0];

        // Ensure we are selecting a weekday
        console.log(`Checking Daycare Availability for: ${dateStr}`);

        const openTimesRes = await axios.get(`${BASE_URL}/api/open-times`, {
            headers: { Authorization: token },
            params: {
                variationId: DAYCARE_VARIATIONS.weekday,
                date: dateStr
            }
        });

        console.log('Open Times Response:', JSON.stringify(openTimesRes.data, null, 2));

        if (openTimesRes.data.openTimes.length === 0) {
            console.error('FAIL: No open times found for Daycare!');
        } else {
            console.log('SUCCESS: Found open times.');
        }

    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
    }
}

testDaycare();
