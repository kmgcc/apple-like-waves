import {
  createSpectrumAnalyzer,
  DEFAULT_TUNING_PROFILE,
  recommendedBandCount,
  SpectrumAnalyzer,
} from "@alwave/core";
import {
  AlwaveCanvasRenderer,
  WebAudioBridge,
} from "@alwave/canvas";

// --- State Variables ---
type VisualizerMode = "tuned" | "raw" | "compare";
type AudioSourceType = "preset" | "file" | "mic";

let currentMode: VisualizerMode = "tuned";
let currentSource: AudioSourceType = "preset";
let bandCount = 6;
let autoWidth = false;
let reactivity = 1.0;
let noiseGateScale = 1.0;
let springDuration = 0.325;
let springDamping = 0.83;
let pauseDuration = 0.6;
let pauseDamping = 1.0;
let capsuleColor = "#e6c450"; // AURORA - The Sun cover gold-yellow
let isSimulatingPause = false;
let localFileUrl: string | null = null;

// Audio Pipeline References
let audioCtx: AudioContext | null = null;
let audioBridge: WebAudioBridge | null = null;
let mediaElementSource: MediaElementAudioSourceNode | null = null;
let micStream: MediaStream | null = null;
let micSourceNode: MediaStreamAudioSourceNode | null = null;
let rawFreqData: Uint8Array<ArrayBuffer> | null = null;

// Core Analyzer & Canvas Renderers
let analyzer: SpectrumAnalyzer | null = null;
let rendererTuned: AlwaveCanvasRenderer | null = null;

// Base URL for assets
const demoTrackUrl = `${import.meta.env.BASE_URL}demo-track.m4a`;

// DOM Elements
const audioElement = document.getElementById("audio-element") as HTMLAudioElement;
const canvasTuned = document.getElementById("canvas-tuned") as HTMLCanvasElement;
const canvasRaw = document.getElementById("canvas-raw") as HTMLCanvasElement;
const panelTuned = document.getElementById("panel-tuned") as HTMLElement;
const panelRaw = document.getElementById("panel-raw") as HTMLElement;
const visualizerWrapper = document.getElementById("visualizer-wrapper") as HTMLElement;

// Topbar & HUD Elements
const modeTunedBtn = document.getElementById("mode-tuned") as HTMLButtonElement;
const modeRawBtn = document.getElementById("mode-raw") as HTMLButtonElement;
const modeCompareBtn = document.getElementById("mode-compare") as HTMLButtonElement;
const statusDot = document.getElementById("status-dot") as HTMLElement;
const statusText = document.getElementById("status-text") as HTMLElement;
const hudBands = document.getElementById("hud-bands") as HTMLElement;
const hudFps = document.getElementById("hud-fps") as HTMLElement;
const hudRate = document.getElementById("hud-rate") as HTMLElement;

// Source Tab Elements
const tabPreset = document.getElementById("tab-preset") as HTMLButtonElement;
const tabFile = document.getElementById("tab-file") as HTMLButtonElement;
const tabMic = document.getElementById("tab-mic") as HTMLButtonElement;
const viewPreset = document.getElementById("view-preset") as HTMLElement;
const viewFile = document.getElementById("view-file") as HTMLElement;
const viewMic = document.getElementById("view-mic") as HTMLElement;

// Preset Player Elements
const playPauseBtn = document.getElementById("play-pause-btn") as HTMLButtonElement;
const currentTimeLabel = document.getElementById("current-time") as HTMLElement;
const totalTimeLabel = document.getElementById("total-time") as HTMLElement;
const progressBarWrapper = document.getElementById("progress-bar-wrapper") as HTMLElement;
const progressBarFill = document.getElementById("progress-bar-fill") as HTMLElement;

