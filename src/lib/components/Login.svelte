<script lang="ts">
    import { user, authToken } from "$lib/stores/auth";

    let email = "";
    let password = "";
    let isLoading = false;
    let error = "";

    async function handleLogin() {
        isLoading = true;
        error = "";
        try {
            // Call the API
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const result = await response.json();

            if (result.success && result.user) {
                $user = result.user;
                $authToken = result.token || null;
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
</script>

<div id="login-screen" class="screen active">
    <div class="login-container">
        <div class="card login-card">
            <div class="login-title">
                <h1>🐕⚡ Quicker Checker Inner</h1>
                <p class="subtitle">Hounds Town Bradenton</p>
            </div>
            <form on:submit|preventDefault={handleLogin} class="login-form">
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
                    <div id="login-error" class="login-error">{error}</div>
                {/if}
            </form>
        </div>
    </div>
</div>
