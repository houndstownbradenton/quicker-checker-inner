# Single Variation Boarding Investigation
**Date:** 2025-12-24
**Objective:** Implement multi-day boarding appointments (e.g., 72 hours / 3 nights) as a **single variation entry** with a custom duration/price, rather than splitting it into multiple per-night variations.

## Context
- **Reference Appointment:** `68857221`
  - Structure: Single variation.
  - Duration: 3 days (4320 minutes).
  - Segments: Contains a single segment with `duration: 4320`.
- **Goal:** Replicate this structure via the Partner API (`POST /api/appointments`).

## Experiments & Findings
Tested using Client "Aaron Jaeger" (ID `21580514`) and Dog "Bouy" (ID `3046596`).
Script used: `debug/experiment_single_var_boarding.js`

### 1. 72-Hour Single Variation (No Segments)
- **Payload:** `begin_at` Day 1, `end_at` Day 4 (72h). Variation `begin/end` matching 72h. `segments` array omitted.
- **Result:** **Failed (422)**.
- **Error:** `"end_at of appointment must be the latest end_at of all non-buffer segments"`.
- **Reason:** The API ignores the explicit variation end time and calculates duration based on the service default (24 hours). The calculated 24h duration does not match the 72h appointment window.

### 2. 72-Hour Single Variation (With Segments)
- **Payload:** Same as above, but added `segments` array to explicitly define `duration: 4320`:
  ```json
  "segments": [ { "kind": "service", "duration": 4320 } ]
  ```
- **Result:** **Failed (422)**.
- **Error:** `"Unprocessable Entity"` (Slot error).
- **Observation:** The API appears to reject the `segments` override entirely for this service/configuration.

### 3. 72-Hour Single Variation (With Segment Template ID)
- **Payload:** Added `segment_template_id: 1084480` (found from inspecting reference appointment) to the segment object.
- **Result:** **Failed (422)**.
- **Error:** `"Unprocessable Entity"`.

### 4. 24-Hour (1-Night) Single Variation (With Segments)
- **Payload:** Standard 1-night appointment, but **included** the `segments` array (duration 1440) to test if segments *ever* work.
- **Result:** **Failed (422)**.
- **Error:** `"Unprocessable Entity"`.
- **Conclusion:** Providing the `segments` array causes the failure, regardless of duration.

### 5. 24-Hour (1-Night) Single Variation (No Segments) - Baseline
- **Payload:** Standard 1-night appointment, NO segments array.
- **Result:** **Success**.
- **Conclusion:** The basic booking flow works, confirming credentials and IDs are correct. The issue is specific to forcing custom durations/segments.

## Questions for MyTime Support
We are unable to replicate the structure of appointment `68857221` via the Partner API.

1.  **How can we book a custom duration segment via the API?**
    - We tried passing `segments: [{ kind: 'service', duration: 4320 }]` but received `422 Unprocessable Entity`.
    - Is there a specific permission or field required to override the service default duration?

2.  **Is "Single Variation" multi-day boarding supported?**
    - Usage of multiple variations (one per night) works, but creates clutter.
    - Reference appointment `68857221` proves single-variation is possible in the system. Was this created via an internal tool or a specific API method?

## Current Workaround
The server currently implements **Per-Night Variations**:
- A 3-night appointment is split into 3 separate variation entries (one per night).
- This is the only method currently accepted by the API.
