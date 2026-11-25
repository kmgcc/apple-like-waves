# apple-like-waves (alwave)

> 高度逼近 iOS 音频胶囊频谱视觉与动态效果的跨平台频谱库（Swift + TypeScript/Canvas），支持八度分箱、瞬态起音加成与二阶弹簧物理模拟。

---

## 效果对比与在线演示

![Apple 与 alwave 频谱对比](docs/assets/comparison.gif)

- [在线演示](https://kmgcc.github.io/apple-like-waves/)

---

## 核心特性

- **对数八度分箱**：支持 6 至 36 根胶囊柱，各频段按频点数与谱密度动态补偿能量。
- **动态起音与门限**：采用三拍历史参考包络与慢跟随门控，放大打击乐瞬态起步，稳定持续大声段落。
- **二阶弹簧阻尼**：解析求解受阻尼谐振子（$\zeta = 0.83, \omega_n = 27.54\text{ rad/s}$），运动响应灵敏且控制过冲在 1% 左右。
- **双端同构**：Swift（Accelerate vDSP）与 Web（TypeScript / Canvas 2D）共用统一计算链路与参数规格，跨端数值最大绝对误差低于 $10^{-5}$。

---

## 快速上手

### Swift (Swift Package Manager)

在 `Package.swift` 中添加依赖：

```swift
dependencies: [
    .package(url: "https://github.com/kmgcc/apple-like-waves.git", from: "1.0.0")
]
```

并在目标 Target 中引入产物：

```swift
.target(
    name: "YourApp",
    dependencies: [
        .product(name: "Alwave", package: "apple-like-waves")
    ]
)
```

音频分析与渲染调用：

```swift
import SpectrumCore
import SpectrumUI

// 初始化分析器
let analyzer = SpectrumAnalyzer(bandCount: 6, sampleRate: 48000)

// 音频输入回调中推入 PCM 浮点样本
analyzer.pushSamples(pcm: pcmFloatBuffer)

// 屏幕刷新周期（如 CADisplayLink）推进计算，返回 [0, 1] 归一化能量
let targets = analyzer.step(dt: 1.0 / 60.0)

// 驱动弹簧物理运算
let follower = CapsuleSpringFollower(count: 6)
let barHeights = follower.step(targets: targets.map(Double.init), dt: 1.0 / 60.0)

// SwiftUI 直接呈现
AlwaveSpectrumView(values: targets)
```

根据视图宽度获取推荐频段数：
```swift
let recommendedBands = SpectrumAnalyzer.recommendedBandCount(width: view.bounds.width)
```

---

### Web (npm)

安装依赖包：

```bash
npm install @alwave/core @alwave/canvas
```

配合 Web Audio API 使用：

```typescript
import { createSpectrumAnalyzer, recommendedBandCount } from "@alwave/core";
import { AlwaveCanvasRenderer } from "@alwave/canvas";

// 创建分析器实例
const analyzer = createSpectrumAnalyzer({
  bandCount: 6,
  sampleRate: 48000,
  tuningProfile: "default"
});

// 绑定 Canvas 画布
const canvas = document.getElementById("visualizer") as HTMLCanvasElement;
const renderer = new AlwaveCanvasRenderer(canvas, { bandCount: 6 });

const pcmBuffer = new Float32Array(2048);

function render() {
  const dt = 1 / 60;
  analyserNode.getFloatTimeDomainData(pcmBuffer);
  analyzer.pushSamples(pcmBuffer);

  const targets = analyzer.step(dt);
  renderer.render(targets, dt);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);
```

---

## 调节参数

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `bandCount` | `Int` / `number` | `6` | 胶囊频段数量（支持 6、9、12、24、36 等） |
| `sampleRate` | `Double` / `number` | `48000` | 输入 PCM 采样率 |
| `reactivity` | `Double` / `number` | `1.0` | 瞬态起音加成缩放系数 |
| `noiseGateScale` | `Double` / `number` | `1.0` | 噪声门限敏感度系数 |
| `springDuration` | `Double` / `number` | `0.325` | 弹簧特征收敛时长（秒） |
| `springDamping` | `Double` / `number` | `0.83` | 弹簧阻尼比 $\zeta$（过冲约 0.9%） |

---

## 算法设计

完整数学推导、频段划分、能量补偿与弹簧解析解参见 [docs/ALGORITHM.md](docs/ALGORITHM.md)。

---

## 算法实现与调优

本项目的频谱曲线、动态响应与标定常数经过系统调优，高度逼近 iOS 系统原生音频胶囊波形的视觉形变与弹簧质感。在此基础上，本项目实现了以下工程设计与扩展：

- 将前级计算升级为 2048 点 Hann 窗与实数 FFT，对齐相干增益。
- 突破原生固定 6 段限制，设计按对数八度比例切分的任意多段算法（支持 6 至 36 根胶囊柱），并引入频点密度补偿。
- 提取三拍参考包络与慢跟随门控，建立软死区起音加成公式，强化打击乐和瞬态节奏表现力。
- 采用受阻尼谐振子解析解（$\zeta = 0.83, \omega_n = 27.54\text{ rad/s}$）实现二阶弹簧动力学，在帧率波动时保持平滑稳定。
- 提供 Swift（Accelerate vDSP）与 Web（TypeScript / Canvas 2D）双端同构实现，跨平台最大绝对数值误差低于 $10^{-5}$。

---

## 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。
