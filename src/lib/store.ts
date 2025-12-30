import { writable } from 'svelte/store';
import type { User, Dog, Variation } from '../api/client';

export const user = writable<User | null>(JSON.parse(sessionStorage.getItem('user') || 'null'));
export const authToken = writable<string | null>(sessionStorage.getItem('authToken'));
export const company = writable<any | null>(null);
export const dogs = writable<Dog[]>([]);
export const filteredDogs = writable<Dog[]>([]);
export const selectedDog = writable<Dog | null>(null);

export const customFields = writable<{
    petNameFieldId: number | null;
    petBreedFieldId: number | null;
    petColorFieldId: number | null;
    petGenderFieldId: number | null;
}>({
    petNameFieldId: null,
    petBreedFieldId: null,
    petColorFieldId: null,
    petGenderFieldId: null
});

export const variations = writable<Variation[]>([]);
export const spaVariations = writable<Variation[]>([]);
export const isSyncing = writable(false);
export const syncProgress = writable(0);
export const focusedCardIndex = writable(-1);

export const toastState = writable({
    visible: false,
    message: '',
    type: 'info', // 'info', 'success', 'error'
    progress: 0 // for sync
});


// Subscribe to update session storage
user.subscribe(val => {
    if (val) sessionStorage.setItem('user', JSON.stringify(val));
    else sessionStorage.removeItem('user');
});

authToken.subscribe(val => {
    if (val) sessionStorage.setItem('authToken', val);
    else sessionStorage.removeItem('authToken');
});
