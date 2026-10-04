import {
  Accessor,
  batch,
  createContext,
  createEffect,
  createSignal,
  JSX,
  Show,
  Setter,
  untrack,
  useContext,
} from "solid-js";
import {
  RoomContext,
  TrackReferenceOrPlaceholder,
  useTracks,
} from "solid-livekit-components";

import {
  LocalVideoTrack,
  LocalTrackPublication,
  Room,
  ScreenShareCaptureOptions,
  ScreenSharePresets,
  Track,
  VideoEncoding,
  VideoPresets,
} from "livekit-client";
import { Channel, Client } from "stoat.js";

import { SoundController, useClient, useSound } from "@revolt/client";
import { useInstance } from "@revolt/instance";
import { ModalController, useModals } from "@revolt/modal";
import { useState } from "@revolt/state";
import { userInformation } from "@revolt/markdown/users";
import {
  NoiseSuppresionState,
  ScreenShareQualityName,
  Voice as VoiceSettings,
} from "@revolt/state/stores/Voice";
import { VoiceCallCardContext } from "@revolt/ui/components/features/voice/callCard/VoiceCallCard";

import { Device, useDevice } from "@revolt/common";
import {
  isAndroidShell,
  NativeVoiceParticipant,
  NativeVoiceState,
} from "../native/android";
import { InRoom } from "./components/InRoom";
import { AndroidNativeAudioManager } from "./components/AndroidNativeMedia";
import { RoomAudioManager } from "./components/RoomAudioManager";
import { VoiceProcessor } from "./VoiceProcessor";

type State =
  | "READY"
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING";

export type VoiceLayout = "fullscreen" | "expanded" | "collapsed" | undefined;

type ScreenShareQuality = Required<
  Pick<ScreenShareCaptureOptions, "contentHint" | "resolution">
> & {
  name: ScreenShareQualityName;
  fullName: string;
  encoding: VideoEncoding;
};

class Voice {
  #settings: VoiceSettings;
  #client: Accessor<Client>;

  channel: Accessor<Channel | undefined>;
  #setChannel: Setter<Channel | undefined>;

  room: Accessor<Room | undefined>;
  #setRoom: Setter<Room | undefined>;

  vidTracks: Accessor<TrackReferenceOrPlaceholder[]>;
  androidParticipants: Accessor<NativeVoiceParticipant[]>;
  #setAndroidParticipants: Setter<NativeVoiceParticipant[]>;

  state: Accessor<State>;
  #setState: Setter<State>;

  deafen: Accessor<boolean>;
  microphone: Accessor<boolean>;

  video: Accessor<boolean>;
  #setVideo: Setter<boolean>;

  screenshare: Accessor<boolean>;
  #setScreenshare: Setter<boolean>;

  layout: Accessor<VoiceLayout>;
  #setLayout: Setter<VoiceLayout>;

  focusId: Accessor<string | undefined>;
  #setFocus: Setter<string | undefined>;

  showBar: Accessor<boolean>;
  #setShowBar: Setter<boolean>;

  private sound: SoundController;
  private device: Device;

  private openModal;
  private config;
  private limits;
  private screenShareTracks: Set<string>;
  private screenShareStopGuard = false;
  #androidNativeActive: Accessor<boolean>;
  #setAndroidNativeActive: Setter<boolean>;
  private androidVoiceUnsubscribers: Array<() => void> = [];
  private androidScreenShareTrack?: LocalVideoTrack;
  private androidScreenShareCleanup?: () => void;
  private voiceProcessor?: VoiceProcessor;

  constructor(
    voiceSettings: VoiceSettings,
    modals: ModalController,
    sound: SoundController,
    device: Device,
    client: Accessor<Client>,
  ) {
    this.#settings = voiceSettings;
    this.#client = client;
    this.sound = sound;
    this.device = device;

    const [channel, setChannel] = createSignal<Channel>();
    this.channel = channel;
    this.#setChannel = setChannel;

    const [room, setRoom] = createSignal<Room>();
    this.room = room;
    this.#setRoom = setRoom;

    this.vidTracks = () => [];

    const [androidParticipants, setAndroidParticipants] = createSignal<
      NativeVoiceParticipant[]
    >([]);
    this.androidParticipants = androidParticipants;
    this.#setAndroidParticipants = setAndroidParticipants;

    const [state, setState] = createSignal<State>("READY");
    this.state = state;
    this.#setState = setState;

    const [androidNativeActive, setAndroidNativeActive] = createSignal(false);
    this.#androidNativeActive = androidNativeActive;
    this.#setAndroidNativeActive = setAndroidNativeActive;

    this.deafen = () => voiceSettings.deafen;
    this.microphone = () => voiceSettings.micOn && !voiceSettings.deafen;

    const [video, setVideo] = createSignal(false);
    this.video = video;
    this.#setVideo = setVideo;

    const [screenshare, setScreenshare] = createSignal(false);
    this.screenshare = screenshare;
    this.#setScreenshare = setScreenshare;

    const [layout, setLayout] = createSignal<VoiceLayout>();
    this.layout = layout;
    this.#setLayout = setLayout;

    const [focus, setFocus] = createSignal<string>();
    this.focusId = focus;
    this.#setFocus = setFocus;

    const [showBar, setShowBar] = createSignal(true);
    this.showBar = showBar;
    this.#setShowBar = setShowBar;

    const inst = useInstance();
    this.config = inst.config;
    this.limits = inst.limits;
    this.openModal = modals.openModal;

    this.screenShareTracks = new Set();

    // Setup settings listeners
    this.settingsListeners();
  }

