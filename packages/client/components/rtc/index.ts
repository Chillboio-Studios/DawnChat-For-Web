import { getVirtmic } from "./virtualMic";
import { isMobileBrowser } from "@livekit/components-core";

export { useVoice, VoiceContext } from "./state";
export type { AndroidVoiceParticipant } from "../native/android";

export { InRoom } from "./components/InRoom";
export { RoomAudioManager } from "./components/RoomAudioManager";
export { stoatSinkName } from "./virtualMic";

const mediaDevices = navigator.mediaDevices;
const originalMediaCall = mediaDevices?.getDisplayMedia;

if (mediaDevices && originalMediaCall) {
  mediaDevices.getDisplayMedia = async function (opts) {
    // Mobile browsers expose different display-capture constraints; keep their defaults.
    if (
      !isMobileBrowser() &&
      opts &&
      opts.video &&
      typeof opts.video === "object"
    ) {
      opts.video = {
        ...opts.video,
        frameRate: { ideal: 5, max: 5 },
        width: { ideal: 640, max: 640 },
        height: { ideal: 480, max: 480 },
      };
    }

    const stream: MediaStream = await originalMediaCall.call(this, opts);

    if (opts && opts.audio && window.native?.isWayland?.()) {
      const id = await getVirtmic();

      console.debug("Virt mic acquired:", id);

      if (id) {
        const audio = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: {
              exact: id,
            },
            autoGainControl: false,
            echoCancellation: false,
            noiseSuppression: false,
            channelCount: 2,
            sampleRate: 48000,
            sampleSize: 16,
          },
        });

        stream.getAudioTracks().forEach((t) => stream.removeTrack(t));
        stream.addTrack(audio.getAudioTracks()[0]);
      }
    }

    return stream;
  };
}
