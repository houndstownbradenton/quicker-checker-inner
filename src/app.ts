/**
 * Quicker Checker - Main Application
 * Fast daycare check-in for Hounds Town Bradenton
 */

import * as api from './api/client';
import { User, Dog, Variation } from './api/client';
import { dogCache as cache } from './api/cache';
import {
    EVALUATION_VARIATION_ID,
    SERVICE_TYPE_NAMES,
    DAYCARE_VARIATIONS,
    SPA_SERVICE_NAMES
} from './api/constants';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';

// ==========================================
// State
// ==========================================

interface AppState {
    user: User | null;
    authToken: string | null;
    company: any | null;
    dogs: Dog[];
    filteredDogs: Dog[];
    selectedDog: Dog | null;
    customFields: {
        petNameFieldId: number | null;
        petBreedFieldId: number | null;
        petColorFieldId: number | null;
        petGenderFieldId: number | null;
    };
    variations: Variation[];
    spaVariations: Variation[];
    isSyncing: boolean;
    syncProgress: number;
    focusedCardIndex: number;
}

let state: AppState = {
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
    variations: [],
    spaVariations: [],
    isSyncing: false,
    syncProgress: 0,
    focusedCardIndex: -1
};

// ==========================================
// DOM Elements
// ==========================================

const elements = {
    // Screens
    loginScreen: document.getElementById('login-screen') as HTMLElement,
    mainScreen: document.getElementById('main-screen') as HTMLElement,

    // Login
    loginForm: document.getElementById('login-form') as HTMLFormElement,
    emailInput: document.getElementById('email') as HTMLInputElement,
    passwordInput: document.getElementById('password') as HTMLInputElement,
    loginError: document.getElementById('login-error') as HTMLElement,

    // Header
    userName: document.getElementById('user-name') as HTMLElement,
    logoutBtn: document.getElementById('logout-btn') as HTMLButtonElement,

    // Search
    dogSearch: document.getElementById('dog-search') as HTMLInputElement,
    dogCount: document.getElementById('dog-count') as HTMLElement,

    // Dogs Grid
    dogsGrid: document.getElementById('dogs-grid') as HTMLElement,
    noResults: document.getElementById('no-results') as HTMLElement,
    loadingDogs: document.getElementById('loading-dogs') as HTMLElement,

    // Modal
    checkinModal: document.getElementById('checkin-modal') as HTMLElement,
    modalClose: document.getElementById('modal-close') as HTMLButtonElement,
    selectedDogInfo: document.getElementById('selected-dog-info') as HTMLElement,
    checkinDate: document.getElementById('checkin-date') as HTMLInputElement,
    checkoutSection: document.getElementById('checkout-section') as HTMLElement,
    checkoutDate: document.getElementById('checkout-date') as HTMLInputElement,
    checkinStatus: document.getElementById('checkin-status') as HTMLElement,
    cancelCheckin: document.getElementById('cancel-checkin') as HTMLButtonElement,
    confirmCheckin: document.getElementById('confirm-checkin') as HTMLButtonElement,
    serviceType: document.getElementById('service-type') as HTMLSelectElement,
    serviceVariation: document.getElementById('service-variation') as HTMLSelectElement,
    variationGroup: document.getElementById('variation-group') as HTMLElement,
    spaTimeSection: document.getElementById('spa-time-section') as HTMLElement,
    spaTime: document.getElementById('spa-time') as HTMLInputElement,
    spaServicesSection: document.getElementById('spa-services-section') as HTMLElement,
    spaAddonsSection: document.querySelector('.spa-addons') as HTMLElement,
    spaBundleNote: document.getElementById('spa-bundle-note') as HTMLElement,

    // Toast
    toast: document.getElementById('toast') as HTMLElement,
    toastMessage: document.getElementById('toast-message') as HTMLElement
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
        // Start background sync after session restore
        startBackgroundSync();
    } else {
        showLoginScreen();
    }

    // Set up event listeners
    setupEventListeners();
}

