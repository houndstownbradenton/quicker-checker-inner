import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VITE_MYTIME_API_KEY;
const LOCATION_ID = process.env.MYTIME_LOCATION_ID;

async function checkPricings() {
    try {
        const url = `https://partners-api.mytime.com/api/pricings?location_mytime_ids=${LOCATION_ID}`;
        const response = await axios.get(url, {
            headers: { 'X-Api-Key': API_KEY }
        });

        const targetEmployeeId = 295287;
        const targetVariationId = 91629241;

        const pricings = response.data.pricings || [];
        console.log(`Total pricings found: ${pricings.length}`);

        const employeePricings = pricings.filter(p => p.employee_mytime_id === targetEmployeeId);
        console.log(`Pricings for Employee ${targetEmployeeId}:`, JSON.stringify(employeePricings, null, 2));

        const specificPricing = employeePricings.find(p => p.variation_mytime_id === targetVariationId);
        if (specificPricing) {
            console.log('--- FOUND SPECIFIC PRICING ---');
            console.log(JSON.stringify(specificPricing, null, 2));
        } else {
            console.log('--- NO PRICING FOUND FOR THIS EMPLOYEE/VARIATION COMBO ---');
        }
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

checkPricings();
