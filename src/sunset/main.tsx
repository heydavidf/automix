import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './sunset.css';
import '../lib/analysis/selftest';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
