export type AndroidVoiceStateName =
  | "IDLE"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "DISCONNECTED";

export type AndroidVoiceParticipant = {
  identity: string;
  name: string;
  isLocal: boolean;
  speaking: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
};

export type AndroidVoiceState = {
  state: AndroidVoiceStateName;
  channelId: string | null;
  channelName: string | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  deafened: boolean;
  participants: AndroidVoiceParticipant[];
};

export type AndroidVoiceEndReason =
  | "left"
  | "hangup"
  | "disconnected"
  | "error";

export type AndroidJoinOptions = {
  micOn: boolean;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
};

export type AndroidBridge = {
  platformVersion: number;
  call(method: string, args?: unknown): Promise<unknown>;
  on(event: string, cb: (payload: unknown) => void): () => void;
};

export function isAndroidShell(): boolean {
  return window.native?.platform === "android" && !!window.native.android;
}

function bridge(): AndroidBridge {
  const b = window.native?.android;
  if (!b) throw new Error("Android bridge unavailable");
  return b;
}

export const androidNative = {
  /** Whether the shell exposes the native voice implementation */
  hasVoice(): boolean {
    return isAndroidShell() && typeof bridge().call === "function";
  },

  voice: {
    join(args: {
      url: string;
      token: string;
      channelId: string;
      channelName: string;
      options?: AndroidJoinOptions;
    }) {
      return bridge().call("voice.join", args) as Promise<void>;
    },
    leave() {
      return bridge().call("voice.leave") as Promise<void>;
    },
    setMicrophone(enabled: boolean) {
      return bridge().call("voice.setMicrophone", { enabled }) as Promise<void>;
    },
    setDeafen(enabled: boolean) {
      return bridge().call("voice.setDeafen", { enabled }) as Promise<void>;
    },
    setCamera(enabled: boolean, facing?: "front" | "back") {
      return bridge().call("voice.setCamera", {
        enabled,
        facing,
      }) as Promise<void>;
    },
    setScreenShare(enabled: boolean) {
      return bridge().call("voice.setScreenShare", {
        enabled,
      }) as Promise<void>;
    },
    getState() {
      return bridge().call("voice.getState") as Promise<AndroidVoiceState>;
    },
    openUI() {
      return bridge().call("voice.openUI") as Promise<void>;
    },
    onState(cb: (state: AndroidVoiceState) => void) {
      return bridge().on("voice.state", (p) => cb(p as AndroidVoiceState));
    },
    onError(cb: (e: { message: string }) => void) {
      return bridge().on("voice.error", (p) => cb(p as { message: string }));
    },
    onEnded(cb: (e: { reason: AndroidVoiceEndReason }) => void) {
      return bridge().on("voice.ended", (p) =>
        cb(p as { reason: AndroidVoiceEndReason }),
      );
    },
  },

  fcm: {
    getToken() {
      return bridge().call("fcm.getToken") as Promise<string | null>;
    },
    onToken(cb: (token: string) => void) {
      return bridge().on("fcm.token", (p) => cb(p as string));
    },
  },

  notifications: {
    requestPermission() {
      return bridge().call("notifications.requestPermission") as Promise<boolean>;
    },
  },
};
