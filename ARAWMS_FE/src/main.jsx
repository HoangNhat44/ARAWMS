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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
