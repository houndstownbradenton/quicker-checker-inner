import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { enrichDogsWithPhotos } from './supabase.ts';
import { requireEnv, config } from './env.ts';
import './logger.ts'; // Initialize file logging - writes to debug/server.log

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from parent directory
dotenv.config({ path: join(__dirname, '..', '.env') });

// Validate required environment variables before starting
requireEnv();

// Inlined constants (TODO: refactor to separate module once ES module issues are resolved)
// LOCATION_ID defaults to internal ID '158078' if MYTIME_LOCATION_ID env var is not set
const LOCATION_ID = process.env.MYTIME_LOCATION_ID || '158078';

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
    // Boarding variations - use boarding employee
    '91404079': EMPLOYEE_IDS.boarding,   // Boarding - 1 Dog Townhome
    '91404147': EMPLOYEE_IDS.boarding,   // Boarding - 1 Dog Luxury Suite
    '111734724': EMPLOYEE_IDS.boarding,  // Boarding - 1 Dog Double Suite
    // Spa variations will use spaServices employee (default fallback)
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

// ============================================================================
// VARIATION CACHE
// ============================================================================
// Dynamically populated from Partner API at startup. Contains service/variation
// metadata used for booking calculations.
//
// IMPORTANT: For boarding services, pay attention to these fields:
//   - `duration`: Maximum duration (e.g., 20160 min = 14 days). NOT per-night!
//   - `time_span_range`: The actual booking unit duration (e.g., [1440, 1440] = 24h = 1 night)
//   - `multiplier_enabled`: If true, multi-unit stays require one variation per unit
// ============================================================================
interface VariationInfo {
    id: string;
    name: string;
    duration: number;           // Max duration in minutes (NOT necessarily per-unit!)
    add_on: boolean;            // Whether this is an add-on service requiring a parent
    price: number;              // Per-unit price
    time_span_range?: [number, number];  // [min, max] span in minutes for ONE booking unit
    multiplier_enabled?: boolean;        // If true, multi-unit bookings multiply price
}

const variationCache: Map<string, VariationInfo> = new Map();

// Get duration for a variation - uses time_span_range first (actual booking unit), then duration
function getVariationDuration(varId: string): number {
    const cached = variationCache.get(varId);
    if (!cached) {
        console.log(`[duration] ${varId}: NOT IN CACHE, using default 15`);
        return 15; // Default 15 min if unknown
    }

    // Debug: log what we have
    console.log(`[duration] ${varId}: time_span_range=${JSON.stringify(cached.time_span_range)}, duration=${cached.duration}`);

    // Prefer time_span_range[0] (actual booking unit duration) over duration field
    // For Bath: time_span_range=[1,1] means 1 min
    // For Townie Bath: time_span_range=[15,15] means 15 min
    // For Boarding: time_span_range=[1440,1440] means 24h (1 night)
    if (cached.time_span_range && cached.time_span_range[0] > 0) {
        console.log(`[duration] ${varId}: Using time_span_range[0]=${cached.time_span_range[0]}`);
        return cached.time_span_range[0];
    }
    if (cached.duration && cached.duration > 0) {
        console.log(`[duration] ${varId}: Using duration=${cached.duration}`);
        return cached.duration;
    }
    console.log(`[duration] ${varId}: Fallback to 15`);
    return 15; // Default fallback
}

// Get duration as the API sees it (same logic as getVariationDuration)
function getApiDuration(varId: string): number {
    return getVariationDuration(varId);
}

// Get variation info from cache
function getVariationInfo(varId: string): VariationInfo | undefined {
    return variationCache.get(varId);
}

// Primary Bath service ID - used as parent for spa add-ons
const SPA_PRIMARY_SERVICE_ID = '99860007';

const app = express();
const PORT = config.PORT;