  private probeNode() {
    return Promise.any(
      this.config.features.livekit.nodes.map(async (node) => {
        return fetch(node.public_url.replace("wss", "https")).then(() => {
          return node.name;
        });
      }),
    );
  }

  /** Current state without tracking, for guards */
  #state() {
    return untrack(this.state);
  }

  // Dynamically set echo cancellation and gain control when the settings are changed
  // These functions are needed to maintain reactivity. Don't ask me why but if you make them not functions it breaks.
  private settingsListeners() {
    const getSettings = () => this.#settings;

    const setEchoCancellation = (echoCancellation: boolean) => {
      const track = this.getMicrophoneTrack()?.audioTrack;
      if (track) {
        track.constraints.echoCancellation = echoCancellation;
      }
    };

    const setAutoGainControl = (autoGainControl: boolean) => {
      const track = this.getMicrophoneTrack()?.audioTrack;
      if (track) {
        track.constraints.autoGainControl = autoGainControl;
      }
    };

    const setNoiseSuppression = (noiseSuppression: NoiseSuppresionState) => {
      const track = this.getMicrophoneTrack()?.audioTrack;
      if (track) {
        if (noiseSuppression === "browser") {
          track.constraints.noiseSuppression = true;
          //@ts-expect-error voiceIsolation is not yet standard, but it supported by livekit and most chromium based browsers, including electron.
          track.constraints.voiceIsolation = true;
        } else {
          track.constraints.noiseSuppression = false;
          //@ts-expect-error voiceIsolation is not yet standard, but it supported by livekit and most chromium based browsers, including electron.
          track.constraints.voiceIsolation = false;
        }
      }
    };

    const restartTrack = () => {
      const track = this.getMicrophoneTrack()?.audioTrack;
      if (track) {
        track.restartTrack();
      }
    };

    createEffect(() => {
      setEchoCancellation(getSettings().echoCancellation ?? true);
      setAutoGainControl(getSettings().autoGainControl ?? true);
      setNoiseSuppression(getSettings().noiseSupression ?? "browser");
      if (this.#androidNativeActive()) {
        void window.native?.android?.voice?.updateAudioSettings({
          echoCancellation: getSettings().echoCancellation ?? true,
          autoGainControl: getSettings().autoGainControl ?? true,
          noiseSuppression: getSettings().noiseSupression !== "disabled",
          inputVolume: getSettings().inputVolume,
        });
        void this.updateAndroidOutputRoute();
      } else {
        restartTrack();
      }
    });
  }

  private async updateAndroidOutputRoute() {
    const nativeVoice = window.native?.android?.voice;
    if (!nativeVoice) return;
    const deviceId = this.#settings.preferredAudioOutputDevice;
    const deviceLabel = deviceId
      ? (await navigator.mediaDevices.enumerateDevices().catch(() => []))
          .find((device) => device.deviceId === deviceId)?.label
      : undefined;
    const label = deviceLabel?.toLowerCase() ?? "";
    const route = label.includes("bluetooth")
      ? "bluetooth"
      : label.includes("earpiece")
        ? "earpiece"
        : label.includes("speaker")
          ? "speaker"
          : label.includes("wired") || label.includes("headset")
            ? "wired"
            : "default";
    await nativeVoice.setOutputRoute(route);
  }

  async connect(channel: Channel, auth?: { url: string; token: string }) {
    this.disconnect();

    this.device.setWakeLocked();

    if (isAndroidShell() && window.native.android?.voice) {
      await this.connectAndroidVoice(channel, auth);
      return;
    }

    const room = new Room({
      audioCaptureDefaults: {
        deviceId: this.#settings.preferredAudioInputDevice,
        echoCancellation: this.#settings.echoCancellation,
        noiseSuppression: this.#settings.noiseSupression === "browser",
        autoGainControl: this.#settings.autoGainControl,
        voiceIsolation: this.#settings.noiseSupression === "browser",
      },
      audioOutput: {
        deviceId: this.#settings.preferredAudioOutputDevice,
      },
      videoCaptureDefaults: {
        // TODO: Support higher resolutions based on limits
        resolution: VideoPresets.h720.resolution,
        deviceId: this.device.isMobile
          ? undefined
          : this.#settings.preferredVideoDevice,
      },
      publishDefaults: {
        videoEncoding: VideoPresets.h720.encoding,
        screenShareEncoding: ScreenSharePresets.h720fps30.encoding,
      },
    });

    this.vidTracks = useTracks(
      [
        { source: Track.Source.Camera, withPlaceholder: true },
        { source: Track.Source.ScreenShare, withPlaceholder: false },
      ],
      { room, onlySubscribed: false },
    );

    batch(() => {
      this.#setRoom(room);
      this.#setChannel(channel);
      this.#setState("CONNECTING");
      this.#setVideo(false);
      this.#setScreenshare(false);
    });

    room.addListener("connected", () => {
      this.#setState("CONNECTED");
      if (this.speakingPermission)
        room.localParticipant
          .setMicrophoneEnabled(this.#settings.micOn)
          .then((track) => {
            this.#settings.micOn = track != null;
          });
      for (const p of room.remoteParticipants.values()) {
        const screenShareTrack = p.getTrackPublication(
          Track.Source.ScreenShare,
        );
        if (screenShareTrack) {
          this.screenShareTracks.add(screenShareTrack.trackSid);
        }
      }
      this.sound.playSound("userJoinVoice");
    });

    room.addListener("disconnected", (reason) => {
      this.#setState("DISCONNECTED");
      console.error("[rtc] LiveKit room disconnected", reason);
      if (isAndroidShell() && window.native?.android) {
        void this.stopAndroidScreenShare(room).finally(() => {
          void window.native?.android?.stopScreenShare?.();
          this.#setScreenshare(false);
        });
      }
    });

    room.addListener("localTrackPublished", (pub) => {
      if (pub.audioTrack && pub.audioTrack.source === Track.Source.Microphone) {
        if (!pub.audioTrack.getProcessor()) {
          pub.audioTrack?.setProcessor(
            (this.voiceProcessor = new VoiceProcessor(this.#settings)),
          );
        }
      }
    });

    room.addListener("participantConnected", () => {
      this.sound.playSound("userJoinVoice");
    });

    room.addListener("participantDisconnected", () => {
      this.sound.playSound("userLeaveVoice");
    });

    room.addListener("trackPublished", (pub) => {
      if (pub.source === Track.Source.ScreenShare) {
        pub.once("subscribed", (track) => {
          // Play the sound once playback starts, which might be quite a bit after subscription
          // as it starts paused for the screen share settings modal.
          track.once("videoPlaybackStarted", () => {
            this.sound.playSound("streamStart");
            if (track.sid) {
              this.screenShareTracks.add(track.sid);
            }
          });
        });
      }
    });

    room.addListener("trackUnpublished", (unpub) => {
      if (this.screenShareTracks.has(unpub.trackSid)) {
        this.sound.playSound("streamEnd");
        this.screenShareTracks.delete(unpub.trackSid);
      }
    });

    // Gather latency
    const selected = await this.probeNode();

    if (!auth) {
      auth = await channel.joinCall(selected);
    }

    await room.connect(auth.url, auth.token, {
      autoSubscribe: false,
    });
  }

  private async connectAndroidVoice(
    channel: Channel,
    auth?: { url: string; token: string },
  ) {
    const android = window.native.android;
    const nativeVoice = android?.voice;
    if (!android || !nativeVoice) return;

    batch(() => {
      this.#setRoom(undefined);
      this.#setChannel(channel);
      this.#setState("CONNECTING");
      this.#setVideo(false);
      this.#setScreenshare(false);
      this.#setAndroidParticipants([]);
    });
    this.#setAndroidNativeActive(true);

    this.androidVoiceUnsubscribers.push(
      android.on("voice.state", (payload) => {
        const state = payload as NativeVoiceState;
        console.debug("[rtc] native voice state", {
          state: state.state,
          participants: state.participants?.length ?? 0,
          localTracks: state.localTracks?.map((track) => track.source),
        });
        if (state.state === "disconnected") {
          console.error("[rtc] native LiveKit disconnected", {
            reason: state.reason,
            error: state.error,
          });
        }
        const participants = [...(state.participants ?? [])];
        if (state.localIdentity) {
          const localTracks = state.localTracks ?? [];
          participants.unshift({
            identity: state.localIdentity,
            sid: "local",
            name: "",
            speaking: state.speakers?.includes(state.localIdentity) ?? false,
            microphoneEnabled: localTracks.some(
              (track) => track.source === "microphone" && !track.muted,
            ),
            cameraEnabled: localTracks.some(
              (track) => track.source === "camera" && !track.muted,
            ),
            screenShareEnabled: localTracks.some((track) =>
              track.source.replaceAll("_", "") === "screenshare",
            ),
            tracks: localTracks,
          });
        }

        batch(() => {
          this.#setAndroidParticipants(participants);
          this.#setState(
            state.state === "connected"
              ? "CONNECTED"
              : state.state === "reconnecting"
                ? "RECONNECTING"
                : state.state === "connecting"
                  ? "CONNECTING"
                  : "DISCONNECTED",
          );
          this.#setVideo(
            participants.some((participant) => participant.identity === state.localIdentity && participant.cameraEnabled),
          );
          this.#setScreenshare(
            participants.some((participant) => participant.identity === state.localIdentity && participant.screenShareEnabled),
          );
        });
        const localParticipant = participants.find(
          (participant) => participant.identity === state.localIdentity,
        );
        if (localParticipant) {
          this.#settings.micOn = localParticipant.microphoneEnabled;
        }
      }),
      android.on("voice.error", (payload) => {
        console.error("[rtc] native LiveKit error", payload);
      }),
    );

    try {
      const callPermissions = await nativeVoice.requestCallPermissions({
        microphone: this.speakingPermission && this.#settings.micOn,
        camera: this.limits().video,
      });
      if (!callPermissions.microphone) this.#settings.micOn = false;
      const outputDeviceId = this.#settings.preferredAudioOutputDevice;
      const outputDeviceLabel = outputDeviceId
        ? (await navigator.mediaDevices.enumerateDevices().catch(() => []))
            .find((device) => device.deviceId === outputDeviceId)?.label
        : undefined;
      const inputDeviceId = this.#settings.preferredAudioInputDevice;
      const inputDeviceLabel = inputDeviceId
        ? (await navigator.mediaDevices.enumerateDevices().catch(() => []))
            .find((device) => device.deviceId === inputDeviceId)?.label
        : undefined;
      const routeLabel = (outputDeviceLabel || inputDeviceLabel)?.toLowerCase() ?? "";
      const audioOutputRoute = routeLabel.includes("bluetooth")
        ? "bluetooth"
        : routeLabel.includes("earpiece")
          ? "earpiece"
          : routeLabel.includes("speaker")
            ? "speaker"
            : routeLabel.includes("wired") || routeLabel.includes("headset")
              ? "wired"
              : "default";
      const preferredCamera = this.#settings.preferredVideoDevice;
      const cameraDeviceLabel = preferredCamera
        ? (await navigator.mediaDevices.enumerateDevices().catch(() => []))
            .find((device) => device.deviceId === preferredCamera)?.label
        : undefined;
      const cameraPosition = cameraDeviceLabel?.toLowerCase().includes("back")
        ? "back"
        : "front";
      const videoResolution = this.limits().video_resolution;
      const videoAspectRatio = this.limits().video_aspect_ratio;
      const selected = await this.probeNode();
      if (!auth) auth = await channel.joinCall(selected);
      const connected = await nativeVoice.connect(auth.url, auth.token, {
        micOn: this.speakingPermission && this.#settings.micOn,
        deafen: this.#settings.deafen,
        echoCancellation: this.#settings.echoCancellation,
        noiseSuppression: this.#settings.noiseSupression !== "disabled",
        autoGainControl: this.#settings.autoGainControl,
        inputVolume: this.#settings.inputVolume,
        outputVolume: this.#settings.outputVolume,
        audioOutputRoute,
        cameraPosition,
        videoResolution,
        videoAspectRatio,
        screenShareQuality: this.#settings.screenShareQuality,
        screenShareAudio: this.#settings.screenShareAudio,
      });
      if (!connected) throw new Error("Native LiveKit connection failed");
      this.sound.playSound("userJoinVoice");
    } catch (error) {
      this.#setAndroidNativeActive(false);
      this.androidVoiceUnsubscribers.forEach((unsubscribe) => unsubscribe());
      this.androidVoiceUnsubscribers = [];
      this.#setState("DISCONNECTED");
      this.onErr(error);
    }
  }

  disconnect() {
    this.device.releaseWakeLock();

    if (this.#androidNativeActive()) {
      this.#setAndroidNativeActive(false);
      this.androidVoiceUnsubscribers.forEach((unsubscribe) => unsubscribe());
      this.androidVoiceUnsubscribers = [];
      void window.native?.android?.voice?.disconnect();
      batch(() => {
        this.#setState("READY");
        this.#setRoom(undefined);
        this.#setChannel(undefined);
        this.#setLayout();
        this.#setVideo(false);
        this.#setScreenshare(false);
        this.#setAndroidParticipants([]);
        this.vidTracks = () => [];
      });
      this.sound.playSound("userLeaveVoice");
      return;
    }

    try {
      void this.stopAndroidScreenShare();
      const room = this.room();
      if (!room) return;

      room.removeAllListeners();
      room.disconnect();

      batch(() => {
        this.#setState("READY");
        this.#setRoom();
        this.#setChannel();
        this.#setLayout();
        this.vidTracks = () => [];
      });

      this.screenShareTracks = new Set();

      this.sound.playSound("userLeaveVoice");
    } catch (e) {
      this.onErr(e);
    }
  }

  async toggleDeafen(fromMute?: boolean) {
    try {
      if (this.#androidNativeActive()) {
        const nextDeafened = !this.#settings.deafen;
        if (nextDeafened) {
          await window.native.android?.voice?.setMicrophoneEnabled(false);
        } else if (this.#settings.micOn || fromMute) {
          await window.native.android?.voice?.setMicrophoneEnabled(true);
          this.#settings.micOn = true;
        }
        await window.native.android?.voice?.setDeafened(nextDeafened);
        this.#settings.deafen = nextDeafened;
        if (fromMute) this.#settings.micOn = !nextDeafened;
        this.sound.playSound(nextDeafened ? "deafen" : "undeafen");
        return;
      }

      const room = this.room();
      if (!room) throw "invalid state";
      await room.localParticipant.setMicrophoneEnabled(
        (this.#settings.micOn || !!fromMute) &&
          !room.localParticipant.isMicrophoneEnabled,
      );

      this.#settings.deafen = !this.#settings.deafen;
      if (fromMute) {
        this.#settings.micOn = room.localParticipant.isMicrophoneEnabled;
      }
      if (this.#settings.deafen) {
        this.sound.playSound("deafen");
      } else {
        this.sound.playSound("undeafen");
      }
    } catch (e) {
      this.onErr(e);
    }
  }

  async toggleMute() {
    if (this.#settings.deafen) {
      this.toggleDeafen(true);
      return;
    }

    try {
      if (this.#androidNativeActive()) {
        const enabled = !this.#settings.micOn;
        const updated = await window.native.android?.voice?.setMicrophoneEnabled(enabled);
        if (!updated) return;
        this.#settings.micOn = enabled;
        this.sound.playSound(enabled ? "unmute" : "mute");
        return;
      }

      const room = this.room();
      if (!room) throw "invalid state";
      await room.localParticipant.setMicrophoneEnabled(
        !room.localParticipant.isMicrophoneEnabled,
      );

      this.#settings.micOn = room.localParticipant.isMicrophoneEnabled;

      if (this.#settings.micOn) {
        this.sound.playSound("unmute");
      } else {
        this.sound.playSound("mute");
      }
    } catch (e) {
      this.onErr(e);
    }
  }

  async toggleCamera() {
    try {
      if (this.#androidNativeActive()) {
        const enabled = !this.video();
        const updated = await window.native.android?.voice?.setCameraEnabled(enabled);
        if (!updated) return;
        this.#setVideo(enabled);
        return;
      }

      const room = this.room();
      if (!room) throw "invalid state";
      await room.localParticipant.setCameraEnabled(
        !room.localParticipant.isCameraEnabled,
      );

      this.#setVideo(room.localParticipant.isCameraEnabled);
    } catch (e) {
      this.onErr(e);
    }
  }

  private async stopAndroidScreenShare(room?: Room) {
    const activeRoom = room ?? this.room();
    const track = this.androidScreenShareTrack;

    if (track && activeRoom) {
      try {
        await activeRoom.localParticipant.unpublishTrack(track);
      } catch (error) {
        console.warn("[DawnChatScreenShare] failed to unpublish native screen track", error);
      }
    }

    this.androidScreenShareCleanup?.();
    this.androidScreenShareCleanup = undefined;
    this.androidScreenShareTrack = undefined;
  }

  private async publishAndroidScreenShare(room: Room) {
    if (this.androidScreenShareTrack) {
      return this.androidScreenShareTrack;
    }
    const androidBridge = window.native.android;
    if (!androidBridge) return;

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || !("captureStream" in canvas)) {
      console.warn("[DawnChatScreenShare] canvas capture is unavailable in this browser");
      return;
    }

    const stream = canvas.captureStream(24);
    const [videoTrack] = stream.getVideoTracks();
    if (!videoTrack) {
      console.warn("[DawnChatScreenShare] no native capture video track available");
      return;
    }

    const localTrack = new LocalVideoTrack(videoTrack, undefined, false);
    localTrack.source = Track.Source.ScreenShare;
    localTrack.mediaStreamTrack.contentHint = "motion";

    const removeFrameListener = androidBridge.on("screenCapture.frame", (payload) => {
      const frame = payload as { data?: string; width?: number; height?: number } | undefined;
      const dataUrl = frame?.data;
      if (!dataUrl || !context) return;

      const image = new Image();
      image.onload = () => {
        const width = Number(frame?.width) || canvas.width;
        const height = Number(frame?.height) || canvas.height;
        if (width !== canvas.width || height !== canvas.height) {
          canvas.width = width;
          canvas.height = height;
        }

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      image.src = dataUrl;
    });
    const removeStoppedListener = androidBridge.on("screenCapture.stopped", () => {
      if (this.screenShareStopGuard) return;
      void this.stopAndroidScreenShare(room).finally(() => {
        this.#setScreenshare(false);
        this.sound.playSound("streamEnd");
      });
    });

    this.androidScreenShareTrack = localTrack;
    this.androidScreenShareCleanup = () => {
      removeFrameListener();
      removeStoppedListener();
    };
    try {
      await room.localParticipant.publishTrack(localTrack, {
        source: Track.Source.ScreenShare,
        screenShareEncoding: ScreenSharePresets.h720fps30.encoding,
      });
    } catch (error) {
      await this.stopAndroidScreenShare(room);
      throw error;
    }
    return localTrack;
  }

  /**
   * Get the enabled screen share qualities. "low" will always be enabled.
   * Each screen share quality is checked against the limit if the limit is available on the client.
   *
   * TODO: Translate the fullNames here, I can't figure out how to do it.
   *
   * @param name The name of the screen share quality to get
   * @returns A partial record of ScreenShareQualityName to ScreenShareQuality. Will always contain "low" quality.
   */
  getEnabledScreenShareQualities(): Partial<
    Record<ScreenShareQualityName, ScreenShareQuality>
  > {
    // Always enable low
    const qualities: Partial<
      Record<ScreenShareQualityName, ScreenShareQuality>
    > = {
      low: {
        name: "low",
        resolution: ScreenSharePresets.h720fps30.resolution,
        fullName: `720p 30FPS`,
        contentHint: "motion",
        encoding: ScreenSharePresets.h720fps30.encoding,
      },
    };

    const limit = this.limits().video_resolution;

    // TODO: Add more resolutions to stream from if they're enabled. May tie into premium users in the future?
    if (
      (limit[0] === 0 || limit[0] >= 1920) &&
      (limit[1] === 0 || limit[1] >= 1080)
    ) {
      qualities.high = {
        name: "high",
        resolution: ScreenSharePresets.h1080fps30.resolution,
        fullName: `1080p 30FPS`,
        contentHint: "motion",
        encoding: ScreenSharePresets.h1080fps30.encoding,
      };
      const originalResolution = ScreenSharePresets.original.resolution;
      originalResolution.frameRate = 5;
      originalResolution.aspectRatio = 0;

      const limit = this.limits().video_resolution;
      originalResolution.width = limit[0];
      originalResolution.height = limit[1];
      // If both resolutions are limited, set aspect ratio
      if (originalResolution.height !== 0 && originalResolution.width !== 0) {
        originalResolution.aspectRatio =
          originalResolution.width / originalResolution.height;
      }

      qualities.text = {
        name: "text",
        resolution: originalResolution,
        fullName: `Source 5FPS`,
        contentHint: "text",
        encoding: ScreenSharePresets.original.encoding,
      };
    }

    return qualities;
  }

  async toggleScreenshare() {
    if (this.#androidNativeActive()) {
      if (this.screenShareStopGuard) return;
      this.screenShareStopGuard = true;
      try {
        if (this.screenshare()) {
          const stopped = await window.native.android?.voice?.setScreenShareEnabled(false);
          if (stopped) {
            this.#setScreenshare(false);
            this.sound.playSound("streamEnd");
          }
          return;
        }

        const qualities = this.getEnabledScreenShareQualities();
        const startNativeShare = async (qualityName: ScreenShareQualityName) => {
          const started = await window.native.android?.voice?.setScreenShareEnabled(
            true,
            qualityName,
          );
          if (started) {
            this.#setScreenshare(true);
            this.sound.playSound("streamStart");
          }
        };

        if (this.#settings.screenShareQualityAsk && Object.keys(qualities).length > 1) {
          this.openModal({
            type: "screen_share_settings",
            native: true,
            qualities: Object.keys(qualities).map((key) => ({
              name: key,
              fullName: qualities[key as ScreenShareQualityName]!.fullName,
            })),
            audio: false,
            onCancel: () => {},
            callback: (qualityName) => {
              void startNativeShare(qualityName).catch((error) => this.onErr(error));
            },
          });
        } else {
          const configuredQuality = this.#settings.screenShareQuality;
          const quality = configuredQuality && qualities[configuredQuality] ?
            configuredQuality : "low";
          await startNativeShare(quality);
        }
      } catch (error) {
        this.onErr(error);
      } finally {
        this.screenShareStopGuard = false;
      }
      return;
    }

    const room = this.room();
    if (!room) throw "invalid state";

    if (isAndroidShell() && window.native?.android?.startScreenShare) {
      if (this.screenshare()) {
        if (this.screenShareStopGuard) return;
        this.screenShareStopGuard = true;
        try {
          await this.stopAndroidScreenShare(room);
          if (window.native.android.stopScreenShare) {
            await window.native.android.stopScreenShare();
          }
          this.#setScreenshare(false);
          this.sound.playSound("streamEnd");
        } finally {
          this.screenShareStopGuard = false;
        }
        return;
      }

      this.screenShareStopGuard = true;
      try {
        const started = await window.native.android.startScreenShare({
          audio: false,
        });
        if (started) {
          const published = await this.publishAndroidScreenShare(room);
          if (!published) {
            if (window.native.android.stopScreenShare) {
              await window.native.android.stopScreenShare();
            }
            return;
          }
          this.#setScreenshare(true);
          this.sound.playSound("streamStart");
        }
      } catch (error) {
        await this.stopAndroidScreenShare(room);
        if (window.native.android.stopScreenShare) {
          await window.native.android.stopScreenShare();
        }
        this.onErr(error);
      } finally {
        this.screenShareStopGuard = false;
      }
      return;
    }

    if (this.screenshare()) {
      if (this.screenShareStopGuard) return;
      this.screenShareStopGuard = true;
      try {
        await room.localParticipant.setScreenShareEnabled(false);
        this.#setScreenshare(room.localParticipant.isScreenShareEnabled);
        this.sound.playSound("streamEnd");
      } finally {
        this.screenShareStopGuard = false;
      }
      return;
    } else {
      if (!this.screenShareSupported) return;

      const qualities = this.getEnabledScreenShareQualities();
      let screenPickerQualityName: ScreenShareQualityName | undefined;
      let screenPickerAudio: boolean | undefined;

      // Register the modal on screen picker handler if it exists
      if (window.native && window.native.onceScreenPicker) {
        window.native.onceScreenPicker((sources) => {
          this.openModal({
            type: "screen_share_picker",
            onCancel: () => {
              window.native.screenPickerCallback(-1, false);
            },
            callback: (
              idx: number,
              qualityName: ScreenShareQualityName,
              audio: boolean,
            ) => {
              window.native.screenPickerCallback(idx, audio);
              screenPickerQualityName = qualityName;
              screenPickerAudio = audio;
            },
            sources: sources,
            qualities: Object.keys(qualities).map((k) => {
              const v = qualities[k as ScreenShareQualityName]!;
              return { name: k, fullName: v.fullName };
            }),
          });
        });
      }

      try {
        const chosenQuality =
          this.getEnabledScreenShareQualities()[
            this.#settings.screenShareQuality || "low"
          ];
        const localTrack = await room.localParticipant.setScreenShareEnabled(
          true,
          {
            resolution: chosenQuality?.resolution,
            audio: {
              autoGainControl: false,
              echoCancellation: false,
              noiseSuppression: false,
              voiceIsolation: false,
              restrictOwnAudio: true,
            },
          },
          { screenShareEncoding: chosenQuality?.encoding },
        );

        const screenAudioTrack = room.localParticipant.getTrackPublication(
          Track.Source.ScreenShareAudio,
        );

        this.#setScreenshare(room.localParticipant.isScreenShareEnabled);

        if (localTrack) {
          // This event is only fired if the screen share is ended by closing the window being streamed.
          // This catches the ending and disables screen sharing on our side. If this weren't here,
          // livekit would still share stream audio after closing the window being streamed.
          localTrack.on("ended", () => {
            if (this.screenShareStopGuard) return;
            this.#setScreenshare(false);
            const oldAudioTrack = room.localParticipant.getTrackPublication(
              Track.Source.ScreenShareAudio,
            );
            if (oldAudioTrack && oldAudioTrack.track) {
              room.localParticipant.unpublishTrack(oldAudioTrack.track);
            }
          });

          const callback = async (
            qualityName: ScreenShareQualityName,
            audio: boolean,
          ) => {
            const quality = qualities[qualityName] || qualities.low!;

            if (localTrack.videoTrack) {
              await localTrack.videoTrack.applyScreenShareConstraints(
                {
                  resolution: {
                    frameRate: quality.resolution.frameRate,
                    width: quality.resolution.width,
                    height: quality.resolution.height,
                  },
                  contentHint: quality.contentHint,
                },
                quality.encoding,
              );
              if (!audio && screenAudioTrack?.track) {
                room.localParticipant.unpublishTrack(screenAudioTrack.track);
              }
              this.sound.playSound("streamStart");
            }
          };

          if (screenPickerQualityName) {
            callback(
              screenPickerQualityName || "low",
              screenPickerAudio || false,
            );
          } else if (this.#settings.screenShareQualityAsk) {
            if (Object.keys(qualities).length > 1) {
              localTrack.pauseUpstream();
              screenAudioTrack?.pauseUpstream();
              this.openModal({
                onCancel: async () => {
                  await room.localParticipant.setScreenShareEnabled(false);
                  this.#setScreenshare(
                    room.localParticipant.isScreenShareEnabled,
                  );
                },
                type: "screen_share_settings",
                trackReference: {
                  participant: room.localParticipant,
                  publication: localTrack,
                  source: Track.Source.ScreenShare,
                },
                qualities: Object.keys(qualities).map((k) => {
                  const v = qualities[k as ScreenShareQualityName]!;
                  return { name: k, fullName: v.fullName };
                }),
                audio: !!screenAudioTrack,
                callback: async (qualityName, audio) => {
                  callback(qualityName, audio);
                  localTrack.resumeUpstream();
                  if (audio) {
                    screenAudioTrack?.resumeUpstream();
                  }
                },
              });
            } else {
              callback(
                this.#settings.screenShareQuality || "low",
                this.#settings.screenShareAudio,
              );
            }
          }
        }
      } catch (e) {
        this.onErr(e);
      }
    }
  }

  resetLayout() {
    this.#setLayout();
  }

  toggleLayout(type: VoiceLayout) {
    this.#setLayout((l) => (l === type ? undefined : type));
  }

  trackId(t: TrackReferenceOrPlaceholder) {
    return `${t.source}_${t.participant.sid}`;
  }

  toggleFocus(t?: TrackReferenceOrPlaceholder) {
    const id = t ? this.trackId(t) : undefined;
    this.#setFocus(
      this.focusId() === id || this.vidTracks().length < 2 ? undefined : id,
    );
  }

  toggleNativeFocus(trackSid: string) {
    this.#setFocus((current) => (current === trackSid ? undefined : trackSid));
  }

  isFocus(t: TrackReferenceOrPlaceholder) {
    return this.trackId(t) === this.focusId();
  }

  focusTrack() {
    const id = this.focusId();
    return id
      ? this.vidTracks().find((t) => this.trackId(t) === id)
      : undefined;
  }

  toggleShowBar() {
    this.#setShowBar((s) => !s);
  }

  getConnectedUser(userId: string) {
    return this.room()?.getParticipantByIdentity(userId);
  }

  showCard(channel: Channel) {
    return (
      channel.isVoice &&
      (this.channel()?.id === channel.id ||
        channel.type === "TextChannel" ||
        !!channel.voiceParticipants.size)
    );
  }

  getMicrophoneTrack(): LocalTrackPublication | undefined {
    const track = this.room()?.localParticipant.getTrackPublication(
      Track.Source.Microphone,
    );
    return track;
  }

  get listenPermission() {
    return !!this.channel()?.havePermission("Listen");
  }

  get isAndroidNativeActive() {
    return this.#androidNativeActive();
  }

  get speakingPermission() {
    return !!this.channel()?.havePermission("Speak");
  }

  get screenShareSupported() {
    return (
      typeof navigator.mediaDevices?.getDisplayMedia === "function" ||
      isAndroidShell()
    );
  }

  private onErr(e: unknown) {
    if ((e as Error).name !== "NotAllowedError")
      this.openModal({ type: "error2", error: e });
  }
}

const voiceContext = createContext<Voice>(null as unknown as Voice);

/**
 * Mount global voice context and room audio manager
 */
export function VoiceContext(props: { children: JSX.Element }) {
  const state = useState();
  const modals = useModals();
  const sound = useSound();
  const device = useDevice();
  const client = useClient();
  const voice = new Voice(state.voice, modals, sound, device, client);

  return (
    <voiceContext.Provider value={voice}>
      <RoomContext.Provider value={voice.room}>
        <VoiceCallCardContext>{props.children}</VoiceCallCardContext>
        <AndroidNativeAudioManager />
        <InRoom>
          <Show when={!voice.isAndroidNativeActive}>
            <RoomAudioManager />
          </Show>
        </InRoom>
      </RoomContext.Provider>
    </voiceContext.Provider>
  );
}

export const useVoice = () => useContext(voiceContext);
