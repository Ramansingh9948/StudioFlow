/**
 * StudioFlow — Recorder Engine
 * Shared MediaRecorder wrapper for both teaching and storytelling modes.
 * Handles: stream management, recording, pausing, saving.
 */

window.Recorder = (() => {
  let mediaRecorder = null;
  let recordedChunks = [];
  let stream = null;

  // Determine best supported MIME type
  function getSupportedMimeType() {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return 'video/webm';
  }

  // Get video constraints based on quality setting
  function getVideoConstraints() {
    const q = StudioFlow.settings.quality;
    const fps = StudioFlow.settings.fps;
    const presets = {
      high:   { width: 1920, height: 1080 },
      medium: { width: 1280, height: 720 },
      low:    { width: 854,  height: 480 },
    };
    const { width, height } = presets[q] || presets.medium;
    return { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: fps } };
  }

  /**
   * Get a screen capture stream from a desktopCapturer source ID
   */
  async function getScreenStream(sourceId, withAudio = false) {
    const constraints = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth: 1920,
          maxHeight: 1080,
        },
      },
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  /**
   * Get webcam/mic stream
   */
  async function getCameraStream(videoOn = true, audioOn = true) {
    return navigator.mediaDevices.getUserMedia({
      video: videoOn ? getVideoConstraints() : false,
      audio: audioOn,
    });
  }

  /**
   * Start recording from a given stream (canvas or camera).
   * @param {MediaStream} recordStream — The stream to record
   * @param {Function} onDataAvailable — Callback with each chunk
   */
  function start(recordStream, onDataAvailable) {
    stream = recordStream;
    recordedChunks = [];

    const mimeType = getSupportedMimeType();

    mediaRecorder = new MediaRecorder(recordStream, {
      mimeType,
      videoBitsPerSecond: getVideoBitrate(),
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
        if (onDataAvailable) onDataAvailable(e.data);
      }
    };

    mediaRecorder.start(1000); // collect in 1s chunks
    return mimeType;
  }

  function pause() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.pause();
    }
  }

  function resume() {
    if (mediaRecorder && mediaRecorder.state === 'paused') {
      mediaRecorder.resume();
    }
  }

  function stop() {
    return new Promise((resolve) => {
      if (!mediaRecorder) return resolve([]);

      mediaRecorder.onstop = () => resolve(recordedChunks);
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      } else {
        resolve(recordedChunks);
      }
    });
  }

  function stopAllTracks() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }

  function getState() {
    return mediaRecorder ? mediaRecorder.state : 'inactive';
  }

  function getVideoBitrate() {
    const quality = StudioFlow.settings.quality;
    return { high: 8000000, medium: 4000000, low: 1500000 }[quality] || 4000000;
  }

  return {
    getScreenStream,
    getCameraStream,
    start,
    pause,
    resume,
    stop,
    stopAllTracks,
    getState,
    getSupportedMimeType,
  };
})();
