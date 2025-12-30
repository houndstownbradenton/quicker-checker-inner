<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import type { Dog, Variation } from "../api/client";
    import * as api from "../api/client";
    import {
        authToken,
        variations,
        spaVariations,
        company,
        customFields as customFieldsStore,
    } from "../lib/store";
    import { showToast } from "../lib/toast";
    import {
        EVALUATION_VARIATION_ID,
        SERVICE_TYPE_NAMES,
        DAYCARE_VARIATIONS,
        SPA_SERVICE_NAMES,
    } from "../api/constants";
    import flatpickr from "flatpickr";
    import "flatpickr/dist/flatpickr.min.css";

    export let dog: Dog;

    const dispatch = createEventDispatcher();

    // Local state
    let serviceType = "daycare";
    let variationId = "";
    let checkinDate = new Date().toISOString().split("T")[0];
    let checkoutDate = "";
    let spaTime = "09:00";
    let spaPrimary = "townie-bath";
    let spaAddons: string[] = [];
    let statusMessages: {
        message: string;
        type: "active" | "complete" | "error";
    }[] = [];
    let isProcessing = false;
    let filteredVariations: Variation[] = [];
    let showAddons = true;

    // Subscriptions
    let token: string | null = null;
    let varList: Variation[] = [];
    let spaVarList: Variation[] = [];

    authToken.subscribe((v) => (token = v));
    variations.subscribe((v) => (varList = v));
    spaVariations.subscribe((v) => (spaVarList = v));

    // Computed
    $: showBundleNote = spaAddons.length === 3;
    $: showCheckout = serviceType === "boarding";
    $: showSpaSection = serviceType === "spa";
    $: showVariationGroup = serviceType !== "spa";
    $: showSpaTime = serviceType === "spa";

    onMount(async () => {
        // Set default checkout date (tomorrow)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        checkoutDate = tomorrow.toISOString().split("T")[0];

        // Load variations if not loaded
        if (varList.length === 0 && token) {
            try {
                const result = await api.getVariations(token);
                if (result.success) {
                    variations.set(result.variations || []);
                }
            } catch (e) {
                console.error("Failed to load variations:", e);
            }
        }

        updateDropdown();
    });

    // Watch for service type changes
    $: if (serviceType) {
        updateDropdown();
    }

    $: if (checkinDate && serviceType === "daycare") {
        updateDropdown();
    }

    async function updateDropdown() {
        filteredVariations = [];

        if (serviceType === "spa") {
            // Load spa variations if not loaded
            if (spaVarList.length === 0) {
                try {
                    const result = await api.getSpaVariations();
                    if (result.success && result.variations) {
                        spaVariations.set(result.variations);
                    }
                } catch (e) {
                    console.error("Failed to load spa variations:", e);
                }
            }
            return;
        }

        if (serviceType === "daycare") {
            // Auto-select based on day of week
            const [y, m, d] = checkinDate.split("-").map(Number);
            const date = new Date(y, m - 1, d);
            const day = date.getDay();

            if (day === 6) {
                variationId = DAYCARE_VARIATIONS.saturday;
            } else if (day === 0) {
                variationId = DAYCARE_VARIATIONS.sunday;
            } else {
                variationId = DAYCARE_VARIATIONS.weekday;
            }
            return;
        }

        if (serviceType === "boarding") {
            filteredVariations = varList.filter(
                (v) =>
                    v.name.toLowerCase().includes("boarding") &&
                    !v.name.toLowerCase().includes("shelter"),
            );
        } else if (serviceType === "evaluation") {
            filteredVariations = varList.filter((v) =>
                v.name.toLowerCase().includes("evaluation"),
            );
        }

        filteredVariations.sort((a, b) => a.name.localeCompare(b.name));
        if (filteredVariations.length > 0) {
            variationId = String(filteredVariations[0].id);
        }
    }

    function handleSpaPrimaryChange() {
        if (spaPrimary === "stand-alone-nails") {
            showAddons = false;
            spaAddons = [];
        } else {
            showAddons = true;
        }
    }

    function close() {
        dispatch("close");
    }

    function addStatus(message: string, type: "active" | "complete" | "error") {
        statusMessages = [...statusMessages, { message, type }];
    }

    async function handleSubmit() {
        if (isProcessing) return;
        isProcessing = true;
        statusMessages = [];

        try {
            const selectedDate = checkinDate;
            let finalVariationId = variationId;
            let searchVariationId = finalVariationId;

            // Spa logic
            if (serviceType === "spa") {
                const getSpaId = (name: string) =>
                    spaVarList.find((v) => v.name === name)?.id;
                const ids: string[] = [];

                let primaryId: string | undefined;
                if (spaPrimary === "townie-bath")
                    primaryId = String(
                        getSpaId(SPA_SERVICE_NAMES.PRIMARY.TOWNIE_BATH),
                    );
                else if (spaPrimary === "townie-bath-deluxe")
                    primaryId = String(
                        getSpaId(SPA_SERVICE_NAMES.PRIMARY.TOWNIE_BATH_DELUXE),
                    );
                else if (spaPrimary === "stand-alone-nails")
                    primaryId = String(
                        getSpaId(SPA_SERVICE_NAMES.PRIMARY.STAND_ALONE_NAILS),
                    );

                if (primaryId) {
                    ids.push(primaryId);
                    searchVariationId = primaryId;
                }

                if (spaAddons.length === 3) {
                    const bundleId = getSpaId(
                        SPA_SERVICE_NAMES.BUNDLE.ALL_ADDONS,
                    );
                    if (bundleId) ids.push(String(bundleId));
                } else {
                    if (spaAddons.includes("nail-trim")) {
                        const id = getSpaId(SPA_SERVICE_NAMES.ADDONS.NAIL_TRIM);
                        if (id) ids.push(String(id));
                    }
                    if (spaAddons.includes("teeth-brushing")) {
                        const id = getSpaId(
                            SPA_SERVICE_NAMES.ADDONS.TEETH_BRUSHING,
                        );
                        if (id) ids.push(String(id));
                    }
                    if (spaAddons.includes("blueberry-facial")) {
                        const id = getSpaId(
                            SPA_SERVICE_NAMES.ADDONS.BLUEBERRY_FACIAL,
                        );
                        if (id) ids.push(String(id));
                    }
                }

                finalVariationId = ids.join(",");
                if (!finalVariationId) {
                    throw new Error("Please select at least one spa service");
                }
            }

            addStatus(`Creating booking for ${selectedDate}...`, "active");

            let beginAt = `${selectedDate}T12:00:00Z`;
            let endAt = `${selectedDate}T22:00:00Z`;

            if (serviceType === "boarding" && checkoutDate) {
                endAt = `${checkoutDate}T17:00:00Z`;
            }

            // Try to get open times
            try {
                const timesResult = await api.getOpenTimes(
                    dog.id,
                    selectedDate,
                    token!,
                    searchVariationId,
                );
                if (timesResult.success && timesResult.openTimes?.length > 0) {
                    beginAt = timesResult.openTimes[0].begin_at;
                    if (serviceType !== "boarding") {
                        endAt = timesResult.openTimes[0].end_at;
                    }
                }
            } catch (e) {
                console.warn("Could not fetch open times, using defaults.");
            }

            const ids = finalVariationId.split(",");
            const directPayload: any = {
                dogId: dog.id,
                beginAt,
                endAt,
                clientId: dog.client_id,
            };

            if (ids.length > 1 || serviceType === "spa") {
                directPayload.variations = ids.map((id) => ({
                    variation_mytime_id: id,
                    variation_begin_at: beginAt,
                    variation_end_at: endAt,
                }));
            } else {
                directPayload.variationId = finalVariationId;
            }

            const directResult = await api.createDirectAppointment(
                directPayload,
                token!,
            );

            if (!directResult.success) {
                throw new Error(
                    directResult.error || "Failed to create appointment",
                );
            }

            const appointmentId = directResult.appointment?.id;
            addStatus("Appointment created ✓", "complete");

            // Check in for daycare only
            if (appointmentId && serviceType === "daycare") {
                addStatus("Checking in...", "active");
                await api.checkInAppointment(appointmentId, token!);
                addStatus("Checked in ✓", "complete");
            }

            const successMessage =
                serviceType === "daycare"
                    ? `${dog.name} checked in! 🎉`
                    : `${dog.name} booked for ${serviceType.charAt(0).toUpperCase() + serviceType.slice(1)}! 🎉`;
            showToast(successMessage, "success");

            setTimeout(close, 1500);
        } catch (error: any) {
            console.error("Check-in error:", error);
            let errorMessage = error.message || "Unknown error";
            addStatus(`Error: ${errorMessage}`, "error");
            showToast(`Check-in failed: ${errorMessage}`, "error");
        } finally {
            isProcessing = false;
        }
    }

    // Reactive for spa primary
    $: if (spaPrimary) handleSpaPrimaryChange();
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
    class="modal-overlay"
    on:click|self={close}
    on:keydown={(e) => e.key === "Escape" && close()}
    role="dialog"
    aria-modal="true"
    aria-label="Check in dialog"
    tabindex="-1"
