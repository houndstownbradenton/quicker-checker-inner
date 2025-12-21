/**
 * Quicker Checker - API Client
 * Handles all communication with the backend proxy server
 */

const API_BASE = '/api';

export interface User {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    authentication_token?: string;
}

export interface Dog {
    id: number;
    mytime_id?: number;
    name: string;
    pet_name?: string;
    breed?: string;
    pet_breed?: string;
    color?: string;
    gender?: string;
    photo?: {
        medium?: string;
        thumb?: string;
        original?: string;
    };
    client_id?: number;
    owner_first_name?: string;
    owner_last_name?: string;
    owner_email?: string;
    custom_field_values?: Array<{
        custom_field_id: number;
        value: string;
    }>;
    label?: string;
    first_name?: string;
    last_name?: string;
    preferred_location_mytime_id?: number;
}

export interface Variation {
    id: number | string;
    name: string;
}

export interface TimeSlot {
    start: string;
    end: string;
    begin_at: string;
    end_at: string;
    deal_id: number;
}

export interface Cart {
    id: number;
}

export interface Purchase {
    id: number;
    appointments?: Array<{ id: number }>;
}

export interface ApiResponse<T = any> {
    success: boolean;
    error?: any;
    [key: string]: any;
}

export interface LoginResponse extends ApiResponse {
    user?: User;
    token?: string;
}

export interface CompanyResponse extends ApiResponse {
    company?: any;
}

export interface DogsResponse extends ApiResponse {
    dogs: Dog[];
}

export interface VariationsResponse extends ApiResponse {
    variations: Variation[];
}

export interface OpenTimesResponse extends ApiResponse {
    openTimes: TimeSlot[];
}

export interface CartResponse extends ApiResponse {
    cart: Cart;
}

export interface PurchaseResponse extends ApiResponse {
    purchase: Purchase;
}

/**
 * Make a request to the backend API
 */
async function apiRequest<T = any>(method: string, endpoint: string, data: any = null, authToken: string | null = null): Promise<T> {
    const url = `${API_BASE}${endpoint}`;

    // Explicitly define headers type to allow indexing with string
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (authToken) {
        headers['Authorization'] = authToken;
    }

    const options: RequestInit = {
        method,
        headers
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    const text = await response.text();

    let json: any;
    try {
        json = JSON.parse(text);
    } catch (e) {
        console.error('API Response Parse Error. Status:', response.status);
        console.error('Response Body:', text.substring(0, 200)); // Log first 200 chars
        throw new Error(`Server returned non-JSON response (${response.status})`);
    }

    if (!response.ok) {
        let errorMessage = `API error: ${response.status}`;

        if (json.error) {
            if (typeof json.error === 'string') {
                errorMessage = json.error;
            } else if (typeof json.error === 'object') {
                // Handle MyTime specific error format: { general: [{ type: '...' }], failed_attempts: X }
                if (json.error.general && Array.isArray(json.error.general) && json.error.general[0]?.type) {
                    errorMessage = json.error.general[0].type.replace(/_/g, ' ');
                    // Capitalize first letter
                    errorMessage = errorMessage.charAt(0).toUpperCase() + errorMessage.slice(1);

                    if (json.error.failed_attempts) {
                        errorMessage += ` (${json.error.failed_attempts} failed attempts)`;
                    }
                } else {
                    errorMessage = JSON.stringify(json.error);
                }
            }
        }

        throw new Error(errorMessage);
    }

    return json as T;
}

/**
 * Login with email and password
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
    return apiRequest<LoginResponse>('POST', '/auth/login', { email, password });
}

/**
 * Get company data including custom fields
 */
export async function getCompany(): Promise<CompanyResponse> {
    return apiRequest<CompanyResponse>('GET', '/company');
}

/**
 * Get all dogs for the authenticated user
 */
export async function getDogs(authToken: string): Promise<DogsResponse> {
    return apiRequest<DogsResponse>('GET', '/dogs', null, authToken);
}

/**
 * Search dogs by name across all clients at the location
 */
export async function searchDogs(query: string, authToken: string): Promise<DogsResponse> {
    return apiRequest<DogsResponse>('GET', `/dogs/search?q=${encodeURIComponent(query)}`, null, authToken);
}

/**
 * Get available times for daycare
 */
export async function getOpenTimes(dogId: number, date: string, authToken: string, variationId: string): Promise<OpenTimesResponse> {
    const params = new URLSearchParams();
    if (dogId) params.append('dogId', dogId.toString());
    if (date) params.append('date', date);
    if (variationId) params.append('variationId', variationId);

    return apiRequest<OpenTimesResponse>('GET', `/open-times?${params.toString()}`, null, authToken);
}

/**
 * Create a new cart
 */
export async function createCart(userId: number, authToken: string): Promise<CartResponse> {
    return apiRequest<CartResponse>('POST', '/cart', { userId }, authToken);
}

/**
 * Add an item to the cart
 */
export async function addCartItem(cartId: number, itemData: any, authToken: string): Promise<ApiResponse> {
    return apiRequest<ApiResponse>('POST', `/cart/${cartId}/items`, itemData, authToken);
}

/**
 * Update a cart (assign to user)
 */
export async function updateCart(cartId: number, userId: number, authToken: string): Promise<CartResponse> {
    return apiRequest<CartResponse>('PUT', `/cart/${cartId}`, { userId }, authToken);
}

/**
 * Create a purchase (complete booking)
 */
export async function createPurchase(cartId: number, dogId: number, authToken: string): Promise<PurchaseResponse> {
    return apiRequest<PurchaseResponse>('POST', '/purchase', { cartId, dogId }, authToken);
}

/**
 * Check in an appointment
 */
export async function checkInAppointment(appointmentId: number, authToken: string): Promise<ApiResponse> {
    return apiRequest<ApiResponse>('PUT', `/check-in/${appointmentId}`, null, authToken);
}

/**
 * Get available variations (services)
 */
export async function getVariations(authToken: string): Promise<VariationsResponse> {
    return apiRequest<VariationsResponse>('GET', '/variations', null, authToken);
}

/**
 * Check API health
 */
export async function healthCheck(): Promise<ApiResponse> {
    return apiRequest<ApiResponse>('GET', '/health');
}
