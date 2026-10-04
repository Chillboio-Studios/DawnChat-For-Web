import { useDevice } from "@revolt/common";
import { UserContextMenu } from "@revolt/app";
import { useUser } from "@revolt/markdown/users";
import { useState } from "@revolt/state";
import { Avatar } from "@revolt/ui/components/design";
import { tile } from "@revolt/ui/components/features/voice/callCard/ParticipantTile";
import { VoiceStatefulUserIcons } from "@revolt/ui/components/features/voice/VoiceStatefulUserIcons";
import { Row } from "@revolt/ui/components/layout";
import { OverflowingText } from "@revolt/ui/components/utils";
import { Symbol } from "@revolt/ui/components/utils/Symbol";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { NativeVoiceParticipant } from "../../native/android";
import { useVoice } from "../state";
import { VideoZoomSurface } from "./VideoZoomSurface";

function isScreenShare(source: string) {
  return source.replaceAll("_", "") === "screenshare";
}

export function AndroidNativeParticipants(props: {
  focusedOnly?: boolean;
  excludeFocused?: boolean;
  compact?: boolean;
}) {
  const voice = useVoice();
  const participants = createMemo(() => {
    const participantsByIdentity = new Map<string, NativeVoiceParticipant>();
    for (const participant of voice.channel()?.voiceParticipants.values() ??
      []) {
      participantsByIdentity.set(participant.userId, {
        identity: participant.userId,
        sid: participant.userId,
        name: "",
        speaking: false,
        microphoneEnabled: participant.isPublishing(),
        cameraEnabled: participant.isCamera(),
        screenShareEnabled: participant.isScreensharing(),
        tracks: participant.isScreensharing()
          ? [
              {
                sid: "",
                source: "screen_share",
                kind: "video",
                muted: false,
                subscribed: true,
              },
            ]
          : [],
      });
    }
    for (const participant of voice.androidParticipants()) {
      participantsByIdentity.set(participant.identity, participant);
    }
    return [...participantsByIdentity.values()];
  });
  const tiles = createMemo(() =>
    participants()
      .flatMap((participant) => {
        const camera = participant.tracks.find(
          (track) => track.source === "camera",
        );
        const screenShares = participant.tracks.filter((track) =>
          isScreenShare(track.source),
        );
        return [
          { participant, sid: camera?.sid, source: "camera" },
          ...screenShares.map((track) => ({
            participant,
            sid: track.sid,
            source: "screen_share",
          })),
        ];
      })
      .filter((entry, index, entries) => {
        const focusId = voice.focusId();
        const focused = focusId ? entry.sid === focusId : index === 0;
        return props.focusedOnly ? focused : !props.excludeFocused || !focused;
      }),
  );

  return (
    <For each={tiles()}>
      {(entry) => (
        <AndroidNativeParticipantTile
          participant={entry.participant}
          sid={entry.sid}
          source={entry.source}
          compact={props.compact}
        />
      )}
    </For>
  );
}