// Configuration from env module (validated at startup)
const MYTIME_BASE_URL = config.MYTIME_BASE_URL;
const MYTIME_API_KEY = config.MYTIME_API_KEY;
const COMPANY_ID = config.MYTIME_COMPANY_ID;

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
async function partnerApiRequest(method: string, endpoint: string, data: any = null, params: any = null): Promise<any> {
    const url = `https://partners-api.mytime.com/api${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Api-Key': MYTIME_API_KEY || '',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://partners-api.mytime.com',
        'Referer': 'https://partners-api.mytime.com/'
    };

    try {
        const config: any = {
            method,
            url,
            headers,
            data,
            params
        };

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
            console.log('[cache] Forcing fresh load of variations...');
            variationCache.clear(); // Clear old entries on force refresh
        } else if (variationCache.size > 0) {
            return; // Already loaded and not forcing refresh
        }

        console.log('[cache] Fetching variations from Booking API (for duration/times)...');
        // STRATEGY: Fetch from TWO sources and merge:
        // 1. Booking API (mytime.com/api/v2): Returns `time_span_range` (critical for accurate duration) but often missing pricing.
        // 2. Partner API (partners-api.mytime.com): Returns accurate `price` but missing `time_span_range`.
        const endpoint = `/companies/${COMPANY_ID}/variations?location_id=${LOCATION_ID}`;
        const bookingResponse = await mytimeRequest('GET', endpoint);

        console.log('[cache] Fetching variations from Partner API (for pricing)...');
        let partnerVariations: any[] = [];
        try {
            // Use axios directly for Partner API to control headers and host specifically
            const partnerRes = await axios.get('https://partners-api.mytime.com/api/variations', {
                params: {
                    location_mytime_id: LOCATION_ID
                },
                headers: {
                    'X-Api-Key': process.env.MYTIME_API_KEY
                }
            });
            partnerVariations = partnerRes.data.variations || [];
            console.log(`[cache] Partner API returned ${partnerVariations.length} variations for pricing lookup.`);
        } catch (err: any) {
            console.error('[cache] Failed to fetch Partner API variations for pricing:', err.message);
        }

        // Create a map for quick price lookup: variation_id -> price info
        const priceMap = new Map<number, number>();
        for (const pv of partnerVariations) {
            let price = 0;
            // Check pricings array first
            if (pv.pricings && Array.isArray(pv.pricings) && pv.pricings.length > 0) {
                // Prefer existing_list_price, fallback to others
                price = pv.pricings[0].existing_list_price || pv.pricings[0].new_list_price || 0;
            } else if (typeof pv.price === 'number') {
                price = pv.price;
            }

            if (price > 0) {
                priceMap.set(pv.id, price);
            }
        }

        const variations = bookingResponse.variations || [];
        if (force) console.log(`[cache] Found ${variations.length} variations from Booking API`);

        let logCount = 0;

        for (const v of variations) {
            const id = String(v.id || v.mytime_id);

            // MERGE PRICING DATA
            let mergedPrice = v.pricings?.[0]?.existing_list_price || v.price || 0;

            if (priceMap.has(v.id)) {
                const partnerPrice = priceMap.get(v.id);
                // Ensure structure exists if we need it later, but mainly set the price we use
                if (!v.pricings) v.pricings = [{}];
                if (!v.pricings[0]) v.pricings[0] = {};

                v.pricings[0].existing_list_price = partnerPrice;
                v.price = partnerPrice; // Set convenience field
                mergedPrice = partnerPrice;
            }

            // Debug: log pricing info for first few variations
            if (force && logCount < 5) {
                console.log(`[cache] Cached Variation ${v.name}:`, JSON.stringify({
                    id: v.id,
                    duration: v.duration,
                    time_span_range: v.time_span_range,
                    pricings: v.pricings,
                    price: v.price
                }));
                logCount++;
            }

            const info: VariationInfo = {
                id,
                name: v.name || 'Unknown',
                service_name: v.service_name || 'Unknown',
                externalId: v.external_id || id,
                duration: v.duration || 0,
                add_on: v.add_on || false,
                price: mergedPrice,
                time_span_range: v.time_span_range,
                multiplier_enabled: v.multiplier_enabled || false
            };
            variationCache.set(id, info);

            // Also update the name lookup
            if (info.name && info.name !== 'Unknown') {
                VARIATION_NAMES[id] = info.name;
            }
        }

        // Debugging Townie Bath specifically
        const townieBath = variationCache.get('91629719');
        if (townieBath) {
            console.log('[cache] Townie Bath (91629719) Final Debug:', {
                price: townieBath.price,
                time_span_range: townieBath.time_span_range
            });
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

// Direct booking bypass using Partners API (to bypass "bookable: false" restriction)
app.post('/api/appointments/direct', async (req: Request, res: Response) => {
    try {
        // Ensure variation cache is fresh before booking
        await loadVariationsCache(true);

        const { dogId, variationId, variations, beginAt, endAt, employeeId, clientId } = req.body;

        // Build variations array - either from provided array or from single variationId
        let variationsArray: any[] = [];

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

            // Calculate total duration for the entire appointment block
            const totalDuration = requestedVarIds.reduce((sum, id) => sum + getVariationDuration(id), 0);
            const appointmentStart = new Date(beginAt);
            const appointmentEnd = new Date(appointmentStart.getTime() + totalDuration * 60 * 1000);
            const appointmentEndStr = appointmentEnd.toISOString().replace('.000Z', 'Z');

            console.log(`[direct_booking] Total appointment duration: ${totalDuration}min`);
            console.log(`[direct_booking] Appointment block: ${beginAt} to ${appointmentEndStr}`);

            // Build variations - SEQUENTIAL timing (each starts after previous ends)
            // The API validates that variation_end_at values are correctly calculated
            let currentStart = new Date(beginAt);
            variationsArray = requestedVarIds.map((varId: string, index: number) => {
                const varEmployeeId = RESOURCE_MAP[varId] || EMPLOYEE_IDS.spaServices;
                const varInfo = getVariationInfo(varId);
                const varPrice = varInfo?.price ?? 0;
                const varDuration = getVariationDuration(varId);

                // Calculate this variation's start and end time
                const varBegin = currentStart.toISOString().replace('.000Z', 'Z');
                const varEnd = new Date(currentStart.getTime() + varDuration * 60 * 1000);
                const varEndStr = varEnd.toISOString().replace('.000Z', 'Z');

                // Move start for next variation
                currentStart = varEnd;

                const variation: any = {
                    variation_mytime_id: String(varId),
                    variation_partner_id: varInfo?.externalId || String(varId),
                    variation_employee_id: String(varEmployeeId),
                    variation_begin_at: varBegin,
                    variation_end_at: varEndStr,
                    price: varPrice
                };

                if (index === 0) {
                    console.log(`[direct_booking] Primary: ${getVarName(varId)} ($${varPrice}, ${varDuration}min) ${varBegin} -> ${varEndStr}`);
                } else {
                    // Add-on - must have parent_id pointing to primary
                    variation.parent_id = String(primaryVariationId);
                    console.log(`[direct_booking] Add-on: ${getVarName(varId)} ($${varPrice}, ${varDuration}min) ${varBegin} -> ${varEndStr} -> parent: ${getVarName(primaryVariationId)}`);
                }

                return variation;
            });

            // All variations end at the same time
            (variationsArray as any).primaryEndAt = appointmentEndStr;
        } else if (variationId) {
            // Single variation (legacy/non-spa)
            const varInfo = getVariationInfo(variationId);
            const varPrice = varInfo?.price ?? 0;
            console.log(`[direct_booking] Single service: ${getVarName(variationId)} ($${varPrice})`);
            const finalEmployeeId = employeeId || RESOURCE_MAP[variationId] || EMPLOYEE_IDS.spaServices;

            // Re-calculate strict end for single service
            const apiDur = getApiDuration(variationId) || 15;
            const strictEndAt = new Date(new Date(beginAt).getTime() + apiDur * 60 * 1000).toISOString().replace('.000Z', 'Z');
            console.log(`[direct_booking] Single Service API Duration: ${apiDur}min, End: ${strictEndAt}`);

            variationsArray = [{
                variation_mytime_id: String(variationId),
                variation_partner_id: varInfo?.externalId || String(variationId),
                variation_employee_id: String(finalEmployeeId),
                variation_begin_at: beginAt,
                variation_end_at: strictEndAt,
                price: varPrice
            }];

            appointmentEndAt = strictEndAt;

            console.log(`[direct_booking] Single variation payload:`, JSON.stringify(variationsArray, null, 2));
        } else {
            return res.status(400).json({ error: 'Missing variations' });
        }

        // Determine primary employee
        const primaryEmployeeId = variationsArray[0]?.variation_employee_id || EMPLOYEE_IDS.spaServices;

        // UNIFIED DURATION & END TIME LOGIC
        const primaryVarIdRaw = variationsArray[0]?.variation_mytime_id;
        const primaryInfo = getVariationInfo(primaryVarIdRaw);
        const primaryVarName = primaryInfo?.name || VARIATION_NAMES[primaryVarIdRaw] || '';
        const isBoarding = primaryInfo?.service_name === 'Boarding' || primaryVarName.toLowerCase().includes('boarding');

        if (isBoarding) {
            // ============================================================================
            // BOARDING BOOKING LOGIC
            // ============================================================================
            // 
            // MyTime Partner API requires ONE VARIATION ENTRY PER NIGHT for multi-night
            // boarding stays. A single variation spanning multiple days will fail with:
            //   "end_at of appointment must be the latest end_at of all non-buffer segments"
            //
            // Key insight from variation configuration:
            //   - `duration`: 20160 (14 days max) - NOT the per-night duration
            //   - `time_span_range`: [1440, 1440] (24 hours = 1 night base unit)
            //   - `multiplier_enabled`: true (API handles multi-night pricing automatically)
            //
            // For a 3-night stay (Jan 6-9), we send 3 variation entries:
            //   Night 1: begin=Jan 6 12:00, end=Jan 7 12:00
            //   Night 2: begin=Jan 7 12:00, end=Jan 8 12:00
            //   Night 3: begin=Jan 8 12:00, end=Jan 9 12:00
            //
            // The appointment end_at MUST equal the last variation's end_at.
            // The API will multiply the per-night price by the number of variations.
            // ============================================================================

            const beginDate = new Date(beginAt);
            const checkoutDate = endAt ? new Date(endAt) : new Date(beginDate.getTime() + 24 * 60 * 60 * 1000);

            // Calculate number of nights from check-in to checkout
            const nights = Math.max(1, Math.round((checkoutDate.getTime() - beginDate.getTime()) / (24 * 60 * 60 * 1000)));

            // Use time_span_range for the base duration (1440 min = 24h = 1 night)
            // Do NOT use `duration` field - that's the max duration, not per-night
            const baseSpan = primaryInfo?.time_span_range?.[0] || 1440; // default to 24h
            const variationId = variationsArray[0].variation_mytime_id;
            const employeeId = String(RESOURCE_MAP[variationId] || EMPLOYEE_IDS.boarding);
            const varPrice = primaryInfo?.price ?? 55;

            console.log(`[direct_booking] Boarding: ${nights} night(s), base span: ${baseSpan}min`);
            console.log(`[direct_booking] Creating ${nights} variation(s), one per night`);

            // Create one variation entry per night
            const nightVariations: any[] = [];
            for (let i = 0; i < nights; i++) {
                const nightBegin = new Date(beginDate.getTime() + i * baseSpan * 60 * 1000);
                const nightEnd = new Date(beginDate.getTime() + (i + 1) * baseSpan * 60 * 1000);

                nightVariations.push({
                    variation_mytime_id: variationId,
                    variation_employee_id: employeeId,
                    variation_begin_at: nightBegin.toISOString().replace('.000Z', 'Z'),
                    variation_end_at: nightEnd.toISOString().replace('.000Z', 'Z'),
                    price: varPrice
                });
                console.log(`[direct_booking]   Night ${i + 1}: ${nightVariations[i].variation_begin_at} -> ${nightVariations[i].variation_end_at}`);
            }

            // Replace the single variation with per-night entries
            variationsArray = nightVariations;

            // CRITICAL: Appointment end_at must equal the last variation's end_at
            // This satisfies: "end_at of appointment must be the latest end_at of all non-buffer segments"
            appointmentEndAt = variationsArray[variationsArray.length - 1].variation_end_at;
            console.log(`[direct_booking] Appointment end: ${appointmentEndAt}`);

            console.log(`[direct_booking] Note: Actual checkout at 12PM is handled operationally by staff.`);
        } else {
            // ============================================================================
            // SPA/OTHER SERVICE BOOKING LOGIC
            // ============================================================================
            // 
            // MyTime Partner API requires: 
            //   "end_at of appointment must be the latest end_at of all non-buffer segments"
            //
            // Key insight: Buffer segments are TRANSITION TIME between appointments, NOT add-ons.
            // ALL service variations (primary and add-ons) are non-buffer segments.
            // Add-ons require parent_id, but they still count as non-buffer segments.
            //
            // For a spa booking with:
            //   - Bath (primary, 15min): 12:15-12:30  <- non-buffer segment
            //   - Townie Bath (addon): 12:30-12:45   <- non-buffer segment (has parent_id)
            //   - Nails (addon): 12:45-13:00         <- non-buffer segment (has parent_id)
            //
            // Appointment end_at must be 13:00 (last non-buffer segment's end).
            // ============================================================================

            // Use the LAST variation's end_at as appointment end (all are non-buffer segments)
            appointmentEndAt = variationsArray[variationsArray.length - 1].variation_end_at;
            console.log(`[direct_booking] Standard Service: Using last variation end -> ${appointmentEndAt}`);
        }

        const appointmentData: any = {
            location_mytime_id: LOCATION_ID,
            employee_mytime_id: String(primaryEmployeeId),
            client_mytime_id: clientId ? String(clientId) : undefined,
            child_mytime_id: dogId ? String(dogId) : undefined,
            begin_at: beginAt,
            end_at: appointmentEndAt
        };

        const bodyData: any = {
            appointment: {
                variations: variationsArray,
                notes: [{
                    content: 'Appointment scheduled with Quicker Checker Inner app.'
                }]
            }
        };

        console.log(`[direct_booking] Final Sending (POST /appointments):`);
        console.log(`[direct_booking] Query Params:`, JSON.stringify(queryParams, null, 2));
        console.log(`[direct_booking] Body Data:`, JSON.stringify(bodyData, null, 2));

        const result = await partnerApiRequest('POST', '/appointments', bodyData, queryParams);

        // Auto check-in ONLY for same-day daycare appointments
        const appointmentId = result.appointment?.mytime_id || result.appointment?.id;
        const isDaycareService = variationsArray.some((v: any) =>
            Object.values(DAYCARE_VARIATIONS).includes(v.variation_mytime_id)
        );
        const appointmentDate = new Date(beginAt).toDateString();
        const today = new Date().toDateString();
        const isSameDay = appointmentDate === today;

        if (appointmentId && isDaycareService && isSameDay) {
            try {
                await partnerApiRequest('PUT', `/appointments/${appointmentId}/client_checked_in`, {});
                console.log(`[direct_booking] Client checked in for daycare appointment ${appointmentId}`);
            } catch (checkInError: any) {
                console.error(`[direct_booking] Check-in failed (appointment created):`, (checkInError as Error).message);
            }
        } else if (appointmentId) {
            console.log(`[direct_booking] Skipping auto-check-in: ${isDaycareService ? 'not same day' : 'not daycare'}`);
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
