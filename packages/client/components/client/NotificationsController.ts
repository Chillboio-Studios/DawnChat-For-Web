import { useLingui } from "@lingui/solid/macro";

import { Client } from "stoat.js";

import { useModals } from "@revolt/modal";
import { useState } from "@revolt/state";
import { useSnackbar } from "@revolt/ui";

import { IS_DEV, useClient } from ".";
import { androidNative, isAndroidShell } from "../native/android";

let unsubscribeFcmToken: (() => void) | undefined;

async function registerFcmToken(client: Client, token?: string | null) {
  if (IS_DEV) {
    console.log("Skipping FCM registration in dev.");
    return;
  }

  token ??= await androidNative.fcm.getToken();
  if (!token) throw "No FCM token available";

  await client.api.post("/push/subscribe", {
    endpoint: "fcm",
    p256dh: "",
    auth: token,
  });
}

export function useNotifications() {
  const { settings } = useState();
  const { t } = useLingui();
  const getClient = useClient();
  const snackbar = useSnackbar();
  const { showError } = useModals();

  const isAndroid = isAndroidShell();
  const supportsNotification = !isAndroid && "Notification" in window;

  const onDeny = async (showModal?: boolean) => {
    settings.resetNotificationsState("denied");
    if (showModal) {
      showError(
        t`Failed to enable notifications. DawnChat does not have notification permission.`,
      );
    }
    await killServiceWorkerSubscription(getClient());
  };

  const notificationStateMismatch = (): boolean => {
    const areNotificationsAllowed =
      settings.desktopNotificationsState === "allowed" ||
      settings.pushNotificationsState === "allowed";

    const notificationPermissionGranted =
      !supportsNotification || Notification.permission === "granted";

    return areNotificationsAllowed && !notificationPermissionGranted;
  };

  const initNotifications = async () => {
    if (isAndroid) {
      settings.desktopNotificationsState = "unsupported";

      unsubscribeFcmToken?.();
      unsubscribeFcmToken = androidNative.fcm.onToken((token) => {
        if (settings.pushNotificationsState !== "allowed") return;
        registerFcmToken(getClient(), token).catch(console.error);
      });

      if (
        settings.pushNotificationsState === "default" ||
        settings.pushNotificationsState === "allowed"
      ) {
        await togglePushPermission(false, true);
      }
      return;
    }

    if (
      settings.desktopNotificationsState === "default" ||
      notificationStateMismatch()
    ) {
      // We do this before permission checking because the constructor will still work fine if we don't have permission.
      if (supportsNotification) {
        try {
          const noti = new Notification(
            "This is what notifications will look like. You shouldn't see this for long.",
            { silent: true },
          );
          // Close the notification just after showing
          // On very slow desktop systems, 100 ms just isn't long enough. Skill issue I guess.
          noti.addEventListener("show", () =>
            setTimeout(() => noti.close(), 100),
          );
        } catch {
          // An error means not supported.
          settings.desktopNotificationsState = "unsupported";
        }
      } else {
        settings.desktopNotificationsState = "unsupported";
      }

      if (supportsNotification) {
        if ((await Notification.requestPermission()) === "granted") {
          settings.desktopNotificationsState = "allowed";
          await enablePushSubscription();
        } else {
          await onDeny();
        }
      } else {
        await enablePushSubscription();
      }
    } else if (
      settings.pushNotificationsState === "allowed" &&
      supportsNotification &&
      Notification.permission === "granted"
    ) {
      await enablePushSubscription();
    }
  };

  const toggleNotificationPermission = async (modalOnDeny?: boolean) => {
    if (settings.desktopNotificationsState !== "allowed") {
      if ((await Notification.requestPermission()) === "granted") {
        settings.desktopNotificationsState = "allowed";
      } else {
        await onDeny(modalOnDeny);
      }
    } else {
      settings.desktopNotificationsState = "denied";
    }
  };

  const enablePushSubscription = async () => {
    settings.pushNotificationsState = "allowed";
    try {
      if (isAndroid) {
        await registerFcmToken(getClient());
      } else {
        await setUpServiceWorkerSubscription(getClient());
      }
    } catch (e) {
      console.error(e);
      snackbar.show({
        message: t`Failed to enable push notifications. Please try again later.`,
      });
      settings.pushNotificationsState = "default";
    }
  };

  const togglePushPermission = async (
    modalOnDeny?: boolean,
    refresh?: boolean,
  ) => {
    if (isAndroid) {
      if (settings.pushNotificationsState !== "allowed" || refresh) {
        if (await androidNative.notifications.requestPermission()) {
          await enablePushSubscription();
        } else {
          await onDeny(modalOnDeny);
        }
      } else {
        settings.pushNotificationsState = "denied";
        await killServiceWorkerSubscription(getClient());
      }
      return;
    }

    if (settings.pushNotificationsState !== "allowed") {
      if (supportsNotification) {
        if ((await Notification.requestPermission()) === "granted") {
          await enablePushSubscription();
        } else {
          await onDeny(modalOnDeny);
        }
      } else {
        // On safari mobile, just enable push notifications.
        await enablePushSubscription();
      }
    } else {
      settings.pushNotificationsState = "denied";
      await killServiceWorkerSubscription(getClient());
    }
  };

  return {
    toggleNotificationPermission,
    togglePushPermission,
    initNotifications,
  };
}

async function setUpServiceWorkerSubscription(client: Client) {
  if (IS_DEV) {
    console.log("Skipping push worker in dev.");
    return;
  }

  if (!client.configured() || !client.configuration) {
    throw "Client not configured";
  }

  const registration = await navigator.serviceWorker.getRegistration(
    import.meta.env.BASE_URL ?? undefined,
  );
  if (!registration) {
    throw "Failed to get service worker";
  }

  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const applicationServerKey = subscription.options.applicationServerKey;
    const savedKey =
      typeof applicationServerKey === "string"
        ? applicationServerKey
        : applicationServerKey
          ? arrayBufferToBase64URL(applicationServerKey)
          : undefined;
    if (
      !savedKey ||
      savedKey !==
        arrayBufferToBase64URL(
          base64URLToArrayBuffer(client.configuration.vapid),
        )
    ) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }

  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64URLToArrayBuffer(client.configuration.vapid),
  });

  await client.api.post("/push/subscribe", {
    endpoint: subscription.endpoint,
    p256dh: arrayBufferToBase64URL(
      subscription.getKey("p256dh") || new ArrayBuffer(),
    ),
    auth: arrayBufferToBase64URL(
      subscription.getKey("auth") || new ArrayBuffer(),
    ),
  });
}

function arrayBufferToBase64URL(buffer: BufferSource): string {
  const intArray =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return intArray.toBase64({ alphabet: "base64url" });
}

function base64URLToArrayBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return buffer;
}

/** Exported for the client controller. Don't use this unless you have to. */
export async function killServiceWorkerSubscription(
  client: Client,
  loggingOut?: boolean,
) {
  if (IS_DEV) {
    console.log("Skipping killing push worker in dev.");
    return;
  }

  if (isAndroidShell()) {
    if (!loggingOut) await client.api.post("/push/unsubscribe");
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration(
    import.meta.env.BASE_URL ?? undefined,
  );
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (await subscription?.unsubscribe()) {
    if (!loggingOut) await client.api.post("/push/unsubscribe");
  }
}
