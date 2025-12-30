<script lang="ts">
    import type { Dog } from "$lib/api/client";
    import { createEventDispatcher } from "svelte";

    export let dog: Dog;
    export let focused: boolean = false;

    const dispatch = createEventDispatcher();

    function handleClick() {
        dispatch("select", dog);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            dispatch("select", dog);
        }
    }
</script>

<div
    class="dog-row"
    class:dog-row-focused={focused}
    on:click={handleClick}
    on:keydown={handleKeydown}
    role="button"
    tabindex="0"
>
    <div class="dog-header">
        <div class="dog-identity">
            {#if dog.photo}
                <img
                    src={dog.photo.medium ||
                        dog.photo.thumb ||
                        dog.photo.original}
                    alt={dog.name}
                    class="dog-avatar-large"
                />
            {:else}
                <div class="dog-avatar-placeholder-large">
                    {dog.name ? dog.name[0].toUpperCase() : "🐕"}
                </div>
            {/if}
            <div class="dog-info">
                <div class="dog-name">
                    {dog.first_name ||
                        dog.name}{#if dog.last_name || dog.owner_last_name}&nbsp;{dog.last_name ||
                            dog.owner_last_name}{/if}
                    {#if dog.gender === "Male"}
                        <span class="gender-icon male">♂</span>
                    {:else if dog.gender === "Female"}
                        <span class="gender-icon female">♀</span>
                    {/if}
                </div>
                <div class="dog-details">
                    {#if dog.owner_first_name || dog.owner_last_name}
                        <span
                            >Owner: {dog.owner_first_name || ""}
                            {dog.owner_last_name || ""}</span
                        >
                    {/if}
                    {#if dog.breed}
                        {#if dog.owner_first_name || dog.owner_last_name}<span
                                class="bullet">•</span
                            >{/if}
                        <span>{dog.breed}</span>
                    {/if}
                    {#if dog.color}
                        {#if dog.breed || dog.owner_first_name || dog.owner_last_name}<span
                                class="bullet">•</span
                            >{/if}
                        <span>{dog.color}</span>
                    {/if}
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    /* Dog Card Row - matching dog-relationship-tracker style */
    .dog-row {
        padding: 1.5rem;
        background: var(--card-bg, #ffffff);
        border: 1px solid var(--border-color, #e2e8f0);
        border-radius: var(--radius-lg, 16px);
        box-shadow:
            0 4px 6px -1px rgba(0, 0, 0, 0.1),
            0 2px 4px -1px rgba(0, 0, 0, 0.06);
        transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
        cursor: pointer;
    }

    .dog-row:hover {
        transform: translateY(-2px);
        box-shadow:
            0 10px 15px -3px rgba(0, 0, 0, 0.1),
            0 4px 6px -2px rgba(0, 0, 0, 0.05);
    }

    .dog-row:focus {
        outline: none;
        box-shadow:
            0 10px 15px -3px rgba(0, 0, 0, 0.1),
            0 4px 6px -2px rgba(0, 0, 0, 0.05);
        transform: translateY(-2px);
        border-color: var(--primary-color, #00587c);
    }

    .dog-row-focused {
        outline: 3px solid var(--secondary-color, #b9d532);
        outline-offset: 2px;
        transform: translateY(-2px);
        box-shadow:
            0 10px 15px -3px rgba(0, 0, 0, 0.1),
            0 0 0 4px rgba(185, 213, 50, 0.3);
    }

    .dog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .dog-identity {
        display: flex;
        align-items: center;
        gap: 1.25rem;
    }

    .dog-avatar-large {
        width: 80px;
        height: 80px;
        min-width: 80px;
        border-radius: 50%;
        object-fit: cover;
        border: 3px solid var(--border-color, #e2e8f0);
        flex-shrink: 0;
    }

    .dog-avatar-placeholder-large {
        width: 80px;
        height: 80px;
        min-width: 80px;
        border-radius: 50%;
        background: linear-gradient(
            135deg,
            var(--primary-color, #00587c),
            var(--accent-color, #38bdf8)
        );
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 2rem;
        flex-shrink: 0;
    }

    .dog-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .dog-name {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--text-main, #0f172a);
        line-height: 1.2;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .gender-icon {
        font-size: 2.25rem;
        font-weight: 900;
    }

    .gender-icon.male {
        color: #3b82f6;
    }

    .gender-icon.female {
        color: #ec4899;
    }

    .dog-details {
        font-size: 1rem;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
        color: var(--text-muted, #64748b);
    }

    .bullet {
        color: #cbd5e1;
    }

    /* Mobile responsiveness */
    @media (max-width: 640px) {
        .dog-identity {
            gap: 1rem;
        }

        .dog-avatar-large,
        .dog-avatar-placeholder-large {
            width: 64px;
            height: 64px;
            min-width: 64px;
        }

        .dog-avatar-placeholder-large {
            font-size: 1.5rem;
        }

        .dog-name {
            font-size: 1.25rem;
        }

        .dog-details {
            font-size: 0.875rem;
        }
    }
</style>
