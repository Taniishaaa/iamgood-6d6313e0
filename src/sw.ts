/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { clientsClaim } from "workbox-core";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

const SUPABASE_URL = "https://magnrdegcegxdtgapyez.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hZ25yZGVnY2VneGR0Z2FweWV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTI5MTYsImV4cCI6MjA4OTQyODkxNn0.GEsHJs4uD-UVrdlgepE6nbjZBmjDICGZ4sR6a3zMv48";
const EMERGENCY_CACHE = "emergency-profile-v1";

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// Supabase API runtime cache
registerRoute(
  ({ url }) => url.origin === SUPABASE_URL && url.pathname.startsWith("/rest/v1/"),
  new NetworkFirst({
    cacheName: "supabase-api",
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 300 })],
  })
);

// Emergency profile pages — cache for offline access
self.addEventListener("fetch", (event: FetchEvent) => {
  const url = new URL(event.request.url);
  const isEmergencyPage = url.pathname.startsWith("/e/") && event.request.mode === "navigate";
  const isEmergencyApi = url.origin === SUPABASE_URL && url.pathname.startsWith("/rest/v1/");
  if (!isEmergencyPage && !isEmergencyApi) return;

  if (isEmergencyPage) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(EMERGENCY_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(
            (cached) =>
              cached ||
              caches.match("/index.html").then(
                (shell) =>
                  shell ||
                  new Response("Offline – emergency profile unavailable", {
                    status: 503,
                    headers: { "Content-Type": "text/plain" },
                  })
              )
          )
        )
    );
  }
});

// IndexedDB helpers
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("checkin-offline", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sos_queue"))
        db.createObjectStore("sos_queue", { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("auth_store"))
        db.createObjectStore("auth_store", { keyPath: "key" });
      if (!db.objectStoreNames.contains("checkin_queue"))
        db.createObjectStore("checkin_queue", { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("med_queue"))
        db.createObjectStore("med_queue", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAuth(): Promise<any | null> {
  try {
    const db = await openDB();
    const tx = db.transaction("auth_store", "readonly");
    return await new Promise((resolve) => {
      const req = tx.objectStore("auth_store").get("session");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function dequeueAll(storeName: string): Promise<any[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    return await new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        store.clear();
        resolve(req.result);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

// Push notification handler
self.addEventListener("push", (event: PushEvent) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Check-iN";
  const isMedication = data.type === "medication";
  const isIncomingCall = data.kind === "incoming_call" || data.type === "guardian_call";

  // Notify any open clients so the in-app ringer starts immediately
  if (isIncomingCall) {
    event.waitUntil(
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((list) => {
          for (const client of list) {
            try {
              client.postMessage({
                kind: "incoming_call",
                callId: data.callId,
                wardName: data.wardName,
                wardPhone: data.wardPhone,
                wardUserId: data.wardUserId,
                guardianId: data.guardianId,
              });
            } catch {}
          }
        })
    );
  }

  const options: NotificationOptions = {
    body: data.body || "You have a notification",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: data.tag || "checkin-notification",
    data: {
      url: data.url || "/",
      type: data.type || "general",
      kind: data.kind || null,
      medication_id: data.medication_id || null,
      log_id: data.log_id || null,
      user_id: data.user_id || null,
      scheduled_time: data.scheduled_time || null,
    },
    // @ts-ignore
    vibrate: isIncomingCall ? [800, 400, 800, 400, 800, 400, 800] : [200, 100, 200],
    // @ts-ignore
    renotify: isIncomingCall ? true : false,
    requireInteraction: true,
    // @ts-ignore
    actions: isIncomingCall
      ? [
          { action: "answer", title: "📞 Answer" },
          { action: "dismiss", title: "✖ Dismiss" },
        ]
      : isMedication
      ? [
          { action: "taken", title: "✅ Taken" },
          { action: "snooze", title: "⏰ Snooze 15min" },
        ]
      : [],
  };
  if (data.type === "checkin_missed") {
    options.requireInteraction = true;
    // @ts-ignore
    options.vibrate = [300, 150, 300, 150, 300];
    // @ts-ignore
    options.actions = [
      { action: "checkin", title: "✓ Check In Now" },
      { action: "dismiss", title: "Dismiss" },
    ];
  }

  event.waitUntil(self.registration.showNotification(title, options));
});


// Notification click
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  const action = event.action;
  const data: any = event.notification.data || {};
  event.notification.close();

  if (action === "dismiss") return;

  if (action === "checkin") {
    event.waitUntil(self.clients.openWindow(data.url || "/") as Promise<any>);
    return;
  }

  if (action === "taken" && data.medication_id && data.user_id) {
    event.waitUntil(
      (async () => {
        const auth = await getAuth();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        };
        if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;
        try {
          await fetch(`${SUPABASE_URL}/rest/v1/medication_logs`, {
            method: "POST",
            headers: { ...headers, Prefer: "return=minimal" },
            body: JSON.stringify({
              medication_id: data.medication_id,
              user_id: data.user_id,
              status: "taken",
              taken_at: new Date().toISOString(),
              scheduled_at: data.scheduled_time || new Date().toISOString(),
            }),
          });
        } catch (err) {
          console.error("Failed to mark medication taken:", err);
        }
      })()
    );
    return;
  }

  if (action === "snooze") {
    event.waitUntil(
      new Promise<void>((resolve) => {
        setTimeout(() => {
          self.registration
            .showNotification("💊 Medication Reminder (Snoozed)", {
              body: "Time to take your medication!",
              icon: "/favicon.ico",
              tag: "med-snooze",
              // @ts-ignore
              vibrate: [200, 100, 200],
              requireInteraction: true,
              data,
              // @ts-ignore
              actions: [
                { action: "taken", title: "✅ Taken" },
                { action: "snooze", title: "⏰ Snooze 15min" },
              ],
            })
            .then(() => resolve());
        }, 15 * 60 * 1000);
      })
    );
    return;
  }

  const url = data.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return (client as WindowClient).focus();
        }
      }
      return self.clients.openWindow(url);
    }) as Promise<any>
  );
});

self.addEventListener("notificationclose", (event) => {
  console.log("[SW] Notification dismissed:", event.notification.tag);
});

// Background Sync
self.addEventListener("sync", (event: any) => {
  if (event.tag === "sos-sync") {
    event.waitUntil(syncQueuedData("sos_queue", "/rest/v1/sos_events"));
  }
  if (event.tag === "checkin-sync") {
    event.waitUntil(syncQueuedData("checkin_queue", "/rest/v1/check_ins"));
  }
  if (event.tag === "med-sync") {
    event.waitUntil(syncQueuedData("med_queue", "/rest/v1/medication_logs"));
  }
});

async function syncQueuedData(storeName: string, endpoint: string) {
  const items = await dequeueAll(storeName);
  if (!items.length) return;

  const auth = await getAuth();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Prefer: storeName === "checkin_queue" || storeName === "med_queue" ? "resolution=merge-duplicates, return=minimal" : "return=minimal",
  };
  if (auth?.accessToken) headers["Authorization"] = `Bearer ${auth.accessToken}`;

  for (const item of items) {
    try {
      const { id, queued_at, ...payload } = item;
      await fetch(`${SUPABASE_URL}${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error(`[SW] Failed to sync ${storeName}:`, err);
    }
  }
}

export {};
