"use client";

import { useEffect, useRef } from "react";

const videoSource = "https://sourceasia.co.in/SouceAsia-vedio.mp4";

interface HeroVideoProps {
  poster: string;
}

export default function HeroVideo({ poster }: HeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const connection = (
      navigator as Navigator & {
        connection?: { effectiveType?: string; saveData?: boolean };
      }
    ).connection;

    if (
      !video ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      connection?.saveData ||
      connection?.effectiveType === "2g"
    ) {
      return;
    }

    const loadVideo = () => {
      if (!video.src) {
        video.src = videoSource;
        video.load();
      }

      void video.play().catch(() => undefined);
    };

    const bounds = video.getBoundingClientRect();
    const isNearViewport = bounds.top < window.innerHeight + 240 && bounds.bottom > -240;
    if (isNearViewport) {
      loadVideo();
      return;
    }

    if (!("IntersectionObserver" in window)) {
      loadVideo();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadVideo();
        } else {
          video.pause();
        }
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(video);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <video
      ref={videoRef}
      className="landing-hero__video"
      autoPlay
      loop
      muted
      playsInline
      preload="none"
      poster={poster}
      aria-hidden="true"
      tabIndex={-1}
      onError={(event) => {
        event.currentTarget.hidden = true;
      }}
    />
  );
}
