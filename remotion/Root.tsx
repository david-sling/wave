import { Composition } from "remotion";
import "../app/globals.css";
import {
  DURATION_IN_FRAMES,
  FPS,
  HowItWorksVideo,
  portraitLayout,
  wideLayout,
} from "./how-it-works-video";

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="HowItWorksWide"
        component={HowItWorksVideo}
        durationInFrames={DURATION_IN_FRAMES}
        fps={FPS}
        width={wideLayout.width}
        height={wideLayout.height}
        defaultProps={{ layout: wideLayout }}
      />
      <Composition
        id="HowItWorksPortrait"
        component={HowItWorksVideo}
        durationInFrames={DURATION_IN_FRAMES}
        fps={FPS}
        width={portraitLayout.width}
        height={portraitLayout.height}
        defaultProps={{ layout: portraitLayout }}
      />
    </>
  );
}