function AndroidNativeParticipantTile(props: {
  participant: NativeVoiceParticipant;
  sid?: string;
  source: string;
  compact?: boolean;
}) {
  const voice = useVoice();
  const device = useDevice();
  const state = useState();
  const user = useUser(props.participant.identity);
  const [frame, setFrame] = createSignal("");
  const [zoomed, setZoomed] = createSignal(false);
  const [frameDimensions, setFrameDimensions] = createSignal({
    width: 0,
    height: 0,
  });
  onMount(() => {
    if (!device.hasTouch) return;
    document.body.dataset.longPressDelay = "650";
    // @ts-expect-error This package installs the browser's long-press event.
    void import("long-press-event");
  });
  let hasLoggedFrame = false;
  const android = window.native?.android;
  const removeListener = android?.on("voice.videoFrame", (payload) => {
    const data = payload as {
      sid?: string;
      data?: string;
      width?: number;
      height?: number;
    };
    if (data.sid === props.sid && data.data) {
      if (!hasLoggedFrame) {
        hasLoggedFrame = true;
        console.info("[rtc] native video frame received", {
          sid: data.sid,
          width: data.width,
          height: data.height,
        });
      }
      setFrame(`data:image/jpeg;base64,${data.data}`);
      setFrameDimensions({ width: data.width ?? 0, height: data.height ?? 0 });
    }
  });
  onCleanup(() => removeListener?.());

  const videoEnabled = () =>
    props.source === "camera"
      ? props.participant.cameraEnabled
      : props.participant.screenShareEnabled;
  const screenShareVideoTrack = () =>
    props.participant.tracks.find((track) => isScreenShare(track.source));
  const screenShareAudioTrack = () =>
    props.participant.tracks.find(
      (track) => track.source.replaceAll("_", "") === "screenshareaudio",
    );
  const isScreenShareAudioUserMuted = () =>
    !user().user!.self && state.voice.getScreenShareMuted(user().user!.id)
      ? "by-user"
      : (screenShareAudioTrack()?.muted ?? true);
  const isZoomedMobileDesktopShare = () =>
    props.source === "screen_share" &&
    props.sid === voice.focusId() &&
    device.layout() !== "desktop" &&
    frameDimensions().width > frameDimensions().height &&
    zoomed();
  const hasVideo = () => !!props.sid && videoEnabled() && !!frame();

  return (
    <Show
      when={
        props.source !== "screen_share" ||
        (videoEnabled() && !screenShareVideoTrack()?.muted)
      }
    >
      <div
        ref={(element) => {
          if (device.hasTouch) element.dataset.longPressDelay = "650";
        }}
        class={
          tile({
            video: hasVideo() || props.source === "screen_share",
            fullscreen: voice.layout() === "fullscreen",
            focus: props.sid !== undefined && props.sid === voice.focusId(),
            speaking: props.source === "camera" && props.participant.speaking,
          }) + " vc_tile"
        }
        data-focused={
          props.sid !== undefined && props.sid === voice.focusId()
            ? "true"
            : undefined
        }
        style={{
          "outline-color": "var(--md-sys-color-outline-variant)",
          ...(props.compact
            ? {
                width: "100%",
                height: "100%",
                "max-width": "100%",
                "max-height": "100%",
                "aspect-ratio": "auto",
                flex: "1 1 auto",
              }
            : {}),
        }}
        onClick={() => {
          if (!zoomed() && props.sid) voice.toggleNativeFocus(props.sid);
        }}
        use:floating={{
          contextMenuHandler: "long-press" as "contextmenu",
          contextMenu: () => (
            <UserContextMenu
              user={user().user!}
              member={user().member}
              inVoice={props.source === "camera"}
              isScreenshare={props.source === "screen_share"}
            />
          ),
        }}
      >
        <Show
          when={hasVideo()}
          fallback={
            <div
              style={{
                "grid-area": "1/1",
                display: "grid",
                "place-items": "center",
                overflow: "hidden",
              }}
            >
              <Avatar
                src={user().avatar}
                fallback={user().username}
                size={48}
                interactive={false}
              />
            </div>
          }
        >
          <VideoZoomSurface
            style={{
              "grid-area": "1/1",
              width: "100%",
              height: "100%",
            }}
            onZoomChange={setZoomed}
            preserveFrameOnResize={isZoomedMobileDesktopShare()}
          >
            <img
              src={frame()}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                "object-fit": isZoomedMobileDesktopShare()
                  ? "cover"
                  : "contain",
              }}
            />
          </VideoZoomSurface>
        </Show>
        <div
          style={{
            "grid-area": "1/1",
            display: "flex",
            "align-items": "end",
            "justify-content": "space-between",
            padding: "var(--gap-md) var(--gap-lg)",
            "min-width": 0,
            opacity: 1,
          }}
        >
          <OverflowingText>{user().username}</OverflowingText>
          <Row gap="md">
            <Show when={props.source === "screen_share"}>
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
            </Show>
            <Show when={props.source === "camera"}>
              <VoiceStatefulUserIcons
                userId={props.participant.identity}
                muted={!props.participant.microphoneEnabled}
                camera={props.participant.cameraEnabled}
              />
            </Show>
          </Row>
        </div>
      </div>
    </Show>
  );
}

