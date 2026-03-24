// ─── SW KILL SWITCH (V2) ───
// This file clears all caches and stops any old service worker for major version updates.

self.addEventListener('install', () => {
    self.skipWaiting(); // Force activation
});

self.addEventListener('activate', async (event) => {
    // 1. Delete all caches
    const keys = await caches.keys();
    keys.forEach(key => caches.delete(key));

    // 2. Unregister itself (self-destruct after cleaning)
    const registrations = await self.registration.scope;
    self.registration.unregister();

    // 3. Take control of all open pages and force a reload
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => {
        if (client.url && 'navigate' in client) {
            client.navigate(client.url); 
        }
    });

    console.log('✅ Walltone SW Kill Switch Activated: Cache Cleared.');
});
