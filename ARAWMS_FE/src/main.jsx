/*
 * File: main.jsx
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Mounts the React application into the root DOM element. Loads the global stylesheet and enables strict mode.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles/index.css';
import './styles/seller.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