export function AndroidNativeAudioManager() {
  const state = useState();
  const voice = useVoice();
  const android = window.native?.android;
  const isAndroid = window.native?.platform === "android" && !!android;
  const sentAudioSettings = new Map<string, string>();
  let audioContext: AudioContext | undefined;
  const nextStartBySid = new Map<string, number>();
  let audioUnlocked = false;

  createEffect(() => {
    if (!isAndroid || !voice.isAndroidNativeActive) {
      sentAudioSettings.clear();
      return;
    }

    for (const participant of voice.androidParticipants()) {
      const settings = {
        identity: participant.identity,
        userVolume: state.voice.getUserVolume(participant.identity),
        userMuted: state.voice.getUserMuted(participant.identity),
        screenShareVolume: state.voice.getScreenShareVolume(participant.identity),
        screenShareMuted: state.voice.getScreenShareMuted(participant.identity),
      };
      const serialized = JSON.stringify(settings);
      if (sentAudioSettings.get(participant.identity) === serialized) continue;

      sentAudioSettings.set(participant.identity, serialized);
      void android?.voice?.setParticipantAudioSettings(settings).catch((error: unknown) => {
        console.warn("Could not update native participant audio settings", error);
      });
    }
  });

  const unlockAudio = () => {
    audioUnlocked = true;
    audioContext ??= new AudioContext({ latencyHint: "interactive" });
    if (audioContext.state === "suspended") {
      void audioContext.resume().catch((error: unknown) => {
        console.debug("Could not resume native voice audio", error);
      });
    }
  };
  if (isAndroid) {
    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown", unlockAudio);
  }

  const removeListener = android?.on("voice.audioFrame", (payload) => {
    const frame = payload as {
      identity?: string;
      sid?: string;
      source?: string;
      data?: string;
      sampleRate?: number;
      channels?: number;
      bitsPerSample?: number;
    };
    if (
      !frame.identity ||
      !frame.sid ||
      !frame.data ||
      frame.bitsPerSample !== 16 ||
      voice.deafen()
    ) {
      return;
    }

    const screenAudio = frame.source === "screen_share_audio";
    const muted = screenAudio
      ? state.voice.getScreenShareMuted(frame.identity)
      : state.voice.getUserMuted(frame.identity);
    if (muted) return;

    const volume =
      state.voice.outputVolume *
      (screenAudio
        ? state.voice.getScreenShareVolume(frame.identity)
        : state.voice.getUserVolume(frame.identity));
    if (volume <= 0) return;

    if (!audioContext) {
      audioContext = new AudioContext({ latencyHint: "interactive" });
    }
    if (audioContext.state !== "running") {
      if (audioUnlocked) {
        void audioContext.resume().catch((error: unknown) => {
          console.debug("Could not resume native voice audio", error);
        });
      }
      return;
    }
    const binary = atob(frame.data);
    const sampleCount = Math.floor(binary.length / 2);
    const channelCount = Math.max(1, frame.channels ?? 1);
    const frameCount = Math.floor(sampleCount / channelCount);
    if (!frameCount) return;

    const buffer = audioContext.createBuffer(
      channelCount,
      frameCount,
      frame.sampleRate || 48000,
    );
    for (let channel = 0; channel < channelCount; channel++) {
      const output = buffer.getChannelData(channel);
      for (let sample = 0; sample < frameCount; sample++) {
        const index = (sample * channelCount + channel) * 2;
        const pcm =
          binary.charCodeAt(index) | (binary.charCodeAt(index + 1) << 8);
        const signed = pcm >= 0x8000 ? pcm - 0x10000 : pcm;
        output[sample] = signed / 32768;
      }
    }

    const source = audioContext.createBufferSource();
    const gain = audioContext.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(audioContext.destination);
    const currentTime = audioContext.currentTime;
    const startAt = Math.max(
      currentTime + 0.01,
      nextStartBySid.get(frame.sid) ?? currentTime,
    );
    source.start(startAt);
    nextStartBySid.set(frame.sid, startAt + buffer.duration);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  });

  onCleanup(() => {
    removeListener?.();
    if (isAndroid) {
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    }
    nextStartBySid.clear();
    void audioContext?.close();
  });

  return null;
}
