self.addEventListener('fetch', (event) => {
  // Skip non-GET or cross-origin if you want
  if (event.request.method !== 'GET') return;

  event.respondWith((async () => {
    try {
      const network = await fetch(event.request);
      // (optional) cache successful responses here
      return network;
    } catch (err) {
      // (optional) fallback to cache here
      // return await caches.match(event.request) || new Response("Offline", { status: 503 });
      throw err; // surface the error so you notice bad URLs
    }
  })());
});
