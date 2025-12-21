import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VITE_MYTIME_API_KEY;
const COMPANY_ID = process.env.VITE_MYTIME_COMPANY_ID;
const LOCATION_ID = process.env.MYTIME_LOCATION_ID;

async function testBooking() {
    try {
        // 1. Create a cart
        console.log('Creating cart...');
        const cartRes = await axios.post('https://www.mytime.com/api/mkp/v1/carts', {
            company_id: parseInt(COMPANY_ID)
        }, { headers: { 'Authorization': API_KEY } });

        const cartId = cartRes.data.cart.id;
        console.log('Cart created:', cartId);

        // 2. Add Resident Daycare (8h) to cart
        const payload = {
            location_id: parseInt(LOCATION_ID),
            variation_ids: '110709520', // Resident Daycare (8h)
            deal_id: 261198,
            employee_id: 295287,
            begin_at: '2025-12-22T10:00:00-05:00',
            end_at: '2025-12-22T10:30:00-05:00',
            is_existing_customer: true,
            has_specific_employee: true,
            child_id: '2499475' // Colby
        };

        console.log('Adding item to cart...', JSON.stringify(payload, null, 2));
        const itemRes = await axios.post(`https://www.mytime.com/api/mkp/v1/carts/${cartId}/cart_items`, payload, {
            headers: { 'Authorization': API_KEY }
        });

        console.log('SUCCESS:', JSON.stringify(itemRes.data.cart_item, null, 2));
    } catch (error) {
        console.error('FAILED:', JSON.stringify(error.response?.data || error.message, null, 2));
    }
}

testBooking();
