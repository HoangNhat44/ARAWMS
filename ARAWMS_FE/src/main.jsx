/*
 * File: main.jsx
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Mounts the React application into the root DOM element. Loads the global stylesheet and enables strict mode.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';

// Register the app-shell cache only in production; API responses stay outside the service worker cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/finished-goods-sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
