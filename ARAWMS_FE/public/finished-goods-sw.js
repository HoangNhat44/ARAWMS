/*
 * File: finished-goods-sw.js
 * Author: Duy Anh
 * Date: 2026-10-30
 * Description: Keeps the application shell available after a successful online visit.
 */
const CACHE_NAME = 'arawms-app-shell-v1';
// Capture the page and its initial Vite assets while online, before offline reload is needed.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    const page = await fetch('/');
    if (!page.ok) throw new Error('Application shell is unavailable');
    await cache.put('/', page.clone());
    const html = await page.text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map((match) => match[1]);
    await cache.addAll(assets);
  }));
  self.skipWaiting();
});
// Remove older shell versions after an update; IndexedDB business drafts are separate.
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((names) => Promise.all(names.filter((name) => name.startsWith('arawms-app-shell-') &&
      name !== CACHE_NAME).map((name) => caches.delete(name)))),
    self.clients.claim(),
  ]));
});
// Never cache API requests: warehouse stock and confirmation must come from the server.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    // Prefer the current page online, then use the previously captured shell on network failure.
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put('/', response.clone()));
      return response;
    }).catch(async () => (await caches.match('/')) || Response.error()));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    // Hashed assets are immutable and can be served from cache once downloaded.
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    })));
  }
});
