import http from 'http';

const req = http.request('http://localhost:3000/api/health', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Content-Type: ${res.headers['content-type']}`);
        try {
            JSON.parse(data);
            console.log('JSON: OK');
        } catch (e) {
            console.log('JSON: FAIL -', e.message);
            console.log('Body:', data.substring(0, 200));
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.end();
