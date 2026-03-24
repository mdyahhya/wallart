// ─── USER SERVICE WORKER (v2) ───
// Strategy: Kill Switch (clears old cache and shuts down PWA on main site)

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(keys.map(key => caches.delete(key)));
        }).then(() => {
            // Self-destruct after cleaning
            return self.registration.unregister();
        }).then(() => {
            return self.clients.matchAll({ type: 'window' });
        }).then((clients) => {
            clients.forEach(client => {
                if (client.navigate) client.navigate(client.url);
            });
        })
    );
});