function setupEventListeners() {
    // Login form
    if (elements.loginForm) {
        elements.loginForm.addEventListener('submit', handleLogin);
    }

    // Logout
    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', handleLogout);
    }

    // Search
    if (elements.dogSearch) {
        elements.dogSearch.addEventListener('input', handleSearch);
        // Reset focus when search input is focused
        elements.dogSearch.addEventListener('focus', () => {
            state.focusedCardIndex = -1;
            updateCardFocus();
        });
    }

    // Keyboard navigation for dog cards
    document.addEventListener('keydown', handleKeyboardNavigation);

    // Modal
    if (elements.modalClose) elements.modalClose.addEventListener('click', closeModal);
    if (elements.cancelCheckin) elements.cancelCheckin.addEventListener('click', closeModal);
    if (elements.confirmCheckin) elements.confirmCheckin.addEventListener('click', handleCheckIn);

    // Escape key closes modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !elements.checkinModal.classList.contains('hidden')) {
            closeModal();
        }
    });

    // Date picker click-anywhere functionality
    const dateWrapper = document.querySelector('.date-input-wrapper');
    const dateInput = document.getElementById('checkin-date') as HTMLInputElement;
    if (dateWrapper && dateInput) {
        dateWrapper.addEventListener('click', () => {
            try {
                // Try modern showPicker if available
                if ('showPicker' in HTMLInputElement.prototype) {
                    dateInput.showPicker();
                } else {
                    dateInput.click();
                    dateInput.focus();
                }
            } catch (e) {
                dateInput.click();
                dateInput.focus();
            }
        });
    }

    // Spa UI listeners
    if (elements.spaServicesSection) {
        elements.spaServicesSection.addEventListener('change', (e) => {
            const target = e.target as HTMLElement;
            if (target.matches('input[name="spa-addon"]')) {
                handleSpaSelection();
            } else if (target.matches('input[name="spa-primary"]')) {
                handleSpaPrimarySelection();
            }
        });
    }
}

// Service Selection
if (elements.serviceType) {
    elements.serviceType.addEventListener('change', () => {
        updateServiceDropdowns();
        // Show/hide spa time picker based on service type
        if (elements.spaTimeSection) {
            if (elements.serviceType.value === 'spa') {
                elements.spaTimeSection.classList.remove('hidden');
            } else {
                elements.spaTimeSection.classList.add('hidden');
            }
        }
    });
}
if (elements.checkinDate) {
    elements.checkinDate.addEventListener('change', () => {
        if (elements.serviceType.value === 'daycare') {
            updateServiceDropdowns();
        }
    });
}
if (elements.serviceVariation) {
    elements.serviceVariation.addEventListener('change', () => {
        // Trigger availability check if date is selected?
        // For now just letting the user click confirm is fine
    });
}

// Close modal on backdrop click
if (elements.checkinModal) {
    elements.checkinModal.addEventListener('click', (e) => {
        if (e.target === elements.checkinModal) {
            closeModal();
        }
    });
}

// ==========================================
// Authentication
// ==========================================

async function handleLogin(e: Event) {
    e.preventDefault();

    const email = elements.emailInput.value;
    const password = elements.passwordInput.value;

    // Show loading state
    const submitBtn = elements.loginForm.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-text')?.classList.add('hidden');
        submitBtn.querySelector('.btn-loading')?.classList.remove('hidden');
    }
    elements.loginError.classList.add('hidden');

    try {
        const result = await api.login(email, password);

        if (result.success && result.user) {
            state.user = result.user;
            state.authToken = result.token || null;

            // Save to session
            if (state.authToken) sessionStorage.setItem('authToken', state.authToken);
            sessionStorage.setItem('user', JSON.stringify(state.user));

            await showMainScreen();
            // Start background sync after login
            startBackgroundSync();
        } else {
            throw new Error('Login failed');
        }
    } catch (error: any) {
        console.error('Login error:', error);

        let displayError = 'Login failed. Please check your credentials.';
        if (error.message) {
            if (error.message.includes('wrong email or password')) {
                displayError = 'Incorrect email or password.';
            } else {
                displayError = error.message;
            }
        }

        elements.loginError.textContent = displayError;
        elements.loginError.classList.remove('hidden');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-text')?.classList.remove('hidden');
            submitBtn.querySelector('.btn-loading')?.classList.add('hidden');
        }
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
        elements.userName.innerHTML = `<span style="margin-right: 1rem; font-size: 1.5rem">🐶</span>${state.user.first_name} ${state.user.last_name}`;
    }

    // Load company data only (dogs will load when user searches)
    await loadCompanyData();

    // Show initial search prompt
    const cachedCount = await cache.getCount();
    elements.dogCount.textContent = cachedCount > 0
        ? `Ready (${cachedCount} dogs cached)`
        : 'Search for a dog by name';
    showSearchPrompt();
}