// File Upload Elements
const dropzone = document.getElementById("dropzone") as HTMLElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const filePlayerRow = document.getElementById("file-player-row") as HTMLElement;
const filePlayPauseBtn = document.getElementById("file-play-pause-btn") as HTMLButtonElement;
const fileChangeBtn = document.getElementById("file-change-btn") as HTMLButtonElement;
const localFileTitle = document.getElementById("local-file-title") as HTMLElement;
const localFileDesc = document.getElementById("local-file-desc") as HTMLElement;
const fileProgressContainer = document.getElementById("file-progress-container") as HTMLElement;
const fileCurrentTime = document.getElementById("file-current-time") as HTMLElement;
const fileTotalTime = document.getElementById("file-total-time") as HTMLElement;
const fileProgressBarWrapper = document.getElementById("file-progress-bar-wrapper") as HTMLElement;
const fileProgressBarFill = document.getElementById("file-progress-bar-fill") as HTMLElement;

// Microphone Elements
const micToggleBtn = document.getElementById("mic-toggle-btn") as HTMLButtonElement;

// Knobs & Controls Elements
const sliderBands = document.getElementById("slider-bands") as HTMLInputElement;
const bandCountVal = document.getElementById("band-count-val") as HTMLElement;
const btnAutoWidth = document.getElementById("btn-auto-width") as HTMLButtonElement;
const btnTestCollapse = document.getElementById("btn-test-collapse") as HTMLButtonElement;
const btnResetKnobs = document.getElementById("btn-reset-knobs") as HTMLButtonElement;

// Accordion & Sliders
const accordionToggle = document.getElementById("accordion-toggle") as HTMLElement;
const accordionStatus = document.getElementById("accordion-status") as HTMLElement;
const accordionBody = document.getElementById("accordion-body") as HTMLElement;
const sliderReactivity = document.getElementById("slider-reactivity") as HTMLInputElement;
const reactivityVal = document.getElementById("reactivity-val") as HTMLElement;
const sliderNoiseGate = document.getElementById("slider-noisegate") as HTMLInputElement;
const noiseGateVal = document.getElementById("noisegate-val") as HTMLElement;
const sliderSpringDuration = document.getElementById("slider-spring-duration") as HTMLInputElement;
const springDurationVal = document.getElementById("spring-duration-val") as HTMLElement;
const sliderSpringDamping = document.getElementById("slider-spring-damping") as HTMLInputElement;
const springDampingVal = document.getElementById("spring-damping-val") as HTMLElement;
const colorSwatches = document.querySelectorAll(".color-swatch");

// Theme Toggle
const themeToggleBtn = document.getElementById("theme-toggle-btn") as HTMLButtonElement;

// --- Helper Functions ---

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function ensureAudioPipeline(): WebAudioBridge {
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
    hudRate.textContent = `${(audioCtx.sampleRate / 1000).toFixed(1)} kHz`;
  }

  if (!audioBridge) {
    audioBridge = new WebAudioBridge({ audioContext: audioCtx, fftSize: 2048 });
    rawFreqData = new Uint8Array(new ArrayBuffer(audioBridge.analyserNode.frequencyBinCount));
  }

  if (!mediaElementSource && audioElement) {
    mediaElementSource = audioCtx.createMediaElementSource(audioElement);
    mediaElementSource.connect(audioBridge.analyserNode);
    audioBridge.analyserNode.connect(audioCtx.destination);
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  return audioBridge;
}

function initAnalyzerAndRenderer() {
  const sampleRate = audioCtx ? audioCtx.sampleRate : 48000.0;

  analyzer = createSpectrumAnalyzer({
    bandCount,
    sampleRate,
    tuningProfile: DEFAULT_TUNING_PROFILE,
    reactivity,
    noiseGateScale,
  });

  rendererTuned = new AlwaveCanvasRenderer(canvasTuned, {
    bandCount,
    color: capsuleColor,
    springDuration,
    springDamping,
    pauseDuration,
    pauseDamping,
  });

  hudBands.textContent = `${bandCount} bands`;
  bandCountVal.textContent = bandCount.toString();
  sliderBands.value = bandCount.toString();
}

