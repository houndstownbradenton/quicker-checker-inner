
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const EMAIL = 'patti.jaeger@houndstownusa.com';
const PASSWORD = 'c0lby&j4ck';
const DOG_ID = 112837451; // Use a known existing dog ID (from previous debug output) or 197178083 (Colby)

// Saturday Variation ID
const SATURDAY_VARIATION_ID = '92628859';
const SATURDAY_DATE = '2025-12-27'; // Future Saturday

async function debugCheckin() {
    try {
        console.log('1. Logging in...');
        const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
            email: EMAIL,
            password: PASSWORD
        });
        const token = loginRes.data.token;
        const userId = loginRes.data.user.id;
        console.log('   Login successful.');

        console.log('2. Creating Cart...');
        const cartRes = await axios.post(`${BASE_URL}/api/cart`, { userId }, {
            headers: { Authorization: token }
        });
        const cartId = cartRes.data.cart.id;
        console.log(`   Cart created: ${cartId}`);

        console.log('3. Fetching Open Times (to trigger Mock logic)...');
        const openTimesRes = await axios.get(`${BASE_URL}/api/open-times`, {
            headers: { Authorization: token },
            params: {
                variationId: SATURDAY_VARIATION_ID,
                date: SATURDAY_DATE,
                dogId: DOG_ID
            }
        });
        const slot = openTimesRes.data.openTimes[0];
        console.log('   Slot found:', slot);

        if (!slot) {
            console.error('FAIL: No open times found even with mock logic!');
            return;
        }

        console.log('4. Adding to Cart (The failing step)...');
        try {
            const addRes = await axios.post(`${BASE_URL}/api/cart/${cartId}/items`, {
                dogId: DOG_ID,
                beginAt: slot.begin_at,
                endAt: slot.end_at,
                dealId: slot.deal_id,
                employeeIds: [295288], // Boarding
                variationId: SATURDAY_VARIATION_ID
            }, {
                headers: { Authorization: token }
            });
            console.log('SUCCESS: Item added to cart.');
        } catch (addError) {
            console.error('FAIL: Add to Cart failed.');
            console.error('Status:', addError.response?.status);
            console.error('Data:', JSON.stringify(addError.response?.data, null, 2));
        }

    } catch (error) {
        console.error('Global Error:', error.message);
        if (error.response) console.error(error.response.data);
    }
}

debugCheckin();