// ==========================================
// Background Sync
// ==========================================

async function startBackgroundSync() {
    if (state.isSyncing || !state.authToken) return;

    state.isSyncing = true;
    let currentPage = 1;
    const perPage = 20;
    let totalDogsSynced = 0;

    showSyncToast('Starting background sync...');

    try {
        while (true) {
            const result = await api.syncDogs(currentPage, perPage, state.authToken);

            if (!result.success) throw new Error('Sync failed');

            const dogs = result.dogs.map((dog: any) => processDog(dog));
            await cache.putDogs(dogs);

            totalDogsSynced += dogs.length;
            const progress = Math.min(Math.round((currentPage / (result.pagination.totalPages || 1)) * 100), 100);

            updateSyncToast(`Synced ${totalDogsSynced} dogs (${progress}%)`, progress);

            if (currentPage >= result.pagination.totalPages) break;
            currentPage++;
        }

        showToast(`Sync complete! ${totalDogsSynced} dogs updated.`, 'success');
        elements.dogCount.textContent = `${totalDogsSynced} dogs loaded`;
    } catch (error) {
        console.error('Background sync failed:', error);
        showToast('Background sync encountered an error.', 'error');
    } finally {
        state.isSyncing = false;
    }
}

function showSyncToast(message: string) {
    elements.toast.className = 'toast info sync-toast';
    elements.toastMessage.innerHTML = `
        <div class="sync-message">${message}</div>
        <div class="progress-bar-container">
            <div class="progress-bar" style="width: 0%"></div>
        </div>
    `;
    elements.toast.classList.remove('hidden');
}

function updateSyncToast(message: string, progress: number) {
    const msgEl = elements.toast.querySelector('.sync-message');
    const barEl = elements.toast.querySelector('.progress-bar') as HTMLElement;
    if (msgEl) msgEl.textContent = message;
    if (barEl) barEl.style.width = `${progress}%`;
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
                const customFields: any[] = state.company.custom_fields;

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



function processDog(dog: any): Dog {
    // Extract values from custom fields or direct fields (Partner API)
    let name: string | null = null;
    let breed: string | null = null;
    let color: string | null = null;
    let gender: string | null = null;
    let photo: any = null;
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
            const nameField = values.find((v: any) => v.custom_field_id === state.customFields.petNameFieldId);
            if (nameField) name = nameField.value;
        }

        // Get breed
        if (!breed && state.customFields.petBreedFieldId) {
            const breedField = values.find((v: any) => v.custom_field_id === state.customFields.petBreedFieldId);
            if (breedField) breed = breedField.value;
        }

        // Get color
        if (state.customFields.petColorFieldId) {
            const colorField = values.find((v: any) => v.custom_field_id === state.customFields.petColorFieldId);
            if (colorField) color = colorField.value;
        }

        // Get gender
        if (!gender && state.customFields.petGenderFieldId) {
            const genderField = values.find((v: any) => v.custom_field_id === state.customFields.petGenderFieldId);
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
        name: name || 'Unknown',
        owner_last_name: ownerName,
        breed: breed || 'Unknown breed',
        color: color || undefined,
        gender: gender || undefined,
        photo,
        // Using `as any` to attach the original generic raw data if needed
        ...dog
    };
}

// ==========================================
// Search
// ==========================================

// Debounce timer
let searchTimeout: any = null;

