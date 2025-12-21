import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VITE_MYTIME_API_KEY;
const LOCATION_ID = process.env.MYTIME_LOCATION_ID;

async function dumpEmployees() {
    try {
        const url = `https://partners-api.mytime.com/api/employees?location_mytime_ids=${LOCATION_ID}`;
        const response = await axios.get(url, {
            headers: { 'X-Api-Key': API_KEY }
        });

        fs.writeFileSync('employees_dump.json', JSON.stringify(response.data, null, 2));
        console.log('Dumped to employees_dump.json');

        const employee = response.data.employees.find(e => e.id === 295287 || e.mytime_id === 295287);
        console.log('Target Employee:', JSON.stringify(employee, null, 2));
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}
import fs from 'fs';
dumpEmployees();
