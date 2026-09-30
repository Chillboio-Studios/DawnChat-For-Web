/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

interface ChannelPartial {
  channel_type: string;
  name?: string;
}

interface StoatPushNotification {
  title?: string;
  author?: string;
  body: string;
  icon?: string;
  channel?: ChannelPartial;
  url?: string;
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (typeof event.notification.data === "string") {
    event.waitUntil(self.clients.openWindow(event.notification.data));
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.text();

  const notification: StoatPushNotification = JSON.parse(payload);

  if (!notification.title) {
    if (notification.channel) {
      if (notification.channel.channel_type === "DirectMessage") {
        notification.title = notification.author || "DawnChat";
      } else {
        notification.title = `${notification.author} in ${notification.channel.name}`;
      }
    } else {
      notification.title = "DawnChat";
    }
  }

  notification.url ||= self.registration.scope;

  event.waitUntil(
    self.registration.showNotification(notification.title || "DawnChat", {
      icon: notification.icon,
      body: notification.body,
      data: notification.url,
    }),
  );
});

cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST.filter(() => false));
