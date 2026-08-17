"use client";

import DotLottieFullScreenLoader from "@/components/DotLottieFullScreenLoader";

export default function FullScreenLoader({ label = "Loading..." }) {
  return <DotLottieFullScreenLoader label={label} />;
}
