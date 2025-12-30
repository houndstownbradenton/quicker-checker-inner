/**
 * Application state stores for Quicker Checker Inner
 */
import { writable } from 'svelte/store';
import type { Dog, Variation } from '../../api/client';

// Company and configuration
export const company = writable<any>(null);
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

// Dog data
export const dogs = writable<Dog[]>([]);
export const filteredDogs = writable<Dog[]>([]);
export const selectedDog = writable<Dog | null>(null);

// Service variations
export const variations = writable<Variation[]>([]);
export const spaVariations = writable<Variation[]>([]);

// UI state
export const focusedCardIndex = writable<number>(-1);

// Sync state
export const isSyncing = writable<boolean>(false);
export const syncProgress = writable<number>(0);
