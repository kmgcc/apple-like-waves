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

// --- 状态定义 ---
type AudioSourceType = "preset" | "file" | "mic";

let currentSource: AudioSourceType = "preset";
let bandCount = 6;
let autoWidth = false;
let inputGain = 1.0;
let reactivity = 1.0;
let noiseGateScale = 1.0;
let springDuration = 0.325;
let springDamping = 0.83;
let pauseDuration = 0.6;
let pauseDamping = 1.0;
let capsuleColor = "#e6c450"; // 默认封面暖金配色
let isSimulatingPause = false;
let localFileUrl: string | null = null;
let isAudioLoading = false;
let isPendingPlay = false;
let hasLoadError = false;
let defaultCoverImg: HTMLImageElement | null = null;
let uploadedCoverImg: HTMLImageElement | null = null;
let activeCoverImg: HTMLImageElement | null = null;
let useArtwork = true; // 默认使用封面渐变

// 音频链路引用
let audioCtx: AudioContext | null = null;
let audioBridge: WebAudioBridge | null = null;
let mediaElementSource: MediaElementAudioSourceNode | null = null;
let micStream: MediaStream | null = null;
let micSourceNode: MediaStreamAudioSourceNode | null = null;

// 核心分析器与渲染器
let analyzer: SpectrumAnalyzer | null = null;
let rendererTuned: AlwaveCanvasRenderer | null = null;

// 资源基地址
const demoTrackUrl = `${import.meta.env.BASE_URL}demo-track.m4a`;
const demoCoverUrl = `${import.meta.env.BASE_URL}demo-cover.jpg`;

// DOM 元素引用
const audioElement = document.getElementById("audio-element") as HTMLAudioElement;
const canvasTuned = document.getElementById("canvas-tuned") as HTMLCanvasElement;
const visualizerWrapper = document.getElementById("visualizer-wrapper") as HTMLElement;

// 顶部状态 HUD
const statusDot = document.getElementById("status-dot") as HTMLElement;
const statusText = document.getElementById("status-text") as HTMLElement;
const hudBands = document.getElementById("hud-bands") as HTMLElement;
const hudFps = document.getElementById("hud-fps") as HTMLElement;
const hudRate = document.getElementById("hud-rate") as HTMLElement;

// 音频源标签页
const tabPreset = document.getElementById("tab-preset") as HTMLButtonElement;
const tabFile = document.getElementById("tab-file") as HTMLButtonElement;
const tabMic = document.getElementById("tab-mic") as HTMLButtonElement;
const viewPreset = document.getElementById("view-preset") as HTMLElement;
const viewFile = document.getElementById("view-file") as HTMLElement;
const viewMic = document.getElementById("view-mic") as HTMLElement;

// 预设音频播放器组件
const playPauseBtn = document.getElementById("play-pause-btn") as HTMLButtonElement;
const trackStatus = document.getElementById("track-status") as HTMLElement;
const currentTimeLabel = document.getElementById("current-time") as HTMLElement;
const totalTimeLabel = document.getElementById("total-time") as HTMLElement;
const progressBarWrapper = document.getElementById("progress-bar-wrapper") as HTMLElement;
const progressBarFill = document.getElementById("progress-bar-fill") as HTMLElement;

// 本地音频上传组件
const dropzone = document.getElementById("dropzone") as HTMLElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const filePlayerRow = document.getElementById("file-player-row") as HTMLElement;
const filePlayPauseBtn = document.getElementById("file-play-pause-btn") as HTMLButtonElement;
const fileChangeBtn = document.getElementById("file-change-btn") as HTMLButtonElement;
const localFileTitle = document.getElementById("local-file-title") as HTMLElement;
const fileStatus = document.getElementById("file-status") as HTMLElement;
const fileProgressContainer = document.getElementById("file-progress-container") as HTMLElement;
const fileCurrentTime = document.getElementById("file-current-time") as HTMLElement;
const fileTotalTime = document.getElementById("file-total-time") as HTMLElement;
const fileProgressBarWrapper = document.getElementById("file-progress-bar-wrapper") as HTMLElement;
const fileProgressBarFill = document.getElementById("file-progress-bar-fill") as HTMLElement;

// 麦克风控制
const micToggleBtn = document.getElementById("mic-toggle-btn") as HTMLButtonElement;

