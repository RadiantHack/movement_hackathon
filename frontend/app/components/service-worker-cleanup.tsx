"use client";

import { useEffect } from "react";

/**
 * Component to handle service worker cleanup and disable PWA caching
 * Runs in both development and production to prevent caching issues
 */
export function ServiceWorkerCleanup() {
  useEffect(() => {
    // Unregister all service workers (both dev and production)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister().catch((error) => {
            // Silently handle unregistration errors
            console.debug("Service worker unregistration:", error);
          });
        }
      });

      // Clear all caches
      if ("caches" in window) {
        caches.keys().then((cacheNames) => {
          return Promise.all(
            cacheNames.map((cacheName) => {
              return caches.delete(cacheName);
            })
          );
        });
      }
    }

    // Suppress Sentry rate limit errors (429)
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      const errorString = String(args[0] || "");
      // Suppress Sentry 429 errors
      if (
        errorString.includes("sentry") &&
        (errorString.includes("429") || errorString.includes("rate limit"))
      ) {
        return; // Silently ignore
      }
      originalError.apply(console, args);
    };

    // Suppress workbox errors in development
    window.addEventListener("error", (event) => {
      const errorMessage = event.message || "";
      if (
        errorMessage.includes("workbox") ||
        errorMessage.includes("no-response") ||
        errorMessage.includes("bad-precaching-response")
      ) {
        event.preventDefault();
        console.debug("Suppressed workbox error in development:", errorMessage);
      }
    });

    // Suppress unhandled promise rejections from workbox
    window.addEventListener("unhandledrejection", (event) => {
      const reason = String(event.reason || "");
      if (
        reason.includes("workbox") ||
        reason.includes("no-response") ||
        reason.includes("bad-precaching-response") ||
        reason.includes("sentry") ||
        reason.includes("429")
      ) {
        event.preventDefault();
        console.debug("Suppressed promise rejection in development:", reason);
      }
    });

    // Cleanup function
    return () => {
      console.error = originalError;
    };
  }, []);

  return null;
}
