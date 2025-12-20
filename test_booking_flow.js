// using global fetch (Node 18+)

const API_BASE = 'http://localhost:3000/api';
let authToken = '';
let userId = '';

async function run() {
    try {
        console.log('1. Logging in...');
        const loginRes = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'patti.jaeger@houndstownusa.com', password: 'c0lby&j4ck' })
        });
        const loginData = await loginRes.json();
        if (!loginData.success) throw new Error('Login failed');
        authToken = loginData.token;
        userId = loginData.user.id;
        console.log('   Logged in as:', loginData.user.name, '(ID:', userId, ')');

        console.log('2. Searching for Colby...');
        const searchRes = await fetch(`${API_BASE}/dogs/search?q=Colby`, {
            headers: { 'Authorization': authToken }
        });
        const searchData = await searchRes.json();
        const dog = searchData.dogs[0]; // Assuming first is correct
        if (!dog) throw new Error('Dog not found');
        console.log('   Found dog:', dog.name, '(ID:', dog.id, ')');

        console.log('3. Getting Open Times...');
        const date = '2025-12-23';
        // Boarding - 1 Dog Townhome ID: 91404079
        const variationId = '91404079';
        // Evaluation ID: 91420537
        const evalId = '91420537';

        // ... Get Times ...
        const timesRes = await fetch(`${API_BASE}/open-times?dogId=${dog.id}&date=${date}&variationId=${variationId}`, {
            headers: { 'Authorization': authToken }
        });
        const timesData = await timesRes.json();
        const slot = timesData.openTimes?.[0];
        if (!slot) throw new Error('No slots found');
        console.log('   Found slot:', slot.begin_at);

        console.log('4. Creating Cart...');
        const cartRes = await fetch(`${API_BASE}/cart`, {
            method: 'POST',
            headers: { 'Authorization': authToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });
        const cartData = await cartRes.json();
        const cartId = cartData.cart.id;
        console.log('   Cart created:', cartId);

        console.log('5. Adding Evaluation Item...');
        const addEvalRes = await fetch(`${API_BASE}/cart/${cartId}/items`, {
            method: 'POST',
            headers: { 'Authorization': authToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dogId: dog.id,
                beginAt: slot.begin_at,
                endAt: slot.end_at,
                dealId: slot.deal_id,
                variationId: evalId
            })
        });
        const addEvalData = await addEvalRes.json();
        console.log('   Eval Add Result:', addEvalData.success);

        console.log('5b. Adding Boarding Item...');
        const addItemRes = await fetch(`${API_BASE}/cart/${cartId}/items`, {
            method: 'POST',
            headers: { 'Authorization': authToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dogId: dog.id,
                beginAt: slot.begin_at,
                endAt: slot.end_at,
                dealId: slot.deal_id,
                variationId: variationId
            })
        });
        const addItemData = await addItemRes.json();
        if (!addItemData.success) {
            console.log('Add Boarding Failed:', addItemData.error);
        } else {
            console.log('   Boarding Item added.');
        }

        console.log('6. Updating Cart (Assign User)...');
        const updateCartRes = await fetch(`${API_BASE}/cart/${cartId}`, {
            method: 'PUT',
            headers: { 'Authorization': authToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });
        // Check success? app.js doesn't explicitly check success property for updateCart return
        console.log('   Cart updated.');

        console.log('7. Creating Purchase (Confirming)...');
        const purchaseRes = await fetch(`${API_BASE}/purchase`, {
            method: 'POST',
            headers: { 'Authorization': authToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ cartId, dogId: dog.id })
        });

        const purchaseText = await purchaseRes.text();
        console.log('   Purchase Status:', purchaseRes.status);
        try {
            const purchaseJson = JSON.parse(purchaseText);
            console.log('   Purchase Response:', JSON.stringify(purchaseJson, null, 2));
        } catch (e) {
            console.log('   Purchase Response (Text):', purchaseText);
        }

    } catch (err) {
        console.error('ERROR:', err);
    }
}

run();