// 右侧常驻控制项
const sliderBands = document.getElementById("slider-bands") as HTMLInputElement;
const bandCountVal = document.getElementById("band-count-val") as HTMLElement;
const btnAutoWidth = document.getElementById("btn-auto-width") as HTMLButtonElement;
const btnTestCollapse = document.getElementById("btn-test-collapse") as HTMLButtonElement;
const btnResetKnobs = document.getElementById("btn-reset-knobs") as HTMLButtonElement;
const sliderInputGain = document.getElementById("slider-input-gain") as HTMLInputElement;
const inputGainVal = document.getElementById("input-gain-val") as HTMLElement;
const sliderReactivity = document.getElementById("slider-reactivity") as HTMLInputElement;
const reactivityVal = document.getElementById("reactivity-val") as HTMLElement;
const sliderNoiseGate = document.getElementById("slider-noisegate") as HTMLInputElement;
const noiseGateVal = document.getElementById("noisegate-val") as HTMLElement;
const sliderSpringDuration = document.getElementById("slider-spring-duration") as HTMLInputElement;
const springDurationVal = document.getElementById("spring-duration-val") as HTMLElement;
const sliderSpringDamping = document.getElementById("slider-spring-damping") as HTMLInputElement;
const springDampingVal = document.getElementById("spring-damping-val") as HTMLElement;
const swatchArtwork = document.getElementById("swatch-artwork") as HTMLButtonElement;
const colorSwatches = document.querySelectorAll(".color-swatch");

// 主题切换
const themeToggleBtn = document.getElementById("theme-toggle-btn") as HTMLButtonElement;

// --- 辅助工具函数 ---

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function updateCapsuleProportions(canvasWidth?: number, canvasHeight?: number) {
  if (!rendererTuned) return;
  const w = canvasWidth || canvasTuned.clientWidth || 400;
  const h = canvasHeight || canvasTuned.clientHeight || 144;
  const maxClusterW = Math.min(w * 0.56, bandCount * 11.0);
  const pitch = maxClusterW / bandCount;
  rendererTuned.capsuleWidth = Math.max(2.2, Math.min(6.0, pitch * 0.54));
  rendererTuned.capsuleSpacing = Math.max(1.5, Math.min(5.0, pitch * 0.46));
  rendererTuned.maxHeightRatio = Math.min(0.50, 68 / Math.max(1, h));
}

function ensureAudioPipeline(): WebAudioBridge {
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
    hudRate.textContent = `${(audioCtx.sampleRate / 1000).toFixed(1)} kHz`;
  }

  // 保证分析器采样率与实际 AudioContext 一致
  if (analyzer && analyzer.sampleRate !== audioCtx.sampleRate) {
    analyzer = createSpectrumAnalyzer({
      bandCount,
      sampleRate: audioCtx.sampleRate,
      tuningProfile: DEFAULT_TUNING_PROFILE,
      reactivity,
      noiseGateScale,
      inputGain,
    });
  }

  if (!audioBridge) {
    audioBridge = new WebAudioBridge({ audioContext: audioCtx, fftSize: 2048 });
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
    inputGain,
  });

  const h = canvasTuned.clientHeight || 144;
  rendererTuned = new AlwaveCanvasRenderer(canvasTuned, {
    bandCount,
    color: capsuleColor,
    springDuration,
    springDamping,
    pauseDuration,
    pauseDamping,
    maxHeightRatio: Math.min(0.50, 68 / Math.max(1, h)),
  });

  const w = canvasTuned.clientWidth || 400;
  updateCapsuleProportions(w, h);

  hudBands.textContent = `${bandCount} 段`;
  bandCountVal.textContent = bandCount.toString();
  sliderBands.value = bandCount.toString();
}

function updateVisualizerLayout() {
  if (rendererTuned) {
    rendererTuned.resize();
    updateCapsuleProportions(canvasTuned.clientWidth || 400);
  }

  if (autoWidth) {
    applyAutoWidth();
  }
}

function applyAutoWidth() {
  const containerWidth = visualizerWrapper.clientWidth;
  const recommended = recommendedBandCount(containerWidth);
  const clamped = Math.min(36, Math.max(6, recommended));

  if (clamped !== bandCount) {
    bandCount = clamped;
    bandCountVal.textContent = bandCount.toString();
    sliderBands.value = bandCount.toString();
    hudBands.textContent = `${bandCount} 段`;

    if (analyzer) {
      analyzer = createSpectrumAnalyzer({
        bandCount,
        sampleRate: audioCtx?.sampleRate ?? 48000,
        tuningProfile: DEFAULT_TUNING_PROFILE,
        reactivity,
        noiseGateScale,
        inputGain,
      });
    }
    if (rendererTuned) {
      rendererTuned.setBandCount(bandCount);
      updateCapsuleProportions(canvasTuned.clientWidth || 400);
    }
  }
}

