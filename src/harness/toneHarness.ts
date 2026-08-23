// Dev-only visual harness for the pronunciation verdict card. Renders the
// ToneCoachPanel in each meaningful state so it can be eyeballed (and screenshot
// with `npm run shots`) without a microphone or a live server. Not part of the
// production build (only index.html is an entry).
import { mount } from 'svelte';
import 'ea-design/ink-jade.css';
import '../app.css';
import ToneHarness from './ToneHarness.svelte';

document.documentElement.setAttribute('data-theme', 'dark');

mount(ToneHarness, { target: document.getElementById('harness')! });
