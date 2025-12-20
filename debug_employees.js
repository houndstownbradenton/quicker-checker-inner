
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

async function listEmployees() {
    try {
        console.log('Fetching employees...');
        const res = await axios.get(`${BASE_URL}/api/employees`);

        if (res.data.success) {
            const employees = res.data.employees;
            console.log(`Found ${employees.length} employees.`);

            employees.forEach(e => {
                console.log(`- ${e.name} (ID: ${e.id}) [${e.email}]`);
            });
        } else {
            console.error('Failed:', res.data.error);
        }
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) console.log(error.response.data);
    }
}

listEmployees();