function handleSearch(e: Event) {
    const target = e.target as HTMLInputElement;
    const query = target.value.trim();

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
    searchTimeout = setTimeout(async () => {
        // First try local cache
        const localResults = await cache.search(query);

        if (localResults.length > 0) {
            state.dogs = localResults;
            state.filteredDogs = [...localResults];
            elements.dogCount.textContent = `${state.dogs.length} dog${state.dogs.length === 1 ? '' : 's'} found (local)`;
            renderDogs();
        } else {
            // Fall back to remote search
            searchDogs(query);
        }
    }, 300);
}

async function searchDogs(query: string) {
    if (!state.authToken) return;

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
    state.focusedCardIndex = -1;
}

// ==========================================
// Keyboard Navigation
// ==========================================

function handleKeyboardNavigation(e: KeyboardEvent) {
    // Only handle navigation when we have dogs displayed and modal is not open
    if (state.filteredDogs.length === 0) return;
    if (!elements.checkinModal.classList.contains('hidden')) return;

    // Handle search input interactions
    if (document.activeElement === elements.dogSearch) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            elements.dogSearch.blur();
            state.focusedCardIndex = 0;
            updateCardFocus();
        }
        return;
    }

    const cards = elements.dogsGrid.querySelectorAll('.card');
    if (cards.length === 0) return;

    // Calculate grid columns (2 columns based on CSS grid-cols-2)
    const gridColumns = 2;

    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            // Move down one row
            if (state.focusedCardIndex === -1) {
                state.focusedCardIndex = 0;
            } else if (state.focusedCardIndex + gridColumns < cards.length) {
                state.focusedCardIndex += gridColumns;
            }
            updateCardFocus();
            break;

        case 'ArrowUp':
            e.preventDefault();
            // Move up one row
            if (state.focusedCardIndex >= gridColumns) {
                state.focusedCardIndex -= gridColumns;
            } else if (state.focusedCardIndex > 0) {
                state.focusedCardIndex = 0; // Move to first item if in first row but not 0 (e.g. 1)
            } else if (state.focusedCardIndex === 0) {
                // If at top, focus search input
                state.focusedCardIndex = -1;
                updateCardFocus();
                elements.dogSearch.focus();
            }
            updateCardFocus();
            break;

        case 'ArrowRight':
            e.preventDefault();
            // Move right one card
            if (state.focusedCardIndex === -1) {
                state.focusedCardIndex = 0;
            } else if (state.focusedCardIndex < cards.length - 1) {
                state.focusedCardIndex++;
            }
            updateCardFocus();
            break;

        case 'ArrowLeft':
            e.preventDefault();
            // Move left one card
            if (state.focusedCardIndex > 0) {
                state.focusedCardIndex--;
            } else if (state.focusedCardIndex === 0) {
                // optional: go back to search?
            }
            updateCardFocus();
            break;

        case 'Enter':
            // Open modal for focused card
            if (state.focusedCardIndex >= 0 && state.focusedCardIndex < state.filteredDogs.length) {
                e.preventDefault();
                const dog = state.filteredDogs[state.focusedCardIndex];
                if (dog) openModal(dog);
            }
            break;

        case 'Escape':
            // Clear focus when Escape is pressed
            if (elements.checkinModal.classList.contains('hidden')) {
                state.focusedCardIndex = -1;
                updateCardFocus();
                elements.dogSearch.focus();
            }
            break;
    }
}

function updateCardFocus() {
    const cards = elements.dogsGrid.querySelectorAll('.card');

    cards.forEach((card, index) => {
        const htmlCard = card as HTMLElement;
        if (index === state.focusedCardIndex) {
            htmlCard.classList.add('card-focused');
            htmlCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            htmlCard.classList.remove('card-focused');
        }
    });
}

// ==========================================
// Service Selection
// ==========================================