>
    <div class="modal-content">
        <div class="modal-header">
            <h2 class="modal-title">Check In</h2>
            <button class="modal-close-btn" on:click={close}>&times;</button>
        </div>
        <div class="modal-body">
            <!-- Dog Info -->
            <div class="selected-dog-info">
                <div class="selected-dog-photo">
                    {#if dog.photo}
                        <img
                            src={typeof dog.photo === "string"
                                ? dog.photo
                                : dog.photo.medium || dog.photo.thumb}
                            alt={dog.name}
                        />
                    {:else}
                        🐕
                    {/if}
                </div>
                <div class="selected-dog-details">
                    <h3>{dog.name}</h3>
                    <p>
                        Owner: {dog.owner_first_name || ""}
                        {dog.owner_last_name || ""}
                    </p>
                    <p>
                        {dog.breed || ""}{dog.gender
                            ? ` • ${dog.gender}`
                            : ""}{dog.color ? ` • ${dog.color}` : ""}
                    </p>
                </div>
            </div>

            <!-- Service Selection -->
            <div class="service-selection-section">
                <div class="form-group">
                    <label for="service-type">Service Type</label>
                    <select
                        id="service-type"
                        class="service-select"
                        bind:value={serviceType}
                    >
                        <option value="daycare">Daycare</option>
                        <option value="boarding">Boarding</option>
                        <option value="spa">Spa Services</option>
                        <option value="evaluation">Evaluation</option>
                    </select>
                </div>

                {#if serviceType === "evaluation"}
                    <div
                        class="info-note"
                        style="margin-top: 0.5rem; font-size: 0.9rem; color: var(--primary-color);"
                    >
                        ℹ️ Evaluations are required for all new dogs before
                        their first daycare or boarding stay.
                    </div>
                {/if}

                {#if showVariationGroup}
                    <div class="form-group">
                        <label for="service-variation"
                            >Specific Service / Room</label
                        >
                        <select
                            id="service-variation"
                            class="service-select"
                            bind:value={variationId}
                            disabled={serviceType === "daycare"}
                        >
                            {#if serviceType === "daycare"}
                                <option value={variationId}>
                                    {variationId === DAYCARE_VARIATIONS.saturday
                                        ? "Saturday Daycare"
                                        : variationId ===
                                            DAYCARE_VARIATIONS.sunday
                                          ? "Sunday Daycare"
                                          : "Daycare (M-F)"}
                                </option>
                            {:else if filteredVariations.length === 0}
                                <option value="">No services available</option>
                            {:else}
                                {#each filteredVariations as v}
                                    <option value={String(v.id)}
                                        >{v.name}</option
                                    >
                                {/each}
                            {/if}
                        </select>
                    </div>
                {/if}
            </div>

            <!-- Date Picker -->
            <div class="date-picker-section">
                <label for="checkin-date">Check-in Date</label>
                <div class="date-input-wrapper">
                    <input
                        type="date"
                        id="checkin-date"
                        class="date-input"
                        bind:value={checkinDate}
                    />
                    <span class="date-input-icon">📅</span>
                </div>
            </div>

            {#if showCheckout}
                <div class="date-picker-section">
                    <label for="checkout-date">Check-out Date</label>
                    <div class="date-input-wrapper">
                        <input
                            type="date"
                            id="checkout-date"
                            class="date-input"
                            bind:value={checkoutDate}
                        />
                        <span class="date-input-icon">📅</span>
                    </div>
                </div>
            {/if}

            {#if showSpaTime}
                <div class="date-picker-section">
                    <label for="spa-time">Appointment Time</label>
                    <div class="date-input-wrapper">
                        <input
                            type="time"
                            id="spa-time"
                            class="date-input time-input"
                            bind:value={spaTime}
                        />
                        <span class="date-input-icon">🕐</span>
                    </div>
                </div>
            {/if}

            <!-- Spa Services -->
            {#if showSpaSection}
                <div class="spa-services-section">
                    <div class="spa-primary-services">
                        <span class="spa-section-label">Primary Service</span>
                        <div class="spa-radio-group">
                            <label class="spa-option">
                                <input
                                    type="radio"
                                    name="spa-primary"
                                    value="townie-bath"
                                    bind:group={spaPrimary}
                                />
                                <span class="spa-option-label"
                                    >🛁 Townie Bath</span
                                >
                            </label>
                            <label class="spa-option">
                                <input
                                    type="radio"
                                    name="spa-primary"
                                    value="townie-bath-deluxe"
                                    bind:group={spaPrimary}
                                />
                                <span class="spa-option-label"
                                    >✨ Townie Bath Deluxe</span
                                >
                            </label>
                            <label class="spa-option">
                                <input
                                    type="radio"
                                    name="spa-primary"
                                    value="stand-alone-nails"
                                    bind:group={spaPrimary}
                                />
                                <span class="spa-option-label"
                                    >💅 Stand Alone Nails</span
                                >
                            </label>
                        </div>
                    </div>
                    {#if showAddons}
                        <div class="spa-addons">
                            <span class="spa-section-label">Add-ons</span>
                            <div class="spa-checkbox-group">
                                <label class="spa-option">
                                    <input
                                        type="checkbox"
                                        value="nail-trim"
                                        bind:group={spaAddons}
                                    />
                                    <span class="spa-option-label"
                                        >💅 Nail Trim</span
                                    >
                                </label>
                                <label class="spa-option">
                                    <input
                                        type="checkbox"
                                        value="teeth-brushing"
                                        bind:group={spaAddons}
                                    />
                                    <span class="spa-option-label"
                                        >🦷 Teeth Brushing</span
                                    >
                                </label>
                                <label class="spa-option">
                                    <input
                                        type="checkbox"
                                        value="blueberry-facial"
                                        bind:group={spaAddons}
                                    />
                                    <span class="spa-option-label"
                                        >🫐 Blueberry Facial</span
                                    >
                                </label>
                            </div>
                            {#if showBundleNote}
                                <div class="spa-bundle-note">
                                    ✨ All 3 add-ons selected - "All Add-Ons"
                                    bundle will be applied!
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Status Messages -->
            <div class="checkin-status">
                {#each statusMessages as status}
                    <div class="status-step {status.type}">
                        <span
                            >{status.type === "active"
                                ? "⏳"
                                : status.type === "complete"
                                  ? "✓"
                                  : "✗"}</span
                        >
                        <span>{status.message}</span>
                    </div>
                {/each}
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" on:click={close}>Cancel</button>
            <button
                class="btn btn-primary btn-large"
                on:click={handleSubmit}
                disabled={isProcessing}
            >
                <span class="btn-text" class:hidden={isProcessing}
                    >✓ Check In</span
                >
                <span class="btn-loading" class:hidden={!isProcessing}
                    >Processing...</span
                >
            </button>
        </div>
    </div>
</div>
