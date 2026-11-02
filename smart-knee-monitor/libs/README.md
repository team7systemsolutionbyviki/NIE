# Third-Party Libraries and Dependencies

This project is built to run entirely statically on **GitHub Pages** (HTTPS) without any backend server.
All client-side libraries are loaded from pinned, high-reliability public CDNs with cryptographic integrity and fallback handling.

## Libraries Overview

| Library | Version | Purpose | CDN Provider |
|---------|---------|---------|--------------|
| **sql.js (SQLite WASM)** | `1.10.3` | In-browser relational SQLite database engine compiled to WebAssembly. Persisted via IndexedDB. | Cloudflare cdnjs / unpkg |
| **Chart.js** | `4.4.1` | High-performance HTML5 canvas charting for real-time sensor streams and telemetry graphs. | jsDelivr |
| **Three.js** | `r128` | WebGL 3D rendering engine for the interactive anatomical knee model and movement visualization. | Cloudflare cdnjs |
| **Three.js OrbitControls** | `r128` | Desktop mouse and mobile multi-touch camera rotation/zoom/pan controls for 3D visualization. | jsDelivr |

## SQLite WASM Details
- **Engine**: SQLite 3.x compiled to WebAssembly via Emscripten (`sql-wasm.js` and `sql-wasm.wasm`).
- **Persistence**: Standard GitHub Pages sites do not serve the `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers required for multi-threaded SharedArrayBuffer OPFS. To ensure 100% universal compatibility across all browsers (Chrome, Edge, Safari, Firefox, Opera) without server-side header modification, `database.js` automatically uses a high-performance **IndexedDB binary blob persistence layer**.
- **Transactions & Export**: Full SQL queries, transactions, prepared statements, and direct export/import of raw `.db` binary SQLite files are supported.

## WebXR AR (Augmented Reality) Support
- Uses the standard browser `navigator.xr` WebXR Device API with `'immersive-ar'` session mode.
- When accessed on ARCore/ARKit supported mobile devices (e.g. Chrome on Android), an **"Enter AR View"** button activates real-world surface projection of the 3D knee model.
- If WebXR is unsupported on the user's browser or device, the application gracefully falls back to the full 3D interactive orbit viewer with an informative status badge.
