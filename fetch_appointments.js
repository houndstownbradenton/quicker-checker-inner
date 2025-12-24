import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VITE_MYTIME_API_KEY;
const LOCATION_ID = process.env.MYTIME_LOCATION_ID;

async function fetchAppointments() {
    try {
        const date = '2025-12-24'; // Today

        console.log(`Fetching appointments for ${date}...`);
        console.log(`Location ID: ${LOCATION_ID}`);

        const response = await axios.get(`https://partners-api.mytime.com/api/appointments`, {
            params: {
                location_mytime_id: LOCATION_ID,
                date: date
            },
            headers: {
                'X-Api-Key': API_KEY,
                'Content-Type': 'application/json'
            }
        });

        const appointments = response.data.appointments || [];
        console.log(`\nFound ${appointments.length} appointments\n`);

        // Filter for Boarding appointments and show structure
        const boardingAppts = appointments.filter(a =>
            a.service_name?.toLowerCase().includes('boarding') ||
            a.variations?.some(v => v.name?.toLowerCase().includes('boarding'))
        );

        console.log(`Boarding appointments: ${boardingAppts.length}\n`);

        // Show details of boarding appointments
        boardingAppts.forEach((appt, i) => {
            console.log(`\n=== Boarding Appointment ${i + 1} ===`);
            console.log(`ID: ${appt.id}`);
            console.log(`begin_at: ${appt.begin_at}`);
            console.log(`end_at: ${appt.end_at}`);
            console.log(`Service: ${appt.service_name}`);
            console.log(`Variation: ${appt.variations?.[0]?.name}`);
            console.log(`Duration (calculated): ${((new Date(appt.end_at) - new Date(appt.begin_at)) / (1000 * 60 * 60)).toFixed(1)} hours`);
            console.log(`Segments:`, JSON.stringify(appt.segments, null, 2));
            console.log(`Full variations:`, JSON.stringify(appt.variations, null, 2));
        });

        // If no boarding, show first few appointments anyway
        if (boardingAppts.length === 0 && appointments.length > 0) {
            console.log('\nNo boarding found. Showing first 3 appointments:');
            appointments.slice(0, 3).forEach((appt, i) => {
                console.log(`\n=== Appointment ${i + 1} ===`);
                console.log(JSON.stringify(appt, null, 2));
            });
        }

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

fetchAppointments();
