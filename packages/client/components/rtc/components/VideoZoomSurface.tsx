import { IconButton } from "@revolt/ui/components/design";
import { Symbol } from "@revolt/ui/components/utils/Symbol";
import { JSX, Show, createSignal, onCleanup, onMount } from "solid-js";

type HeldFrame = { source: string; fit: string };

function captureFrame(media: HTMLVideoElement | HTMLImageElement) {
  const isVideo = media instanceof HTMLVideoElement;
  const width = isVideo ? media.videoWidth : media.naturalWidth;
  const height = isVideo ? media.videoHeight : media.naturalHeight;
  if (
    (isVideo && media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) ||
    !width ||
    !height
  ) {
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;

  try {
    context.drawImage(media, 0, 0, width, height);
    return {
      source: canvas.toDataURL("image/jpeg", 0.9),
      fit: getComputedStyle(media).objectFit,
    };
  } catch {
    return;
  }
}

export function VideoZoomSurface(props: {
  children: JSX.Element;
  class?: string;
  style?: JSX.CSSProperties;
  onZoomChange?: (zoomed: boolean) => void;
  preserveFrameOnResize?: boolean;
}) {
  const [scale, setScale] = createSignal(1);
  const [offset, setOffset] = createSignal({ x: 0, y: 0 });
  const [frameHold, setFrameHold] = createSignal<HeldFrame>();
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStartDistance = 0;
  let pinchStartScale = 1;
  let panStart:
    | { x: number; y: number; offsetX: number; offsetY: number }
    | undefined;
  let surface: HTMLDivElement | undefined;
  let animationFrameId: number | undefined;
  let videoFrameCallbackId: number | undefined;

  const clampOffset = (x: number, y: number, zoom: number) => {
    const bounds = surface?.getBoundingClientRect();
    const maxX = ((bounds?.width ?? 0) * (zoom - 1)) / 2;
    const maxY = ((bounds?.height ?? 0) * (zoom - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  const setZoom = (next: number) => {
    const bounded = Math.max(1, Math.min(4, next));
    if (bounded > 1 !== scale() > 1) {
      props.onZoomChange?.(bounded > 1);
    }
    setScale(bounded);
    if (bounded === 1) setOffset({ x: 0, y: 0 });
    else setOffset((current) => clampOffset(current.x, current.y, bounded));
  };

  const toggleZoom = () => setZoom(scale() === 1 ? 2.5 : 1);

  const distance = (points: { x: number; y: number }[]) =>
    Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y);

  const clearFrameHold = () => {
    setFrameHold(undefined);
    videoFrameCallbackId = undefined;
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = undefined;
    }
  };

  const watchForNextFrame = (media: HTMLVideoElement | HTMLImageElement) => {
    if (media instanceof HTMLVideoElement) {
      const supportsVideoFrameCallback =
        typeof (media as unknown as { requestVideoFrameCallback?: unknown })
          .requestVideoFrameCallback === "function";
      if (supportsVideoFrameCallback) {
        videoFrameCallbackId = media.requestVideoFrameCallback(clearFrameHold);
      } else {
        const currentTime = media.currentTime;
        const waitForFrame = () => {
          if (
            media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            media.currentTime !== currentTime
          ) {
            clearFrameHold();
          } else {
            animationFrameId = requestAnimationFrame(waitForFrame);
          }
        };
        animationFrameId = requestAnimationFrame(waitForFrame);
      }
    } else {
      media.addEventListener("load", clearFrameHold, { once: true });
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      pinchStartDistance = distance([...pointers.values()]);
      pinchStartScale = scale();
      panStart = undefined;
    } else if (pointers.size === 1) {
      const current = offset();
      panStart = {
        x: event.clientX,
        y: event.clientY,
        offsetX: current.x,
        offsetY: current.y,
      };
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    event.stopPropagation();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2 && pinchStartDistance > 0) {
      setZoom(
        pinchStartScale *
          (distance([...pointers.values()]) / pinchStartDistance),
      );
    } else if (scale() > 1 && panStart) {
      setOffset(
        clampOffset(
          panStart.offsetX + event.clientX - panStart.x,
          panStart.offsetY + event.clientY - panStart.y,
          scale(),
        ),
      );
    }
  };

  const onPointerEnd = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size === 1) {
      const point = [...pointers.values()][0]!;
      const current = offset();
      panStart = {
        x: point.x,
        y: point.y,
        offsetX: current.x,
        offsetY: current.y,
      };
    } else if (pointers.size === 0) {
      panStart = undefined;
      pinchStartDistance = 0;
    }
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setZoom(scale() * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  const preserveFrameUntilNextFrame = () => {
    if (frameHold()) return;
    const media = surface?.querySelector("video, img");
    if (
      !(media instanceof HTMLVideoElement || media instanceof HTMLImageElement)
    ) {
      return;
    }

    const frame = captureFrame(media);
    if (!frame) return;
    setFrameHold(frame);
    watchForNextFrame(media);
  };

  onMount(() => {
    if (!surface) return;

    const media = surface.querySelector("video, img");
    if (
      frameHold() &&
      (media instanceof HTMLVideoElement || media instanceof HTMLImageElement)
    ) {
      watchForNextFrame(media);
    }

    const observer = new ResizeObserver(() => {
      if (props.preserveFrameOnResize) preserveFrameUntilNextFrame();
      const currentScale = scale();
      setOffset((current) => clampOffset(current.x, current.y, currentScale));
      pointers.clear();
      panStart = undefined;
      pinchStartDistance = 0;
      pinchStartScale = currentScale;
    });
    observer.observe(surface);
    onCleanup(() => {
      observer.disconnect();
      if (
        videoFrameCallbackId !== undefined &&
        surface?.querySelector("video") instanceof HTMLVideoElement
      ) {
        surface
          .querySelector("video")!
          .cancelVideoFrameCallback(videoFrameCallbackId);
      }
      if (animationFrameId !== undefined) {
        cancelAnimationFrame(animationFrameId);
      }
    });
  });

  return (
    <div
      ref={surface}
      class={props.class}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onWheel={onWheel}
      onClick={(event) => {
        if (scale() > 1) event.stopPropagation();
      }}
      style={{
        ...props.style,
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        "touch-action": "none",
        cursor: scale() > 1 ? "grab" : "default",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transform: `translate(${offset().x}px, ${offset().y}px) scale(${scale()})`,
          "transform-origin": "center",
          transition: pointers.size ? "none" : "transform 120ms ease-out",
        }}
      >
        {props.children}
        <Show when={frameHold()}>
          {(frame) => (
            <img
              src={frame().source}
              alt=""
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                "object-fit": frame().fit as JSX.CSSProperties["object-fit"],
                "pointer-events": "none",
                "z-index": 1,
              }}
            />
          )}
        </Show>
      </div>
      <div
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "absolute",
          right: "var(--gap-sm)",
          top: "var(--gap-sm)",
          "z-index": 2,
        }}
      >
        <IconButton
          size="xs"
          variant="standard"
          aria-label={scale() === 1 ? "Zoom in" : "Reset zoom"}
          onPress={() => toggleZoom()}
          style={{ opacity: 0.85 }}
        >
          <Symbol>{scale() === 1 ? "zoom_in" : "zoom_out"}</Symbol>
        </IconButton>
      </div>
    </div>
  );
}
