self.addEventListener('push', (event) => {
    const data = event.data?.json() ?? {};
    event.waitUntil(
        self.registration.showNotification(data.title ?? 'Bodega Pro', {
            body: data.body ?? '',
            icon: '/vite.svg',
            badge: '/vite.svg',
            tag: data.tag ?? 'bodega',
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow('/'));
});
