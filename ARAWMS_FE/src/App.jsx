/*
 * File: App.jsx
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Composes direct routes, navigation, and pending packing-video uploads.
 */
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import AppRouter from './routes/AppRouter';
import Navbar from './components/common/Navbar';
import Footer from './components/common/Footer';
import QuickNav from './components/common/QuickNav';
import PackingUploadRunner from './components/PackingUploadRunner';
import { AuthProvider } from './context/AuthContext';
import CatalogSyncRunner from './components/CatalogSyncRunner';
import FinishedGoodsSyncRunner from './components/FinishedGoodsSyncRunner';
import RealtimeBridge from './components/RealtimeBridge';

/** Keeps pending packing recordings uploading across direct URL navigation. */
function App() {
  return (
    <AuthProvider><BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <PackingUploadRunner />
      <CatalogSyncRunner />
      <FinishedGoodsSyncRunner />
      <RealtimeBridge />
      <QuickNav />
      <div className="app-container">
        <Navbar />
        <main className="main-content">
          <AppRouter />
        </main>
        <Footer />
      </div>
    </BrowserRouter></AuthProvider>
  );
}

export default App;
