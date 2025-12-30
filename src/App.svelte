<script lang="ts">
    import { writable } from "svelte/store";
    import { LogOut } from "lucide-svelte";

    // Inline stores to avoid import issues
    const user = writable<any>(
        JSON.parse(sessionStorage.getItem("user") || "null"),
    );
    const authToken = writable<string | null>(
        sessionStorage.getItem("authToken"),
    );

    user.subscribe((val) => {
        if (val) sessionStorage.setItem("user", JSON.stringify(val));
        else sessionStorage.removeItem("user");
    });

    authToken.subscribe((val) => {
        if (val) sessionStorage.setItem("authToken", val);
        else sessionStorage.removeItem("authToken");
    });

    let currentUser: any = null;
    let token: string | null = null;

    user.subscribe((v) => (currentUser = v));
    authToken.subscribe((v) => (token = v));

    $: isLoggedIn = currentUser !== null && token !== null;

    // Login form state
    let email = "";
    let password = "";
    let isLoading = false;
    let error = "";

    async function handleLogin() {
        isLoading = true;
        error = "";
        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const result = await response.json();

            if (result.success && result.user) {
                user.set(result.user);
                authToken.set(result.token || null);
            } else {
                throw new Error(result.error || "Login failed");
            }
        } catch (e: any) {
            if (e.message && e.message.includes("wrong email")) {
                error = "Incorrect email or password.";
            } else {
                error = e.message || "Login failed.";
            }
        } finally {
            isLoading = false;
        }
    }

    function handleLogout() {
        user.set(null);
        authToken.set(null);
    }
</script>

<div class="app">
    {#if isLoggedIn}
        <div id="main-screen" class="screen active">
            <header class="app-header">
                <div class="header-left">
                    <h1>🐕⚡ Quicker Checker Inner</h1>
                </div>
                <div class="header-right">
                    <span class="user-name">
                        <span style="margin-right: 1rem; font-size: 1.5rem"
                            >🐶</span
                        >
                        {currentUser?.first_name}
                        {currentUser?.last_name}
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
                <section
                    class="search-section card"
                    style="margin-bottom: 2rem;"
                >
                    <p>Main screen - logged in successfully!</p>
                    <p>Search and dog grid will go here.</p>
                </section>
            </main>
        </div>
    {:else}
        <div id="login-screen" class="screen active">
            <div class="login-container">
                <div class="card login-card">
                    <div class="login-title">
                        <h1>🐕⚡ Quicker Checker Inner</h1>
                        <p class="subtitle">Hounds Town Bradenton</p>
                    </div>
                    <form
                        on:submit|preventDefault={handleLogin}
                        class="login-form"
                    >
                        <div class="form-group">
                            <label for="email">Email</label>
                            <input
                                type="email"
                                id="email"
                                bind:value={email}
                                required
                                placeholder="staff@houndstown.com"
                            />
                        </div>
                        <div class="form-group">
                            <label for="password">Password</label>
                            <input
                                type="password"
                                id="password"
                                bind:value={password}
                                required
                                placeholder="••••••••"
                            />
                        </div>
                        <button
                            type="submit"
                            class="btn btn-primary btn-large"
                            disabled={isLoading}
                        >
                            <span class="btn-text" class:hidden={isLoading}
                                >Sign In</span
                            >
                            <span class="btn-loading" class:hidden={!isLoading}
                                >Signing in...</span
                            >
                        </button>
                        {#if error}
                            <div id="login-error" class="login-error">
                                {error}
                            </div>
                        {/if}
                    </form>
                </div>
            </div>
        </div>
    {/if}
</div>
