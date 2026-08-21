import { mount } from 'svelte'
import 'ea-design/ink-jade.css'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
