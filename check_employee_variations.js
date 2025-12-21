import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VITE_MYTIME_API_KEY;
const COMPANY_ID = process.env.VITE_MYTIME_COMPANY_ID;

async function checkEmployeeVariations(employeeId) {
    try {
        const url = `https://partners-api.mytime.com/api/employees/${employeeId}`;
        const response = await axios.get(url, {
            headers: { 'X-Api-Key': API_KEY }
        });

        const employee = response.data.employee;
        console.log(`Employee: ${employee.first_name} ${employee.last_name} (ID: ${employee.id})`);
        console.log('Variations:', employee.variation_ids);

        // Also check if they work at the location
        console.log('Locations:', employee.location_ids);
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

checkEmployeeVariations('295287');
