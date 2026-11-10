import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './theme.css';
import './app.css';
import { followSystemBars } from './systemBars';

followSystemBars();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
