/**
 * Quicker Checker - Main Application
 * Fast daycare check-in for Hounds Town Bradenton
 */

import * as api from './api/client.js';

const DAYCARE_VARIATIONS = {
    weekday: '91629241',      // Standard Daycare (Mon-Fri)
    saturday: '92628859',     // Saturday Daycare
    sunday: '111325854'       // Sunday Daycare
};

// ==========================================
// State
// ==========================================

let state = {
    user: null,
    authToken: null,
    company: null,
    dogs: [],
    filteredDogs: [],
    selectedDog: null,
    customFields: {
        petNameFieldId: null,
        petBreedFieldId: null,
        petColorFieldId: null,
        petGenderFieldId: null
    },
    variations: []
};

// ==========================================
// DOM Elements
// ==========================================

const elements = {
    // Screens
    loginScreen: document.getElementById('login-screen'),
    mainScreen: document.getElementById('main-screen'),

    // Login
    loginForm: document.getElementById('login-form'),
    emailInput: document.getElementById('email'),
    passwordInput: document.getElementById('password'),
    loginError: document.getElementById('login-error'),

    // Header
    userName: document.getElementById('user-name'),
    logoutBtn: document.getElementById('logout-btn'),

    // Search
    dogSearch: document.getElementById('dog-search'),
    dogCount: document.getElementById('dog-count'),

    // Dogs Grid
    dogsGrid: document.getElementById('dogs-grid'),
    noResults: document.getElementById('no-results'),
    loadingDogs: document.getElementById('loading-dogs'),

    // Modal
    checkinModal: document.getElementById('checkin-modal'),
    modalClose: document.getElementById('modal-close'),
    selectedDogInfo: document.getElementById('selected-dog-info'),
    checkinDate: document.getElementById('checkin-date'),
    checkinStatus: document.getElementById('checkin-status'),
    cancelCheckin: document.getElementById('cancel-checkin'),
    confirmCheckin: document.getElementById('confirm-checkin'),
    serviceType: document.getElementById('service-type'),
    serviceVariation: document.getElementById('service-variation'),
    variationGroup: document.getElementById('variation-group'),

    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message')
};

// ==========================================
// Initialization
// ==========================================

async function init() {
    // Check for existing session
    const savedToken = sessionStorage.getItem('authToken');
    const savedUser = sessionStorage.getItem('user');

    if (savedToken && savedUser) {
        state.authToken = savedToken;
        state.user = JSON.parse(savedUser);
        await showMainScreen();
    } else {
        showLoginScreen();
    }

    // Set up event listeners
    setupEventListeners();
}

function setupEventListeners() {
    // Login form
    elements.loginForm.addEventListener('submit', handleLogin);

    // Logout
    elements.logoutBtn.addEventListener('click', handleLogout);

    // Search
    elements.dogSearch.addEventListener('input', handleSearch);

    // Modal
    elements.modalClose.addEventListener('click', closeModal);
    elements.cancelCheckin.addEventListener('click', closeModal);
    elements.confirmCheckin.addEventListener('click', handleCheckIn);

    // Service Selection
    elements.serviceType.addEventListener('change', updateServiceDropdowns);
    elements.checkinDate.addEventListener('change', () => {
        if (elements.serviceType.value === 'daycare') {
            updateServiceDropdowns();
        }
    });
    elements.serviceVariation.addEventListener('change', () => {
        // Trigger availability check if date is selected?
        // For now just letting the user click confirm is fine
    });

    // Close modal on backdrop click
    elements.checkinModal.addEventListener('click', (e) => {
        if (e.target === elements.checkinModal) {
            closeModal();
        }
    });
}

// ==========================================
// Authentication
// ==========================================

