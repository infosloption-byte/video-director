/** One source of truth for storyboard render narration availability.
 * Render requires playable stored audio, not optional word timing metadata.
 */
export async function inspectNarration(projectId, inputScenes, fileExists) {
  const scenes = await Promise.all(inputScenes.map(async (scene) => {
    const hasAudioUrl = Boolean(scene.audioUrl);
    const fileAvailable = hasAudioUrl ? Boolean(await fileExists(projectId, scene.id)) : false;
    const ready = hasAudioUrl && fileAvailable;
    const timestampsAvailable = Array.isArray(scene.wordTimestamps) && scene.wordTimestamps.length > 0;
    return {
      sceneId: scene.id,
      sceneOrder: Number(scene.sceneOrder),
      ready,
      reason: ready ? null : hasAudioUrl ? "audio_file_missing" : "audio_not_generated",
      hasWordTimestamps: timestampsAvailable,
    };
  }));
  const readyScenes = scenes.filter((scene) => scene.ready).length;
  return {
    projectId,
    ready: scenes.length > 0 && readyScenes === scenes.length,
    totalScenes: scenes.length,
    readyScenes,
    missingScenes: scenes.filter((scene) => !scene.ready).map((scene) => scene.sceneOrder),
    scenes,
  };
}
