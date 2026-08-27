import React from "react";
import { Composition } from "remotion";
import { HelixComposition, compositionMetadata } from "./Composition.jsx";

export function RemotionRoot() {
  return (
    <Composition
      id="HelixReel"
      component={HelixComposition}
      durationInFrames={1}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ scenes: [] }}
      calculateMetadata={compositionMetadata}
    />
  );
}