function updateVisualizerLayout() {
  if (currentMode === "tuned") {
    panelTuned.style.display = "flex";
    panelRaw.style.display = "none";
  } else if (currentMode === "raw") {
    panelTuned.style.display = "none";
    panelRaw.style.display = "flex";
  } else {
    panelTuned.style.display = "flex";
    panelRaw.style.display = "flex";
  }

  if (rendererTuned) {
    rendererTuned.resize();
  }
  resizeRawCanvas();

  if (autoWidth) {
    applyAutoWidth();
  }
}

function resizeRawCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvasRaw.clientWidth || 300;
  const h = canvasRaw.clientHeight || 150;
  canvasRaw.width = Math.round(w * dpr);
  canvasRaw.height = Math.round(h * dpr);
}

function applyAutoWidth() {
  const containerWidth = visualizerWrapper.clientWidth;
  const targetWidth = currentMode === "compare" ? containerWidth * 0.5 : containerWidth;
  const recommended = recommendedBandCount(targetWidth);
  const clamped = Math.min(36, Math.max(6, recommended));

  if (clamped !== bandCount) {
    bandCount = clamped;
    bandCountVal.textContent = bandCount.toString();
    sliderBands.value = bandCount.toString();
    hudBands.textContent = `${bandCount} bands`;

    if (analyzer) {
      analyzer = createSpectrumAnalyzer({
        bandCount,
        sampleRate: audioCtx?.sampleRate ?? 48000,
        tuningProfile: DEFAULT_TUNING_PROFILE,
        reactivity,
        noiseGateScale,
      });
    }
    if (rendererTuned) {
      rendererTuned.setBandCount(bandCount);
    }
  }
}

// --- Audio Source Management ---

function isAudioActive(): boolean {
  if (currentSource === "mic") {
    return micStream !== null;
  }
  return !audioElement.paused && !audioElement.ended;
}

function updatePlaybackUI(playing: boolean) {
  if (playing) {
    playPauseBtn.textContent = "Pause";
    filePlayPauseBtn.textContent = "Pause";
    statusDot.classList.add("active");
    statusText.textContent = currentSource === "mic" ? "Mic Active" : "Playing";
  } else {
    playPauseBtn.textContent = "Play";
    filePlayPauseBtn.textContent = "Play";
    statusDot.classList.remove("active");
    statusText.textContent = "Idle";
  }
}

async function startMicrophone() {
  try {
    ensureAudioPipeline();
    if (!audioCtx || !audioBridge) return;

    audioElement.pause();

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });

    micSourceNode = audioCtx.createMediaStreamSource(micStream);
    micSourceNode.connect(audioBridge.analyserNode);

    micToggleBtn.textContent = "Mute Mic";
    micToggleBtn.classList.remove("btn-primary");
    micToggleBtn.classList.add("btn-secondary", "active");

    updatePlaybackUI(true);
  } catch (err) {
    console.error("Microphone access failed:", err);
    alert("Could not access microphone: " + (err as Error).message);
  }
}

function stopMicrophone() {
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }
  if (micSourceNode) {
    micSourceNode.disconnect();
    micSourceNode = null;
  }

  micToggleBtn.textContent = "Enable Mic";
  micToggleBtn.classList.remove("btn-secondary", "active");
  micToggleBtn.classList.add("btn-primary");

  updatePlaybackUI(false);
}

function togglePlayPause() {
  ensureAudioPipeline();
  if (currentSource === "mic") {
    stopMicrophone();
    return;
  }

  if (!audioElement.src || audioElement.src === "" || audioElement.src.endsWith("/")) {
    audioElement.src = demoTrackUrl;
  }

  if (audioElement.paused) {
    audioElement.play().then(() => updatePlaybackUI(true)).catch(console.error);
  } else {
    audioElement.pause();
    updatePlaybackUI(false);
  }
}

// --- Render Loop & Animation Frame ---

let lastTimestamp = performance.now();
let frameCount = 0;
let lastFpsUpdate = performance.now();

