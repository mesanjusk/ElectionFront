export function registerSW() {
  if (typeof window === 'undefined') {
    return;
  }

  if (!('serviceWorker' in navigator)) {
    console.info('Service workers are not supported in this browser.');
    return;
  }

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');

      // Automatically activate waiting workers to make sure cached assets stay current.
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      registration.addEventListener('updatefound', () => {
        const { installing } = registration;
        if (!installing) return;

        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.info('A new service worker is controlling the page.');
      });
    } catch (error) {
      console.error('Service worker registration failed:', error);
    }
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
