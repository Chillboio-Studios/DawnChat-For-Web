import { useLingui } from "@lingui/solid/macro";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import { createEffect, createMemo, For, onMount, Show } from "solid-js";
import { TrackLoop } from "solid-livekit-components";
import { styled } from "styled-system/jsx";

import { useUser } from "@revolt/client";
import { useDevice } from "@revolt/common";
import { InRoom, useVoice, type AndroidVoiceParticipant } from "@revolt/rtc";
import { IconButton } from "@revolt/ui/components/design";
import { Symbol } from "@revolt/ui/components/utils/Symbol";
import { scrollableStyles } from "@revolt/ui/directives";

import { AndroidParticipantTile, ParticipantTile, tile } from "./ParticipantTile";
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
      <Show when={!voice.isNative} fallback={<AndroidParticipants />}>
        <Participants />
      </Show>
      <VoiceCallControls>
        <VoiceCallControlHolder left collapsed={collapsed()}>
          <VoiceCallCardStatus />
        </VoiceCallControlHolder>
        <VoiceCallCardActions size="sm" />
        <VoiceCallControlHolder right collapsed={collapsed()}>
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
      <Show when={voice.isNative}>
        <IconButton
          size="sm"
          variant="standard"
          onPress={() => voice.openNativeUI()}
          use:floating={{
            tooltip: {
              placement: "top",
              content: t`Open call window`,
            },
          }}
        >
          <Symbol>open_in_new</Symbol>
        </IconButton>
      </Show>
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
        onPress={() => voice.toggleLayout("fullscreen")}
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

const TILE_MIN_WIDTH = "250px",
  TILE_MIN_FOCUS_HEIGHT = "100px";

/**
 * Show a grid of participants
 */
function Participants() {
  const voice = useVoice();
  const { t } = useLingui();

  // Modify this value to get test tracks
  const testTrackCount = 0;

  let callRef: HTMLDivElement | undefined;

  const tileWidth = () => {
    const vidWidth = Math.round(
      100 / (voice.vidTracks().length + testTrackCount),
    );
    return `max(${TILE_MIN_WIDTH}, ${vidWidth}% - var(--gap-md))`;
  };

  // Clear out any focus when the track that was focused is no longer available.
  createEffect(() => {
    if (!voice.focusTrack()) voice.toggleFocus();
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
        <FocusedParticipant />
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
          focus={!!voice.focusId()}
          show={voice.showBar()}
          class={voice.focusId() ? scrollableStyles({ direction: "x" }) : ""}
          style={{ "--vc-tile-width": tileWidth() }}
        >
          <TrackLoop
            tracks={() => voice.vidTracks().filter((t) => !voice.isFocus(t))}
          >
            {() => <ParticipantTile />}
          </TrackLoop>
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

function FocusedParticipant() {
  const voice = useVoice();

  return (
    <Show when={voice.focusTrack()}>
      <TrackLoop tracks={() => [voice.focusTrack()!]}>
        {() => (
          <FocusBox>
            <ParticipantTile focus />
          </FocusBox>
        )}
      </TrackLoop>
    </Show>
  );
}

/**
 * Show a grid of participants for Android native voice calls
 */
function AndroidParticipants() {
  const voice = useVoice();
  const selfUser = useUser();
  let callRef: HTMLDivElement | undefined;

  const participantsList = createMemo<AndroidVoiceParticipant[]>(() => {
    const list = voice.participants();
    if (list && list.length > 0) return list;
    const self = selfUser();
    if (self) {
      return [
        {
          identity: self.id,
          name: self.username,
          isLocal: true,
          speaking: false,
          micEnabled: voice.microphone(),
          cameraEnabled: voice.video(),
          screenSharing: voice.screenshare(),
        },
      ];
    }
    return [];
  });

  const tileWidth = () => {
    const count = participantsList().length || 1;
    const vidWidth = Math.round(100 / count);
    return `max(min(${TILE_MIN_WIDTH}, 100%), ${vidWidth}% - var(--gap-md))`;
  };

  onMount(() => {
    createResizeObserver(callRef, ({ width, height }, el) => {
      if (el === callRef) {
        el.style.setProperty("--vc-w", `${width}px`);
        el.style.setProperty("--vc-h", `${height}px`);
      }
    });
  });

  return (
    <Call ref={callRef} class={scrollableStyles()}>
      <Grid style={{ "--vc-tile-width": tileWidth() }}>
        <For each={participantsList()}>
          {(participant) => <AndroidParticipantTile participant={participant} />}
        </For>
      </Grid>
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
    collapsed: {
      true: { padding: 0 },
    },
  },
});

const VoiceCallControls = styled("div", {
  base: {
    display: "flex",
    flexShrink: 0,
    overflow: "hidden",
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
    height: 0,
    alignSelf: "center",
    overflow: "visible",
    display: "flex",
    flexDirection: "column-reverse",
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
    minHeight: "100%",
    gap: "var(--gap-md)",
  },

  variants: {
    focus: {
      true: {
        flexDirection: "column",
        height: `max(20%, ${TILE_MIN_FOCUS_HEIGHT})`,
        minHeight: 0,
        transition: "height .3s ease",

        "& .vc_tile": {
          width: "auto",
          height: "100%",
        },
      },
    },
    show: {
      false: {
        height: 0,
      },
    },
  },
});

const FocusBox = styled("div", {
  base: {
    height: 0,
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    margin: "0 auto",
  },
});