// --- 音频源状态逻辑 ---

function isAudioActive(): boolean {
  if (currentSource === "mic") {
    return micStream !== null;
  }
  return !audioElement.paused && !audioElement.ended;
}

function updatePlaybackUI(customPlaying?: boolean) {
  if (currentSource === "mic") {
    const isMicActive = customPlaying !== undefined ? customPlaying : (micStream !== null);
    playPauseBtn.textContent = "播放";
    filePlayPauseBtn.textContent = "播放";
    statusDot.className = "status-dot" + (isMicActive ? " active" : "");
    statusText.textContent = isMicActive ? "麦克风采集" : "就绪";
    if (trackStatus) trackStatus.style.display = "none";
    if (fileStatus) fileStatus.style.display = "none";
    return;
  }

  const activeStatusEl = currentSource === "preset" ? trackStatus : fileStatus;
  const otherStatusEl = currentSource === "preset" ? fileStatus : trackStatus;
  if (otherStatusEl) otherStatusEl.style.display = "none";

  if (hasLoadError) {
    playPauseBtn.textContent = "点击重试";
    filePlayPauseBtn.textContent = "点击重试";
    statusDot.className = "status-dot error";
    statusText.textContent = "加载失败";
    if (activeStatusEl) {
      activeStatusEl.textContent = "音频加载失败，请检查网络或点击重试";
      activeStatusEl.style.display = "block";
    }
    return;
  }

  if (isPendingPlay) {
    playPauseBtn.textContent = "正在加载...";
    filePlayPauseBtn.textContent = "正在加载...";
    statusDot.className = "status-dot loading";
    statusText.textContent = "正在加载...";
    if (activeStatusEl) {
      activeStatusEl.textContent = "正在缓冲音频...";
      activeStatusEl.style.display = "block";
    }
    return;
  }

  if (isAudioLoading && !isAudioActive()) {
    playPauseBtn.textContent = "播放";
    filePlayPauseBtn.textContent = "播放";
    statusDot.className = "status-dot loading";
    statusText.textContent = "正在加载...";
    if (activeStatusEl) {
      activeStatusEl.textContent = "正在预载音频...";
      activeStatusEl.style.display = "block";
    }
    return;
  }

  const playing = customPlaying !== undefined ? customPlaying : isAudioActive();
  if (playing) {
    playPauseBtn.textContent = "暂停";
    filePlayPauseBtn.textContent = "暂停";
    statusDot.className = "status-dot active";
    statusText.textContent = "播放中";
    if (activeStatusEl) activeStatusEl.style.display = "none";
  } else {
    playPauseBtn.textContent = "播放";
    filePlayPauseBtn.textContent = "播放";
    statusDot.className = "status-dot";
    statusText.textContent = "就绪";
    if (activeStatusEl) activeStatusEl.style.display = "none";
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

    micToggleBtn.textContent = "静音麦克风";
    micToggleBtn.classList.remove("btn-primary");
    micToggleBtn.classList.add("btn-secondary", "active");

    updatePlaybackUI(true);
  } catch (err) {
    console.error("无法访问麦克风:", err);
    alert("无法访问麦克风: " + (err as Error).message);
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

  micToggleBtn.textContent = "开启麦克风";
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

  if (hasLoadError) {
    hasLoadError = false;
    isAudioLoading = true;
    isPendingPlay = true;
    updatePlaybackUI();
    audioElement.load();
    audioElement.play().then(() => {
      isPendingPlay = false;
      hasLoadError = false;
      updatePlaybackUI(true);
    }).catch((err) => {
      console.error("重试播放失败:", err);
      hasLoadError = true;
      isPendingPlay = false;
      updatePlaybackUI();
    });
    return;
  }

  if (isPendingPlay) {
    return;
  }

  if (!audioElement.src || audioElement.src === "" || audioElement.src.endsWith("/")) {
    audioElement.src = currentSource === "file" && localFileUrl ? localFileUrl : demoTrackUrl;
  }

  if (audioElement.paused) {
    isPendingPlay = true;
    updatePlaybackUI();
    audioElement.play().then(() => {
      isPendingPlay = false;
      hasLoadError = false;
      updatePlaybackUI(true);
    }).catch((err) => {
      console.error("播放失败:", err);
      isPendingPlay = false;
      if (err.name !== "AbortError") {
        hasLoadError = true;
      }
      updatePlaybackUI();
    });
  } else {
    audioElement.pause();
    isPendingPlay = false;
    updatePlaybackUI(false);
  }
}

// --- 动画循环与渲染 ---

let lastTimestamp = performance.now();
let frameCount = 0;
let lastFpsUpdate = performance.now();

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
}

