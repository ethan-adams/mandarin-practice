// Base URL of mandarin-api (the Lightsail server: content, transcription, and
// later accounts + progress). Empty in local dev / pre-deploy, in which case the
// app falls back to bundled content and word check reports itself unavailable.
// Set VITE_API_BASE at build time to point at the deployed server.
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '';
