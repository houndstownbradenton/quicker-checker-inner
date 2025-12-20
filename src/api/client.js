/**
 * Quicker Checker - API Client
 * Handles all communication with the backend proxy server
 */

const API_BASE = '/api';

/**
 * Make a request to the backend API
 */
async function apiRequest(method, endpoint, data = null, authToken = null) {
    const url = `${API_BASE}${endpoint}`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    if (authToken) {
        options.headers['Authorization'] = authToken;
    }

    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    const json = await response.json();

    if (!response.ok) {
        throw new Error(json.error || `API error: ${response.status}`);
    }

    return json;
}

/**
 * Login with email and password
 */
export async function login(email, password) {
    return apiRequest('POST', '/auth/login', { email, password });
}

/**
 * Get company data including custom fields
 */
export async function getCompany() {
    return apiRequest('GET', '/company');
}

/**
 * Get all dogs for the authenticated user
 */
export async function getDogs(authToken) {
    return apiRequest('GET', '/dogs', null, authToken);
}

/**
 * Get available times for daycare
 */
export async function getOpenTimes(dogId, date, authToken) {
    const params = new URLSearchParams();
    if (dogId) params.append('dogId', dogId);
    if (date) params.append('date', date);

    return apiRequest('GET', `/open-times?${params.toString()}`, null, authToken);
}

/**
 * Create a new cart
 */
export async function createCart(userId, authToken) {
    return apiRequest('POST', '/cart', { userId }, authToken);
}

/**
 * Add an item to the cart
 */
export async function addCartItem(cartId, itemData, authToken) {
    return apiRequest('POST', `/cart/${cartId}/items`, itemData, authToken);
}

/**
 * Update a cart (assign to user)
 */
export async function updateCart(cartId, userId, authToken) {
    return apiRequest('PUT', `/cart/${cartId}`, { userId }, authToken);
}

/**
 * Create a purchase (complete booking)
 */
export async function createPurchase(cartId, dogId, authToken) {
    return apiRequest('POST', '/purchase', { cartId, dogId }, authToken);
}

/**
 * Check in an appointment
 */
export async function checkInAppointment(appointmentId, authToken) {
    return apiRequest('PUT', `/check-in/${appointmentId}`, null, authToken);
}

/**
 * Check API health
 */
export async function healthCheck() {
    return apiRequest('GET', '/health');
}
