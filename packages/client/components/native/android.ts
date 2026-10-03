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

let colorCtx: CanvasRenderingContext2D | null | undefined;

/** Rasterises any CSS colour to '#rrggbb' (or '#rrggbbaa' when translucent) */
export function cssColorToHex(cssColor: string): string | undefined {
  if (colorCtx === undefined) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    colorCtx = canvas.getContext("2d", { willReadFrequently: true });
  }
  const ctx = colorCtx;
  if (!ctx) return;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const parts = a === 255 ? [r, g, b] : [r, g, b, a];
  return `#${parts.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export const androidNative = {
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

  ui: {
    /** Tints the area behind the system bars and picks icon contrast */
    setSystemBars(cssColor: string) {
      const hex = cssColorToHex(cssColor);
      if (!hex) return;
      return bridge().call("ui.setSystemBars", {
        color: hex.slice(0, 7),
      }) as Promise<void>;
    },
  },
};
