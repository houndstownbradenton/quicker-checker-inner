import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration from .env
const MYTIME_BASE_URL = process.env.MYTIME_BASE_URL || 'https://www.mytime.com';
const MYTIME_API_KEY = process.env.VITE_MYTIME_API_KEY;
const COMPANY_ID = process.env.VITE_MYTIME_COMPANY_ID;
const LOCATION_ID = process.env.MYTIME_LOCATION_ID || '158078';

// Daycare variation IDs
const DAYCARE_VARIATIONS = {
    weekday: '91629241',      // Standard Daycare (Mon-Fri)
    saturday: '92628859',     // Saturday Daycare
    sunday: '111325854'       // Sunday Daycare (in case needed later)
};

// Get the appropriate daycare variation ID based on the day
function getDaycareVariationId(date = new Date()) {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

    if (dayOfWeek === 6) {
        return DAYCARE_VARIATIONS.saturday;
    } else if (dayOfWeek === 0) {
        return DAYCARE_VARIATIONS.sunday;
    } else {
        return DAYCARE_VARIATIONS.weekday;
    }
}

// Middleware
app.use(cors());
app.use(express.json());

// Helper to make MyTime API requests
// Uses API key by default, or user auth token for user-specific requests
async function mytimeRequest(method, endpoint, data = null, authToken = null) {
    const url = `${MYTIME_BASE_URL}/api/mkp/v1${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authToken || MYTIME_API_KEY
    };

    try {
        const response = await axios({
            method,
            url,
            data,
            headers
        });
        return response.data;
    } catch (error) {
        console.error(`MyTime API Error: ${method} ${endpoint}`, error.response?.data || error.message);
        throw error;
    }
}

// === API ROUTES ===

// Login - authenticate staff
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await mytimeRequest('POST', '/sessions', {
            email,
            password,
            company_id: parseInt(COMPANY_ID),
            recaptcha_token: null
        });

        res.json({
            success: true,
            user: result.user,
            token: result.user?.authentication_token
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Login failed'
        });
    }
});

// Get company data (includes custom fields for dog attributes)
app.get('/api/company', async (req, res) => {
    try {
        const result = await mytimeRequest('GET', `/companies/${COMPANY_ID}?include_custom_fields=true`);
        res.json({
            success: true,
            company: result.company,
            locationId: LOCATION_ID,
            daycareVariationId: DAYCARE_VARIATION_ID
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch company data'
        });
    }
});

// Get all locations for the company
app.get('/api/locations', async (req, res) => {
    try {
        const result = await mytimeRequest('GET', `/companies/${COMPANY_ID}/locations`);
        res.json({
            success: true,
            locations: result.locations || []
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch locations'
        });
    }
});

// Get deals (services) for a location
app.get('/api/deals', async (req, res) => {
    try {
        const { locationId } = req.query;
        const locId = locationId || LOCATION_ID;

        if (!locId) {
            return res.status(400).json({ success: false, error: 'Location ID required' });
        }

        const result = await mytimeRequest('GET', `/companies/${COMPANY_ID}/deals?location_ids=${locId}`);
        res.json({
            success: true,
            deals: result.deals || []
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch deals'
        });
    }
});

// Get all deals for the company (no location filter)
app.get('/api/deals/all', async (req, res) => {
    try {
        const result = await mytimeRequest('GET', `/companies/${COMPANY_ID}/deals`);
        res.json({
            success: true,
            deals: result.deals || []
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch deals'
        });
    }
});

// Get all variations for the company
app.get('/api/variations', async (req, res) => {
    try {
        const { locationId, noLocation } = req.query;

        let endpoint = `/companies/${COMPANY_ID}/variations`;

        // Only add location filter if not explicitly disabled
        if (noLocation !== 'true') {
            const locId = locationId || LOCATION_ID;
            if (locId) {
                endpoint += `?location_id=${locId}`;
            }
        }

        const result = await mytimeRequest('GET', endpoint);
        res.json({
            success: true,
            variations: result.variations || []
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch variations'
        });
    }
});

// Get all dogs (pets/children) for authenticated user
app.get('/api/dogs', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        if (!authToken) {
            return res.status(401).json({ success: false, error: 'Authorization required' });
        }

        const result = await mytimeRequest('GET', `/user/children?company_id=${COMPANY_ID}&include_label=true`, null, authToken);
        res.json({
            success: true,
            dogs: result.children || []
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch dogs'
        });
    }
});

// Get open times for daycare on a specific date
app.get('/api/open-times', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const { dogId, date } = req.query;

        const params = new URLSearchParams({
            location_id: LOCATION_ID,
            variation_ids: DAYCARE_VARIATION_ID,
            is_existing_customer: 'true',
            date: date || new Date().toISOString().split('T')[0]
        });

        if (dogId) {
            params.append('child_id', dogId);
        }

        const result = await mytimeRequest('GET', `/open_times?${params.toString()}`, null, authToken);
        res.json({
            success: true,
            openTimes: result.open_times || []
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch open times'
        });
    }
});

// Create a new cart
app.post('/api/cart', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const { userId } = req.body;

        const result = await mytimeRequest('POST', '/carts', {
            user_id: userId || null
        }, authToken);

        res.json({
            success: true,
            cart: result.cart
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to create cart'
        });
    }
});

// Add item to cart
app.post('/api/cart/:cartId/items', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const { cartId } = req.params;
        const { dogId, beginAt, endAt, dealId } = req.body;

        const result = await mytimeRequest('POST', `/carts/${cartId}/cart_items`, {
            location_id: parseInt(LOCATION_ID),
            variation_ids: DAYCARE_VARIATION_ID,
            deal_id: dealId,
            employee_ids: '',
            begin_at: beginAt,
            end_at: endAt,
            is_existing_customer: true,
            travel_to_customer: false,
            has_specific_employee: false,
            child_id: dogId ? parseInt(dogId) : null
        }, authToken);

        res.json({
            success: true,
            cartItem: result.cart_item,
            cart: result.cart
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to add cart item'
        });
    }
});

// Update cart (assign to user)
app.put('/api/cart/:cartId', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const { cartId } = req.params;
        const { userId } = req.body;

        const result = await mytimeRequest('PUT', `/carts/${cartId}`, {
            user_id: userId
        }, authToken);

        res.json({
            success: true,
            cart: result.cart
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to update cart'
        });
    }
});

// Create purchase (complete booking)
app.post('/api/purchase', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const { cartId, dogId } = req.body;

        const result = await mytimeRequest('POST', '/purchases', {
            note: 'Quick check-in via Quicker Checker',
            referrer: 'express_checkout',
            cart_id: cartId,
            is_embedded: true,
            no_pay: true,
            is_mobile_consumer_app: false,
            child_id: dogId ? parseInt(dogId) : null
        }, authToken);

        res.json({
            success: true,
            purchase: result.purchase
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to create purchase'
        });
    }
});

// Check in an appointment
app.put('/api/check-in/:appointmentId', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const { appointmentId } = req.params;

        const result = await mytimeRequest('PUT', `/appointments/${appointmentId}/check_in`, null, authToken);

        res.json({
            success: true,
            appointment: result
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to check in'
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        config: {
            baseUrl: MYTIME_BASE_URL,
            companyId: COMPANY_ID ? 'configured' : 'missing',
            locationId: LOCATION_ID ? 'configured' : 'missing',
            daycareVariationId: DAYCARE_VARIATION_ID ? 'configured' : 'missing'
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🐕 Quicker Checker server running on http://localhost:${PORT}`);
    console.log(`   MyTime API: ${MYTIME_BASE_URL}`);
    console.log(`   Company ID: ${COMPANY_ID}`);
    console.log(`   Location ID: ${LOCATION_ID}`);
});
