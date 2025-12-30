<script lang="ts">
    import type { Dog } from "../api/client";
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
    class="card dog-card"
    class:card-focused={focused}
    on:click={handleClick}
    on:keydown={handleKeydown}
    role="button"
    tabindex="0"
>
    <div class="dog-photo">
        {#if dog.photo}
            <img src={dog.photo} alt={dog.name} />
        {:else}
            <div class="dog-photo-placeholder">🐕</div>
        {/if}
    </div>
    <div class="dog-info">
        <h3 class="dog-name">{dog.name}</h3>
        <p class="dog-owner">{dog.owner_last_name}</p>
        <p class="dog-breed">{dog.breed}</p>
        {#if dog.color}
            <p class="dog-color">{dog.color}</p>
        {/if}
    </div>
</div>
