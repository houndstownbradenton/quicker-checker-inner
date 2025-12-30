/**
 * Toast notification store
 */
import { writable } from 'svelte/store';

interface ToastState {
    visible: boolean;
    message: string;
    type: 'info' | 'success' | 'error' | 'sync-toast';
    progress: number;
}

export const toastState = writable<ToastState>({
    visible: false,
    message: '',
    type: 'info',
    progress: 0
});

/**
 * Show a toast notification
 */
export function showToast(message: string, type: 'info' | 'success' | 'error' = 'info', duration = 3000) {
    toastState.set({
        visible: true,
        message,
        type,
        progress: 0
    });

    if (type !== 'sync-toast') {
        setTimeout(() => {
            toastState.update(s => ({ ...s, visible: false }));
        }, duration);
    }
}

/**
 * Show a sync progress toast
 */
export function showSyncToast(message: string) {
    toastState.set({
        visible: true,
        message,
        type: 'sync-toast',
        progress: 0
    });
}

/**
 * Update sync toast progress
 */
export function updateSyncToast(message: string, progress: number) {
    toastState.set({
        visible: true,
        message,
        type: 'sync-toast',
        progress
    });
}

/**
 * Hide the toast
 */
export function hideToast() {
    toastState.update(s => ({ ...s, visible: false }));
}
