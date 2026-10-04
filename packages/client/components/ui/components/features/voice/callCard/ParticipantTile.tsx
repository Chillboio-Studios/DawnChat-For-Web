import { createSignal, onMount, Show } from "solid-js";
import {
  TrackReference,
  useEnsureParticipant,
  useIsMuted,
  useIsSpeaking,
  useTrackRefContext,
  VideoTrack,
} from "solid-livekit-components";

import { RemoteTrackPublication, Track } from "livekit-client";
import { cva } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { UserContextMenu } from "@revolt/app";
import { useDevice } from "@revolt/common";
import { useUser } from "@revolt/markdown/users";
import { useVoice } from "@revolt/rtc";
import { VideoZoomSurface } from "@revolt/rtc/components/VideoZoomSurface";
import { useState } from "@revolt/state";
import { Avatar } from "@revolt/ui/components/design";
import { Row } from "@revolt/ui/components/layout";
import { OverflowingText } from "@revolt/ui/components/utils";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

import { VoiceStatefulUserIcons } from "../VoiceStatefulUserIcons";

/**
 * Individual participant tile
 */
export function ParticipantTile() {
  const voice = useVoice();
  const state = useState();
  const device = useDevice();
  const participant = useEnsureParticipant();
  const track = useTrackRefContext();
  const user = useUser(participant.identity);

  let videoRef: HTMLVideoElement | undefined;

  const [videoDims, setVideoDims] = createSignal<{
    height: number;
    width: number;
  }>({ height: 0, width: 0 });
  const [zoomed, setZoomed] = createSignal(false);

  const isMuted = useIsMuted({
    participant,
    source: Track.Source.Microphone,
  });

  const isScreenShareAudioMuted = useIsMuted({
    participant,
    source: Track.Source.ScreenShareAudio,
  });

  const isRemoteScreenShareMuted = useIsMuted({
    participant,
    source: Track.Source.ScreenShare,
  });

  const isScreenShareAudioUserMuted = () =>
    !user().user!.self && state.voice.getScreenShareMuted(user().user!.id)
      ? "by-user"
      : isScreenShareAudioMuted() || false;

  const isVideoMuted = useIsMuted({
    participant,
    source: Track.Source.Camera,
  });

  onMount(() => {
    const publication = track.publication;
    if (
      publication instanceof RemoteTrackPublication &&
      !publication.isSubscribed
    ) {
      void publication.setSubscribed(true);
    }
  });

  const isVideo = () => !isVideoMuted();
  const isScreenShare = () => track.source === Track.Source.ScreenShare;
  const isFocused = () => voice.isFocus(track);
  const isZoomedMobileDesktopShare = () =>
    isScreenShare() &&
    isFocused() &&
    device.layout() !== "desktop" &&
    videoDims().width > videoDims().height &&
    zoomed();
  const isSpeaking = useIsSpeaking(participant);

  return (
    <Show when={!isScreenShare() || !isRemoteScreenShareMuted()}>
      <div
        class={
          tile({
            speaking: !isScreenShare() && isSpeaking(),
            video: isVideo() || isScreenShare(),
            fullscreen: voice.layout() === "fullscreen",
            focus: isFocused(),
          }) + (isScreenShare() ? " vc_tile group" : " vc_tile")
        }
        data-focused={isFocused() ? "true" : undefined}
        onClick={(event) => {
          if (!isVideo() && !isScreenShare()) return;
          if (zoomed()) return;
          if (
            event.target instanceof Element &&
            event.target.closest(
              '[aria-label="Zoom in"], [aria-label="Reset zoom"]',
            )
          ) {
            return;
          }
          voice.toggleFocus(track);
        }}
        use:floating={{
          // TODO: Conflicts with focusing, maybe only show if clicking name itself
          //   userCard: {
          //     user: user().user!,
          //     member: user().member,
          //   },
          contextMenu: () => (
            <UserContextMenu
              user={user().user!}
              member={user().member}
              inVoice={!isScreenShare()}
              isScreenshare={isScreenShare()}
            />
          ),
        }}
        style={
          isFocused()
            ? {
                "min-width": 0,
                "max-width": "none",
                width: "100%",
                "grid-column": "1 / -1",
                "grid-row": "1",
                "align-self": "stretch",
                "justify-self": "stretch",
              }
            : undefined
        }
      >
        <Show
          when={isVideo() || isScreenShare()}
          fallback={
            <AvatarOnly>
              <Avatar
                src={user().avatar}
                fallback={user().username}
                size={48}
                interactive={false}
              />
            </AvatarOnly>
          }
        >
          <VideoZoomSurface
            style={{ "grid-area": "1/1", width: "100%", height: "100%" }}
            onZoomChange={setZoomed}
            preserveFrameOnResize={isZoomedMobileDesktopShare()}
          >
            <VideoTrack
              style={{
                "object-fit": isZoomedMobileDesktopShare()
                  ? "cover"
                  : "contain",
                width: "100%",
                height: "100%",
                overflow: "hidden",
              }}
              trackRef={track as TrackReference}
              ref={videoRef}
              on:resize={() => {
                setVideoDims({
                  height: videoRef?.videoHeight || 0,
                  width: videoRef?.videoWidth || 0,
                });
              }}
            />
          </VideoZoomSurface>
        </Show>
        <Overlay showOnHover={isScreenShare()}>
          <OverlayInner>
            <OverflowingText>{user().username}</OverflowingText>
            <Row gap="md">
              {isScreenShare() ? (
                <Show when={isScreenShareAudioUserMuted()}>
                  <Symbol
                    size={18}
                    color={
                      isScreenShareAudioUserMuted() === "by-user"
                        ? "var(--md-sys-color-error)"
                        : undefined
                    }
                  >
                    no_sound
                  </Symbol>
                </Show>
              ) : (
                <VoiceStatefulUserIcons
                  userId={participant.identity}
                  muted={isMuted()}
                  camera={isVideo()}
                />
              )}
            </Row>
          </OverlayInner>
        </Overlay>
      </div>
    </Show>
  );
}

