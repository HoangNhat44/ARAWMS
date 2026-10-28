/*
 * File: App.jsx
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Composes the application shell with routing, authentication context, and shared navigation. Runs pending packing-video uploads while the app is open.
 */
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import AppRouter from './routes/AppRouter';
import Navbar from './components/common/Navbar';
import Footer from './components/common/Footer';
// import PackingUploadRunner from './components/PackingUploadRunner';

/** Composes routing, authentication, navigation, and the background video runner. */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <div className="app-container">
            <Navbar />
            <main className="main-content">
              <AppRouter />
            </main>
            <Footer />
          </div>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
