// using global fetch

const API_BASE = 'http://localhost:3000/api';

async function run() {
    try {
        console.log('Logging in...');
        const loginRes = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'patti.jaeger@houndstownusa.com', password: 'c0lby&j4ck' })
        });
        const loginData = await loginRes.json();
        const authToken = loginData.token;

        console.log('Fetching variations...');
        const varRes = await fetch(`${API_BASE}/variations`, {
            headers: { 'Authorization': authToken }
        });
        const varData = await varRes.json();

        console.log(`Total variations: ${varData.variations.length}`);

        // List all variations
        console.log('Listing ALL variations:');
        const list = varData.variations.map(v => ({
            id: v.id,
            name: v.name,
            service: v.service_name,
            bookable: v.bookable
        }));

        console.log(JSON.stringify(list, null, 2));

    } catch (e) {
        console.error(e);
    }
}

run();
