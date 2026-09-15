import { Composition } from "remotion";
import "../app/globals.css";
import { DURATION_IN_FRAMES, FPS, HowItWorksVideo } from "./how-it-works-video";

export function RemotionRoot() {
  return (
    <Composition
      id="HowItWorksWide"
      component={HowItWorksVideo}
      durationInFrames={DURATION_IN_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
}
