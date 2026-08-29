import React from "react";
import { Composition, registerRoot } from "remotion";
import { HelixComposition, compositionMetadata } from "./Composition.jsx";
import { HelixEditorComposition, editorCompositionMetadata } from "./EditorComposition.jsx";

export function RemotionRoot() {
  return (
    <>
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
      <Composition
        id="HelixEditorReel"
        component={HelixEditorComposition}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ timeline: { fps: 30, width: 1080, height: 1920, duration: 0, tracks: [] } }}
        calculateMetadata={editorCompositionMetadata}
      />
    </>
  );
}

registerRoot(RemotionRoot);
