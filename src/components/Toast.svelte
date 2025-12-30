<script lang="ts">
    import { toastState } from "../lib/store";
</script>

<div
    id="toast"
    class="toast {$toastState.type}"
    class:hidden={!$toastState.visible}
    class:sync-toast={$toastState.type === "sync-toast"}
>
    {#if $toastState.type === "sync-toast"}
        <div class="sync-message">{$toastState.message}</div>
        <div class="progress-bar-container">
            <div
                class="progress-bar"
                style="width: {$toastState.progress}%"
            ></div>
        </div>
    {:else}
        <span id="toast-message">{$toastState.message}</span>
    {/if}
</div>
