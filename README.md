# SMART KNEE MONITOR — AI & AR
> **Complete Static Web Application for GitHub Pages**  
> *HTML5 &bull; Vanilla CSS3 &bull; Vanilla JavaScript &bull; SQLite WASM &bull; Web Bluetooth API &bull; Chart.js &bull; Three.js &bull; WebXR AR*

![Smart Knee Monitor Architecture](https://img.shields.io/badge/Architecture-100%25%20Static%20Client--Side-06b6d4?style=for-the-badge)
![Deployment](https://img.shields.io/badge/Deployment-GitHub%20Pages%20(HTTPS)-10b981?style=for-the-badge)
![Storage](https://img.shields.io/badge/Database-SQLite%20WASM%20%2B%20IndexedDB-8b5cf6?style=for-the-badge)
![Sensors](https://img.shields.io/badge/Hardware-ESP32%20BLE%20%2B%20Dual%20MPU6050-f59e0b?style=for-the-badge)

---

## 1. Project Objective & Architecture

**SMART KNEE MONITOR — AI & AR** is a responsive, zero-backend, client-side clinical research web application designed to monitor knee kinematics and kinetics in real time. It pairs directly with an ESP32 wearable sensor array over **Web Bluetooth (BLE)** and runs a relational **SQLite database compiled to WebAssembly (WASM)** directly in the browser's origin sandbox.

### System Architecture
```
[Thigh MPU-6050] (0x68) ──┐
[Lower MPU-6050] (0x69) ──┼──> [ESP32 DevKit V1] ──(BLE GATT Notifications)──> [Web Bluetooth API]
[FSR Force Sensor] ───────┤            │                                                │
[DS18B20 Temp Sensor] ────┘            └─> (20 Hz Telemetry Stream)                     ▼
                                                                                [Sensor Engine]
                                                                                (Complementary Filter)
                                                                                       │
                      ┌────────────────────────────────────────────────────────────────┼─────────────────────────────────┐
                      ▼                                                                ▼                                 ▼
             [SQLite WASM DB]                                                   [Chart.js / UI]                 [Three.js 3D & WebXR]
     (Persistent via IndexedDB)                                               (Live Angle & Temp)              (Anatomical Flexion Model)
              │               │                                                        │
              ▼               ▼                                                        ▼
         [.db Export]   [CSV Export]                                           [Browser AI Engine]
                                                                        (v1.2-rf-ensemble Classifier)
```

No Flask, Node.js, PHP, MySQL, or Firebase runtime is required. The entire application runs statically on **GitHub Pages**.

---

## 2. GitHub Pages Deployment Guide

Follow these exact steps to publish the application to GitHub Pages:

### Step 1: Create a GitHub Repository
1. Log into your GitHub account.
2. Click **New Repository**.
3. Name the repository: `smart-knee-monitor`.
4. Choose **Public** (required for free GitHub Pages).
5. Do not initialize with a README (this repository already provides one).

### Step 2: Push Project Files
Open your terminal in this project directory and run:
```bash
git init
git add .
git commit -m "Initial release of Smart Knee Monitor for GitHub Pages"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/smart-knee-monitor.git
git push -u origin main
```

### Step 3: Enable GitHub Pages
1. Go to your repository on GitHub.
2. Click **Settings** (top navigation tab).
3. In the left sidebar, click **Pages** (under *Code and automation*).
4. Under **Build and deployment**:
   - **Source**: Select `Deploy from a branch`.
   - **Branch**: Select `main` and folder `/(root)`.
5. Click **Save**.
6. Wait 1–2 minutes for GitHub Actions to complete the static build.
7. Your application will be live at:
   ```
   https://YOUR_USERNAME.github.io/smart-knee-monitor/
   ```

> **Subpath Compatibility**: All script imports, stylesheets, and assets use relative paths (`css/...`, `js/...`), ensuring full operation under your GitHub Pages subpath URL without domain-root assumptions.

---

## 3. Directory Layout

```
smart-knee-monitor/
├── index.html              # Core single-page application structure & UI panels
├── css/
│   └── style.css           # Cyber-medical dark mode styling & responsive grid
├── js/
│   ├── app.js              # Application orchestrator & telemetry dispatch
│   ├── ble.js              # Web Bluetooth manager, GATT connection & packet parsing
│   ├── sensors.js          # Complementary filter, angle calculation & simulator
│   ├── calibration.js      # Dual IMU neutral standing zeroing & profiles
│   ├── database.js         # SQLite WASM engine with IndexedDB binary persistence
│   ├── charts.js           # Multi-channel Chart.js telemetry visualization
│   ├── ai.js               # Browser AI movement inference engine (v1.2-rf-ensemble)
│   ├── knee3d.js           # Three.js 3D anatomical knee model & WebXR AR
│   ├── history.js          # SQLite session history, ROM aggregation & inspector
│   └── export.js           # SQLite .db export/restore, CSV export, clinical report
├── firmware/
│   └── esp32_knee_ble.ino  # Production Arduino C++ firmware for ESP32 DevKit V1
├── assets/
│   ├── icons/              # Scalable SVG icons and UI assets
│   └── models/             # 3D assets directory
├── libs/
│   └── README.md           # Pinned CDNs, library licenses, and offline notes
├── .nojekyll               # Prevents GitHub Pages Jekyll asset filtering
└── README.md               # Complete system documentation
```

---

## 4. Hardware Wiring & ESP32 BLE Firmware

The wearable sensing harness uses an **ESP32 DevKit V1**:

### Pin Connections
| Sensor | Sensor Pin | ESP32 GPIO | Description / Notes |
|--------|------------|------------|---------------------|
| **Thigh MPU-6050** | VCC | 3.3V | Primary 6-DOF IMU |
| | GND | GND | Ground |
| | SDA | GPIO 21 | Shared I2C Data bus |
| | SCL | GPIO 22 | Shared I2C Clock bus |
| | AD0 | GND | I2C Address = `0x68` |
| **Lower-Leg MPU-6050** | VCC | 3.3V | Secondary 6-DOF IMU |
| | GND | GND | Ground |
| | SDA | GPIO 21 | Shared I2C Data bus |
| | SCL | GPIO 22 | Shared I2C Clock bus |
| | AD0 | 3.3V | Sets I2C Address to `0x69` |
| **FSR Pressure Sensor** | Terminal 1 | 3.3V | Foot strike / Patellar load |
| | Terminal 2 | GPIO 34 | Connected to 10kΩ pull-down resistor to GND |
| **DS18B20 Temp** | VDD | 3.3V | Surface skin temperature |
| | GND | GND | Ground |
| | DQ (Data) | GPIO 4 | 4.7kΩ pull-up resistor to 3.3V |
| **Status LED** | Anode | GPIO 2 | Onboard LED (blinks advertising, solid connected) |

### Flashing the ESP32
1. Open the [firmware/esp32_knee_ble.ino](file:///c:/Users/VIKI/Desktop/NEE%20ALA/firmware/esp32_knee_ble.ino) sketch in the **Arduino IDE**.
2. Select **Board**: `DOIT ESP32 DEVKIT V1` and your COM Port.
3. Install required libraries via the Arduino Library Manager:
   - `DallasTemperature` by Miles Burton
   - `OneWire` by Paul Stoffregen
4. Click **Upload**. Open Serial Monitor at `115200 baud` to observe boot messages and sensor detection.

---

## 5. Web Bluetooth & Browser Compatibility

Web Bluetooth requires:
1. **Secure Context**: `https://` (provided automatically by GitHub Pages) or `http://localhost`.
2. **Supported Browser**:
   - **Google Chrome** (Windows 10/11, macOS, Linux, ChromeOS, Android)
   - **Microsoft Edge** (Windows, macOS)
   - **Opera** (Desktop, Android)
   - *Note for iOS*: Web Bluetooth is not supported in Safari. Use specialized browsers such as **Bluefy** or **WebBLE** on iOS.

### Testing Without Hardware (Simulation Engine)
To test every feature without physical sensors, click the **"Simulate Sensors"** checkbox in the top header. You can toggle between **Walking Gait**, **Flexion / Extension**, and **Stationary** to evaluate the 3D model, real-time charts, SQLite database, and AI classifier.

---

## 6. SQLite WASM Database Architecture

The application implements client-side relational storage using **SQLite 3.x compiled to WebAssembly via sql.js**:

- **Database Name**: `knee_monitor.db`
- **Persistence Mechanism**: Standard GitHub Pages sites do not serve the `COOP/COEP` headers required for multi-threaded SharedArrayBuffer OPFS. To ensure universal compatibility across all browsers without custom server headers, `database.js` mirrors the SQLite binary image into **IndexedDB** on every transaction.
- **Relational Schema**:
  - `monitoring_sessions` (id, start_time, end_time, duration_seconds, notes, calibration_status)
  - `sensor_readings` (id, session_id, timestamp, seq, 6-DOF thigh, 6-DOF lower, knee_angle, fsr_adc, surface_temperature, movement_class, sensor_status)
  - `body_temperature_entries` (id, session_id, timestamp, temperature_c, notes)
  - `calibration_profiles` (id, created_at, thigh_offset, lower_leg_offset, angle_offset, calibration_notes)
  - `ai_predictions` (id, session_id, timestamp, predicted_class, confidence, model_version)
- **Backup & Restore**:
  - **Export `.db` Binary**: Downloads a genuine SQLite `.db` file directly from browser memory.
  - **Restore `.db` Binary**: Upload any previous `.db` file to restore your full monitoring history with automated table validation.
  - **Export CSV**: Export individual session telemetry for MATLAB, Python, or Excel analysis.

---

## 7. AI Movement Inference Engine

A lightweight browser AI inference engine (`js/ai.js`) evaluates sliding kinematic windows (1.0 second, 20 samples) to classify movement into 5 states:
- **Stationary**: Low total gyro variance (< 35 deg²/s²), minimal angle change (< 4°).
- **Flexion**: Positive angular velocity (`angle_delta > 8°`) with joint loading.
- **Extension**: Negative angular velocity (`angle_delta < -8°`) toward anatomical zero.
- **Walking**: Cyclic gait pattern, alternating stance/swing phases, high gyro variance (> 140 deg²/s²), and periodic FSR pressure spikes.
- **Unknown**: Out-of-distribution or noisy motion.

Feature extraction directly mirrors the trained Random Forest model parameters in `ai/model_metrics.json` (`v1.2-rf-ensemble`).

---

## 8. Interactive 3D Knee Kinematics & WebXR AR

- **Anatomical Visualization**: Custom Three.js model featuring femoral shaft, medial/lateral femoral condyles, tibial plateau, tibia, fibula, and a dynamically gliding patella.
- **Live Motion**: The lower leg segment pivots smoothly in the sagittal plane around a transverse hinge axis according to live estimated flexion/extension angles.
- **WebXR Augmented Reality**: On ARCore/ARKit supported mobile browsers, the **"View in AR"** button allows projecting the 3D knee model onto real-world tabletop or floor surfaces. Standard interactive 3D WebGL is provided as an automatic fallback on desktop browsers.

---

## 9. Regulatory & Medical Disclaimer

> **IMPORTANT MEDICAL NOTICE**:  
> The Smart Knee Monitor is an academic and engineering research prototype. The joint angles, surface skin temperatures, and movement analyses are biomechanical estimates derived from external wearable IMUs and are **NOT certified medical devices**. They do not replace formal clinical goniometry or radiological evaluation, and must **never** be used to diagnose surgical implant failure, prosthetic loosening, arthrofibrosis, or periprosthetic joint infection.
