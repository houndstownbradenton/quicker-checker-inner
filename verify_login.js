import http from 'http';

const postData = JSON.stringify({
    email: 'aaron@houndstownbradenton.com', // valid
    password: 'password'
});

const req = http.request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log(`Login Status: ${res.statusCode}`);
        console.log(`Content-Type: ${res.headers['content-type']}`);
        try {
            const json = JSON.parse(data);
            console.log('Login JSON: OK');
            console.log('Success:', json.success);
        } catch (e) {
            console.log('Login JSON: FAIL -', e.message);
            console.log('Body:', data.substring(0, 300));
        }
    });
});

req.on('error', (e) => console.error(e));
req.write(postData);
req.end();
