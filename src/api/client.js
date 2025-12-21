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
    const text = await response.text();

    let json;
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
 * Search dogs by name across all clients at the location
 */
export async function searchDogs(query, authToken) {
    return apiRequest('GET', `/dogs/search?q=${encodeURIComponent(query)}`, null, authToken);
}

/**
 * Get available times for daycare
 */
export async function getOpenTimes(dogId, date, authToken, variationId) {
    const params = new URLSearchParams();
    if (dogId) params.append('dogId', dogId);
    if (date) params.append('date', date);
    if (variationId) params.append('variationId', variationId);

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
 * Get available variations (services)
 */
export async function getVariations(authToken) {
    return apiRequest('GET', '/variations', null, authToken);
}

/**
 * Check API health
 */
export async function healthCheck() {
    return apiRequest('GET', '/health');
}