export const tile = cva({
  base: {
    display: "grid",
    aspectRatio: "16/9",
    transition: "all .3s ease, width 0s, height 0s",
    borderRadius: "var(--borderRadius-lg)",
    width: "var(--vc-tile-width)",
    maxWidth: "calc(var(--vc-h) * 16 / 9)",
    cursor: "pointer",

    color: "var(--md-sys-color-on-surface)",
    background: "#0002",

    overflow: "hidden",
    outlineWidth: "3px",
    outlineStyle: "solid",
    outlineOffset: "-3px",
    outlineColor: "transparent",
  },
  variants: {
    speaking: {
      true: {
        outlineColor: "var(--md-sys-color-primary)",
      },
    },
    focus: {
      true: {
        width: "auto",
        maxWidth: "none",
      },
    },
    video: {
      true: {},
    },
    fullscreen: {
      true: {
        minWidth: "20%",
      },
    },
  },
  compoundVariants: [
    {
      video: [false],
      focus: [true],
      css: {
        height: "100%",
        maxHeight: "calc(var(--vc-w) * 9 / 16)",
      },
    },
    {
      video: [true],
      focus: [true],
      css: {
        aspectRatio: "auto",
      },
    },
  ],
});

const AvatarOnly = styled("div", {
  base: {
    gridArea: "1/1",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",

    // TODO: Refactor the avatar component to be reactive later.
    "& > *": {
      width: "auto !important",
      height: "30% !important",
      minHeight: "48px",
    },
  },
});

const Overlay = styled("div", {
  base: {
    minWidth: 0,
    gridArea: "1/1",

    padding: "var(--gap-md) var(--gap-lg)",

    opacity: 1,
    display: "flex",
    alignItems: "end",
    flexDirection: "row",

    transition: "var(--transitions-fast) all",
    transitionTimingFunction: "ease",
  },
  variants: {
    showOnHover: {
      true: {
        opacity: 0,

        _groupHover: {
          opacity: 1,
        },
      },
      false: {
        opacity: 1,
      },
    },
  },
  defaultVariants: {
    showOnHover: false,
  },
});

const OverlayInner = styled("div", {
  base: {
    minWidth: 0,

    display: "flex",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",

    _first: {
      flexGrow: 1,
    },
  },
});
