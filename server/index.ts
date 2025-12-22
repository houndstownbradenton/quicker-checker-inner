import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from parent directory
dotenv.config({ path: join(__dirname, '..', '.env') });

// Inlined constants (TODO: refactor to separate module once ES module issues are resolved)
const LOCATION_ID = '158078';

const DAYCARE_VARIATIONS = {
    weekday: '91629241',      // Standard Daycare (Mon-Fri)
    saturday: '92628859',     // Saturday Daycare
    sunday: '111325854'       // Sunday Daycare
};

const EVALUATION_VARIATION_ID = '91420537';

const RESOURCE_MAP: Record<string, string> = {
    [DAYCARE_VARIATIONS.weekday]: '295287',
    [DAYCARE_VARIATIONS.saturday]: '295287',
    [EVALUATION_VARIATION_ID]: '295290', // Evaluation Staff
    '99860007': '295289'                // Bath (Grooming) -> Spa Services Staff
};

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration from .env
const MYTIME_BASE_URL = process.env.MYTIME_BASE_URL || 'https://www.mytime.com';
const MYTIME_API_KEY = process.env.MYTIME_API_KEY;
const COMPANY_ID = process.env.MYTIME_COMPANY_ID;

// Get the appropriate daycare variation ID based on the day
function getDaycareVariationId(date: Date = new Date()): string {
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
async function mytimeRequest(method: string, endpoint: string, data: any = null, authToken: string | null = null): Promise<any> {
    const url = `${MYTIME_BASE_URL}/api/mkp/v1${endpoint}`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authToken || MYTIME_API_KEY || ''
    };

    try {
        const response = await axios({
            method,
            url,
            data,
            headers
        });
        return response.data;
    } catch (error: any) {
        console.error(`MyTime API Error: ${method} ${endpoint}`, error.response?.data || error.message);
        throw error;
    }
}

