<script lang="ts">
    import { user, authToken } from "$lib/stores/auth";
    import Login from "$lib/components/Login.svelte";
    import Main from "$lib/components/Main.svelte";
    import Toast from "$lib/components/Toast.svelte";

    // Reactive auth check
    $: isLoggedIn = $user !== null && $authToken !== null;
</script>

<svelte:head>
    <title>Quicker Checker - Hounds Town Bradenton</title>
</svelte:head>

<div class="app">
    {#if isLoggedIn}
        <Main />
    {:else}
        <Login />
    {/if}
    <Toast />
</div>
