<script lang="ts">
    import { onMount } from "svelte";
    import type { Dog } from "$lib/api/client";
    import * as api from "$lib/api/client";
    import { user, authToken } from "$lib/stores/auth";
    import {
        company,
        dogs,
        filteredDogs,
        selectedDog,
        customFields,
        focusedCardIndex,
    } from "$lib/stores/app";
    import {
        showToast,
        showSyncToast,
        updateSyncToast,
    } from "$lib/stores/toast";
    import { dogCache as cache } from "$lib/api/cache";
    import DogCard from "$lib/components/DogCard.svelte";
    import CheckinModal from "$lib/components/CheckinModal.svelte";
    import { LogOut } from "lucide-svelte";

    let searchQuery = "";
    let dogCount = "Search for a dog by name";
    let isLoading = false;
    let searchTimeout: ReturnType<typeof setTimeout> | null = null;

    // Subscriptions
    let token: string | null = null;
    let currentUser: any = null;
    let dogsList: Dog[] = [];
    let filtered: Dog[] = [];
    let focusedIdx = -1;

    user.subscribe((v) => (currentUser = v));
    authToken.subscribe((v) => (token = v));
    filteredDogs.subscribe((v) => (filtered = v));
    focusedCardIndex.subscribe((v) => (focusedIdx = v));

    let showModal = false;
    let modalDog: Dog | null = null;

    onMount(async () => {
        await loadCompanyData();
        const cachedCount = await cache.getCount();
        dogCount =
            cachedCount > 0
                ? `Ready (${cachedCount} dogs cached)`
                : "Search for a dog by name";
        startBackgroundSync();
    });

    async function loadCompanyData() {
        try {
            const result = await api.getCompany();
            if (result.success) {
                company.set(result.company);
                const companyData = result.company;
                if (companyData?.custom_fields) {
                    const cf: any[] = companyData.custom_fields;
                    const petNameField = cf.find(
                        (c) =>
                            c.uuid === "pet_name" ||
                            (c.is_label === true &&
                                c.resource_type === "MyClient::Child"),
                    );
                    const petBreedField = cf.find(
                        (c) =>
                            c.uuid === "pet_breed" ||
                            (c.is_secondary_label === true &&
                                c.resource_type === "MyClient::Child"),
                    );
                    const petColorField = cf.find(
                        (c) =>
                            c.title?.toLowerCase().includes("color") &&
                            c.resource_type === "MyClient::Child",
                    );
                    const petGenderField = cf.find(
                        (c) =>
                            (c.title?.toLowerCase().includes("gender") ||
                                c.title?.toLowerCase().includes("sex")) &&
                            c.resource_type === "MyClient::Child",
                    );
                    customFields.set({
                        petNameFieldId: petNameField?.id || null,
                        petBreedFieldId: petBreedField?.id || null,
                        petColorFieldId: petColorField?.id || null,
                        petGenderFieldId: petGenderField?.id || null,
                    });
                }
            }
        } catch (e) {
            console.error("Failed to load company data:", e);
            showToast("Failed to load company data", "error");
        }
    }

    async function startBackgroundSync() {
        if (!token) return;

        let currentPage = 1;
        const perPage = 20;
        let totalDogsSynced = 0;

        showSyncToast("Starting background sync...");

        try {
            while (true) {
                const result = await api.syncDogs(currentPage, perPage, token);
                if (!result.success) throw new Error("Sync failed");

                const processedDogs = result.dogs.map((dog: any) =>
                    processDog(dog),
                );
                await cache.putDogs(processedDogs);

                totalDogsSynced += processedDogs.length;
                const progress = Math.min(
                    Math.round(
                        (currentPage / (result.pagination.totalPages || 1)) *
                            100,
                    ),
                    100,
                );
                updateSyncToast(
                    `Synced ${totalDogsSynced} dogs (${progress}%)`,
                    progress,
                );

                if (currentPage >= result.pagination.totalPages) break;
                currentPage++;
            }

            showToast(
                `Sync complete! ${totalDogsSynced} dogs updated.`,
                "success",
            );
            dogCount = `${totalDogsSynced} dogs loaded`;
        } catch (e) {
            console.error("Background sync failed:", e);
            showToast("Background sync encountered an error.", "error");
        }
    }

    function processDog(dog: any): Dog {
        let name: string | null = dog.pet_name || null;
        let breed: string | null = dog.pet_breed?.trim() || null;
        let color: string | null = null;
        let gender: string | null = dog.gender || null;
        let photo: any = null;
        let ownerName =
            dog.owner_first_name || dog.owner_last_name
                ? `${dog.owner_first_name || ""} ${dog.owner_last_name || ""}`.trim()
                : "Unknown";

        if (!name)
            name =
                dog.first_name ||
                dog.label ||
                `Pet #${dog.id || dog.mytime_id}`;
        if (dog.photo)
            photo = dog.photo.medium || dog.photo.thumb || dog.photo.original;

        return {
            id: dog.id || dog.mytime_id,
            name: name || "Unknown",
            owner_last_name: ownerName,
            breed: breed || "Unknown breed",
            color: color || undefined,
            gender: gender || undefined,
            photo,
            ...dog,
        };
    }

    function handleSearch() {
        if (searchTimeout) clearTimeout(searchTimeout);

        if (!searchQuery.trim()) {
            dogs.set([]);
            filteredDogs.set([]);
            dogCount = "Search for a dog by name";
            return;
        }

        if (searchQuery.length < 2) {
            dogCount = "Type at least 2 characters to search";
            return;
        }

        searchTimeout = setTimeout(async () => {
            const localResults = await cache.search(searchQuery);
            if (localResults.length > 0) {
                dogs.set(localResults);
                filteredDogs.set([...localResults]);
                dogCount = `${localResults.length} dog${localResults.length === 1 ? "" : "s"} found (local)`;
            } else {
                await searchDogsRemote(searchQuery);
            }
        }, 300);
    }

    async function searchDogsRemote(query: string) {
        if (!token) return;

        isLoading = true;
        dogCount = "Searching...";

        try {
            const result = await api.searchDogs(query, token);
            if (result.success) {
                const processed = result.dogs.map((d) => processDog(d));
                dogs.set(processed);
                filteredDogs.set([...processed]);
                dogCount =
                    processed.length === 0
                        ? `No dogs found for "${query}"`
                        : `${processed.length} dog${processed.length === 1 ? "" : "s"} found`;
            }
        } catch (e) {
            console.error("Search failed:", e);
            showToast("Failed to search dogs", "error");
            dogCount = "Search failed - try again";
        } finally {
            isLoading = false;
        }
    }

    function handleLogout() {
        user.set(null);
        authToken.set(null);
        dogs.set([]);
        filteredDogs.set([]);
    }

    function openModal(dog: Dog) {
        modalDog = dog;
        selectedDog.set(dog);
        showModal = true;
    }

    function closeModal() {
        showModal = false;
        modalDog = null;
        selectedDog.set(null);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (showModal) return;
        if (filtered.length === 0) return;

        const gridColumns = 2;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (focusedIdx === -1) {
                focusedCardIndex.set(0);
            } else if (focusedIdx + gridColumns < filtered.length) {
                focusedCardIndex.set(focusedIdx + gridColumns);
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (focusedIdx >= gridColumns) {
                focusedCardIndex.set(focusedIdx - gridColumns);
            } else if (focusedIdx > 0) {
                focusedCardIndex.set(0);
            }
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            if (focusedIdx < filtered.length - 1) {
                focusedCardIndex.set(focusedIdx + 1);
            }
        } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            if (focusedIdx > 0) {
                focusedCardIndex.set(focusedIdx - 1);
            }
        } else if (e.key === "Enter") {
            if (focusedIdx >= 0 && focusedIdx < filtered.length) {
                e.preventDefault();
                openModal(filtered[focusedIdx]);
            }
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />

<div id="main-screen" class="screen active">
    <header class="app-header">
        <div class="header-left">
            <h1>🐕⚡ Quicker Checker Inner</h1>
        </div>
        <div class="header-right">
            <span class="user-name">
                {#if currentUser}
                    <span style="margin-right: 1rem; font-size: 1.5rem">🐶</span
                    >
                    {currentUser.first_name}
                    {currentUser.last_name}
                {/if}
            </span>
            <button
                class="header-icon-btn"
                on:click={handleLogout}
                title="Logout"
                aria-label="Logout"
            >
                <LogOut size={20} />
            </button>
        </div>
    </header>

    <main class="main-content app-grid">
        <!-- Search Section -->
        <section class="search-section card" style="margin-bottom: 2rem;">
            <div class="search-container">
                <input
                    type="text"
                    class="search-input"
                    placeholder="🔍 Search for a dog by name..."
                    autocomplete="off"
                    bind:value={searchQuery}
                    on:input={handleSearch}
                />
            </div>
            <div
                class="search-stats"
                style="margin-top: 0.5rem; color: var(--text-muted); font-size: 0.9rem;"
            >
                <span>{dogCount}</span>
            </div>
        </section>

        <!-- Dogs Grid -->
        <section class="dogs-section">
            <div class="grid grid-cols-2">
                {#each filtered as dog, i}
                    <DogCard
                        {dog}
                        focused={i === focusedIdx}
                        on:select={(e) => openModal(e.detail)}
                    />
                {/each}
            </div>
            {#if filtered.length === 0 && searchQuery.length >= 2 && !isLoading}
                <div class="no-results">
                    <p>No dogs found matching your search.</p>
                </div>
            {/if}
            {#if isLoading}
                <div class="loading">
                    <div class="spinner"></div>
                    <p>Loading dogs...</p>
                </div>
            {/if}
        </section>
    </main>
</div>

{#if showModal && modalDog}
    <CheckinModal dog={modalDog} on:close={closeModal} />
{/if}