function renderRawFFT(ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) {
  if (!audioBridge || !rawFreqData) return;

  audioBridge.analyserNode.getByteFrequencyData(rawFreqData);

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const numBars = bandCount;
  const padding = 20;
  const availWidth = width - padding * 2;
  const barSpacing = 3;
  const barWidth = Math.max(2, (availWidth - (numBars - 1) * barSpacing) / numBars);

  const binStep = Math.floor(rawFreqData.length / (numBars * 2));

  for (let i = 0; i < numBars; i++) {
    const binIdx = Math.min(rawFreqData.length - 1, i * binStep + 1);
    const rawVal = rawFreqData[binIdx] / 255.0;
    const barHeight = Math.max(4, rawVal * (height * 0.85));
    const x = padding + i * (barWidth + barSpacing);
    const y = (height - barHeight) * 0.5;

    ctx.fillStyle = currentMode === "compare" ? "rgba(239, 68, 68, 0.85)" : capsuleColor;
    ctx.fillRect(x, y, barWidth, barHeight);
  }

  ctx.restore();
}

function animationLoop(timestamp: number) {
  requestAnimationFrame(animationLoop);

  const rawDt = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  const dt = Math.max(0.001, Math.min(1.0 / 30.0, rawDt));

  frameCount++;
  if (timestamp - lastFpsUpdate >= 500) {
    const fps = Math.round((frameCount * 1000) / (timestamp - lastFpsUpdate));
    hudFps.textContent = `${fps} fps`;
    frameCount = 0;
    lastFpsUpdate = timestamp;
  }

  const active = isAudioActive() && !isSimulatingPause;

  if (audioBridge && analyzer && rendererTuned) {
    const pcm = audioBridge.readTimeDomainSamples();
    analyzer.pushSamples(pcm);
    const tunedTargets = analyzer.step(dt);
    rendererTuned.render(tunedTargets, dt, active);
  }

  if (currentMode !== "tuned") {
    const ctxRaw = canvasRaw.getContext("2d");
    if (ctxRaw) {
      const dpr = window.devicePixelRatio || 1;
      const w = canvasRaw.clientWidth || 300;
      const h = canvasRaw.clientHeight || 150;
      renderRawFFT(ctxRaw, w, h, dpr);
    }
  }
}

// --- Setup Event Listeners ---

