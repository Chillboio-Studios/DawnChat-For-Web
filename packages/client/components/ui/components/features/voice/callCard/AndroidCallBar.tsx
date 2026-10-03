import { For, Show } from "solid-js";

import { useLingui } from "@lingui/solid/macro";
import { styled } from "styled-system/jsx";

import { useVoice } from "@revolt/rtc";
import { Button, IconButton } from "@revolt/ui/components/design";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

import { VoiceCallCardStatus } from "./VoiceCallCardStatus";

/**
 * Call card for the Android shell, where the call runs natively
 */
export function AndroidCallBar(props: { size: "xs" | "sm" }) {
  const voice = useVoice();
  const { t } = useLingui();

  return (
    <Base>
      <Header>
        <VoiceCallCardStatus pip={props.size === "xs"} />
        <Name>{voice.channel()?.name}</Name>
      </Header>
      <Show when={props.size !== "xs"}>
        <People>
          <For each={voice.participants()}>
            {(p) => (
              <Person speaking={p.speaking}>
                <Show when={!p.micEnabled}>
                  <Symbol size={14}>mic_off</Symbol>
                </Show>
                {p.name}
              </Person>
            )}
          </For>
        </People>
      </Show>
      <Actions>
        <IconButton
          size={props.size}
          variant={voice.microphone() ? "filled" : "tonal"}
          onPress={() => voice.toggleMute()}
          isDisabled={!voice.speakingPermission}
          use:floating={{
            tooltip: {
              placement: "top",
              content: voice.microphone() ? t`Mute` : t`Unmute`,
            },
          }}
        >
          <Show when={voice.microphone()} fallback={<Symbol>mic_off</Symbol>}>
            <Symbol>mic</Symbol>
          </Show>
        </IconButton>
        <IconButton
          size={props.size}
          variant={
            voice.deafen() || !voice.listenPermission ? "tonal" : "filled"
          }
          onPress={() => voice.toggleDeafen()}
          isDisabled={!voice.listenPermission}
          use:floating={{
            tooltip: {
              placement: "top",
              content: voice.deafen() ? t`Undeafen` : t`Deafen`,
            },
          }}
        >
          <Show
            when={voice.deafen() || !voice.listenPermission}
            fallback={<Symbol>headset</Symbol>}
          >
            <Symbol>headset_off</Symbol>
          </Show>
        </IconButton>
        <IconButton
          size={props.size}
          variant={voice.video() ? "filled" : "tonal"}
          onPress={() => voice.toggleCamera()}
          use:floating={{
            tooltip: {
              placement: "top",
              content: voice.video() ? t`Stop camera` : t`Start camera`,
            },
          }}
        >
          <Symbol>camera_video</Symbol>
        </IconButton>
        <IconButton
          size={props.size}
          variant={voice.screenshare() ? "filled" : "tonal"}
          onPress={() => voice.toggleScreenshare()}
          use:floating={{
            tooltip: {
              placement: "top",
              content: voice.screenshare() ? t`Stop sharing` : t`Share screen`,
            },
          }}
        >
          <Show
            when={voice.screenshare()}
            fallback={<Symbol>screen_share</Symbol>}
          >
            <Symbol>stop_screen_share</Symbol>
          </Show>
        </IconButton>
        <IconButton
          size={props.size}
          variant="standard"
          onPress={() => voice.openNativeUI()}
          use:floating={{
            tooltip: {
              placement: "top",
              content: t`Open call view`,
            },
          }}
        >
          <Symbol>open_in_full</Symbol>
        </IconButton>
        <Button
          size={props.size}
          variant="_error"
          onPress={() => voice.disconnect()}
          use:floating={{
            tooltip: {
              placement: "top",
              content: t`End call`,
            },
          }}
        >
          <Symbol>call_end</Symbol>
        </Button>
      </Actions>
    </Base>
  );
}

const Base = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: "var(--gap-md)",
    padding: "var(--gap-md)",
    minHeight: 0,
    height: "100%",
    width: "100%",
    pointerEvents: "all",
  },
});

const Header = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-md)",
    overflow: "hidden",
  },
});

const Name = styled("div", {
  base: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: 600,
  },
});

const People = styled("div", {
  base: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--gap-sm)",
    overflowY: "auto",
  },
});

const Person = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    padding: "var(--gap-sm) var(--gap-md)",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-surface-container)",
    outlineOffset: "1px",
  },
  variants: {
    speaking: {
      true: { outline: "2px solid var(--md-sys-color-primary)" },
    },
  },
});

const Actions = styled("div", {
  base: {
    flexShrink: 0,
    gap: "var(--gap-md)",
    padding: "var(--gap-md)",
    display: "flex",
    flexWrap: "wrap",
    width: "fit-content",
    justifyContent: "center",
    alignSelf: "center",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-surface-container)",
  },
});
