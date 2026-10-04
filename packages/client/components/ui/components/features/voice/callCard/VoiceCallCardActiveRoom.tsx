import { useLingui } from "@lingui/solid/macro";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import { createEffect, createMemo, For, onMount, Show } from "solid-js";
import { TrackLoop } from "solid-livekit-components";
import { styled } from "styled-system/jsx";

import { useDevice } from "@revolt/common";
import { AndroidNativeParticipants, InRoom, useVoice } from "@revolt/rtc";
import { IconButton } from "@revolt/ui/components/design";
import { Symbol } from "@revolt/ui/components/utils/Symbol";
import { scrollableStyles } from "@revolt/ui/directives";

import { ParticipantTile, tile } from "./ParticipantTile";
import { VoiceCallCardActions } from "./VoiceCallCardActions";
import { VoiceCallCardStatus } from "./VoiceCallCardStatus";

/**
 * Call card (active)
 */
export function VoiceCallCardActiveRoom() {
  const voice = useVoice();
  const collapsed = createMemo(() => voice.layout() === "collapsed");

  return (
    <View collapsed={collapsed()}>
      <Participants />
      <VoiceCallControls>
        <VoiceCallControlHolder class="vc_status" left collapsed={collapsed()}>
          <VoiceCallCardStatus />
        </VoiceCallControlHolder>
        <VoiceCallCardActions size="sm" class="vc_actions" />
        <VoiceCallControlHolder class="vc_layout" right collapsed={collapsed()}>
          <LayoutButtons />
        </VoiceCallControlHolder>
      </VoiceCallControls>
    </View>
  );
}

function LayoutButtons() {
  const voice = useVoice();
  const device = useDevice();
  const { t } = useLingui();

  return (
    <>
      {/* TODO: Refactor call controls on mobile to make these buttons not overflow */}
      <Show when={device.layout() === "desktop"}>
        <IconButton
          size="sm"
          variant="standard"
          onPress={() => voice.toggleLayout("collapsed")}
          use:floating={{
            tooltip: {
              placement: "top",
              content: t`Collapse call window`,
            },
          }}
        >
          <Symbol>unfold_less</Symbol>
        </IconButton>
        <IconButton
          size="sm"
          variant="standard"
          onPress={() => voice.toggleLayout("expanded")}
          use:floating={{
            tooltip: {
              placement: "top",
              content:
                voice.layout() === "expanded"
                  ? t`Restore call window`
                  : t`Maximize call window`,
            },
          }}
        >
          <Show
            when={voice.layout() === "expanded"}
            fallback={<Symbol>open_in_full</Symbol>}
          >
            <Symbol>close_fullscreen</Symbol>
          </Show>
        </IconButton>
      </Show>
      <IconButton
        size="sm"
        variant={"standard"}
        onPress={() => {
          if (voice.layout() === "fullscreen") {
            voice.toggleLayout("fullscreen");
            if (document.fullscreenElement) {
              void document.exitFullscreen().catch((error: unknown) => {
                console.debug("Could not exit browser fullscreen", error);
              });
            }
            return;
          }

          const fullscreenRequest = document
            .getElementById("floating")
            ?.requestFullscreen();
          voice.toggleLayout("fullscreen");
          void fullscreenRequest?.catch((error: unknown) => {
            console.debug("Browser fullscreen is unavailable", error);
          });
        }}
      >
        <Show
          when={voice.layout() === "fullscreen"}
          fallback={<Symbol>fullscreen</Symbol>}
        >
          <Symbol>fullscreen_exit</Symbol>
        </Show>
      </IconButton>
    </>
  );
}

const TILE_MIN_WIDTH = "250px";

/**
 * Show a grid of participants
 */
