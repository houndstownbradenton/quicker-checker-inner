# Server Module

Express.js API server for the Quicker Checker Inner application. Provides endpoints for dog check-in/check-out, appointment booking, and client management via the MyTime Partner API.

## Quick Start

```bash
# From project root
npm run server
```

## Environment Variables

See [env.ts](./env.ts) for the complete list. required variables:
- `MYTIME_API_KEY` - MyTime Partner API key
- `MYTIME_COMPANY_ID` - MyTime company ID
- `MYTIME_LOCATION_ID` - MyTime location ID (defaults to internal ID if not set)

Optional:
- `PORT` - Server port (default: 3000)
- `MYTIME_BASE_URL` - MyTime API base URL (default: https://www.mytime.com)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` - For pet photo enrichment

## API Endpoints

Full API documentation available in [OpenAPI format](../docs/api-spec.yaml).

### Appointments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/appointments/direct` | POST | Book an appointment directly |
| `/api/open-times` | GET | Get available booking slots |
| `/api/variations` | GET | List all service variations |

### Clients & Pets

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/clients/:id/children` | GET | Get pets for a client |
| `/api/appointments/today` | GET | Get today's appointments |

---

## Booking Logic

### Service Types

The server handles three main service types differently:

1. **Daycare** - Single-day bookings (auto-check-in for same-day)
2. **Spa Services** - Duration-based, sequential timing with add-ons
3. **Boarding** - Multi-night stays (special handling required)

### Auto Check-in

Only **same-day daycare** appointments are automatically checked in after booking. This prevents errors when booking future appointments (check-in API returns 404 for future dates).

| Service | Auto-Check-in |
|---------|---------------|
| Daycare (same day) | ✅ Yes |
| Daycare (future) | ❌ No |
| Spa Services | ❌ No |
| Boarding | ❌ No |

### Spa Services

Spa services use **sequential timing** where each variation has its own start/end time:

```
Primary: Bath (1min)      → 11:00:00Z to 11:01:00Z
Add-on:  Townie Bath (15min) → 11:01:00Z to 11:16:00Z
Appointment end_at: 11:16:00Z
```

#### Key Rules

1. **Duration Source**: Use `time_span_range[0]` for duration, NOT the `duration` field
   - Bath: `duration=15` but `time_span_range=[1,1]` → use **1 minute**
   - Townie Bath: `duration=0` but `time_span_range=[15,15]` → use **15 minutes**

2. **Add-on Services**: Must include `parent_id` pointing to the primary service's ID

3. **Sequential Timing**: Each variation starts when the previous ends
   - Appointment `end_at` must equal the last variation's `variation_end_at`

4. **Pricing & Cache**: The caching mechanism fetches data from **two sources** to ensure accuracy:
   - **Booking API** (`/companies/.../variations`): Provides `time_span_range` (critical for duration).
   - **Partner API** (`partners-api.mytime.com`): Provides accurate `price` information.
   - The server merges these two data sources on startup.

### Boarding Appointments

> **IMPORTANT**: Multi-night boarding requires special handling!

The MyTime Partner API requires **one variation entry per night** for multi-night boarding stays. A single variation spanning multiple days will fail with:

```
"end_at of appointment must be the latest end_at of all non-buffer segments"
```

#### How It Works

Boarding variations have these key configuration fields:
- `duration`: 20160 (14 days max) - **NOT** the per-night duration!
- `time_span_range`: [1440, 1440] (24 hours = 1 night base unit)
- `multiplier_enabled`: true (price multiplied by number of nights)

#### Example: 3-Night Stay (Jan 6-9)

The server generates 3 variation entries:

```json
{
  "begin_at": "2026-01-06T12:00:00Z",
  "end_at": "2026-01-09T12:00:00Z",
  "variations": [
    {
      "variation_mytime_id": "91404079",
      "variation_begin_at": "2026-01-06T12:00:00Z",
      "variation_end_at": "2026-01-07T12:00:00Z",
      "price": 55
    },
    {
      "variation_mytime_id": "91404079",
      "variation_begin_at": "2026-01-07T12:00:00Z",
      "variation_end_at": "2026-01-08T12:00:00Z",
      "price": 55
    },
    {
      "variation_mytime_id": "91404079",
      "variation_begin_at": "2026-01-08T12:00:00Z",
      "variation_end_at": "2026-01-09T12:00:00Z",
      "price": 55
    }
  ]
}
```

**Key Rules:**
1. Each variation spans exactly 24 hours (`time_span_range[0]` minutes)
2. Appointment `end_at` MUST equal the last variation's `variation_end_at`
3. The API automatically calculates total price (3 × $55 = $165)

---

## Variation Cache

Service variations are cached at startup. Because no single API returns all necessary fields, the server performs a **merged fetch**:

1. **Booking API** (`mytime.com/api/v2/...`):
   - Returns valid `time_span_range` (critical for duration logic).
   - **Issue**: often missing pricing or returns price 0.

2. **Partner API** (`partners-api.mytime.com/...`):
   - Returns valid `price` / `pricings`.
   - **Issue**: missing `time_span_range`.

The `loadVariationsCache` function merges these into a single cached object containing both accurate duration and price.

| Field | Description |
|-------|-------------|
| `duration` | Max duration in minutes (NOT per-unit for boarding!) |
| `time_span_range` | Actual booking unit duration [min, max] in minutes |
| `multiplier_enabled` | Whether multi-unit bookings multiply price |
| `add_on` | Whether service requires a parent service |
| `price` | Merged price from Partner API |

**Note**: Always use `time_span_range[0]` for per-unit duration, not `duration`.

---

## Employee/Staff Mapping

Services are mapped to specific employees:

| Service | Employee ID |
|---------|-------------|
| Boarding | 295288 |
| Spa Services | 295289 |
| Evaluation | 295290 |
| Daycare | 295287 |

See `RESOURCE_MAP` in [index.ts](./index.ts) for the complete mapping.

---

## Debug Scripts

Debug scripts are located in the `/debug` directory (gitignored):

- `test_boarding_booking.ts` - Test boarding appointment booking
- `test_spa_minimal.ts` - Test single spa service booking
- `test_spa_addon.ts` - Test spa service with add-on booking
- `test_pricing_fetch.ts` - Verification script for Partner API pricing fetch & merge logic
- `inspect_variations.ts` - Fetch and display raw variation data from API

Run with:
```bash
npx ts-node --esm debug/test_spa_addon.ts
```
