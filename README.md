# Quicker Checker Inner

Check dogs into MyTime much faster than with the default web UI.

## Features

- **Fast Check-In/Check-Out** - Quick interface for daycare arrivals and departures
- **Appointment Booking** - Book daycare, boarding, spa services, and evaluations
- **Pet Management** - View client pets with photos from Supabase

## Getting Started

```bash
# Install dependencies
npm install

# Start development server (frontend + backend)
npm run dev

# Or start only the API server
npm run server
```

## Configuration

Copy `.env.example` to `.env` and configure:
- `MYTIME_API_KEY` - MyTime Partner API key (required)
- `MYTIME_COMPANY_ID` - MyTime company ID (required)
- See `.env.example` for all options

## Project Structure

```
├── server/           # Express.js API server
│   ├── index.ts      # Main server with all endpoints
│   ├── env.ts        # Environment variable validation
│   ├── supabase.ts   # Pet photo enrichment
│   └── README.md     # Server documentation
├── src/              # Frontend (Vite + TypeScript)
├── debug/            # Debug scripts (gitignored)
└── docs/             # API documentation
```

## Documentation

- **[Server Module](./server/README.md)** - API endpoints, booking logic, boarding handling
- **[API Specification](./docs/api-spec.yaml)** - OpenAPI 3.0 schema
- **[API Docs](./docs/)** - MyTime API reference

## Key Features

### Boarding Appointments

Multi-night boarding bookings require special handling. The MyTime API expects **one variation entry per night**. See [server/README.md](./server/README.md#boarding-appointments) for details.

## UI Components

### Icon Buttons

The application uses circular icon buttons (matching the dog-relationship-tracker style):

| Class | Description | Use Case |
|-------|-------------|----------|
| `.icon-btn.primary` | Green circular button | Confirm/Save actions |
| `.icon-btn.secondary` | Gray circular button | Cancel/Close actions |
| `.icon-btn.delete` | Red circular button | Delete actions |
| `.icon-btn.edit` | Blue circular button | Edit actions |
| `.header-icon-btn` | Semi-transparent circular button | Header actions on colored backgrounds |

Icons are provided by [lucide-svelte](https://lucide.dev/guide/packages/lucide-svelte).