function Participants() {
  const voice = useVoice();
  const { t } = useLingui();

  // Modify this value to get test tracks
  const testTrackCount = 0;

  let callRef: HTMLDivElement | undefined;

  const trackCount = () => {
    const nativeTrackCount = voice
      .androidParticipants()
      .reduce(
        (count, participant) =>
          count +
          1 +
          participant.tracks.filter(
            (track) => track.source.replaceAll("_", "") === "screenshare",
          ).length,
        0,
      );
    return voice.isAndroidNativeActive
      ? nativeTrackCount
      : voice.vidTracks().length + testTrackCount;
  };

  const tileWidth = () => {
    const vidWidth = Math.round(100 / Math.max(1, trackCount()));
    return `max(var(--vc-tile-min-width, ${TILE_MIN_WIDTH}), calc(${vidWidth}% - var(--gap-md)))`;
  };

  // Clear out any focus when the track that was focused is no longer available.
  createEffect(() => {
    if (!voice.isAndroidNativeActive && !voice.focusTrack())
      voice.toggleFocus();
  });

  onMount(() => {
    createResizeObserver(callRef, ({ width, height }, el) => {
      if (el === callRef) {
        el.style.setProperty("--vc-w", `${width}px`);
        el.style.setProperty("--vc-h", `${height}px`);
      }
    });
  });

  return (
    <Call ref={callRef} class={voice.focusId() ? "" : scrollableStyles()}>
      <InRoom>
        <Show when={voice.focusId()}>
          <ShowBarButtonHolder>
            <div style={{ "margin-bottom": "10px" }}>
              <IconButton
                size="xs"
                variant={"tonal"}
                onPress={() => voice.toggleShowBar()}
                use:floating={{
                  tooltip: {
                    placement: "top",
                    content: voice.showBar() ? t`Hide Others` : t`Show Others`,
                  },
                }}
              >
                <Show
                  when={voice.showBar()}
                  fallback={<Symbol>keyboard_arrow_up</Symbol>}
                >
                  <Symbol>keyboard_arrow_down</Symbol>
                </Show>
              </IconButton>
            </div>
          </ShowBarButtonHolder>
        </Show>
        <Grid
          focusedStage={!!voice.focusId()}
          fullscreen={voice.layout() === "fullscreen"}
          show={voice.showBar()}
          unfocused={!voice.focusId()}
          class={voice.focusId() ? scrollableStyles({ direction: "x" }) : ""}
          style={{
            "--vc-tile-width": tileWidth(),
            "--vc-thumbnail-count": Math.max(1, trackCount() - 1),
          }}
        >
          <Show
            when={voice.isAndroidNativeActive}
            fallback={
              <TrackLoop tracks={() => voice.vidTracks()}>
                {() => <ParticipantTile />}
              </TrackLoop>
            }
          >
            <AndroidNativeParticipants />
          </Show>
          <For each={Array(testTrackCount)}>
            {() => (
              <div
                class={
                  tile({ fullscreen: voice.layout() === "fullscreen" }) +
                  " vc_tile"
                }
              />
            )}
          </For>
        </Grid>
      </InRoom>
    </Call>
  );
}

const View = styled("div", {
  base: {
    minHeight: 0,
    height: "100%",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "var(--gap-md)",
    padding: "var(--gap-md)",
    transition: "padding var(--transitions-medium)",
  },
  variants: {
    fullscreen: {
      true: {
        padding:
          "max(var(--gap-sm), env(safe-area-inset-top)) max(var(--gap-sm), env(safe-area-inset-right)) max(var(--gap-sm), env(safe-area-inset-bottom)) max(var(--gap-sm), env(safe-area-inset-left))",
        gap: "var(--gap-sm)",
      },
    },
    collapsed: {
      true: { padding: 0 },
    },
  },
});
const VoiceCallControls = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    minWidth: 0,
    overflow: "visible",

    "@media (max-width: 640px)": {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      gridTemplateAreas: '"status layout" "actions actions"',
      gap: "var(--gap-xs) var(--gap-sm)",

      "& .vc_status": {
        gridArea: "status",
        minWidth: 0,
        padding: "var(--gap-xs)",
      },
      "& .vc_layout": {
        gridArea: "layout",
        padding: "var(--gap-xs)",
      },
      "& .vc_actions": {
        gridArea: "actions",
        justifySelf: "center",
        width: "100%",
        maxWidth: "100%",
        overflowX: "auto",
        justifyContent: "safe center",
        padding: "var(--gap-xs)",
        scrollbarWidth: "none",
      },
      "& .vc_actions::-webkit-scrollbar": {
        display: "none",
      },
    },
  },
});

const VoiceCallControlHolder = styled("div", {
  base: {
    display: "flex",
    flex: 1,
    alignSelf: "center",
    gap: "var(--gap-md)",
    padding: "var(--gap-md)",
    opacity: 1,
    transition: "opacity var(--transitions-medium)",
  },
  variants: {
    left: {
      true: {
        justifyContent: "flex-start",
        overflow: "hidden",
      },
    },
    right: {
      true: {
        justifyContent: "flex-end",
      },
    },
    collapsed: {
      true: {
        opacity: 0,
        pointerEvents: "none",
      },
    },
  },
});

const ShowBarButtonHolder = styled("div", {
  base: {
    position: "absolute",
    zIndex: 4,
    top: "var(--gap-xs)",
    left: "50%",
    transform: "translateX(-50%)",
    height: "auto",
    pointerEvents: "none",
    overflow: "visible",
    display: "flex",
    justifyContent: "center",

    "& > div": {
      pointerEvents: "auto",
      marginBottom: 0,
    },
  },
});

const Call = styled("div", {
  base: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    flexGrow: 1,
    minHeight: 0,
  },
});

