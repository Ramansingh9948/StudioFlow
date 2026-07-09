# StudioFlow 🎥✨
### *The Ultimate Interactive Screen Recording & YouTube Live Streaming Studio*

StudioFlow is a powerful, lightweight, and hardware-optimized desktop recording and live streaming application built with Electron, HTML5, and FFmpeg. Designed specifically for educators, content creators, and presenters, it delivers a premium, lag-free experience with advanced features like circular webcam bubbles, drawing tools, and direct YouTube live integration.

---

## 🚀 Key Features

### 1. 📡 Direct YouTube Live Streaming
* **One-Click Go-Live**: Stream directly to your YouTube channel via RTMP by just pasting your stream key in Settings.
* **Apple Silicon Hardware Acceleration**: Powered by Apple's native `h264_videotoolbox` encoder, offloading video encoding from the CPU to dedicated hardware. This ensures zero CPU-lag and a completely cool Mac (fanless M1/M2/M3/M4 friendly!).
* **Auto-Record Streams**: Choose to automatically save a copy of your live stream locally as a high-quality MP4.

### 2. 🎓 Interactive Teaching & Whiteboard Mode
* **Circular Webcam Bubble**: Present with a beautiful circular camera overlay that you can drag and resize.
* **Camera Filters**: Enhance your look in real-time with built-in presets: *Brighten*, *Smooth*, and *Glow*.
* **Annotate & Draw**: Draw directly on the canvas with customizable pens, shapes, colors, and line widths.
* **Teleprompter**: Write your script and let it scroll automatically in a smooth overlay window.
* **Chapters / Markers**: Place instant timestamp marks during your recording to easily index key moments.

### 3. 📱 Direct iPad USB Mirroring (Wired Projection)
* **Zero Latency**: Connect your iPad via USB, and project it directly onto the StudioFlow canvas as the main source with zero lag (perfect for writing with Apple Pencil).
* **Smart Device Detection**: Automatically lists connected iPads and iPhones in the source picker.

### 4. 🪟 Loom-style Floating Widget Mode
* **Compact Controls**: Minimize the entire StudioFlow UI into a tiny floating control bar and your circular webcam bubble.
* **Smart Click-Through**: Keeps your desktop fully interactive while you record.

### 5. 📖 Storytelling & Presenter Mode
* **Document Presentation**: Present alongside PDFs, slides, and images.
* **Virtual Backgrounds**: Apply smooth backdrops behind your documents or camera feed.

### 6. ⚡ Thermal & Performance Optimizations
* **Smart FPS Throttle**: Runs at a battery-saving 24fps during preview mode, automatically upgrading to full chosen framerate (30/60fps) only during active recording/streaming.
* **VP8 Codec Optimization**: Prefers hardware-accelerated VP8 compression over software VP9, avoiding thermal spikes.

---

## 🛠️ Getting Started

### Prerequisites
* **Node.js** (v16 or higher recommended)
* **FFmpeg** (For live streaming and format conversions)
  * *On macOS (via Homebrew)*: `brew install ffmpeg`

### Installation
1. Clone or copy the project files to your system.
2. Open your terminal in the project directory and install dependencies:
   ```bash
   npm install
   ```

### Running the App
Start StudioFlow in development mode with console logging enabled:
```bash
npm run dev
```

---

## ⚙️ Configuration & Streaming Settings
1. Open the **Settings** tab in the app.
2. Enter your **YouTube Stream Key** (from the YouTube Live Control Room).
3. Set your preferred **Quality** (High, Medium, Low) and **Framerate** (30fps / 60fps).
4. Connect your webcam and iPad to begin projecting!
