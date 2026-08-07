import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';

// Service worker disabled for now because it can cache an outdated index.html
// with old hashed asset references after a new deploy.
// if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