async function loadVariations() {
    if (state.variations.length > 0) return;
    if (!state.authToken) return;

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

function handleSpaSelection() {
    // Check checkboxes
    const checkboxes = document.querySelectorAll('input[name="spa-addon"]:checked');
    const checkedCount = checkboxes.length;

    // Toggle Bundle Note if 3 selected
    if (checkedCount === 3) {
        elements.spaBundleNote.classList.remove('hidden');
    } else {
        elements.spaBundleNote.classList.add('hidden');
    }
}

function handleSpaPrimarySelection() {
    const primary = document.querySelector('input[name="spa-primary"]:checked') as HTMLInputElement;
    if (primary && primary.value === 'stand-alone-nails') {
        if (elements.spaAddonsSection) {
            elements.spaAddonsSection.classList.add('hidden');
            // Uncheck addons
            const addons = document.querySelectorAll('input[name="spa-addon"]');
            addons.forEach((el) => { (el as HTMLInputElement).checked = false; });
            handleSpaSelection(); // Update bundle note state
        }
    } else {
        if (elements.spaAddonsSection) {
            elements.spaAddonsSection.classList.remove('hidden');
        }
    }
}

async function updateServiceDropdowns() {
    const serviceType = elements.serviceType.value;
    const select = elements.serviceVariation;

    // Reset visibility
    elements.spaServicesSection.classList.add('hidden');
    elements.variationGroup.classList.add('hidden');

    // Clear existing dropdown
    select.innerHTML = '';

    // Handle Evaluation Note (Must run before any early returns)
    let noteEl = document.getElementById('eval-note');
    if (!noteEl) {
        noteEl = document.createElement('div');
        noteEl.id = 'eval-note';
        noteEl.className = 'info-note hidden';
        noteEl.style.marginTop = '0.5rem';
        noteEl.style.fontSize = '0.9rem';
        noteEl.style.color = 'var(--primary-color)';
        if (elements.serviceType.parentNode) {
            elements.serviceType.parentNode.insertBefore(noteEl, elements.serviceType.nextSibling);
        }
    }

    if (serviceType === 'evaluation') {
        noteEl.textContent = 'ℹ️ Evaluations are required for all new dogs before their first daycare or boarding stay.';
        noteEl.classList.remove('hidden');
    } else {
        noteEl.classList.add('hidden');
    }

    if (serviceType === 'spa') {
        elements.spaServicesSection.classList.remove('hidden');
        elements.checkoutSection?.classList.add('hidden'); // Hide for spa

        // Fetch spa-specific variations if not loaded
        if (state.spaVariations.length === 0) {
            try {
                const result = await api.getSpaVariations();
                if (result.success && result.variations) {
                    state.spaVariations = result.variations;
                    console.log('[spa_filter] Spa variations loaded:', state.spaVariations.map(v => v.name));
                }
            } catch (error) {
                console.error('[spa_filter] Error fetching spa variations:', error);
            }
        }

        // Initialize UI state
        handleSpaSelection();
        return;
    }

    // Standard filtering for other types
    elements.variationGroup.classList.remove('hidden');

    // Filter variations
    let filtered: Variation[] = [];

    // Check-out date is hidden by default (only for Boarding)
    elements.checkoutSection?.classList.add('hidden');

    if (serviceType === 'daycare') {
        // Special logic for Daycare (hardcoded IDs as they are hidden in API)
        const dateStr = elements.checkinDate.value || new Date().toISOString().split('T')[0];
        // Parse date considering timezone (simplified: assume local input matches)
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

        const option = document.createElement('option');
        option.value = targetId;
        option.textContent = targetName;
        select.appendChild(option);
        select.disabled = false;
        return; // Skip standard filtering
    }

    if (serviceType === 'boarding') {
        elements.checkoutSection?.classList.remove('hidden');
        filtered = state.variations.filter(v =>
            v.name.toLowerCase().includes('boarding') &&
            !v.name.toLowerCase().includes('shelter')
        );
    } else if (serviceType === 'evaluation') {
        filtered = state.variations.filter(v => v.name.toLowerCase().includes('evaluation'));
        // Show all if no specific 'evaluation' keyword found? Or just assume setup is correct.
        // If filtered is empty, maybe show all 'Daycare' style variations?
        // For now, strict filtering is safer.
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
            option.value = String(v.id);
            option.textContent = v.name;
            select.appendChild(option);
        });

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
    // Reset keyboard focus when new results are rendered
    state.focusedCardIndex = -1;
    // Using grid layout from new CSS
    elements.dogsGrid.className = 'grid grid-cols-2';
    elements.dogsGrid.innerHTML = state.filteredDogs.map(dog => createDogCard(dog)).join('');

    // Add click handlers
    elements.dogsGrid.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', () => {
            const htmlCard = card as HTMLElement;
            const dogId = parseInt(htmlCard.dataset.dogId || '0');
            const dog = state.dogs.find(d => d.id === dogId);
            if (dog) openModal(dog);
        });
    });
}