// --- 事件监听配置 ---

function setupEventListeners() {
  // 音频源切换
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
        activeCoverImg = defaultCoverImg;
        if (useArtwork && rendererTuned) {
          rendererTuned.setArtwork(defaultCoverImg);
        }
        if (audioElement.src !== demoTrackUrl) {
          audioElement.src = demoTrackUrl;
        }
      } else if (type === "file") {
        activeCoverImg = uploadedCoverImg;
        if (useArtwork && rendererTuned) {
          if (uploadedCoverImg) {
            rendererTuned.setArtwork(uploadedCoverImg);
          } else {
            rendererTuned.setArtwork(null);
            rendererTuned.setColor(capsuleColor);
          }
        }
        if (localFileUrl && audioElement.src !== localFileUrl) {
          audioElement.src = localFileUrl;
        }
      } else if (type === "mic") {
        if (useArtwork && rendererTuned) {
          rendererTuned.setArtwork(null);
          rendererTuned.setColor(capsuleColor);
        }
      }
    });
  });

  // 播放暂停
  playPauseBtn.addEventListener("click", togglePlayPause);
  filePlayPauseBtn.addEventListener("click", togglePlayPause);

  // 音频缓冲与加载状态事件
  audioElement.addEventListener("loadstart", () => {
    isAudioLoading = true;
    hasLoadError = false;
    updatePlaybackUI();
  });

  audioElement.addEventListener("waiting", () => {
    isAudioLoading = true;
    updatePlaybackUI();
  });

  audioElement.addEventListener("stalled", () => {
    isAudioLoading = true;
    updatePlaybackUI();
  });

  audioElement.addEventListener("canplay", () => {
    isAudioLoading = false;
    updatePlaybackUI();
  });

  audioElement.addEventListener("canplaythrough", () => {
    isAudioLoading = false;
    updatePlaybackUI();
  });

  audioElement.addEventListener("playing", () => {
    isAudioLoading = false;
    isPendingPlay = false;
    hasLoadError = false;
    updatePlaybackUI(true);
  });

  audioElement.addEventListener("pause", () => {
    isPendingPlay = false;
    updatePlaybackUI(false);
  });

  audioElement.addEventListener("ended", () => {
    isPendingPlay = false;
    updatePlaybackUI(false);
  });

  audioElement.addEventListener("error", () => {
    isAudioLoading = false;
    isPendingPlay = false;
    hasLoadError = true;
    updatePlaybackUI();
  });

  // 播放进度与拖动条
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

  // 文件拖拽与选择
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
    hasLoadError = false;
    isAudioLoading = true;
    isPendingPlay = true;
    audioElement.src = localFileUrl;
    localFileTitle.textContent = file.name;
    filePlayerRow.style.display = "flex";
    if (fileProgressContainer) {
      fileProgressContainer.style.display = "flex";
    }
    dropzone.style.display = "none";
    updatePlaybackUI();

    // 异步尝试解析内嵌封面（MP4/M4A/MP3）
    extractEmbeddedCover(file).then((coverImg) => {
      uploadedCoverImg = coverImg;
      if (currentSource === "file") {
        activeCoverImg = coverImg;
        if (useArtwork && rendererTuned) {
          if (coverImg) {
            rendererTuned.setArtwork(coverImg);
          } else {
            rendererTuned.setArtwork(null);
            rendererTuned.setColor(capsuleColor);
          }
        }
      }
    });

    audioElement.play().then(() => {
      isPendingPlay = false;
      hasLoadError = false;
      updatePlaybackUI(true);
    }).catch((err) => {
      console.error("本地音频播放失败:", err);
      isPendingPlay = false;
      if (err.name !== "AbortError") {
        hasLoadError = true;
      }
      updatePlaybackUI();
    });
  }

  // 麦克风按钮
  micToggleBtn.addEventListener("click", () => {
    if (micStream) {
      stopMicrophone();
    } else {
      startMicrophone();
    }
  });

  // 频段数调节与自适应
  sliderBands.addEventListener("input", () => {
    autoWidth = false;
    btnAutoWidth.classList.remove("active");
    bandCount = parseInt(sliderBands.value, 10);
    bandCountVal.textContent = bandCount.toString();
    hudBands.textContent = `${bandCount} 段`;

    if (analyzer) {
      analyzer = createSpectrumAnalyzer({
        bandCount,
        sampleRate: audioCtx?.sampleRate ?? 48000,
        tuningProfile: DEFAULT_TUNING_PROFILE,
        reactivity,
        noiseGateScale,
        inputGain,
      });
    }
    if (rendererTuned) {
      rendererTuned.setBandCount(bandCount);
      updateCapsuleProportions(canvasTuned.clientWidth || 400);
    }
  });

  btnAutoWidth.addEventListener("click", () => {
    autoWidth = !autoWidth;
    btnAutoWidth.classList.toggle("active", autoWidth);
    if (autoWidth) {
      applyAutoWidth();
    }
  });

  // 模拟暂停收缩
  btnTestCollapse.addEventListener("click", () => {
    isSimulatingPause = !isSimulatingPause;
    btnTestCollapse.classList.toggle("active", isSimulatingPause);
    btnTestCollapse.textContent = isSimulatingPause ? "恢复弹簧动效" : "模拟暂停收缩";
  });

  // 恢复默认参数
  btnResetKnobs.addEventListener("click", () => {
    inputGain = 1.0;
    reactivity = 1.0;
    noiseGateScale = 1.0;
    springDuration = 0.325;
    springDamping = 0.83;
    pauseDuration = 0.60;
    pauseDamping = 1.0;

    sliderInputGain.value = "1.00";
    inputGainVal.textContent = "1.00x";
    sliderReactivity.value = "1.0";
    reactivityVal.textContent = "1.00x";
    sliderNoiseGate.value = "1.0";
    noiseGateVal.textContent = "1.00x";
    sliderSpringDuration.value = "0.325";
    springDurationVal.textContent = "0.325 s";
    sliderSpringDamping.value = "0.83";
    springDampingVal.textContent = "0.83";

    useArtwork = true;
    swatchArtwork.classList.add("active");
    colorSwatches.forEach((s) => s.classList.remove("active"));

    if (analyzer) {
      analyzer.inputGain = inputGain;
      analyzer.reactivity = reactivity;
      analyzer.noiseGateScale = noiseGateScale;
    }
    if (rendererTuned) {
      rendererTuned.setArtwork(activeCoverImg);
      rendererTuned.setSpringParameters(springDuration, springDamping);
      rendererTuned.setPauseParameters(pauseDuration, pauseDamping);
      rendererTuned.reset();
    }
  });

  // 动态旋钮调节
  sliderInputGain.addEventListener("input", () => {
    inputGain = parseFloat(sliderInputGain.value);
    inputGainVal.textContent = `${inputGain.toFixed(2)}x`;
    if (analyzer) {
      analyzer.inputGain = inputGain;
    }
  });

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

  // 配色与封面切换
  swatchArtwork.addEventListener("click", () => {
    useArtwork = true;
    swatchArtwork.classList.add("active");
    colorSwatches.forEach((s) => s.classList.remove("active"));
    if (rendererTuned) {
      rendererTuned.setArtwork(activeCoverImg);
    }
  });

  colorSwatches.forEach((swatch) => {
    swatch.addEventListener("click", () => {
      useArtwork = false;
      swatchArtwork.classList.remove("active");
      colorSwatches.forEach((s) => s.classList.remove("active"));
      swatch.classList.add("active");
      const color = swatch.getAttribute("data-color");
      if (color && rendererTuned) {
        capsuleColor = color;
        rendererTuned.setArtwork(null);
        rendererTuned.setColor(color);
        document.documentElement.style.setProperty("--capsule-color", color);
      }
    });
  });

  // 空格快捷键
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      togglePlayPause();
    }
  });

  // 主题切换
  themeToggleBtn.addEventListener("click", () => {
    const html = document.documentElement;
    const isDark = html.getAttribute("data-theme") === "dark";
    const nextTheme = isDark ? "light" : "dark";
    html.setAttribute("data-theme", nextTheme);
    themeToggleBtn.textContent = isDark ? "深色" : "浅色";
  });

  // 视窗缩放监听
  window.addEventListener("resize", () => {
    if (rendererTuned) {
      rendererTuned.resize();
      updateCapsuleProportions(canvasTuned.clientWidth || 400);
    }
    if (autoWidth) {
      applyAutoWidth();
    }
  });
}

