import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { enrichDogsWithPhotos } from './supabase.ts';

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

// Employee/Staff IDs
const EMPLOYEE_IDS = {
    boarding: '295288',
    spaServices: '295289',
    evaluation: '295290',
    daycare: '295287'
};

const RESOURCE_MAP: Record<string, string> = {
    [DAYCARE_VARIATIONS.weekday]: EMPLOYEE_IDS.daycare,
    [DAYCARE_VARIATIONS.saturday]: EMPLOYEE_IDS.daycare,
    [EVALUATION_VARIATION_ID]: EMPLOYEE_IDS.evaluation,
    // Spa variations will use spaServices employee
};

// Variation ID to name lookup for logging
const VARIATION_NAMES: Record<string, string> = {
    '91629241': 'Daycare',
    '92628859': 'Saturday Daycare',
    '110709520': 'Resident Daycare',
    '91420537': 'Evaluation',
    '99860007': 'Bath (Primary)',
    '91629719': 'Townie Bath',
    '91629630': 'Townie Deluxe Bath',
    '91425203': 'Nails',
    '106411403': 'Stand Alone Nails',
    '91425254': 'Blueberry Facial',
    '91425350': 'Teeth Brushing',
    '110883216': 'All Add-Ons',
    '91404079': 'Boarding - 1 Dog Townhome',
    '91404147': 'Boarding - 1 Dog Luxury Suite',
    '111734724': 'Boarding - 1 Dog Double Suite'
};

// Variation IDs that are add-ons (need a parent service)
const ADD_ON_VARIATION_IDS: Set<string> = new Set([
    '91629719',   // Townie Bath
    '91629630',   // Townie Deluxe Bath
    '91425203',   // Nails
    '106411403',  // Stand Alone Nails
    '91425254',   // Blueberry Facial
    '91425350',   // Teeth Brushing
    '110883216',  // All Add-Ons
    '112837451',  // Use Staff: SPA SERVICES
    '112837449',  // Use Staff: FEE
    '110763601',  // After 12pm Check Out
]);

// Dynamic variation cache - populated from API at startup
interface VariationInfo {
    id: string;
    name: string;
    duration: number;  // in minutes
    add_on: boolean;
    price: number;
}

const variationCache: Map<string, VariationInfo> = new Map();

// Get duration for a variation
function getVariationDuration(varId: string): number {
    const cached = variationCache.get(varId);
    if (cached && cached.duration > 0) return cached.duration;
    return 15; // Default 15 min if unknown
}

// Get duration as the API sees it (from cache)
function getApiDuration(varId: string): number {
    const cached = variationCache.get(varId);
    return cached?.duration ?? 0;
}

// Get variation info from cache
function getVariationInfo(varId: string): VariationInfo | undefined {
    return variationCache.get(varId);
}

// Primary Bath service ID - used as parent for spa add-ons
const SPA_PRIMARY_SERVICE_ID = '99860007';

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

