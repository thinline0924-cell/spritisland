import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './app/App';
import { startBackdrop } from './render/backdrop';

void startBackdrop(document.getElementById('stage')!);
createRoot(document.getElementById('ui')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
