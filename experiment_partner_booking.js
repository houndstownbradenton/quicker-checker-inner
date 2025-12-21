import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VITE_MYTIME_API_KEY;
const LOCATION_ID = process.env.MYTIME_LOCATION_ID;

async function testPartnerBooking() {
    try {
        const date = '2025-12-23'; // Tuesday
        const beginAt = `${date}T10:00:00Z`;
        const endAt = `${date}T10:30:00Z`;

        const payload = {
            booked_by: 'merchant',
            partner_name: 'Quicker Checker',
            location_mytime_id: 158078,
            location_partner_id: '66',
            variations: [
                {
                    variation_mytime_id: '91629241', // Daycare
                    variation_partner_id: '91629241',
                    variation_employee_id: '295287',
                    price: 36,
                    variation_begin_at: beginAt,
                    variation_end_at: endAt
                }
            ]
        };

        console.log('Attempting Partner API Booking (IDs in body):', JSON.stringify(payload, null, 2));

        const response = await axios.post(`https://partners.mytime.com/api/v1/appointments`, payload, {
            params: {
                location_mytime_id: LOCATION_ID,
                location_partner_id: '66',
                client_mytime_id: 16969085, // Patti Jaegar
                child_mytime_id: 2499475,   // Colby
                employee_mytime_id: 295287, // Daycare Staff
                begin_at: beginAt,
                end_at: endAt,
                check_conflicts: false
            },
            headers: {
                'X-Api-Key': API_KEY,
                'Content-Type': 'application/json'
            }
        });

        console.log('SUCCESS:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('FAILED:', JSON.stringify(error.response?.data || error.message, null, 2));
    }
}

testPartnerBooking();