// Load and cache all variations from Partner API
async function loadVariationsCache(force: boolean = false): Promise<void> {
    try {
        if (force) {
            console.log('[cache] Forcing fresh load of variations from Partner API...');
        } else if (variationCache.size > 0) {
            return; // Already loaded and not forcing refresh
        }

        const result = await partnerApiRequest('GET', '/variations', {
            location_mytime_id: LOCATION_ID
        });

        const variations = result.variations || [];
        if (force) console.log(`[cache] Found ${variations.length} variations`);

        for (const v of variations) {
            const id = String(v.id || v.mytime_id);
            const info: VariationInfo = {
                id,
                name: v.name || 'Unknown',
                duration: v.duration || 0,
                add_on: v.add_on || false,
                price: v.pricings?.[0]?.existing_list_price || v.price || 0
            };
            variationCache.set(id, info);

            // Also update the name lookup
            if (info.name && info.name !== 'Unknown') {
                VARIATION_NAMES[id] = info.name;
            }
        }

        if (force) console.log(`[cache] Refreshed ${variationCache.size} variations`);
    } catch (error: any) {
        console.error('[cache] Failed to load variations cache:', error.message);
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

// Get variations for a specific employee (e.g., Spa Services)
app.get('/api/variations/by-employee/:employeeId', async (req: Request, res: Response) => {
    try {
        const { employeeId } = req.params;

        // Try Partner API /variations with employee_id and location_mytime_id
        const result = await partnerApiRequest('GET', '/variations', {
            employee_id: employeeId,
            location_mytime_id: LOCATION_ID
        });

        console.log(`[variations_by_employee] Employee ${employeeId} variations:`,
            (result.variations || []).map((v: any) => v.name));

        res.json({
            success: true,
            variations: result.variations || []
        });
    } catch (error: any) {
        console.error(`[variations_by_employee] Error:`, error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch employee variations'
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
        const dogs = result.children || [];

        // Enrich dogs with photos from Supabase
        await enrichDogsWithPhotos(dogs);

        res.json({
            success: true,
            dogs: dogs
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

        // Log employee names and IDs for debugging
        const employees = result.employees || [];
        console.log('[employees] Found employees:', employees.map((e: any) => ({
            id: e.id || e.mytime_id,
            name: e.name || `${e.first_name} ${e.last_name}`,
            nickname: e.nickname
        })));

        res.json({
            success: true,
            employees: employees
        });
    } catch (error: any) {
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch employees'
        });
    }
});

// Get employees via Partner API (better data)
app.get('/api/employees/partner', async (req: Request, res: Response) => {
    try {
        const result = await partnerApiRequest('GET', '/employees');
        const employees = result.employees || [];

        // Log for debugging
        console.log('[partner_employees] Found employees:', employees.map((e: any) => ({
            mytime_id: e.mytime_id,
            name: e.name || `${e.first_name || ''} ${e.last_name || ''}`.trim(),
            nickname: e.nickname
        })));

        res.json({
            success: true,
            employees: employees
        });
    } catch (error: any) {
        console.error('[partner_employees] Error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.errors || 'Failed to fetch employees from Partner API'
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

        // Enrich dogs with photos from Supabase
        await enrichDogsWithPhotos(matchedDogs);

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
        const totalClients = clientsResult.total_count || clientsResult.count || clients.length;
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

        // Enrich dogs with photos from Supabase
        await enrichDogsWithPhotos(dogs);

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

            // Static business hours - Daycare: M-F 7a-7p, Sat 9a-5p
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

        console.log(`[open_times] Sending ${openTimes.length} slots.`);

        // Log first 3 slots for debugging
        if (openTimes.length > 0) {
            console.log(`[open_times] Sample slots:`);
            openTimes.slice(0, 3).forEach((slot: any, i: number) => {
                console.log(`  Slot ${i + 1}: begin_at=${slot.begin_at}, end_at=${slot.end_at}`);
            });
        }

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
            note: 'Appointment scheduled with Quicker Checker Inner app.',
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
        // Ensure variation cache is fresh before booking
        await loadVariationsCache(true);

        const { dogId, variationId, variations, beginAt, endAt, employeeId, clientId, notes } = req.body;

        // Build variations array - either from provided array or from single variationId
        let variationsArray: any[] = [];
        let customEndAt: string | undefined;

        // Helper to get variation name for logging
        const getVarName = (id: string) => VARIATION_NAMES[id] || `Unknown(${id})`;

        let appointmentEndAt = endAt; // Initialize with request param, will update with strict API calculation

        if (variations && Array.isArray(variations) && variations.length > 0) {
            // Extract variation IDs from the request
            let requestedVarIds = variations.map((v: any) => String(v.variation_mytime_id || v.variationId));

            // Log the requested services with durations from cache
            const serviceInfo = requestedVarIds.map(id => {
                const dur = getVariationDuration(id);
                const info = getVariationInfo(id);
                return `${getVarName(id)}(${dur}min, $${info?.price ?? 0})`;
            }).join(', ');
            console.log(`[direct_booking] Requested services: ${serviceInfo}`);

            // Check if ALL requested variations are add-ons
            const allAreAddOns = requestedVarIds.every(id => ADD_ON_VARIATION_IDS.has(id));

            if (allAreAddOns) {
                console.log('[direct_booking] All variations are add-ons - prepending primary Bath service');
                // Prepend the primary Bath service as the parent
                requestedVarIds = [SPA_PRIMARY_SERVICE_ID, ...requestedVarIds];
            }

            // Define primary variation ID (first service)
            const primaryVariationId = requestedVarIds[0];

            // Calculate END_AT strictly based on API definition (ignoring fallbacks) to pass validation
            // API sums durations of non-buffer segments (non-add-ons)
            let apiDefinedDuration = 0;
            requestedVarIds.forEach(id => {
                const info = getVariationInfo(id);
                if (!info?.add_on) { // Only sum non-add-on durations
                    apiDefinedDuration += getApiDuration(id);
                }
            });
            const apiEndAt = new Date(new Date(beginAt).getTime() + apiDefinedDuration * 60 * 1000).toISOString().replace('.000Z', 'Z');
            console.log(`[direct_booking] API Defined Duration (Strict): ${apiDefinedDuration}min, End: ${apiEndAt}`);

            // Calculate REAL total duration (using fallbacks) for logs
            const totalRealDuration = requestedVarIds.reduce((sum, id) => sum + getVariationDuration(id), 0);
            console.log(`[direct_booking] Total real duration: ${totalRealDuration}min`);

            let currentStart = new Date(beginAt);

            // Build variations - Staggered based on actual duration
            variationsArray = requestedVarIds.map((varId: string, index: number) => {
                const varEmployeeId = RESOURCE_MAP[varId] || EMPLOYEE_IDS.spaServices;
                const varDuration = getVariationDuration(varId);
                const varInfo = getVariationInfo(varId);
                const varPrice = varInfo?.price ?? 0;

                const varBegin = currentStart.toISOString().replace('.000Z', 'Z');
                currentStart = new Date(currentStart.getTime() + varDuration * 60 * 1000);
                const varEnd = currentStart.toISOString().replace('.000Z', 'Z');

                const variation: any = {
                    variation_mytime_id: String(varId),
                    variation_employee_id: String(varEmployeeId),
                    variation_begin_at: varBegin,
                    variation_end_at: varEnd,
                    price: varPrice
                };

                // Add parent_id for add-ons (index > 0 means it's after the primary service)
                if (index > 0) {
                    variation.parent_id = String(primaryVariationId);
                    console.log(`[direct_booking] Add-on: ${getVarName(varId)} (${varDuration}min) -> parent: ${getVarName(primaryVariationId)}`);
                }

                return variation;
            });
        } else if (variationId) {
            // Single variation (legacy/non-spa)
            const varInfo = getVariationInfo(variationId);
            const varPrice = varInfo?.price ?? 0;
            console.log(`[direct_booking] Single service: ${getVarName(variationId)} ($${varPrice})`);
            const finalEmployeeId = employeeId || RESOURCE_MAP[variationId] || EMPLOYEE_IDS.spaServices;

            // Single service logic - need to calculate end_at?
            // Existing logic uses endAt request param which is 24h for Boarding.
            // If we want consistent validation, we should ALSO re-calculate strict API end for single service.

            // Re-calculate strict end for single service too
            const apiDur = getApiDuration(variationId);
            const strictEndAt = new Date(new Date(beginAt).getTime() + apiDur * 60 * 1000).toISOString().replace('.000Z', 'Z');
            console.log(`[direct_booking] Single Service API Duration: ${apiDur}min, End: ${strictEndAt}`);

            variationsArray = [{
                variation_mytime_id: String(variationId),
                variation_employee_id: String(finalEmployeeId),
                variation_begin_at: beginAt,
                variation_end_at: strictEndAt, // Use strict end for variation too? No keep original endAt? 
                // Wait, if validation checks "end_at must be latest end_at of non-buffer segments",
                // then variation_end_at must match end_at.
                // Let's us strictEndAt for both.
                price: varPrice
            }];

            // NOTE: Overwriting `endAt` usage below -> Use appointmentEndAt instead
            // endAt = strictEndAt; 
            appointmentEndAt = strictEndAt;
        } else {
            return res.status(400).json({ error: 'Missing variations' });
        }

        // ...

        // Use the strict API end time
        // Determine primary ...
        const primaryEmployeeId = variationsArray[0]?.variation_employee_id || EMPLOYEE_IDS.spaServices;

        // Use the last variation's end_at directly to ensure exact format match
        const latestEndAt = variationsArray[variationsArray.length - 1].variation_end_at;

        // Log calculated appointment times because it's confusing
        const calcBegin = new Date(beginAt);
        const calcEnd = new Date(latestEndAt);
        const calcDurationMin = Math.round((calcEnd.getTime() - calcBegin.getTime()) / 60000);
        console.log(`[direct_booking] Calculated appointment (Real): ${beginAt} to ${latestEndAt} (${calcDurationMin}min)`);

        // UNIFIED DURATION & END TIME LOGIC
        // This overrides any previous calculations to ensure specific business rules are met

        // 1. Identify Service Type (Boarding vs Spa/Other)
        const primaryVarIdRaw = variationsArray[0]?.variation_mytime_id;
        const primaryInfo = getVariationInfo(primaryVarIdRaw);
        const isBoarding = primaryInfo?.service_name === 'Boarding' || primaryInfo?.name?.toLowerCase().includes('boarding');

        if (isBoarding) {
            // Rule: Boarding uses ALIGNED times for API validation (same time of day)
            // Multi-day stays = N × 24h duration. 12PM checkout is handled operationally by staff.

            // Get the intended checkout date from the request endAt
            const checkoutDate = endAt ? new Date(endAt) : new Date(new Date(beginAt).getTime() + 24 * 60 * 60 * 1000);
            const beginDate = new Date(beginAt);

            // Align check-out to same clock time as check-in for API validation
            // We use the requested date but force the HOUR/MIN to match beginAt
            const alignedCheckout = new Date(checkoutDate);
            alignedCheckout.setUTCHours(beginDate.getUTCHours(), beginDate.getUTCMinutes(), 0, 0);

            appointmentEndAt = alignedCheckout.toISOString().replace('.000Z', 'Z');

            const nights = Math.max(1, Math.round((alignedCheckout.getTime() - beginDate.getTime()) / (24 * 60 * 60 * 1000)));
            console.log(`[direct_booking] Boarding: ${nights} night stay -> ${appointmentEndAt}`);

            // For boarding, we use ONE variation spanning the whole stay
            // WARNING: MyTime configuration MUST match the stay duration (e.g. 24h per night)
            if (variationsArray.length > 0) {
                variationsArray[0].variation_end_at = appointmentEndAt;
                console.log(`[direct_booking] Variation end synced to: ${appointmentEndAt}`);
            }

            console.log(`[direct_booking] Note: Actual checkout at 12PM is handled operationally by staff.`);
        } else {
            // Rule: Spa/Other uses Strict API Duration (sum of non-add-ons)
            let apiSum = 0;
            variationsArray.forEach(v => {
                const info = getVariationInfo(v.variation_mytime_id);
                if (!info?.add_on) apiSum += getApiDuration(v.variation_mytime_id);
            });

            if (apiSum === 0) apiSum = 15;

            appointmentEndAt = new Date(new Date(beginAt).getTime() + apiSum * 60 * 1000).toISOString().replace('.000Z', 'Z');
            console.log(`[direct_booking] Standard Service: Using Strict API Duration (${apiSum}min) -> ${appointmentEndAt}`);
        }

        const appointmentData: any = {
            location_mytime_id: LOCATION_ID,
            employee_mytime_id: String(primaryEmployeeId),
            client_mytime_id: clientId ? String(clientId) : undefined,
            child_mytime_id: dogId ? String(dogId) : undefined,
            begin_at: beginAt,
            end_at: appointmentEndAt, // Use Strict API End
            is_existing_customer: true,
            variations: variationsArray,
            notes: [{
                content: 'Appointment scheduled with Quicker Checker Inner app.'
            }]
        };

        // Log final service list with names
        const finalServices = variationsArray.map((v: any) => getVarName(v.variation_mytime_id)).join(' + ');
        console.log(`[direct_booking] Final booking: ${finalServices}`);
        console.log('[direct_booking] Sending:', JSON.stringify(appointmentData, null, 2));

        const result = await partnerApiRequest('POST', '/appointments', appointmentData);

        // Check in the client after successful booking
        const appointmentId = result.appointment?.mytime_id || result.appointment?.id;
        if (appointmentId) {
            try {
                await partnerApiRequest('PUT', `/appointments/${appointmentId}/client_checked_in`, {});
                console.log(`[direct_booking] Client checked in for appointment ${appointmentId}`);
            } catch (checkInError: any) {
                console.error(`[direct_booking] Check-in failed (appointment created):`, checkInError.message);
                // Don't fail the whole request if check-in fails - appointment was still created
            }
        }

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
app.listen(PORT, async () => {
    console.log(`🐕 Quicker Checker server running on http://localhost:${PORT}`);
    console.log(`   MyTime API: ${MYTIME_BASE_URL}`);
    console.log(`   Company ID: ${COMPANY_ID}`);
    console.log(`   Location ID: ${LOCATION_ID}`);

    // Load variation cache at startup
    await loadVariationsCache();
});