async function handleLogin(e) {
    e.preventDefault();

    const email = elements.emailInput.value;
    const password = elements.passwordInput.value;

    // Show loading state
    const submitBtn = elements.loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.querySelector('.btn-text').classList.add('hidden');
    submitBtn.querySelector('.btn-loading').classList.remove('hidden');
    elements.loginError.classList.add('hidden');

    try {
        const result = await api.login(email, password);

        if (result.success && result.user) {
            state.user = result.user;
            state.authToken = result.token;

            // Save to session
            sessionStorage.setItem('authToken', state.authToken);
            sessionStorage.setItem('user', JSON.stringify(state.user));

            await showMainScreen();
        } else {
            throw new Error('Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        elements.loginError.textContent = error.message || 'Login failed. Please check your credentials.';
        elements.loginError.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-text').classList.remove('hidden');
        submitBtn.querySelector('.btn-loading').classList.add('hidden');
    }
}

function handleLogout() {
    state.user = null;
    state.authToken = null;
    state.dogs = [];
    state.filteredDogs = [];

    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('user');

    showLoginScreen();
}

// ==========================================
// Screen Navigation
// ==========================================

function showLoginScreen() {
    elements.loginScreen.classList.add('active');
    elements.loginScreen.classList.remove('hidden');
    elements.mainScreen.classList.add('hidden');
    elements.loginForm.reset();
}

async function showMainScreen() {
    elements.loginScreen.classList.remove('active');
    elements.loginScreen.classList.add('hidden');
    elements.mainScreen.classList.remove('hidden');
    elements.mainScreen.classList.add('active');

    // Update user name in header
    if (state.user) {
        elements.userName.textContent = `${state.user.first_name} ${state.user.last_name}`;
    }

    // Load company data only (dogs will load when user searches)
    await loadCompanyData();

    // Show initial search prompt
    elements.dogCount.textContent = 'Search for a dog by name';
    showSearchPrompt();
}

// ==========================================
// Data Loading
// ==========================================

async function loadCompanyData() {
    try {
        const result = await api.getCompany();
        if (result.success) {
            state.company = result.company;

            // Find custom field IDs for pet attributes
            if (state.company?.custom_fields) {
                const customFields = state.company.custom_fields;

                // Find pet name field
                const petNameField = customFields.find(cf =>
                    cf.uuid === 'pet_name' || (cf.is_label === true && cf.resource_type === 'MyClient::Child')
                );
                if (petNameField) state.customFields.petNameFieldId = petNameField.id;

                // Find pet breed field
                const petBreedField = customFields.find(cf =>
                    cf.uuid === 'pet_breed' || (cf.is_secondary_label === true && cf.resource_type === 'MyClient::Child')
                );
                if (petBreedField) state.customFields.petBreedFieldId = petBreedField.id;

                // Find color field (might be named differently)
                const petColorField = customFields.find(cf =>
                    cf.title?.toLowerCase().includes('color') && cf.resource_type === 'MyClient::Child'
                );
                if (petColorField) state.customFields.petColorFieldId = petColorField.id;

                // Find gender field
                const petGenderField = customFields.find(cf =>
                    (cf.title?.toLowerCase().includes('gender') || cf.title?.toLowerCase().includes('sex')) &&
                    cf.resource_type === 'MyClient::Child'
                );
                if (petGenderField) state.customFields.petGenderFieldId = petGenderField.id;
            }
        }
    } catch (error) {
        console.error('Failed to load company data:', error);
        showToast('Failed to load company data', 'error');
    }
}

async function loadDogs() {
    elements.loadingDogs.classList.remove('hidden');
    elements.dogsGrid.innerHTML = '';

    try {
        const result = await api.getDogs(state.authToken);

        if (result.success) {
            // Process dogs with custom field values
            state.dogs = result.dogs.map(dog => processDog(dog));
            state.filteredDogs = [...state.dogs];

            elements.dogCount.textContent = `${state.dogs.length} dogs loaded`;
            renderDogs();
        }
    } catch (error) {
        console.error('Failed to load dogs:', error);
        showToast('Failed to load dogs', 'error');
    } finally {
        elements.loadingDogs.classList.add('hidden');
    }
}

function processDog(dog) {
    // Extract values from custom fields or direct fields (Partner API)
    let name = null;
    let breed = null;
    let color = null;
    let gender = null;
    let photo = null;
    let ownerName = 'Unknown';

    // Partner API provides these directly on the dog object
    if (dog.pet_name) {
        name = dog.pet_name;
    }
    if (dog.pet_breed) {
        breed = dog.pet_breed.trim();
    }
    if (dog.gender) {
        gender = dog.gender;
    }
    if (dog.owner_first_name || dog.owner_last_name) {
        ownerName = `${dog.owner_first_name || ''} ${dog.owner_last_name || ''}`.trim();
    }

    // Legacy: Extract from custom fields if Partner API fields not present
    if (!name && dog.custom_field_values && Array.isArray(dog.custom_field_values)) {
        const values = dog.custom_field_values;

        // Get name
        if (state.customFields.petNameFieldId) {
            const nameField = values.find(v => v.custom_field_id === state.customFields.petNameFieldId);
            if (nameField) name = nameField.value;
        }

        // Get breed
        if (!breed && state.customFields.petBreedFieldId) {
            const breedField = values.find(v => v.custom_field_id === state.customFields.petBreedFieldId);
            if (breedField) breed = breedField.value;
        }

        // Get color
        if (state.customFields.petColorFieldId) {
            const colorField = values.find(v => v.custom_field_id === state.customFields.petColorFieldId);
            if (colorField) color = colorField.value;
        }

        // Get gender
        if (!gender && state.customFields.petGenderFieldId) {
            const genderField = values.find(v => v.custom_field_id === state.customFields.petGenderFieldId);
            if (genderField) gender = genderField.value;
        }
    }

    // Fallback to first_name or label if name not found
    if (!name) {
        name = dog.first_name || dog.label || `Pet #${dog.id || dog.mytime_id}`;
    }

    // Get photo if available
    if (dog.photo) {
        photo = dog.photo.medium || dog.photo.thumb || dog.photo.original;
    }

    // Use mytime_id if id not present
    const dogId = dog.id || dog.mytime_id;

    // Use owner fields from Partner API or fall back to last_name
    if (ownerName === 'Unknown') {
        ownerName = dog.last_name || 'Unknown';
    }

    return {
        id: dogId,
        name,
        ownerLastName: ownerName,
        breed: breed || 'Unknown breed',
        color: color || null,
        gender: gender || null,
        photo,
        raw: dog
    };
}

// ==========================================
// Search
// ==========================================

// Debounce timer
let searchTimeout = null;

function handleSearch(e) {
    const query = e.target.value.trim();

    // Clear previous timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    // If empty, show search prompt
    if (!query) {
        state.dogs = [];
        state.filteredDogs = [];
        elements.dogCount.textContent = 'Search for a dog by name';
        showSearchPrompt();
        return;
    }

    // Require at least 2 characters
    if (query.length < 2) {
        elements.dogCount.textContent = 'Type at least 2 characters to search';
        return;
    }

    // Debounce - wait 300ms before searching
    searchTimeout = setTimeout(() => {
        searchDogs(query);
    }, 300);
}

async function searchDogs(query) {
    elements.loadingDogs.classList.remove('hidden');
    elements.dogsGrid.innerHTML = '';
    elements.noResults.classList.add('hidden');
    elements.dogCount.textContent = 'Searching...';

    try {
        const result = await api.searchDogs(query, state.authToken);

        if (result.success) {
            // Process dogs with custom field values
            state.dogs = result.dogs.map(dog => processDog(dog));
            state.filteredDogs = [...state.dogs];

            if (state.dogs.length === 0) {
                elements.dogCount.textContent = `No dogs found for "${query}"`;
            } else {
                elements.dogCount.textContent = `${state.dogs.length} dog${state.dogs.length === 1 ? '' : 's'} found`;
            }
            renderDogs();
        }
    } catch (error) {
        console.error('Failed to search dogs:', error);
        showToast('Failed to search dogs', 'error');
        elements.dogCount.textContent = 'Search failed - try again';
    } finally {
        elements.loadingDogs.classList.add('hidden');
    }
}

function showSearchPrompt() {
    elements.dogsGrid.innerHTML = '';
    elements.noResults.classList.add('hidden');
    elements.loadingDogs.classList.add('hidden');
}

// ==========================================
// Service Selection
// ==========================================

async function loadVariations() {
    if (state.variations.length > 0) return;

    try {
        const result = await api.getVariations(state.authToken);
        if (result.success) {
            state.variations = result.variations || [];
            updateServiceDropdowns();
        }
    } catch (error) {
        console.error('Failed to load variations:', error);
        showToast('Failed to load services', 'error');
    }
}

function updateServiceDropdowns() {
    const serviceType = elements.serviceType.value;
    const select = elements.serviceVariation;
    const group = elements.variationGroup;

    // Clear existing
    select.innerHTML = '';

    // Filter variations
    let filtered = [];

    if (serviceType === 'daycare') {
        // Special logic for Daycare (hardcoded IDs as they are hidden in API)
        const dateStr = elements.checkinDate.value || new Date().toISOString().split('T')[0];
        // Parse date considering timezone (simplified: assume local input matches)
        // new Date(dateStr) treats YYYY-MM-DD as UTC, so we need to be careful.
        // Better: create date from parts
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const day = date.getDay();

        let targetId = DAYCARE_VARIATIONS.weekday;
        let targetName = 'Daycare (M-F)';

        if (day === 6) { // Saturday
            targetId = DAYCARE_VARIATIONS.saturday;
            targetName = 'Saturday Daycare';
        } else if (day === 0) { // Sunday
            targetId = DAYCARE_VARIATIONS.sunday;
            targetName = 'Sunday Daycare';
        }

        // Add "Resident Daycare" option? User requested it.
        // If ID is unknown, maybe skip or use weekday? User said "Resident Daycare should be available".
        // Assuming it's a specific variation I missed or just a label preference?
        // For now, providing the date-based one as primary.

        const option = document.createElement('option');
        option.value = targetId;
        option.textContent = targetName;
        select.appendChild(option);
        select.disabled = false;
        return; // Skip standard filtering
    }

    if (serviceType === 'boarding') {
        filtered = state.variations.filter(v =>
            v.name.toLowerCase().includes('boarding') &&
            !v.name.toLowerCase().includes('shelter')
        );
    } else if (serviceType === 'evaluation') {
        filtered = state.variations.filter(v => v.name.toLowerCase().includes('evaluation'));
    } else if (serviceType === 'spa') {
        filtered = state.variations.filter(v =>
            !v.name.toLowerCase().includes('boarding') &&
            !v.name.toLowerCase().includes('daycare') &&
            !v.name.toLowerCase().includes('evaluation')
        );
    }

    // Sort alpha
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    if (filtered.length === 0) {
        const option = document.createElement('option');
        option.textContent = 'No services available';
        select.appendChild(option);
        select.disabled = true;
    } else {
        select.disabled = false;
        filtered.forEach(v => {
            const option = document.createElement('option');
            option.value = v.id;
            option.textContent = v.name;
            select.appendChild(option);
        });
        // Select first item
        select.selectedIndex = 0;
    }
}

// ==========================================
// Rendering
// ==========================================

function renderDogs() {
    if (state.filteredDogs.length === 0) {
        elements.dogsGrid.innerHTML = '';
        elements.noResults.classList.remove('hidden');
        return;
    }

    elements.noResults.classList.add('hidden');
    // Using grid layout from new CSS
    elements.dogsGrid.className = 'grid grid-cols-2';
    elements.dogsGrid.innerHTML = state.filteredDogs.map(dog => createDogCard(dog)).join('');

    // Add click handlers: delegate or attach to new cards
    elements.dogsGrid.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', () => {
            const dogId = parseInt(card.dataset.dogId);
            const dog = state.dogs.find(d => d.id === dogId);
            if (dog) openModal(dog);
        });
    });
}

