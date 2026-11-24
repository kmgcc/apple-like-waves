import {
  createSpectrumAnalyzer,
  DEFAULT_TUNING_PROFILE,
  recommendedBandCount,
  SpectrumAnalyzer,
} from "@capsule-wave/core";
import {
  CapsuleWaveCanvasRenderer,
  WebAudioBridge,
} from "@capsule-wave/canvas";

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
let capsuleColor = "#ffffff";
let isSimulatingPause = false;

// Audio Pipeline References
let audioCtx: AudioContext | null = null;
let audioBridge: WebAudioBridge | null = null;
let mediaElementSource: MediaElementAudioSourceNode | null = null;
let micStream: MediaStream | null = null;
let micSourceNode: MediaStreamAudioSourceNode | null = null;
let rawFreqData: Uint8Array | null = null;

// Core Analyzer & Canvas Renderers
let analyzer: SpectrumAnalyzer | null = null;
let rendererTuned: CapsuleWaveCanvasRenderer | null = null;

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
const iconPlay = document.getElementById("icon-play") as HTMLElement;
const iconPause = document.getElementById("icon-pause") as HTMLElement;
const currentTimeLabel = document.getElementById("current-time") as HTMLElement;
const totalTimeLabel = document.getElementById("total-time") as HTMLElement;
const progressBarWrapper = document.getElementById("progress-bar-wrapper") as HTMLElement;
const progressBarFill = document.getElementById("progress-bar-fill") as HTMLElement;

// File Upload Elements
const dropzone = document.getElementById("dropzone") as HTMLElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const browseBtn = document.getElementById("browse-btn") as HTMLButtonElement;
const filePlayerRow = document.getElementById("file-player-row") as HTMLElement;
const filePlayPauseBtn = document.getElementById("file-play-pause-btn") as HTMLButtonElement;
const fileIconPlay = document.getElementById("file-icon-play") as HTMLElement;
const fileIconPause = document.getElementById("file-icon-pause") as HTMLElement;
const localFileTitle = document.getElementById("local-file-title") as HTMLElement;
const localFileDesc = document.getElementById("local-file-desc") as HTMLElement;

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
const accordionArrow = document.getElementById("accordion-arrow") as HTMLElement;
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
const themeIconSun = document.getElementById("theme-icon-sun") as HTMLElement;
const themeIconMoon = document.getElementById("theme-icon-moon") as HTMLElement;

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
    rawFreqData = new Uint8Array(audioBridge.analyserNode.frequencyBinCount);
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

  rendererTuned = new CapsuleWaveCanvasRenderer(canvasTuned, {
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
    // Compare (side by side)
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
    iconPlay.style.display = "none";
    iconPause.style.display = "block";
    fileIconPlay.style.display = "none";
    fileIconPause.style.display = "block";
    statusDot.classList.add("active");
    statusText.textContent = currentSource === "mic" ? "Mic Active" : "Playing";
  } else {
    iconPlay.style.display = "block";
    iconPause.style.display = "none";
    fileIconPlay.style.display = "block";
    fileIconPause.style.display = "none";
    statusDot.classList.remove("active");
    statusText.textContent = "Idle";
  }
}

