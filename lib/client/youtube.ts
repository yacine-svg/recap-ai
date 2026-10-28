"use client";

/* Minimal typings + loader for the YouTube IFrame Player API. */

export type YTPlayer = {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  getDuration(): number;
  getCurrentTime(): number;
  getVideoData(): { title?: string };
  destroy(): void;
};

type YTNamespace = {
  Player: new (
    el: HTMLElement | string,
    opts: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, number | string>;
      events?: { onReady?: (e: { target: YTPlayer }) => void; onError?: (e: { data: number }) => void };
    },
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => reject(new Error("Could not load the YouTube player."));
    document.head.appendChild(s);
  });
  return loading;
}

/** Reads a public video's duration and title with an invisible player. */
export async function youtubeInfo(videoId: string): Promise<{ duration: number; title: string }> {
  const YT = await loadYouTubeApi();
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-9999px;top:0;width:200px;height:120px";
  const inner = document.createElement("div");
  host.appendChild(inner);
  document.body.appendChild(host);
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("YouTube did not answer. Check the link.")), 15000);
      const player = new YT.Player(inner, {
        videoId,
        events: {
          onReady: (e) => {
            // duration can be 0 for a moment right after onReady
            let tries = 0;
            const poll = () => {
              const d = e.target.getDuration();
              if (d > 0 || tries++ > 20) {
                clearTimeout(timer);
                const title = e.target.getVideoData()?.title ?? "";
                player.destroy();
                if (d > 0) resolve({ duration: d, title });
                else reject(new Error("Could not read this video's duration (live streams are not supported)."));
              } else setTimeout(poll, 250);
            };
            poll();
          },
          onError: () => {
            clearTimeout(timer);
            reject(new Error("This video can't be played (private, removed or embedding disabled)."));
          },
        },
      });
    });
  } finally {
    host.remove();
  }
}
