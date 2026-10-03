import { createEffect, createMemo } from "solid-js";

import { useClientLifecycle } from "@revolt/client";
import { State } from "@revolt/client/Controller";
import { useState } from "@revolt/state";

import { androidNative, cssColorToHex, isAndroidShell } from "../../native/android";

import {
  createMaterialColourVariables,
  createMduiColourTriplets,
  createStoatWebVariables,
} from ".";
import { SlideState } from "../components/navigation/SlideDrawer";
import { Masks } from "./Masks";
import { FONTS, MONOSPACE_FONTS } from "./fonts";
import { legacyThemeUnsetShim } from "./legacyThemeGeneratorCode";

let themeTimer: ReturnType<typeof setTimeout> | undefined;
let lastTheme = "";

function pushAndroidTheme(
  cssProps: Record<string, string>,
  theme: { activeTheme: { darkMode: boolean }; interfaceFont: string },
) {
  const dark = theme.activeTheme.darkMode;
  const fontFamily = theme.interfaceFont;
  clearTimeout(themeTimer);
  themeTimer = setTimeout(() => {
    const colors: Record<string, string> = {};
    const radii: Record<string, number> = {};
    for (const [key, value] of Object.entries(cssProps)) {
      if (key.startsWith("--md-sys-color-")) {
        const hex = cssColorToHex(value);
        if (hex) colors[key.slice("--md-sys-color-".length)] = hex;
      } else if (key.startsWith("--borderRadius-")) {
        const name = key.slice("--borderRadius-".length);
        if (name === "full") radii[name] = 9999;
        else if (/^\d+(\.\d+)?px$/.test(value)) radii[name] = parseFloat(value);
      }
    }

    const payload = { dark, colors, radii, fontFamily };
    const json = JSON.stringify(payload);
    if (json === lastTheme) return;
    lastTheme = json;
    androidNative.ui.setTheme(payload).catch(() => {
      lastTheme = "";
    });
  }, 150);
}

/**
 * Component for loading theme variables into root
 */
export function LoadTheme() {
  const state = useState();
  const { lifecycle } = useClientLifecycle();

  const bannerShown = createMemo(() =>
    [
      State.Connecting,
      State.Disconnected,
      State.Reconnecting,
      State.Offline,
    ].includes(lifecycle.state()),
  );

  const getCssProps = createMemo(() => {
    const activeTheme = state.theme.activeTheme;

    return {
      // create unset variables to indicate where colours need replacing
      ...Object.keys(legacyThemeUnsetShim().colours).reduce(
        (d, k) => ({
          ...d,
          [`--colours-${k}`]: k.includes("background")
            ? "var(--unset-bg)"
            : "var(--unset-fg)",
        }),
        {},
      ),
      // mount Stoat for Web variables
      ...createStoatWebVariables(activeTheme),
      // mount --md-sys-color variables
      ...createMaterialColourVariables(activeTheme, "--md-sys-color-"),
      // mount --mdui-color triplet variables
      ...createMduiColourTriplets(activeTheme, "--mdui-color-"),
    };
  });

  //Load fonts & update CSS props on body
  createEffect(() => {
    FONTS[state.theme.interfaceFont].load();
    MONOSPACE_FONTS[state.theme.monospaceFont].load();

    const cssProps = getCssProps();
    for (const [key, value] of Object.entries(cssProps))
      document.body.style.setProperty(key, value);

    if (isAndroidShell()) pushAndroidTheme(cssProps, state.theme);
  });

  //Set PWA theme color
  createEffect(() => {
    const drawerShown =
      state.appDrawer()?.state === SlideState.SHOWN ||
      state.diagDrawer()?.state === SlideState.SHOWN;

    const color =
      getCssProps()[
        bannerShown()
          ? "--md-sys-color-primary-container"
          : drawerShown
            ? "--md-sys-color-surface-container-low"
            : "--md-sys-color-surface-container-high"
      ];

    for (const meta of document.head.querySelectorAll("meta[name=theme-color]"))
      (meta as HTMLMetaElement).content = color;

    if (isAndroidShell()) androidNative.ui.setSystemBars(color)?.catch(() => {});
  });

  return <Masks />;
}
