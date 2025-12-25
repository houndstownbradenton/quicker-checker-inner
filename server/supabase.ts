/**
 * Supabase client for fetching pet photos
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './env.ts';

// Get Supabase configuration from validated env config
const SUPABASE_URL = config.SUPABASE_URL;
const SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;

console.log('[supabase-debug] SUPABASE_URL present:', !!SUPABASE_URL);
console.log('[supabase-debug] SUPABASE_ANON_KEY present:', !!SUPABASE_ANON_KEY);

let supabase: SupabaseClient | null = null;

/**
 * Initialize and return the Supabase client
 */
function getSupabaseClient(): SupabaseClient | null {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.warn('[supabase-debug] Missing SUPABASE_URL or SUPABASE_ANON_KEY - photo enrichment disabled');
        return null;
    }

    if (!supabase) {
        try {
            supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('[supabase-debug] Client initialized successfully');
        } catch (e: any) {
            console.error('[supabase-debug] Client initialization failed:', e.message);
        }
    }

    return supabase;
}

/**
 * Fetch photo URLs for dogs by their MyTime child IDs
 * @param mytimeIds Array of mytime_id values for dogs
 * @returns Map of mytime_id to photo URL
 */
export async function getDogPhotos(mytimeIds: number[]): Promise<Map<number, string>> {
    const photoMap = new Map<number, string>();

    if (mytimeIds.length === 0) {
        console.log('[supabase-debug] getDogPhotos called with empty mytimeIds list');
        return photoMap;
    }

    // Log a sample of IDs being queried to avoid flooding logs if list is huge
    const idSample = mytimeIds.slice(0, 5).join(', ');
    console.log(`[supabase-debug] Fetching photos for ${mytimeIds.length} dogs. Sample IDs: [${idSample}${mytimeIds.length > 5 ? '...' : ''}]`);

    const client = getSupabaseClient();
    if (!client) {
        console.warn('[supabase-debug] No Supabase client available, skipping photo fetch.');
        return photoMap;
    }

    try {
        // Query the dogs table for matching mytime_child_id values
        // Adjust table name and column names as needed based on actual schema
        const query = client
            .from('dogs')
            .select('mytime_child_id, photo')
            .in('mytime_child_id', mytimeIds);

        const { data, error, count } = await query;

        if (error) {
            console.error('[supabase-debug] Error fetching dog photos:', error.message, error.details, error.hint);
            return photoMap;
        }

        if (data) {
            console.log(`[supabase-debug] Query successful. Returned ${data.length} records.`);
            for (const row of data) {
                // @ts-ignore - Dynamic key access if types are inferred
                if (row.mytime_child_id && row.photo) {
                    photoMap.set(row.mytime_child_id, row.photo);
                } else {
                    console.log('[supabase-debug] Skipping row with missing id or photo:', row);
                }
            }
            console.log(`[supabase-debug] Successfully mapped ${photoMap.size} photos.`);
        } else {
            console.log('[supabase-debug] Query returned no data (data is null).');
        }
    } catch (err: any) {
        console.error('[supabase-debug] Exception fetching photos:', err.message);
        if (err.stack) console.error(err.stack);
    }

    return photoMap;
}

/**
 * Enrich an array of dogs with photo URLs from Supabase
 * Modifies the dogs array in place, adding photo field where available
 */
export async function enrichDogsWithPhotos(dogs: any[]): Promise<void> {
    if (!dogs || !Array.isArray(dogs)) {
        console.warn('[supabase-debug] enrichDogsWithPhotos called with invalid dogs array');
        return;
    }

    // Collect all mytime_ids from dogs
    const mytimeIds: number[] = dogs
        .map(dog => dog.mytime_id)
        .filter((id): id is number => {
            const valid = typeof id === 'number';
            if (!valid && id !== undefined && id !== null) {
                // Log identifying info for invalid IDs if needed, usually just missing or wrong type
            }
            return valid;
        });

    if (mytimeIds.length === 0) {
        console.log('[supabase-debug] No valid numeric mytime_ids found in dogs array.');
        return;
    }

    console.log(`[supabase-debug] Enriching ${dogs.length} dogs, found ${mytimeIds.length} valid IDs.`);

    const photoMap = await getDogPhotos(mytimeIds);

    // Enrich each dog with photo if available
    let enrichedCount = 0;
    for (const dog of dogs) {
        if (dog.mytime_id && photoMap.has(dog.mytime_id)) {
            const photoUrl = photoMap.get(dog.mytime_id);
            dog.photo = {
                medium: photoUrl,
                thumb: photoUrl,
                original: photoUrl
            };
            enrichedCount++;
        }
    }
    console.log(`[supabase-debug] Enrichment complete. Added photos to ${enrichedCount} dogs.`);
}