function setupEventListeners() {
  // Mode switcher
  const modeButtons = [
    { btn: modeTunedBtn, mode: "tuned" as VisualizerMode },
    { btn: modeRawBtn, mode: "raw" as VisualizerMode },
    { btn: modeCompareBtn, mode: "compare" as VisualizerMode },
  ];

  modeButtons.forEach(({ btn, mode }) => {
    btn.addEventListener("click", () => {
      modeButtons.forEach((b) => b.btn.classList.remove("active"));
      btn.classList.add("active");
      currentMode = mode;
      updateVisualizerLayout();
    });
  });

  // Source tabs
  const tabs = [
    { btn: tabPreset, view: viewPreset, type: "preset" as AudioSourceType },
    { btn: tabFile, view: viewFile, type: "file" as AudioSourceType },
    { btn: tabMic, view: viewMic, type: "mic" as AudioSourceType },
  ];

  tabs.forEach(({ btn, view, type }) => {
    btn.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.btn.classList.remove("active");
        t.view.style.display = "none";
      });
      btn.classList.add("active");
      view.style.display = "flex";

      if (currentSource === "mic" && type !== "mic") {
        stopMicrophone();
      }

      currentSource = type;
      if (type === "preset") {
        if (audioElement.src !== demoTrackUrl) {
          audioElement.src = demoTrackUrl;
        }
      } else if (type === "file") {
        if (localFileUrl && audioElement.src !== localFileUrl) {
          audioElement.src = localFileUrl;
        }
      }
    });
  });

  // Play/pause controls
  playPauseBtn.addEventListener("click", togglePlayPause);
  filePlayPauseBtn.addEventListener("click", togglePlayPause);

  // Audio progress and scrubber synchronization for both preset and local file views
  audioElement.addEventListener("timeupdate", () => {
    if (!isNaN(audioElement.duration) && audioElement.duration > 0) {
      const pct = (audioElement.currentTime / audioElement.duration) * 100;
      const curFormatted = formatTime(audioElement.currentTime);
      const totalFormatted = formatTime(audioElement.duration);

      progressBarFill.style.width = `${pct}%`;
      currentTimeLabel.textContent = curFormatted;
      totalTimeLabel.textContent = totalFormatted;

      if (fileProgressBarFill) {
        fileProgressBarFill.style.width = `${pct}%`;
        fileCurrentTime.textContent = curFormatted;
        fileTotalTime.textContent = totalFormatted;
      }
    }
  });

  audioElement.addEventListener("loadedmetadata", () => {
    const formatted = formatTime(audioElement.duration);
    totalTimeLabel.textContent = formatted;
    if (fileTotalTime) {
      fileTotalTime.textContent = formatted;
    }
  });

  audioElement.addEventListener("ended", () => {
    updatePlaybackUI(false);
  });

  const handleSeek = (wrapper: HTMLElement, e: MouseEvent) => {
    if (!isNaN(audioElement.duration) && audioElement.duration > 0) {
      const rect = wrapper.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      audioElement.currentTime = pct * audioElement.duration;
    }
  };

  progressBarWrapper.addEventListener("click", (e) => handleSeek(progressBarWrapper, e));
  if (fileProgressBarWrapper) {
    fileProgressBarWrapper.addEventListener("click", (e) => handleSeek(fileProgressBarWrapper, e));
  }

  // Local audio file dropzone & change button
  dropzone.addEventListener("click", () => fileInput.click());
  if (fileChangeBtn) {
    fileChangeBtn.addEventListener("click", () => fileInput.click());
  }

  fileInput.addEventListener("change", (e) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      handleAudioFile(target.files[0]);
    }
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleAudioFile(e.dataTransfer.files[0]);
    }
  });

  function handleAudioFile(file: File) {
    ensureAudioPipeline();
    localFileUrl = URL.createObjectURL(file);
    audioElement.src = localFileUrl;
    localFileTitle.textContent = file.name;
    localFileDesc.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB · Local File`;
    filePlayerRow.style.display = "flex";
    if (fileProgressContainer) {
      fileProgressContainer.style.display = "flex";
    }
    dropzone.style.display = "none";
    audioElement.play().then(() => updatePlaybackUI(true)).catch(console.error);
  }

  // Microphone toggle
  micToggleBtn.addEventListener("click", () => {
    if (micStream) {
      stopMicrophone();
    } else {
      startMicrophone();
    }
  });

  // Band count slider & Auto button
  sliderBands.addEventListener("input", () => {
    autoWidth = false;
    btnAutoWidth.classList.remove("active");
    bandCount = parseInt(sliderBands.value, 10);
    bandCountVal.textContent = bandCount.toString();
    hudBands.textContent = `${bandCount} bands`;

    if (analyzer) {
      analyzer = createSpectrumAnalyzer({
        bandCount,
        sampleRate: audioCtx?.sampleRate ?? 48000,
        tuningProfile: DEFAULT_TUNING_PROFILE,
        reactivity,
        noiseGateScale,
      });
    }
    if (rendererTuned) {
      rendererTuned.setBandCount(bandCount);
    }
  });

  btnAutoWidth.addEventListener("click", () => {
    autoWidth = !autoWidth;
    btnAutoWidth.classList.toggle("active", autoWidth);
    if (autoWidth) {
      applyAutoWidth();
    }
  });

  // Pause Collapse Simulation
  btnTestCollapse.addEventListener("click", () => {
    isSimulatingPause = !isSimulatingPause;
    btnTestCollapse.classList.toggle("active", isSimulatingPause);
    btnTestCollapse.textContent = isSimulatingPause ? "Resume Dynamic Bounce" : "Simulate Pause";
  });

  // Reset knobs to defaults
  btnResetKnobs.addEventListener("click", () => {
    reactivity = 1.0;
    noiseGateScale = 1.0;
    springDuration = 0.325;
    springDamping = 0.83;
    pauseDuration = 0.60;
    pauseDamping = 1.0;

    sliderReactivity.value = "1.0";
    reactivityVal.textContent = "1.00x";
    sliderNoiseGate.value = "1.0";
    noiseGateVal.textContent = "1.00x";
    sliderSpringDuration.value = "0.325";
    springDurationVal.textContent = "0.325 s";
    sliderSpringDamping.value = "0.83";
    springDampingVal.textContent = "0.83";

    if (analyzer) {
      analyzer.reactivity = reactivity;
      analyzer.noiseGateScale = noiseGateScale;
    }
    if (rendererTuned) {
      rendererTuned.setSpringParameters(springDuration, springDamping);
      rendererTuned.setPauseParameters(pauseDuration, pauseDamping);
      rendererTuned.reset();
    }
  });

  // Accordion toggle
  accordionToggle.addEventListener("click", () => {
    const isOpen = accordionBody.classList.toggle("open");
    accordionStatus.textContent = isOpen ? "[-]" : "[+]";
  });

  // Live DSP & Spring Knobs
  sliderReactivity.addEventListener("input", () => {
    reactivity = parseFloat(sliderReactivity.value);
    reactivityVal.textContent = `${reactivity.toFixed(2)}x`;
    if (analyzer) {
      analyzer.reactivity = reactivity;
    }
  });

  sliderNoiseGate.addEventListener("input", () => {
    noiseGateScale = parseFloat(sliderNoiseGate.value);
    noiseGateVal.textContent = `${noiseGateScale.toFixed(2)}x`;
    if (analyzer) {
      analyzer.noiseGateScale = noiseGateScale;
    }
  });

  sliderSpringDuration.addEventListener("input", () => {
    springDuration = parseFloat(sliderSpringDuration.value);
    springDurationVal.textContent = `${springDuration.toFixed(3)} s`;
    if (rendererTuned) {
      rendererTuned.setSpringParameters(springDuration, springDamping);
    }
  });

  sliderSpringDamping.addEventListener("input", () => {
    springDamping = parseFloat(sliderSpringDamping.value);
    springDampingVal.textContent = springDamping.toFixed(2);
    if (rendererTuned) {
      rendererTuned.setSpringParameters(springDuration, springDamping);
    }
  });

  // Color Swatches
  colorSwatches.forEach((swatch) => {
    swatch.addEventListener("click", () => {
      colorSwatches.forEach((s) => s.classList.remove("active"));
      swatch.classList.add("active");
      const color = swatch.getAttribute("data-color");
      if (color && rendererTuned) {
        capsuleColor = color;
        rendererTuned.setColor(color);
        document.documentElement.style.setProperty("--capsule-color", color);
      }
    });
  });

  // Keyboard shortcut (Space = Play/Pause)
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      togglePlayPause();
    }
  });

  // Theme toggle
  themeToggleBtn.addEventListener("click", () => {
    const html = document.documentElement;
    const isDark = html.getAttribute("data-theme") === "dark";
    const nextTheme = isDark ? "light" : "dark";
    html.setAttribute("data-theme", nextTheme);
    themeToggleBtn.textContent = isDark ? "Dark" : "Light";
  });

  // Window resize observer
  window.addEventListener("resize", () => {
    if (rendererTuned) {
      rendererTuned.resize();
    }
    resizeRawCanvas();
    if (autoWidth) {
      applyAutoWidth();
    }
  });
}

// --- Entry Point ---

function main() {
  // Pre-load default audio so clicking play immediately works
  audioElement.src = demoTrackUrl;

  initAnalyzerAndRenderer();
  setupEventListeners();
  updateVisualizerLayout();
  requestAnimationFrame(animationLoop);
}

main();
