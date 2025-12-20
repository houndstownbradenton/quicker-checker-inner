
import axios from 'axios';

const BASE_URL = 'http://localhost:3000'; // Make sure this matches running server

async function fetchVariations() {
    try {
        console.log('Fetching variations...');
        const res = await axios.get(`${BASE_URL}/api/variations?noLocation=true`);

        if (res.data.success) {
            const variations = res.data.variations;
            console.log(`Found ${variations.length} variations.`);

            // Search for our known Daycare IDs
            const targets = ['91629241', '92628859', '111325854'];

            const found = variations.filter(v => targets.includes(String(v.id)));

            found.forEach(v => {
                console.log(`\n--- Variation: ${v.name} ---`);
                console.log(`ID: ${v.id}`);
                console.log(`Deal ID: ${v.deal_id}`); // This is what we need
            });
        }
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) console.log(error.response.data);
    }
}

fetchVariations();