function createDogCard(dog: Dog) {
    const photoHtml = dog.photo
        ? `<img src="${typeof dog.photo === 'string' ? dog.photo : (dog.photo.medium || dog.photo.thumb || dog.photo.original)}" alt="${dog.name}" class="avatar">`
        : `<div class="avatar">${dog.name.charAt(0)}</div>`;

    // Extend dog type locally to access owner_last_name which we added in processDog
    const extendedDog = dog as any;

    return `
    <article class="card dog-card-interactive" data-dog-id="${dog.id}" style="cursor: pointer; display: flex; align-items: center; gap: 1rem; padding: 1.5rem;">
      ${photoHtml}
      <div class="dog-info">
        <h3 class="" style="margin: 0; font-size: 1.25rem; color: var(--primary-color);">${escapeHtml(dog.name)}</h3>
        <p class="" style="margin: 0.25rem 0; color: var(--text-muted); font-size: 0.9rem;">Owner: ${escapeHtml(`${extendedDog.owner_first_name || ''} ${extendedDog.owner_last_name || ''}`.trim() || 'Unknown')}</p>
        <div class="dog-details" style="display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap;">
          ${dog.gender ? `<span class="syncing-badge gender-badge-${dog.gender.toLowerCase()}">${escapeHtml(dog.gender)}</span>` : ''}
          <span class="syncing-badge">${escapeHtml(dog.breed || 'Unknown')}</span>
        </div>
      </div>
    </article>
  `;
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// Modal
// ==========================================

async function openModal(dog: Dog) {
    state.selectedDog = dog;

    const photoHtml = dog.photo
        ? `<img src="${typeof dog.photo === 'string' ? dog.photo : (dog.photo.medium || dog.photo.thumb || dog.photo.original)}" alt="${dog.name}">`
        : '🐕';

    const extendedDog = dog as any;

    elements.selectedDogInfo.innerHTML = `
    <div class="selected-dog-photo">${photoHtml}</div>
    <div class="selected-dog-details">
      <h3>${escapeHtml(dog.name)}</h3>
      <p>Owner: ${escapeHtml(`${extendedDog.owner_first_name || ''} ${extendedDog.owner_last_name || ''}`.trim() || 'Unknown')}</p>
      <p>${escapeHtml(dog.breed || '')}${dog.gender ? ` • ${escapeHtml(dog.gender)}` : ''}${dog.color ? ` • ${escapeHtml(dog.color)}` : ''}</p>
    </div>
  `;

    elements.checkinStatus.innerHTML = '';
    elements.confirmCheckin.disabled = false;
    elements.confirmCheckin.querySelector('.btn-text')?.classList.remove('hidden');
    elements.confirmCheckin.querySelector('.btn-loading')?.classList.add('hidden');

    // Set date to today by default
    elements.checkinDate.value = new Date().toISOString().split('T')[0];

    // Initialize flatpickr for date picker
    flatpickr('#checkin-date', {
        dateFormat: 'Y-m-d',
        defaultDate: 'today',
        minDate: 'today'
    });

    // Initialize checkout date (default tomorrow)
    if (elements.checkoutDate) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        elements.checkoutDate.value = tomorrow.toISOString().split('T')[0];

        flatpickr('#checkout-date', {
            dateFormat: 'Y-m-d',
            defaultDate: tomorrow,
            minDate: 'today'
        });
    }

    // Initialize flatpickr for time picker (spa)
    if (elements.spaTime) {
        flatpickr('#spa-time', {
            enableTime: true,
            noCalendar: true,
            dateFormat: 'H:i',
            defaultDate: '09:00',
            time_24hr: false,
            minuteIncrement: 15
        });
    }

    // Load variations
    if (state.variations.length === 0) {
        await loadVariations();
    } else {
        updateServiceDropdowns();
    }

    elements.checkinModal.classList.remove('hidden');

    // Auto-focus the Service Type dropdown for better accessibility
    setTimeout(() => {
        if (elements.serviceType) {
            elements.serviceType.focus();
        }
    }, 50);
}