// Helper to make Partner API requests (for location-wide access to clients/pets)
// Uses X-Api-Key header and partners-api.mytime.com host
async function partnerApiRequest(method: string, endpoint: string, dataOrParams: any = null): Promise<any> {
    const url = `https://partners-api.mytime.com/api${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Api-Key': MYTIME_API_KEY || ''
    };

    try {
        const config: any = {
            method,
            url,
            headers
        };

        // For POST/PUT, send as body data; for GET, send as query params
        if (method.toUpperCase() === 'GET') {
            config.params = dataOrParams;
        } else {
            config.data = dataOrParams;
        }

        const response = await axios(config);
        return response.data;
    } catch (error: any) {
        console.error(`Partner API Error: ${method} ${endpoint}`, error.response?.data || error.message);
        if (error.response?.data?.errors) {
            console.error(`Partner API Error Details:`, JSON.stringify(error.response.data.errors, null, 2));
        }
        throw error;
    }
}

// === API ROUTES ===

// Login - authenticate staff
app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        console.log(`Login attempt for: ${email}`);
        console.log(`Using Company ID: ${COMPANY_ID}`);

        // Removing recaptcha_token: null as some APIs reject explicit nulls
        const result = await mytimeRequest('POST', '/sessions', {
            email,
            password,
            company_id: COMPANY_ID ? parseInt(COMPANY_ID) : undefined
        });

        console.log(`Login successful for user: ${result.user?.id}`);

        res.json({
            success: true,
            user: result.user,
            token: result.user?.authentication_token
        });
    } catch (error: any) {
        const errorData = error.response ? error.response.data : { message: error.message };
        console.error('Login failed:', JSON.stringify(errorData));
        res.status(error.response?.status || 500).json({
            success: false,
            error: errorData.errors || errorData.error || 'Login failed'
        });
    }
});

// Get company data (includes custom fields for dog attributes)
app.get('/api/company', async (req: Request, res: Response) => {
    try {
        const result = await mytimeRequest('GET', `/companies/${COMPANY_ID}?include_custom_fields=true`);
        res.json({
            success: true,
            company: result.company,
            locationId: LOCATION_ID,
            daycareVariationId: getDaycareVariationId()
        });
    } catch (error: any) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch company data'
        });
    }
});

// Get all locations for the company
app.get('/api/locations', async (req: Request, res: Response) => {
    try {
        const result = await mytimeRequest('GET', `/companies/${COMPANY_ID}/locations`);
        res.json({
            success: true,
            locations: result.locations || []
        });
    } catch (error: any) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch locations'
        });
    }
});

// Get deals (services) for a location
app.get('/api/deals', async (req: Request, res: Response) => {
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
    } catch (error: any) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch deals'
        });
    }
});

// Get all deals for the company (no location filter)
app.get('/api/deals/all', async (req: Request, res: Response) => {
    try {
        const result = await mytimeRequest('GET', `/companies/${COMPANY_ID}/deals`);
        res.json({
            success: true,
            deals: result.deals || []
        });
    } catch (error: any) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch deals'
        });
    }
});

// Get all variations for the company
app.get('/api/variations', async (req: Request, res: Response) => {
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
    } catch (error: any) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch variations'
        });
    }
});

// Get all dogs (pets/children) for authenticated user
app.get('/api/dogs', async (req: Request, res: Response) => {
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
    } catch (error: any) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch dogs'
        });
    }

});

// Get employees for location
app.get('/api/employees', async (req: Request, res: Response) => {
    try {
        const { locationId, per_page } = req.query;
        const locId = locationId || LOCATION_ID;
        const perPage = per_page || 50;
        const result = await mytimeRequest('GET', `/companies/${COMPANY_ID}/employees?location_id=${locId}&per_page=${perPage}`);
        res.json({
            success: true,
            employees: result.employees || []
        });
    } catch (error: any) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch employees'
        });
    }
});


// Search dogs by name using Partner API (location-wide access)
app.get('/api/dogs/search', async (req: Request, res: Response) => {
    try {
        const authToken = req.headers.authorization;
        const { q } = req.query;

        if (!authToken) {
            return res.status(401).json({ success: false, error: 'Authorization required' });
        }

        if (typeof q !== 'string' || q.trim().length < 2) {
            return res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
        }

        const query = q.trim();
        const queryLower = query.toLowerCase();
        let allDogs: any[] = [];

        // Get clients at this location with their children
        // Note: We don't use the search parameter because it only searches client names, not pet names
        // We filter locally to support searching by pet name
        const clientsResult = await partnerApiRequest('GET', '/clients', {
            include_children: true,
            location_mytime_ids: LOCATION_ID ? [parseInt(LOCATION_ID)] : [],
            per_page: 20
        });

        const clients = clientsResult.clients || [];
        for (const client of clients) {
            if (client.children && Array.isArray(client.children)) {
                for (const child of client.children) {
                    allDogs.push({
                        ...child,
                        owner_first_name: client.first_name,
                        owner_last_name: client.last_name,
                        owner_email: client.email,
                        client_id: client.id || client.mytime_id,
                        preferred_location_mytime_id: client.preferred_location_mytime_id
                    });
                }
            }
        }

        // Also try /children endpoint with search for pet name search
        try {
            const childrenResult = await partnerApiRequest('GET', '/children', {
                search: query,
                per_page: 20
            });
            const children = childrenResult.children || childrenResult || [];
            if (Array.isArray(children)) {
                for (const child of children) {
                    // Avoid duplicates by checking mytime_id
                    const exists = allDogs.some(d => d.mytime_id === child.mytime_id);
                    if (!exists) {
                        allDogs.push(child);
                    }
                }
            }
        } catch (e: any) {
            // /children endpoint may not support search, that's ok
            console.log('Children search:', e.response?.data?.errors || e.message);
        }

        // Filter results by pet name or owner name
        const matchedDogs = allDogs.filter(dog => {
            const petName = (dog.pet_name || dog.label || dog.first_name || '').toLowerCase();
            const ownerName = `${dog.owner_first_name || ''} ${dog.owner_last_name || ''}`.toLowerCase();
            return petName.includes(queryLower) || ownerName.includes(queryLower);
        });

        // Sort: prefer dogs from clients with preferred_location matching our location
        const locationIdInt = LOCATION_ID ? parseInt(LOCATION_ID) : 0;
        matchedDogs.sort((a, b) => {
            const aPreferred = a.preferred_location_mytime_id === locationIdInt ? 1 : 0;
            const bPreferred = b.preferred_location_mytime_id === locationIdInt ? 1 : 0;
            return bPreferred - aPreferred; // Higher priority first
        });

        // Note: Partner API doesn't include photos for children
        // Photos are only available via Booking API which requires user-specific auth

        console.log(`Search for "${query}": ${clients.length} clients, ${matchedDogs.length} matched dogs`);

        res.json({
            success: true,
            dogs: matchedDogs
        });
    } catch (error: any) {
        console.error('Search error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to search dogs'
        });
    }
});

// Sync dogs and clients (paginated, location-wide)
app.get('/api/dogs/sync', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const page = parseInt(req.query.page as string) || 1;
        const perPage = Math.min(parseInt(req.query.per_page as string) || 20, 20);

        if (!authToken) {
            return res.status(401).json({ success: false, error: 'Authorization required' });
        }

        console.log(`Sync request: page ${page}, per_page ${perPage}`);

        // Get clients at this location with their children
        const clientsResult = await partnerApiRequest('GET', '/clients', {
            include_children: true,
            location_mytime_ids: [parseInt(LOCATION_ID)],
            page: page,
            per_page: perPage
        });

        const clients = clientsResult.clients || [];
        const totalClients = clientsResult.total_count || clients.length;
        const dogs = [];

        for (const client of clients) {
            if (client.children && Array.isArray(client.children)) {
                for (const child of client.children) {
                    dogs.push({
                        ...child,
                        owner_first_name: client.first_name,
                        owner_last_name: client.last_name,
                        owner_email: client.email,
                        client_id: client.id || client.mytime_id,
                        preferred_location_mytime_id: client.preferred_location_mytime_id
                    });
                }
            }
        }

        res.json({
            success: true,
            dogs: dogs,
            pagination: {
                page,
                perPage,
                totalClients,
                totalPages: Math.ceil(totalClients / perPage)
            }
        });
    } catch (error: any) {
        console.error('Sync error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to sync dogs'
        });
    }
});

// Get open times for daycare on a specific date
app.get('/api/open-times', async (req: Request, res: Response) => {
    try {
        const authToken = req.headers.authorization;
        const { dogId, date, variationId } = req.query as { dogId: string, date: string, variationId: string };
        console.log(`[open_times] REQUEST:`, req.query);

        // ... existing date parsing ...
        const selectedDate = (typeof date === 'string' ? date : null) || new Date().toISOString().split('T')[0];
        const [year, month, day] = selectedDate.split('-').map(Number);
        const localDate = new Date(year, month - 1, day);

        const targetVariationId = (typeof variationId === 'string' ? variationId : null) || getDaycareVariationId(localDate);
        console.log(`[open_times] Target variation: ${targetVariationId} (date: ${selectedDate})`);

        const params = new URLSearchParams({
            location_id: LOCATION_ID || '',
            variation_ids: targetVariationId,
            is_existing_customer: 'true',
            date: selectedDate
        });

        if (dogId) params.append('child_id', String(dogId));

        console.log(`[open_times] Calling MyTime: ${params.toString()}`);
        const result = await mytimeRequest('GET', `/open_times?${params.toString()}`, null, authToken);

        let openTimes = result.open_times || [];

        // FALLBACK: If Daycare and no times found, inject a default slot
        // Daycare is often "bookable: false" in API but valid for walk-ins/requests
        const isDaycare = Object.values(DAYCARE_VARIATIONS).includes(targetVariationId);

        if (isDaycare && openTimes.length === 0) {
            console.log(`[open_times] Empty Daycare slots. Injecting MOCK slot.`);

            // Hours: M-F (7-7), Sat (9-5)
            let startHour = 7;
            let endHour = 19; // 7 PM

            if (String(targetVariationId) === String(DAYCARE_VARIATIONS.saturday)) {
                startHour = 9;
                endHour = 17; // 5 PM
            }

            // For today, ensure start time is in the future
            const now = new Date();
            const selectedYMD = selectedDate;
            const nowYMD = now.toISOString().split('T')[0];

            if (selectedYMD === nowYMD) {
                const currentHour = now.getHours();
                if (currentHour >= 7) {
                    startHour = currentHour + 1; // Start next hour
                }
            }

            // Start hour may have been bumped past end hour?
            if (startHour >= endHour) {
                console.log('[open_times] Mock slot skipped: Closed or time passed.');
                openTimes = [];
            } else {
                // Format: HH:00:00
                const startStr = `${String(startHour).padStart(2, '0')}:00:00`;
                const endStr = `${String(endHour).padStart(2, '0')}:00:00`;

                openTimes = [{
                    start: `${selectedDate}T${startStr}-05:00`,
                    end: `${selectedDate}T${endStr}-05:00`,
                    begin_at: `${selectedDate}T${startStr}-05:00`,
                    end_at: `${selectedDate}T${endStr}-05:00`,
                    deal_id: 261198
                }];
            }
        }

        console.log(`[open_times] Sending ${openTimes.length} slots.`);

        res.json({
            success: true,
            openTimes: openTimes
        });
    } catch (error: any) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch open times'
        });
    }
});

// Create a new cart
app.post('/api/cart', async (req: Request, res: Response) => {
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
    } catch (error: any) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to create cart'
        });
    }
});

// Add item to cart
app.post('/api/cart/:cartId/items', async (req: Request, res: Response) => {
    try {
        const authToken = req.headers.authorization;
        const { cartId } = req.params;
        const { dogId, beginAt, endAt, dealId, variationId, employeeIds } = req.body;

        // Resource Mapping (Boarding ID: 295288, Evaluation ID: 295290)
        // User requested: Daycare -> Daycare Employee, Boarding -> Boarding Employee
        // Since "Daycare" employee is missing from list, we fallback to Boarding or generic logic
        // For now, we map Daycare variations to Boarding ID as it's the only generic "room" type available
        const RESOURCE_MAP = {
            '91629241': '295287', // Weekday Daycare -> Daycare Staff
            '92628859': '295287', // Sat Daycare -> Daycare Staff
            '111325854': '295287', // Sun Daycare -> Daycare Staff
            '91420537': '295290', // Evaluation -> Evaluation Staff
            '99860007': '295289'  // Bath (Grooming) -> Spa Services Staff
        };

        let targetEmployeeIds = employeeIds || '';

        // Auto-assign resource if not provided
        if (!targetEmployeeIds && variationId && (RESOURCE_MAP as Record<string, string>)[String(variationId)]) {
            targetEmployeeIds = (RESOURCE_MAP as Record<string, string>)[String(variationId)];
            console.log(`[cart] Auto-assigned resource ${targetEmployeeIds} for variation ${variationId}`);
        }

        // Get the correct variation based on the booking date
        // Parse date as local time to get correct day of week
        let bookingDate = new Date();
        if (beginAt) {
            const dateStr = beginAt.split('T')[0]; // Extract date portion
            const [year, month, day] = dateStr.split('-').map(Number);
            bookingDate = new Date(year, month - 1, day); // month is 0-indexed
        }

        const result = await mytimeRequest('POST', `/carts/${cartId}/cart_items`, {
            location_id: LOCATION_ID ? parseInt(LOCATION_ID) : undefined,
            variation_ids: String(variationId || getDaycareVariationId(bookingDate)),
            deal_id: dealId ? parseInt(dealId) : null,
            employee_ids: targetEmployeeIds || '',
            begin_at: beginAt,
            end_at: endAt,
            is_existing_customer: true,
            travel_to_customer: false,
            has_specific_employee: !!targetEmployeeIds,
            child_id: dogId ? String(dogId) : null
        }, authToken);

        res.json({
            success: true,
            cartItem: result.cart_item,
            cart: result.cart
        });
    } catch (error: any) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to add cart item'
        });
    }
});

// Update cart (assign to user)
app.put('/api/cart/:cartId', async (req: Request, res: Response) => {
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
    } catch (error: any) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to update cart'
        });
    }
});

// Create purchase (complete booking)
app.post('/api/purchase', async (req: Request, res: Response) => {
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
    } catch (error: any) {
        console.error('Create purchase error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || error.response?.data || 'Failed to create purchase'
        });
    }
});

// Direct booking bypass using Partners API (to bypass "bookable: false" restriction)
app.post('/api/appointments/direct', async (req: Request, res: Response) => {
    try {
        const { dogId, variationId, beginAt, endAt, employeeId, clientId } = req.body;

        // Determine employee ID: use provided one, or look up from RESOURCE_MAP
        const finalEmployeeId = employeeId || RESOURCE_MAP[variationId];

        if (!finalEmployeeId) {
            console.error(`[direct_booking] No employee found for variation ${variationId}`);
            return res.status(400).json({
                success: false,
                error: `No employee/resource mapping found for variation ${variationId}`
            });
        }

        const appointmentData: any = {
            location_mytime_id: parseInt(LOCATION_ID),
            employee_mytime_id: parseInt(finalEmployeeId),
            variations: [{
                variation_id: parseInt(variationId)
            }],
            begin_at: beginAt,
            end_at: endAt,
            child_id: dogId ? parseInt(dogId) : undefined,
            is_existing_customer: true,
            send_notifications: false
        };

        // Only include client_mytime_id if provided
        if (clientId) {
            appointmentData.client_mytime_id = parseInt(clientId);
        }

        const result = await partnerApiRequest('POST', '/appointments', appointmentData);

        res.json({
            success: true,
            appointment: result.appointment
        });
    } catch (error: any) {
        console.error(`[direct_booking] Error:`, error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || error.message || 'Failed to create direct appointment'
        });
    }
});

// Check in an appointment
app.put('/api/check-in/:appointmentId', async (req: Request, res: Response) => {
    try {
        const authToken = req.headers.authorization;
        const { appointmentId } = req.params;

        const result = await mytimeRequest('PUT', `/appointments/${appointmentId}/check_in`, null, authToken);

        res.json({
            success: true,
            appointment: result
        });
    } catch (error: any) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to check in'
        });
    }
});

// Diagnostic: List all employees to verify emails
app.get('/api/debug/employees', async (req: Request, res: Response) => {
    try {
        console.log('Fetching employee list...');
        const result = await partnerApiRequest('GET', '/employees');
        const employees: any[] = result.employees || [];

        res.json({
            success: true,
            count: employees.length,
            employees: employees.map(e => ({
                id: e.mytime_id,
                name: `${e.first_name} ${e.last_name}`,
                email: e.email,
                active: e.active
            }))
        });
    } catch (error: any) {
        console.error('Failed to fetch employees:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.response ? error.response.data : null
        });
    }
});

// Diagnostic: Verify API Key and IDs
app.get('/api/debug/verify-config', async (req: Request, res: Response) => {
    try {
        console.log('Running diagnostic check...');
        // The Partner API /locations endpoint doesn't require a company_id
        const result = await partnerApiRequest('GET', '/locations');
        const locations: any[] = result.locations || result.clients || [];

        const bradenton = locations.find(l =>
            l.name?.toLowerCase().includes('bradenton') ||
            String(l.mytime_id) === String(LOCATION_ID)
        );

        res.json({
            success: true,
            currentConfig: {
                companyId: COMPANY_ID,
                locationId: LOCATION_ID
            },
            discovered: bradenton ? {
                name: bradenton.name,
                company_id: bradenton.company_id,
                location_id: bradenton.mytime_id
            } : 'Bradenton not found in your account locations',
            allAccountLocations: locations.map(l => ({ name: l.name, id: l.mytime_id, company_id: l.company_id }))
        });
    } catch (error: any) {
        console.error('Diagnostic failed:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.response ? error.response.data : null
        });
    }
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        config: {
            baseUrl: MYTIME_BASE_URL,
            companyId: COMPANY_ID ? 'configured' : 'missing',
            locationId: LOCATION_ID ? 'configured' : 'missing',
            daycareVariationId: getDaycareVariationId() ? 'configured' : 'missing'
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