// --- 封面加载与内嵌封面解析 ---

function loadDefaultCover() {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    defaultCoverImg = img;
    if (currentSource === "preset") {
      activeCoverImg = img;
      if (useArtwork && rendererTuned) {
        rendererTuned.setArtwork(img);
      }
    }
  };
  img.src = demoCoverUrl;
}

async function extractEmbeddedCover(file: File): Promise<HTMLImageElement | null> {
  try {
    const sliceSize = Math.min(file.size, 16 * 1024 * 1024);
    const buffer = await file.slice(0, sliceSize).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    let imgBlob: Blob | null = null;

    // 1. 检查 MP3 ID3v2 "APIC" 帧
    if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      for (let i = 10; i < bytes.length - 16; i++) {
        if (bytes[i] === 0x41 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x49 && bytes[i + 3] === 0x43) {
          const searchLimit = Math.min(bytes.length, i + 512);
          for (let j = i + 10; j < searchLimit; j++) {
            // JPEG: 0xFF 0xD8 0xFF
            if (bytes[j] === 0xff && bytes[j + 1] === 0xd8 && bytes[j + 2] === 0xff) {
              let end = j + 3;
              for (let k = j + 3; k < bytes.length - 1; k++) {
                if (bytes[k] === 0xff && bytes[k + 1] === 0xd9) {
                  end = k + 2;
                  break;
                }
              }
              imgBlob = new Blob([bytes.subarray(j, end)], { type: "image/jpeg" });
              break;
            }
            // PNG: 0x89 0x50 0x4E 0x47
            if (bytes[j] === 0x89 && bytes[j + 1] === 0x50 && bytes[j + 2] === 0x4e && bytes[j + 3] === 0x47) {
              let end = j + 4;
              for (let k = j + 4; k < bytes.length - 8; k++) {
                if (bytes[k] === 0x49 && bytes[k + 1] === 0x45 && bytes[k + 2] === 0x4e && bytes[k + 3] === 0x44) {
                  end = k + 8;
                  break;
                }
              }
              imgBlob = new Blob([bytes.subarray(j, end)], { type: "image/png" });
              break;
            }
          }
          if (imgBlob) break;
        }
      }
    }

    // 2. 检查 MP4/M4A 'covr' 元数据原子
    if (!imgBlob) {
      for (let i = 0; i < bytes.length - 16; i++) {
        if (bytes[i] === 0x63 && bytes[i + 1] === 0x6f && bytes[i + 2] === 0x76 && bytes[i + 3] === 0x72) {
          for (let j = i + 4; j < Math.min(bytes.length - 16, i + 64); j++) {
            if (bytes[j] === 0x64 && bytes[j + 1] === 0x61 && bytes[j + 2] === 0x74 && bytes[j + 3] === 0x61) {
              const imgStart = j + 12;
              const dataBoxSize = (bytes[j - 4] << 24) | (bytes[j - 3] << 16) | (bytes[j - 2] << 8) | bytes[j - 1];
              const imgEnd = dataBoxSize > 16 ? j - 4 + dataBoxSize : bytes.length;
              const isPng = bytes[imgStart] === 0x89 && bytes[imgStart + 1] === 0x50;
              imgBlob = new Blob([bytes.subarray(imgStart, Math.min(bytes.length, imgEnd))], {
                type: isPng ? "image/png" : "image/jpeg",
              });
              break;
            }
          }
          if (imgBlob) break;
        }
      }
    }

    if (imgBlob && imgBlob.size > 100) {
      return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(imgBlob!);
        img.onload = () => resolve(img);
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      });
    }
  } catch (err) {
    console.warn("未能解析内嵌封面:", err);
  }
  return null;
}

// --- 入口初始化 ---

function main() {
  audioElement.src = demoTrackUrl;

  initAnalyzerAndRenderer();
  setupEventListeners();
  updateVisualizerLayout();
  updatePlaybackUI();
  loadDefaultCover();
  requestAnimationFrame(animationLoop);
}

main();