async function startMicrophone() {
  try {
    ensureAudioPipeline();
    if (!audioCtx || !audioBridge) return;

    // Disconnect audio element so it stops playing through speakers
    audioElement.pause();

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });

    micSourceNode = audioCtx.createMediaStreamSource(micStream);
    // CRITICAL: Connect mic ONLY to analyserNode, NOT to audioCtx.destination to prevent acoustic feedback!
    micSourceNode.connect(audioBridge.analyserNode);

    micToggleBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="1" y1="1" x2="23" y2="23"></line>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
      </svg>
      <span>Mute Microphone</span>
    `;
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

  micToggleBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="23"></line>
      <line x1="8" y1="23" x2="16" y2="23"></line>
    </svg>
    <span>Enable Microphone</span>
  `;
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

  audioBridge.analyserNode.getByteFrequencyData(rawFreqData as unknown as Uint8Array<ArrayBuffer>);

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const numBars = bandCount;
  const padding = 20;
  const availWidth = width - padding * 2;
  const barSpacing = 3;
  const barWidth = Math.max(2, (availWidth - (numBars - 1) * barSpacing) / numBars);

  // Sample raw FFT bins linearly
  const binStep = Math.floor(rawFreqData.length / (numBars * 2));

  for (let i = 0; i < numBars; i++) {
    const binIdx = Math.min(rawFreqData.length - 1, i * binStep + 1);
    const rawVal = rawFreqData[binIdx] / 255.0; // 0..1
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

  // FPS calculation
  frameCount++;
  if (timestamp - lastFpsUpdate >= 500) {
    const fps = Math.round((frameCount * 1000) / (timestamp - lastFpsUpdate));
    hudFps.textContent = `${fps} fps`;
    frameCount = 0;
    lastFpsUpdate = timestamp;
  }

  const active = isAudioActive() && !isSimulatingPause;

  if (audioBridge && analyzer && rendererTuned) {
    // 1. Read PCM samples from time domain (AnalyserNode.getFloatTimeDomainData)
    const pcm = audioBridge.readTimeDomainSamples();
    analyzer.pushSamples(pcm);

    // 2. Step tuned spectrum analyzer
    const tunedTargets = analyzer.step(dt);

    // 3. Render tuned capsules (handles spring physics and pause collapse internally)
    rendererTuned.render(tunedTargets, dt, active);
  }

  // 4. Render Raw FFT if panel is visible
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
        if (audioElement.src !== "/demo-track.m4a") {
          audioElement.src = "/demo-track.m4a";
        }
      }
    });
  });

  // Play/pause controls
  playPauseBtn.addEventListener("click", togglePlayPause);
  filePlayPauseBtn.addEventListener("click", togglePlayPause);

  // Audio progress and scrubber
  audioElement.addEventListener("timeupdate", () => {
    if (!isNaN(audioElement.duration) && audioElement.duration > 0) {
      const pct = (audioElement.currentTime / audioElement.duration) * 100;
      progressBarFill.style.width = `${pct}%`;
      currentTimeLabel.textContent = formatTime(audioElement.currentTime);
      totalTimeLabel.textContent = formatTime(audioElement.duration);
    }
  });

  audioElement.addEventListener("loadedmetadata", () => {
    totalTimeLabel.textContent = formatTime(audioElement.duration);
  });

  audioElement.addEventListener("ended", () => {
    updatePlaybackUI(false);
  });

  progressBarWrapper.addEventListener("click", (e) => {
    if (!isNaN(audioElement.duration) && audioElement.duration > 0) {
      const rect = progressBarWrapper.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      audioElement.currentTime = pct * audioElement.duration;
    }
  });

  // Local audio file dropzone
  browseBtn.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("click", () => fileInput.click());

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
    const objectUrl = URL.createObjectURL(file);
    audioElement.src = objectUrl;
    localFileTitle.textContent = file.name;
    localFileDesc.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB · Local File`;
    filePlayerRow.style.display = "flex";
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
    btnTestCollapse.textContent = isSimulatingPause ? "Resuming Dynamic Bounce" : "Simulate Pause Collapse";
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
      rendererTuned.reset();
    }
  });

  // Accordion toggle
  accordionToggle.addEventListener("click", () => {
    const isOpen = accordionBody.classList.toggle("open");
    accordionArrow.classList.toggle("open", isOpen);
  });

  // Tuning knobs
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
    // Update renderer solvers if needed
  });

  sliderSpringDamping.addEventListener("input", () => {
    springDamping = parseFloat(sliderSpringDamping.value);
    springDampingVal.textContent = springDamping.toFixed(2);
  });

  // Color Swatches
  colorSwatches.forEach((swatch) => {
    swatch.addEventListener("click", () => {
      colorSwatches.forEach((s) => s.classList.remove("active"));
      swatch.classList.add("active");
      const color = swatch.getAttribute("data-color");
      if (color && rendererTuned) {
        capsuleColor = color;
        rendererTuned.color = color;
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

    themeIconSun.style.display = isDark ? "block" : "none";
    themeIconMoon.style.display = isDark ? "none" : "block";

    // Adjust monochrome swatch color
    const defaultSwatch = document.querySelector('.color-swatch[data-color="#ffffff"], .color-swatch[data-color="#121417"]') as HTMLElement;
    if (defaultSwatch) {
      const newColor = nextTheme === "dark" ? "#ffffff" : "#121417";
      defaultSwatch.setAttribute("data-color", newColor);
      defaultSwatch.style.backgroundColor = newColor;
      if (capsuleColor === "#ffffff" || capsuleColor === "#121417") {
        capsuleColor = newColor;
        if (rendererTuned) {
          rendererTuned.color = newColor;
        }
      }
    }
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
  initAnalyzerAndRenderer();
  setupEventListeners();
  updateVisualizerLayout();
  requestAnimationFrame(animationLoop);
}

main();
