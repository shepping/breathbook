// sw.js — service worker: makes Breathbook work offline.
//
// HOW UPDATES WORK: when you change any file and deploy, bump CACHE_VERSION
// below (and APP_VERSION in js/config.js). The phone then downloads the new
// files and shows "A new version is available — Refresh".

const CACHE_VERSION = 'breathbook-v1.0.0';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/config.js',
  './js/storage.js',
  './js/suggest.js',
  './js/backup.js',
  './js/demo-data.js',
  './js/ui.js',
  './js/views/icons.js',
  './js/views/plan.js',
  './js/views/exercises.js',
  './js/views/exercise-form.js',
  './js/views/history.js',
  './js/views/more.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)),
  );
  // First install: activate right away. Updates wait for the user's "Refresh".
  if (!self.registration.active) self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Cache first (fast + offline), falling back to the network.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    }),
  );
});
