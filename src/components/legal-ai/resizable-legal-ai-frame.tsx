"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Expand, Grip, Minimize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 640;
const MIN_HEIGHT = 480;
const DEFAULT_WIDTH = 1100;
const DEFAULT_HEIGHT = 760;
const VIEWPORT_GUTTER = 32;

export function clampChatDimension(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(Math.max(value, min), max);
}

export function ResizableLegalAiFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  });
  const [fullscreen, setFullscreen] = useState(false);

  const resize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.innerWidth < 768 || fullscreen) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const start = size;
    event.currentTarget.setPointerCapture(event.pointerId);

    const onMove = (move: PointerEvent) => {
      setSize({
        width: clampChatDimension(
          start.width + move.clientX - startX,
          MIN_WIDTH,
          window.innerWidth - VIEWPORT_GUTTER,
        ),
        height: clampChatDimension(
          start.height + move.clientY - startY,
          MIN_HEIGHT,
          window.innerHeight - VIEWPORT_GUTTER,
        ),
      });
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
  }, [fullscreen, size]);

  const toggleFullscreen = useCallback(async () => {
    const element = frameRef.current;
    if (!element) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await element.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const syncFullscreen = () => {
      setFullscreen(document.fullscreenElement === frameRef.current);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  return (
    <div
      ref={frameRef}
      className={cn(
        "relative mx-auto h-full w-full overflow-hidden bg-[#FAF9F7] md:rounded-xl md:border md:border-[#0B1F3A]/10 md:shadow-xl",
        fullscreen && "h-svh w-svw max-w-none rounded-none border-0",
        className,
      )}
      style={
        fullscreen
          ? undefined
          : {
              width: `min(100%, ${size.width}px)`,
              height: `min(100svh, ${size.height}px)`,
            }
      }
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-2 right-2 z-20 hidden bg-white/90 shadow-sm md:inline-flex"
        aria-label={fullscreen ? "Бүтэн дэлгэцээс гарах" : "Бүтэн дэлгэцээр нээх"}
        onClick={() => void toggleFullscreen()}
      >
        {fullscreen ? <Minimize2 className="size-4" /> : <Expand className="size-4" />}
      </Button>
      {children}
      <div
        role="separator"
        aria-label="Чатын өргөн ба өндрийг өөрчлөх"
        aria-orientation="horizontal"
        onPointerDown={resize}
        data-testid="legal-ai-resize-handle"
        className="absolute right-2 bottom-2 z-30 hidden size-9 cursor-nwse-resize touch-none items-end justify-end rounded-md border border-[#0B1F3A]/15 bg-white/90 p-1 text-[#0B1F3A] shadow-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A7A72]/50 md:flex"
      >
        <Grip className="size-4 rotate-45" aria-hidden />
      </div>
    </div>
  );
}