function closeModal() {
    elements.checkinModal.classList.add('hidden');
    state.selectedDog = null;
}

// Reset the check-in form to defaults after successful booking
function resetCheckinForm() {
    // Reset service type to daycare
    elements.serviceType.value = 'daycare';

    // Clear spa radio buttons
    const spaRadios = document.querySelectorAll<HTMLInputElement>('input[name="spa-primary"]');
    spaRadios.forEach(radio => radio.checked = false);

    // Clear spa checkboxes
    const spaCheckboxes = document.querySelectorAll<HTMLInputElement>('.spa-addons input[type="checkbox"]');
    spaCheckboxes.forEach(checkbox => checkbox.checked = false);

    // Hide spa section and show regular variation dropdown
    elements.spaServicesSection?.classList.add('hidden');
    elements.variationGroup?.classList.remove('hidden');

    // Clear status container
    elements.checkinStatus.innerHTML = '';

    // Trigger dropdown update
    updateServiceDropdowns();
}

// ==========================================
// Check-In Process
// ==========================================

async function handleCheckIn() {
    if (!state.selectedDog) return;
    if (!state.authToken) return;

    const dog = state.selectedDog;
    const confirmBtn = elements.confirmCheckin;

    // Disable button and show loading
    confirmBtn.disabled = true;
    confirmBtn.querySelector('.btn-text')?.classList.add('hidden');
    confirmBtn.querySelector('.btn-loading')?.classList.remove('hidden');

    const statusContainer = elements.checkinStatus;

    try {
        const selectedDate = elements.checkinDate.value || new Date().toISOString().split('T')[0];
        let variationId = elements.serviceVariation.value;
        let searchVariationId = variationId;
        const serviceType = elements.serviceType.value;

        // Spa Logic: Determine variation IDs
        if (serviceType === 'spa') {
            const getSpaId = (name: string) => state.spaVariations.find(v => v.name === name)?.id;
            const primaryVal = (document.querySelector('input[name="spa-primary"]:checked') as HTMLInputElement)?.value;
            const addons = Array.from(document.querySelectorAll('input[name="spa-addon"]:checked'))
                .map(el => (el as HTMLInputElement).value);

            const ids: string[] = [];

            // Primary Service
            let primaryId: string | undefined;
            if (primaryVal === 'townie-bath') primaryId = String(getSpaId(SPA_SERVICE_NAMES.PRIMARY.TOWNIE_BATH));
            else if (primaryVal === 'townie-bath-deluxe') primaryId = String(getSpaId(SPA_SERVICE_NAMES.PRIMARY.TOWNIE_BATH_DELUXE));
            else if (primaryVal === 'stand-alone-nails') primaryId = String(getSpaId(SPA_SERVICE_NAMES.PRIMARY.STAND_ALONE_NAILS));

            if (primaryId) {
                ids.push(primaryId);
                searchVariationId = primaryId;
            }

            // Add-ons (Bundle Logic)
            if (addons.length === 3) {
                const bundleId = getSpaId(SPA_SERVICE_NAMES.BUNDLE.ALL_ADDONS);
                if (bundleId) ids.push(String(bundleId));
            } else {
                if (addons.includes('nail-trim')) {
                    const id = getSpaId(SPA_SERVICE_NAMES.ADDONS.NAIL_TRIM);
                    if (id) ids.push(String(id));
                }
                if (addons.includes('teeth-brushing')) {
                    const id = getSpaId(SPA_SERVICE_NAMES.ADDONS.TEETH_BRUSHING);
                    if (id) ids.push(String(id));
                }
                if (addons.includes('blueberry-facial')) {
                    const id = getSpaId(SPA_SERVICE_NAMES.ADDONS.BLUEBERRY_FACIAL);
                    if (id) ids.push(String(id));
                }
            }

            variationId = ids.join(',');
            console.log('[checkin] Spa Booking IDs:', variationId, 'Names:', ids.map(id => state.spaVariations.find(v => String(v.id) === id)?.name));

            if (!variationId) {
                throw new Error('Please select at least one spa service');
            }

            console.log('[checkin] Spa Booking IDs:', variationId, 'Search ID:', searchVariationId);
        }

        // Use Direct Booking for ALL services (Partner API)
        {
            updateStatus(statusContainer, `Creating direct booking for ${selectedDate}...`, 'active');

            // Find begin/end times (default to current time if no times found, or use a mock slot)
            // For now, we'll try to find a real slot if possible, but if not found, we use current time
            let beginAt = `${selectedDate}T12:00:00Z`; // Default to 7am EST (12:00 UTC)
            let endAt = `${selectedDate}T22:00:00Z`;   // Default to 5pm EST (22:00 UTC)

            // Overwrite endAt for Boarding if selected
            if (serviceType === 'boarding' && elements.checkoutDate?.value) {
                // Boarding ends at 12pm EST on checkout date (17:00 UTC)
                endAt = `${elements.checkoutDate.value}T17:00:00Z`;
            }

            try {
                // Only fetch open times if NOT boarding (or if we want to confirm start time?)
                // MyTime API might fail if we ask for 2-week range slots?
                // For now, let's skip getOpenTimes for Boarding to avoid complexity, or just use it for start time?
                // Let's TRY to get open times but fallback safely.
                const timesResult = await api.getOpenTimes(dog.id, selectedDate, state.authToken, searchVariationId);
                if (timesResult.success && timesResult.openTimes?.length > 0) {
                    beginAt = timesResult.openTimes[0].begin_at;
                    if (serviceType !== 'boarding') {
                        endAt = timesResult.openTimes[0].end_at;
                    }
                }
            } catch (e) {
                console.warn('Could not fetch open times for direct booking, using defaults.');
            }

            // Prepare payload with variations array for spa or single variationId for others
            const ids = variationId.split(',');
            const directPayload: any = {
                dogId: dog.id,
                beginAt: beginAt,
                endAt: endAt,
                clientId: dog.client_id
            };

            if (ids.length > 1 || serviceType === 'spa') {
                // Use 'variations' array for Spa services (Partner API format)
                directPayload.variations = ids.map(id => ({
                    variation_mytime_id: id,
                    variation_begin_at: beginAt,
                    variation_end_at: endAt
                }));
            } else {
                directPayload.variationId = variationId;
            }

            const directResult = await api.createDirectAppointment(directPayload, state.authToken);

            if (!directResult.success) {
                throw new Error(directResult.error || 'Failed to create direct appointment');
            }

            const appointmentId = directResult.appointment?.id;
            updateStatus(statusContainer, 'Appointment created ✓', 'complete');

            // Step 6: Check in - ONLY for Daycare appointments
            // Spa and Boarding should NOT auto-check in
            if (appointmentId && serviceType === 'daycare') {
                updateStatus(statusContainer, 'Checking in...', 'active');
                await api.checkInAppointment(appointmentId, state.authToken);
                updateStatus(statusContainer, 'Checked in ✓', 'complete');
            }
        }

        // Success message varies by service type
        const successMessage = serviceType === 'daycare'
            ? `${dog.name} checked in! 🎉`
            : `${dog.name} booked for ${serviceType.charAt(0).toUpperCase() + serviceType.slice(1)}! 🎉`;
        showToast(successMessage, 'success');

        // Reset form for next use
        resetCheckinForm();

        setTimeout(() => {
            closeModal();
        }, 1500);

    } catch (error: any) {
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
        confirmBtn.querySelector('.btn-text')?.classList.remove('hidden');
        confirmBtn.querySelector('.btn-loading')?.classList.add('hidden');
    }
}

function updateStatus(container: HTMLElement, message: string, type: 'active' | 'complete' | 'error') {
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

function showToast(message: string, type = 'info') {
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
