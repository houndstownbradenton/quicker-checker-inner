import { toastState } from './store';

export function showToast(message: string, type: string = 'info') {
    toastState.set({ visible: true, message, type, progress: 0 });
    if (type !== 'sync-toast') {
        setTimeout(() => {
            toastState.update(s => {
                if (s.visible && s.type !== 'sync-toast') return { ...s, visible: false };
                return s;
            });
        }, 3000);
    }
}

export function showSyncToast(message: string) {
    toastState.set({ visible: true, message, type: 'sync-toast', progress: 0 });
}

export function updateSyncToast(message: string, progress: number) {
    toastState.update(s => ({ ...s, message, progress }));
}

export function hideToast() {
    toastState.update(s => ({ ...s, visible: false }));
}
