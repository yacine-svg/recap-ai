"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { loadYouTubeApi, type YTPlayer } from "@/lib/client/youtube";
import { youtubeId } from "@/lib/pipeline/text";

export type PlayerHandle = { seek: (sec: number) => void };

/**
 * YouTube recaps embed the video. Uploaded videos are never stored, so the
 * viewer can re-attach the file from their device to make timestamps playable.
 */
const Player = forwardRef<PlayerHandle, { sourceType: "upload" | "youtube"; sourceUrl: string | null }>(function Player(
  { sourceType, sourceUrl },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const yt = useRef<YTPlayer | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [isAudio, setIsAudio] = useState(false);
  const videoId = sourceType === "youtube" && sourceUrl ? youtubeId(sourceUrl) : null;

  useEffect(() => {
    if (!videoId || !host.current) return;
    let cancelled = false;
    const el = document.createElement("div");
    host.current.appendChild(el);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        yt.current = new YT.Player(el, { videoId, width: "100%", height: "100%", playerVars: { rel: 0, modestbranding: 1 } });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      yt.current?.destroy();
      yt.current = null;
      el.remove();
    };
  }, [videoId]);

  useEffect(() => () => {
    if (localUrl) URL.revokeObjectURL(localUrl);
  }, [localUrl]);

  useImperativeHandle(ref, () => ({
    seek(sec: number) {
      if (yt.current) {
        yt.current.seekTo(sec, true);
        yt.current.playVideo();
      } else if (video.current) {
        video.current.currentTime = sec;
        void video.current.play();
      }
      host.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
  }));

  if (videoId) return <div className="player" ref={host} />;

  return (
    <div ref={host}>
      {localUrl ? (
        <video ref={video} src={localUrl} controls className={isAudio ? "" : "player"} style={{ width: "100%" }} />
      ) : (
        <div className="panel small">
          <p style={{ marginTop: 0 }}>Your video stayed on your device. Attach it again to jump to any timestamp:</p>
          <input
            type="file"
            accept="video/*,audio/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setIsAudio(f.type.startsWith("audio"));
              setLocalUrl(URL.createObjectURL(f));
            }}
          />
        </div>
      )}
    </div>
  );
});

export default Player;