const Grid = styled("div", {
  base: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "safe center",
    alignContent: "safe center",
    minHeight: 0,
    flex: "1 1 auto",
    gap: "var(--gap-md)",

    "@media (max-width: 640px)": {
      "--vc-tile-min-width": "min(42vw, 180px)",
      justifyContent: "flex-start",
      alignContent: "flex-start",
      gap: "var(--gap-sm)",
      padding: "var(--gap-xs)",
    },
  },

  variants: {
    focusedStage: {
      true: {
        display: "grid",
        gridTemplateColumns:
          "repeat(var(--vc-thumbnail-count), minmax(0, 1fr))",
        gridTemplateRows: "minmax(0, 1fr) clamp(96px, 18vh, 180px)",
        alignContent: "stretch",
        justifyContent: "safe center",
        overflowX: "auto",
        overflowY: "hidden",
        gap: "var(--gap-sm)",
        padding: "var(--gap-xs)",

        '& .vc_tile[data-focused="true"]': {
          gridColumn: "1 / -1",
          gridRow: "1",
          alignSelf: "stretch",
          justifySelf: "stretch",
          width: "auto",
          minWidth: 0,
          maxWidth: "none",
          height: "100%",
          minHeight: 0,
          aspectRatio: "auto",
        },
        '& .vc_tile:not([data-focused="true"])': {
          gridRow: "2",
          width: "100%",
          minWidth: 0,
          maxWidth: "min(28vw, 240px)",
          height: "100%",
          aspectRatio: "auto",
          flex: "1 1 auto",
        },
        "& .vc_tile:only-child": {
          gridColumn: "1 / -1",
          gridRow: "1",
          height: "100%",
        },
        "@media (max-width: 640px)": {
          gridTemplateColumns:
            "repeat(var(--vc-thumbnail-count), minmax(0, 1fr))",
          gridTemplateRows: "minmax(0, 1fr) clamp(88px, 14vh, 120px)",
          gap: "var(--gap-xs)",
          padding: "var(--gap-xs)",
          '& .vc_tile:not([data-focused="true"])': {
            maxWidth: "min(44vw, 180px)",
          },
        },
      },
    },
    fullscreen: {
      true: {
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 400px), 1fr))",
        gridAutoRows: "auto",
        flex: "1 1 auto",
        alignContent: "center",
        justifyContent: "stretch",
        justifyItems: "center",
        gap: "var(--gap-lg)",
        overflowX: "hidden",
        overflowY: "auto",
        padding: "var(--gap-md)",

        "& .vc_tile": {
          width: "100%",
          minWidth: 0,
          maxWidth: "100%",
          height: "auto",
          aspectRatio: "16/9",
          alignSelf: "center",
        },
        "& .vc_tile:only-child": {
          width: "min(100%, 1200px)",
          maxHeight: "min(76vh, 900px)",
        },
        "@media (max-width: 640px)": {
          gap: "var(--gap-md)",
          padding: "var(--gap-xs)",

          "& .vc_tile:only-child": {
            height: "min(65dvh, 640px)",
            aspectRatio: "auto",
          },
        },
      },
    },
    show: {
      false: {
        height: 0,
      },
    },
    unfocused: {
      true: {},
    },
  },
  compoundVariants: [
    {
      unfocused: true,
      fullscreen: true,
      css: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
        alignContent: "center",
        justifyItems: "center",
        "& .vc_tile": {
          width: "min(100%, 560px)",
          maxWidth: "560px",
          maxHeight: "76dvh",
        },
        "@media (orientation: landscape)": {
          display: "flex",
          flexDirection: "row",
          flexWrap: "nowrap",
          justifyContent: "safe center",
          alignItems: "center",
          overflowX: "auto",
          overflowY: "hidden",
          "& .vc_tile": {
            flex: "0 0 min(28vw, 320px)",
            width: "min(28vw, 320px)",
          },
        },
        "@media (min-width: 1025px) and (orientation: landscape)": {
          '& .vc_tile:not([data-focused="true"])': {
            flex: "0 0 min(32vw, 380px)",
            width: "min(32vw, 380px)",
            maxWidth: "380px",
          },
        },
        "@media (max-width: 640px) and (orientation: portrait)": {
          gridTemplateColumns: "minmax(0, 1fr)",
          "& .vc_tile": {
            width: "100%",
            maxWidth: "min(100%, 420px)",
            maxHeight: "none",
          },
        },
        "@media (max-width: 640px) and (orientation: landscape)": {
          '& .vc_tile:not([data-focused="true"])': {
            flex: "0 0 min(78vw, 320px)",
            width: "min(78vw, 320px)",
          },
        },
      },
    },
    {
      focusedStage: true,
      fullscreen: true,
      css: {
        gridTemplateColumns:
          "repeat(var(--vc-thumbnail-count), minmax(0, 1fr))",
      },
    },
    {
      focusedStage: true,
      fullscreen: false,
      css: {
        gridTemplateColumns:
          "repeat(var(--vc-thumbnail-count), minmax(0, 1fr))",
      },
    },
    {
      focusedStage: true,
      fullscreen: true,
      css: {
        "@media (max-height: 500px) and (orientation: landscape)": {
          gridTemplateRows: "minmax(0, 1fr) clamp(64px, 20vh, 88px)",
          gap: "var(--gap-xs)",
          padding: "var(--gap-xs)",
          '& .vc_tile[data-focused="true"]': {
            height: "100%",
            minHeight: 0,
            aspectRatio: "auto",
          },
          '& .vc_tile:not([data-focused="true"])': {
            height: "100%",
            minHeight: 0,
            aspectRatio: "auto",
          },
        },
      },
    },
    {
      focusedStage: true,
      show: false,
      css: {
        gridTemplateRows: "minmax(0, 1fr) 0px",
        overflow: "hidden",
        '& .vc_tile:not([data-focused="true"])': {
          display: "none",
        },
      },
    },
  ],
});
