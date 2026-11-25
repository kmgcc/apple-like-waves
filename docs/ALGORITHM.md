# apple-like-waves (alwave) Algorithm Specification

This document details the mathematical models, digital signal processing (DSP) pipeline, and physics simulation underpinning apple-like-waves (alwave).

---

## 1. Architecture Overview

apple-like-waves (alwave) transforms real-time mono pulse-code modulation (PCM) audio into smooth, responsive, organic capsule bars:

```
Audio PCM (48 kHz)
   │
   ▼
[2048-Sample Circular Buffer]
   │
   ▼
[Hann Windowing + Real FFT]
   │
   ▼
[Calibrated Octave Binning]
   │
   ▼
[Nonlinear Amplitude Compression]
   │
   ▼
[Dynamic Attack Boost & Noise Gate]
   │
   ▼
[Second-Order Spring Dynamics]
   │
   ▼
Visual Capsule Dimensions (Width & Height)
```

---

## 2. Spectral Analysis Front-End

### 2.1 Windowing & FFT
- Input: Monophonic audio buffer $x[n]$ with frame size $N = 2048$ samples (typically sampled at 48 kHz, yielding a frequency resolution of $\Delta f \approx 23.4375\text{ Hz}$).
- Window Function: Periodic Hann window:
  $$w[n] = 0.5 - 0.5 \cos\left(\frac{2\pi n}{N}\right), \quad n \in [0, N-1]$$
- Windowed signal: $x_w[n] = x[n] \cdot w[n]$
- Discrete Fourier Transform:
  $$X[k] = \sum_{n=0}^{N-1} x_w[n] e^{-j 2\pi k n / N}, \quad k \in [0, N/2]$$
- Magnitude normalization:
  $$|X[k]| = \frac{2}{N/2} \cdot \sqrt{\text{Re}(X[k])^2 + \text{Im}(X[k])^2}$$

### 2.2 Energy Scaling Constant
An energy correction factor $K_{\text{norm}} = 2 \sqrt{\frac{8}{3}}$ is applied to account for the coherent gain and equivalent noise bandwidth of the Hann window.

---

## 3. Octave Band Mapping & Density Compensation

### 3.1 Base Frequency Anchors
The baseline 6-band spectrum uses empirical acoustic boundary edges:
$$F_{\text{edges}} = [20, 81, 170, 527, 1500, 4500, 10000]\text{ Hz}$$

The logarithmic center frequency of each octave band is given by:
$$f_{c, i} = \sqrt{F_{\text{edges}}[i] \cdot F_{\text{edges}}[i+1]}$$

### 3.2 Dynamic Band Allocation ($N_{\text{bands}} > 6$)
When expanding beyond 6 bars:
1. The lower boundary is raised to $40\text{ Hz}$ to avoid subsonic rumble.
2. Available bars are allocated proportionally to the fractional octaves of each parent band:
   $$\text{octave}_p = \log_2\left(\frac{F_{\text{edges}}[p+1]}{F_{\text{edges}}[p]}\right)$$
3. Each sub-band is guaranteed at least one discrete FFT bin.
4. Density Normalization:
   Because sub-bands divide the energy across fewer FFT bins, the energy density is scaled to maintain spectral consistency:
   $$S_{\text{density}}[i] = \frac{B_{\text{parent}}}{B_{\text{sub}}[i]}$$
   where $B$ denotes the number of FFT bins spanning the respective interval. A trim factor of $0.85$ is applied to fractional sub-bands to prevent saturation.

---

## 4. Nonlinear Amplitude Calibration

For each frequency band $i$, the accumulated magnitude $A_i$ is mapped through tuned gain $g_i$ and exponent $e_i$:
$$v_i = \text{clamp}\left( (A_i \cdot g_i)^{e_i}, 0.0, 1.0 \right)$$

Baseline 6-band calibration vectors:
- **Gain ($g$)**: `[0.706, 0.706, 0.433, 0.433, 0.339, 0.300]`
- **Exponent ($e$)**: `[1.15, 0.85, 0.75, 0.85, 0.70, 0.75]`

For arbitrary band counts, parameters are interpolated at the band centers using cubic Hermite (smoothstep) curves across logarithmic frequency coordinates.

---

## 5. Transient Attack Boost & Dynamic Gating

To enhance visual punch and rhythmic responsiveness during quiet-to-loud transitions without cluttering continuous loud passages:

### 5.1 Three-Tap Reference History
A low-pass reference baseline tracks historical levels:
$$v_{\text{ref}}[t] = 0.50 \cdot v[t] + 0.30 \cdot v[t-1] + 0.20 \cdot v[t-2]$$
$$\Delta v_{\text{rise}} = \max(0.0, v[t] - v_{\text{ref}}[t])$$

### 5.2 Slow Envelope Follower (Noise & Energy Floor)
A continuous one-pole recursive filter tracks ambient band energy:
$$\alpha = 1 - e^{-\Delta t / \tau_{\text{slow}}}, \quad \tau_{\text{slow}} = 0.80\text{ s}$$
$$v_{\text{slow}}[t] = v_{\text{slow}}[t-1] + \alpha \cdot (v[t] - v_{\text{slow}}[t-1])$$

### 5.3 Transient Punch Factor & Soft Deadband
- Quiet-passage gate:
  $$\text{Gate} = \text{clamp}\left(1.0 - \frac{v_{\text{slow}}}{0.35}, 0.0, 1.0\right)$$
- Soft Deadband function (prevents jitter below threshold):
  $$\text{Shape}(x) = \text{clamp}\left(\frac{x - 0.01}{0.06 - 0.01}, 0.0, 1.0\right)$$
- Final target height $H_i$:
  $$H_i = \text{clamp}\left(v_i + (P_i \cdot \text{Gate} + 1.05) \cdot \Delta v_{\text{rise}} \cdot \text{Shape}(\Delta v_{\text{rise}}), 0.0, 1.0\right)$$
  where baseline punch factors $P = [3.45, 2.07, 3.45, 11.5, 1.38, 1.38]$.

---

## 6. Second-Order Damped Spring Solver

Display positions evolve under the analytical closed-form solution of a damped harmonic oscillator:
$$\ddot{x} + 2\zeta\omega_n \dot{x} + \omega_n^2 (x - x_{\text{target}}) = 0$$

- **Natural Angular Frequency**: $\omega_n = 27.54\text{ rad/s}$ (settling time $T_s \approx 0.325\text{ s}$)
- **Damping Ratio**: $\zeta = 0.83$ (mild overshoot $\approx 0.9\%$, avoiding perceptual lag and jitter)

The analytical solution guarantees unconditional numerical stability regardless of frame pacing ($dt$).

---

## 7. Capsule Geometry Mapping

Visual capsules dynamically scale in both dimensions to convey energy:
- **Height**:
  $$h = \max(H_{\text{display}} \cdot H_{\text{max}}, w_{\text{slot}} \cdot 0.5)$$
- **Dynamic Width Expansion**:
  $$w = w_{\text{base}} \cdot (1.0 + 0.145 \cdot H_{\text{display}})$$
  Continuous floating-point path rendering prevents subpixel snapping artifacts on high-DPI displays.
