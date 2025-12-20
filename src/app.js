/**
 * Quicker Checker - Main Application
 * Fast daycare check-in for Hounds Town Bradenton
 */

import * as api from './api/client.js';

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
    }
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
    checkinStatus: document.getElementById('checkin-status'),
    cancelCheckin: document.getElementById('cancel-checkin'),
    confirmCheckin: document.getElementById('confirm-checkin'),

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

    // Close modal on backdrop click
    elements.checkinModal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
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
    elements.mainScreen.classList.add('hidden');
    elements.loginForm.reset();
}

async function showMainScreen() {
    elements.loginScreen.classList.remove('active');
    elements.mainScreen.classList.remove('hidden');

    // Update user name in header
    if (state.user) {
        elements.userName.textContent = `${state.user.first_name} ${state.user.last_name}`;
    }

    // Load company data and dogs
    await loadCompanyData();
    await loadDogs();
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
    // Extract values from custom fields
    let name = null;
    let breed = null;
    let color = null;
    let gender = null;
    let photo = null;

    if (dog.custom_field_values && Array.isArray(dog.custom_field_values)) {
        const values = dog.custom_field_values;

        // Get name
        if (state.customFields.petNameFieldId) {
            const nameField = values.find(v => v.custom_field_id === state.customFields.petNameFieldId);
            if (nameField) name = nameField.value;
        }

        // Get breed
        if (state.customFields.petBreedFieldId) {
            const breedField = values.find(v => v.custom_field_id === state.customFields.petBreedFieldId);
            if (breedField) breed = breedField.value;
        }

        // Get color
        if (state.customFields.petColorFieldId) {
            const colorField = values.find(v => v.custom_field_id === state.customFields.petColorFieldId);
            if (colorField) color = colorField.value;
        }

        // Get gender
        if (state.customFields.petGenderFieldId) {
            const genderField = values.find(v => v.custom_field_id === state.customFields.petGenderFieldId);
            if (genderField) gender = genderField.value;
        }
    }

    // Fallback to first_name or label if name not found
    if (!name) {
        name = dog.first_name || dog.label || `Pet #${dog.id}`;
    }

    // Get photo if available
    if (dog.photo) {
        photo = dog.photo.medium || dog.photo.thumb || dog.photo.original;
    }

    return {
        id: dog.id,
        name,
        ownerLastName: dog.last_name || 'Unknown',
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

function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();

    if (!query) {
        state.filteredDogs = [...state.dogs];
    } else {
        state.filteredDogs = state.dogs.filter(dog =>
            dog.name.toLowerCase().includes(query) ||
            dog.ownerLastName.toLowerCase().includes(query) ||
            dog.breed.toLowerCase().includes(query)
        );
    }

    renderDogs();
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
    elements.dogsGrid.innerHTML = state.filteredDogs.map(dog => createDogCard(dog)).join('');

    // Add click handlers
    elements.dogsGrid.querySelectorAll('.dog-card').forEach(card => {
        card.addEventListener('click', () => {
            const dogId = parseInt(card.dataset.dogId);
            const dog = state.dogs.find(d => d.id === dogId);
            if (dog) openModal(dog);
        });
    });
}

function createDogCard(dog) {
    const genderClass = dog.gender?.toLowerCase() === 'male' ? 'gender-male' :
        dog.gender?.toLowerCase() === 'female' ? 'gender-female' : '';

    const photoHtml = dog.photo
        ? `<img src="${dog.photo}" alt="${dog.name}">`
        : '🐕';

    return `
    <article class="dog-card" data-dog-id="${dog.id}">
      <div class="dog-photo">${photoHtml}</div>
      <div class="dog-info">
        <h3 class="dog-name">${escapeHtml(dog.name)}</h3>
        <p class="dog-owner">Owner: ${escapeHtml(dog.ownerLastName)}</p>
        <div class="dog-details">
          ${dog.gender ? `<span class="dog-tag ${genderClass}">${escapeHtml(dog.gender)}</span>` : ''}
          <span class="dog-tag">${escapeHtml(dog.breed)}</span>
          ${dog.color ? `<span class="dog-tag">${escapeHtml(dog.color)}</span>` : ''}
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

function openModal(dog) {
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
        // Step 1: Get available times
        updateStatus(statusContainer, 'Finding available time slot...', 'active');
        const today = new Date().toISOString().split('T')[0];
        const timesResult = await api.getOpenTimes(dog.id, today, state.authToken);

        if (!timesResult.success || !timesResult.openTimes?.length) {
            throw new Error('No available time slots for today');
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
        updateStatus(statusContainer, 'Adding daycare service...', 'active');
        const itemResult = await api.addCartItem(cartId, {
            dogId: dog.id,
            beginAt: timeSlot.begin_at,
            endAt: timeSlot.end_at,
            dealId: timeSlot.deal_id
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
        updateStatus(statusContainer, `Error: ${error.message}`, 'error');
        showToast(`Check-in failed: ${error.message}`, 'error');

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
