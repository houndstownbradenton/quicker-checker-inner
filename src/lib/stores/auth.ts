/**
 * Authentication stores for Quicker Checker Inner
 */
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface User {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    authentication_token?: string;
}

// Initialize from session storage if in browser
const storedUser = browser ? JSON.parse(sessionStorage.getItem('user') || 'null') : null;
const storedToken = browser ? sessionStorage.getItem('authToken') : null;

export const user = writable<User | null>(storedUser);
export const authToken = writable<string | null>(storedToken);

// Persist to session storage when values change
if (browser) {
    user.subscribe(val => {
        if (val) {
            sessionStorage.setItem('user', JSON.stringify(val));
        } else {
            sessionStorage.removeItem('user');
        }
    });

    authToken.subscribe(val => {
        if (val) {
            sessionStorage.setItem('authToken', val);
        } else {
            sessionStorage.removeItem('authToken');
        }
    });
}