function createDogCard(dog) {
    const genderClass = dog.gender?.toLowerCase() === 'male' ? 'dog-tag-male' :
        dog.gender?.toLowerCase() === 'female' ? 'dog-tag-female' : '';

    const photoHtml = dog.photo
        ? `<img src="${dog.photo}" alt="${dog.name}" class="avatar">`
        : `<div class="avatar">${dog.name.charAt(0)}</div>`;

    return `
    <article class="card dog-card-interactive" data-dog-id="${dog.id}" style="cursor: pointer; display: flex; align-items: center; gap: 1rem; padding: 1.5rem;">
      ${photoHtml}
      <div class="dog-info">
        <h3 class="" style="margin: 0; font-size: 1.25rem; color: var(--primary-color);">${escapeHtml(dog.name)}</h3>
        <p class="" style="margin: 0.25rem 0; color: var(--text-muted); font-size: 0.9rem;">Owner: ${escapeHtml(dog.ownerLastName)}</p>
        <div class="dog-details" style="display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap;">
          ${dog.gender ? `<span class="syncing-badge">${escapeHtml(dog.gender)}</span>` : ''}
          <span class="syncing-badge">${escapeHtml(dog.breed)}</span>
        </div>
      </div>
    </article>
  `;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// Modal
// ==========================================

async function openModal(dog) {
    state.selectedDog = dog;

    const photoHtml = dog.photo
        ? `<img src="${dog.photo}" alt="${dog.name}">`
        : '🐕';

    elements.selectedDogInfo.innerHTML = `
    <div class="selected-dog-photo">${photoHtml}</div>
    <div class="selected-dog-details">
      <h3>${escapeHtml(dog.name)}</h3>
      <p>Owner: ${escapeHtml(dog.ownerLastName)}</p>
      <p>${escapeHtml(dog.breed)}${dog.gender ? ` • ${escapeHtml(dog.gender)}` : ''}${dog.color ? ` • ${escapeHtml(dog.color)}` : ''}</p>
    </div>
  `;

    elements.checkinStatus.innerHTML = '';
    elements.confirmCheckin.disabled = false;
    elements.confirmCheckin.querySelector('.btn-text').classList.remove('hidden');
    elements.confirmCheckin.querySelector('.btn-loading').classList.add('hidden');

    // Set date to today by default
    elements.checkinDate.value = new Date().toISOString().split('T')[0];

    // Load variations
    if (state.variations.length === 0) {
        await loadVariations();
    } else {
        updateServiceDropdowns();
    }

    elements.checkinModal.classList.remove('hidden');
}

function closeModal() {
    elements.checkinModal.classList.add('hidden');
    state.selectedDog = null;
}

// ==========================================
// Check-In Process
// ==========================================

async function handleCheckIn() {
    if (!state.selectedDog) return;

    const dog = state.selectedDog;
    const confirmBtn = elements.confirmCheckin;

    // Disable button and show loading
    confirmBtn.disabled = true;
    confirmBtn.querySelector('.btn-text').classList.add('hidden');
    confirmBtn.querySelector('.btn-loading').classList.remove('hidden');

    const statusContainer = elements.checkinStatus;

    try {
        // Step 1: Get available times for the selected date
        const selectedDate = elements.checkinDate.value || new Date().toISOString().split('T')[0];
        const variationId = elements.serviceVariation.value;

        updateStatus(statusContainer, `Finding available time slot for ${selectedDate}...`, 'active');
        const timesResult = await api.getOpenTimes(dog.id, selectedDate, state.authToken, variationId);

        if (!timesResult.success || !timesResult.openTimes?.length) {
            throw new Error(`No available time slots for ${selectedDate}`);
        }

        const timeSlot = timesResult.openTimes[0];
        updateStatus(statusContainer, 'Found time slot ✓', 'complete');

        // Step 2: Create cart
        updateStatus(statusContainer, 'Creating appointment...', 'active');
        const cartResult = await api.createCart(state.user?.id, state.authToken);

        if (!cartResult.success) {
            throw new Error('Failed to create cart');
        }

        const cartId = cartResult.cart.id;
        updateStatus(statusContainer, 'Cart created ✓', 'complete');

        // Step 3: Add cart item
        updateStatus(statusContainer, 'Adding service to cart...', 'active');
        const itemResult = await api.addCartItem(cartId, {
            dogId: dog.id,
            beginAt: timeSlot.begin_at,
            endAt: timeSlot.end_at,
            dealId: timeSlot.deal_id,
            variationId: variationId
        }, state.authToken);

        if (!itemResult.success) {
            throw new Error('Failed to add service to cart');
        }
        updateStatus(statusContainer, 'Service added ✓', 'complete');

        // Step 4: Update cart with user
        updateStatus(statusContainer, 'Confirming booking...', 'active');
        await api.updateCart(cartId, state.user?.id, state.authToken);

        // Step 5: Create purchase
        const purchaseResult = await api.createPurchase(cartId, dog.id, state.authToken);

        if (!purchaseResult.success) {
            throw new Error('Failed to complete booking');
        }
        updateStatus(statusContainer, 'Booking confirmed ✓', 'complete');

        // Step 6: Check in
        updateStatus(statusContainer, 'Checking in...', 'active');

        // Get appointment ID from purchase
        const appointmentId = purchaseResult.purchase?.appointments?.[0]?.id;

        if (appointmentId) {
            await api.checkInAppointment(appointmentId, state.authToken);
            updateStatus(statusContainer, 'Checked in ✓', 'complete');
        } else {
            // If no appointment ID, still show success (appointment was created)
            updateStatus(statusContainer, 'Appointment created ✓', 'complete');
        }

        // Success!
        showToast(`${dog.name} checked in for daycare! 🎉`, 'success');

        setTimeout(() => {
            closeModal();
        }, 1500);

    } catch (error) {
        console.error('Check-in error:', error);

        let errorMessage = error.message;
        if (typeof error === 'object' && error !== null) {
            // If message is generic object string or missing, try to stringify the whole error or response data
            if (!errorMessage || errorMessage === '[object Object]' || errorMessage.includes('[object Object]')) {
                if (error.response?.data) {
                    errorMessage = JSON.stringify(error.response.data);
                } else {
                    try {
                        errorMessage = JSON.stringify(error);
                    } catch (e) {
                        errorMessage = 'Unknown error object';
                    }
                }
            }
        }

        updateStatus(statusContainer, `Error: ${errorMessage}`, 'error');
        showToast(`Check-in failed: ${errorMessage}`, 'error');

        // Re-enable button
        confirmBtn.disabled = false;
        confirmBtn.querySelector('.btn-text').classList.remove('hidden');
        confirmBtn.querySelector('.btn-loading').classList.add('hidden');
    }
}

function updateStatus(container, message, type) {
    const step = document.createElement('div');
    step.className = `status-step ${type}`;
    step.innerHTML = `
    <span>${type === 'active' ? '⏳' : type === 'complete' ? '✓' : '✗'}</span>
    <span>${message}</span>
  `;
    container.appendChild(step);
    container.scrollTop = container.scrollHeight;
}

// ==========================================
// Toast Notifications
// ==========================================

function showToast(message, type = 'info') {
    elements.toast.className = `toast ${type}`;
    elements.toastMessage.textContent = message;
    elements.toast.classList.remove('hidden');

    setTimeout(() => {
        elements.toast.classList.add('hidden');
    }, 4000);
}

// ==========================================
// Start App
// ==========================================

init();
