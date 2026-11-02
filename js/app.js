/**
 * SMART KNEE MONITOR — Main Application Orchestrator
 * 
 * Coordinates SQLite WASM, Web Bluetooth API, Sensor Processing,
 * Three.js 3D Viewer, WebXR AR, AI Movement Inference, and Charts.
 */

class SmartKneeApp {
  constructor() {
    this.currentSessionId = null;
    this.isRecording = false;
    this.isPaused = false;
    this.sessionStartTime = null;
    this.sessionTimer = null;
    this.recordBatch = [];
    this.batchFlushInterval = null;

    // Active Tab
    this.activeTab = 'dashboard';
  }

  async init() {
    console.log('[App] Initializing Smart Knee Monitor...');
    this._setupTabNavigation();
    this._setupEventListeners();

    // 1. Initialize SQLite WASM Database
    try {
      this.showToast('Initializing SQLite WASM Database...', 'info');
      await window.kneeDatabase.init();
      this.updateDbStatusBadge('Database Ready');
      this.showToast('SQLite WASM Database persistent storage ready.', 'success');
      
      // Load any existing calibration
      await window.kneeCalibrator.loadFromDatabase();
      this._updateCalibrationBadge();
    } catch (dbErr) {
      console.error('[App] Database setup error:', dbErr);
      this.updateDbStatusBadge('Database Error: ' + dbErr.message, true);
      this.showToast('SQLite WASM initialization failed. Using in-memory fallback.', 'error');
    }

    // 2. Initialize Charts
    if (window.kneeCharts) {
      window.kneeCharts.init();
    }

    // 3. Initialize 3D Viewer
    if (typeof Knee3DViewer === 'function') {
      window.knee3D = new Knee3DViewer('knee-3d-canvas');
      window.knee3D.init();
    }

    // 4. Hook Sensor Listener
    window.kneeSensors.addListener((reading) => this.onSensorData(reading));

    // 5. Hook BLE Callbacks
    window.kneeBLE.onPacketReceived = (packet) => {
      window.kneeSensors.processReading(packet);
    };

    window.kneeBLE.onStatusChanged = (status) => {
      this._updateBleStatus(status);
    };

    window.kneeBLE.onError = (err) => {
      this.showToast(`BLE Error: ${err}`, 'error');
    };

    // 6. Hook AI Classifier Callback
    window.kneeAI.onPrediction = (prediction) => {
      this._updateAiUI(prediction);
    };

    // 7. Hook Calibration Callback
    window.kneeCalibrator.onStatusChanged = (status) => {
      this._updateCalibrationUI(status);
    };

    // Check BLE browser support
    const bleCheck = window.kneeBLE.isSupported();
    if (!bleCheck.supported || !bleCheck.secureContext) {
      const banner = document.getElementById('ble-support-banner');
      if (banner) {
        banner.style.display = 'block';
        banner.textContent = bleCheck.message + ' You can use the "Simulate Sensors" toggle below to test all functionality!';
      }
    }

    // Load initial history
    if (window.kneeHistory) {
      window.kneeHistory.loadHistory();
    }

    console.log('[App] Application initialization complete.');
  }

  /**
   * Main Sensor Data Dispatcher
   */
  onSensorData(reading) {
    // 1. Update Real-time Dashboard Elements
    this._updateDashboardMetrics(reading);

    // 2. Update Charts
    if (window.kneeCharts) {
      window.kneeCharts.updateLive(reading);
    }

    // 3. Update 3D Knee Model
    if (window.knee3D) {
      window.knee3D.setAngle(reading.knee_angle);
    }

    // 4. Feed AI Engine
    if (window.kneeAI) {
      window.kneeAI.feedSample(reading);
    }

    // 5. Feed Calibration routine if actively calibrating
    if (window.kneeCalibrator && window.kneeCalibrator.isCalibrating) {
      window.kneeCalibrator.feedSample(reading);
    }

    // 6. Queue reading for database if active session
    if (this.isRecording && !this.isPaused && this.currentSessionId) {
      reading.session_id = this.currentSessionId;
      reading.movement_class = window.kneeAI ? window.kneeAI.currentPrediction.predicted_class : 'Unknown';
      this.recordBatch.push(reading);

      // Flush batch every 20 samples (~1 sec)
      if (this.recordBatch.length >= 20) {
        this._flushRecordBatch();
      }
    }
  }

  _flushRecordBatch() {
    if (this.recordBatch.length === 0 || !window.kneeDatabase) return;
    const batch = [...this.recordBatch];
    this.recordBatch = [];
    window.kneeDatabase.insertSensorBatch(batch);
  }

  /**
   * Update Dashboard Metric Cards
   */
  _updateDashboardMetrics(r) {
    // Knee Angle
    const angleEl = document.getElementById('val-knee-angle');
    if (angleEl) angleEl.textContent = `${r.knee_angle.toFixed(1)}°`;

    // Angle Bar fill
    const angleBar = document.getElementById('bar-knee-angle');
    if (angleBar) {
      const pct = Math.min(100, Math.max(0, (r.knee_angle / 140.0) * 100));
      angleBar.style.width = `${pct}%`;
    }

    // Thigh IMU
    const tAx = document.getElementById('val-thigh-ax');
    const tAy = document.getElementById('val-thigh-ay');
    const tAz = document.getElementById('val-thigh-az');
    const tGx = document.getElementById('val-thigh-gx');
    const tGy = document.getElementById('val-thigh-gy');
    const tGz = document.getElementById('val-thigh-gz');

    if (tAx) tAx.textContent = r.thigh_ax.toFixed(2);
    if (tAy) tAy.textContent = r.thigh_ay.toFixed(2);
    if (tAz) tAz.textContent = r.thigh_az.toFixed(2);
    if (tGx) tGx.textContent = r.thigh_gx.toFixed(1);
    if (tGy) tGy.textContent = r.thigh_gy.toFixed(1);
    if (tGz) tGz.textContent = r.thigh_gz.toFixed(1);

    // Lower Leg IMU
    const lAx = document.getElementById('val-lower-ax');
    const lAy = document.getElementById('val-lower-ay');
    const lAz = document.getElementById('val-lower-az');
    const lGx = document.getElementById('val-lower-gx');
    const lGy = document.getElementById('val-lower-gy');
    const lGz = document.getElementById('val-lower-gz');

    if (lAx) lAx.textContent = r.lower_ax.toFixed(2);
    if (lAy) lAy.textContent = r.lower_ay.toFixed(2);
    if (lAz) lAz.textContent = r.lower_az.toFixed(2);
    if (lGx) lGx.textContent = r.lower_gx.toFixed(1);
    if (lGy) lGy.textContent = r.lower_gy.toFixed(1);
    if (lGz) lGz.textContent = r.lower_gz.toFixed(1);

    // FSR
    const fsrAdc = document.getElementById('val-fsr-adc');
    const fsrPct = document.getElementById('val-fsr-pct');
    const fsrBar = document.getElementById('bar-fsr-pressure');
    const pct = r.fsr_normalized ?? ((r.fsr_adc / 4095.0) * 100.0);

    if (fsrAdc) fsrAdc.textContent = r.fsr_adc;
    if (fsrPct) fsrPct.textContent = `${pct.toFixed(0)}%`;
    if (fsrBar) fsrBar.style.width = `${pct}%`;

    // Temperature
    const tempEl = document.getElementById('val-surface-temp');
    if (tempEl) tempEl.textContent = `${r.surface_temperature.toFixed(1)}°C`;

    // Last packet timestamp
    const packetEl = document.getElementById('val-last-packet');
    if (packetEl) {
      packetEl.textContent = new Date().toLocaleTimeString();
    }

    // Sensor source badge
    const badge = document.getElementById('badge-sensor-source');
    if (badge) {
      if (r.is_simulated) {
        badge.className = 'badge badge-warning';
        badge.textContent = 'Simulated Data';
      } else {
        badge.className = 'badge badge-success';
        badge.textContent = 'Live ESP32 BLE';
      }
    }
  }

  _updateAiUI(pred) {
    const classEl = document.getElementById('val-ai-class');
    const confEl = document.getElementById('val-ai-confidence');
    const badgeEl = document.getElementById('badge-ai-state');

    if (classEl) classEl.textContent = pred.predicted_class;
    if (confEl) confEl.textContent = `${Math.round(pred.confidence * 100)}%`;

    if (badgeEl) {
      badgeEl.className = 'badge ' + (
        pred.predicted_class === 'Walking' ? 'badge-primary' :
        pred.predicted_class === 'Flexion' ? 'badge-info' :
        pred.predicted_class === 'Extension' ? 'badge-accent' :
        pred.predicted_class === 'Stationary' ? 'badge-success' : 'badge-warning'
      );
      badgeEl.textContent = pred.predicted_class;
    }
  }

  _updateBleStatus(status) {
    const pill = document.getElementById('ble-status-pill');
    const devName = document.getElementById('ble-device-name');
    const btnConnect = document.getElementById('btn-ble-connect');
    const btnDisconnect = document.getElementById('btn-ble-disconnect');

    if (devName) devName.textContent = status.deviceName || 'None';

    if (pill) {
      pill.className = `status-pill status-${status.state}`;
      pill.textContent = status.state.toUpperCase();
    }

    if (status.state === 'connected') {
      if (btnConnect) btnConnect.style.display = 'none';
      if (btnDisconnect) btnDisconnect.style.display = 'inline-flex';
      this.showToast(`Connected to ${status.deviceName}`, 'success');
    } else {
      if (btnConnect) btnConnect.style.display = 'inline-flex';
      if (btnDisconnect) btnDisconnect.style.display = 'none';
    }
  }

  _updateCalibrationUI(status) {
    const statusText = document.getElementById('calib-status-text');
    const progressBar = document.getElementById('calib-progress-bar');
    const calibOffsets = document.getElementById('calib-offsets-display');

    if (status.stage === 'collecting_neutral') {
      if (statusText) statusText.textContent = `Calibrating... (${status.progress || 0}%)`;
      if (progressBar) progressBar.style.width = `${status.progress || 0}%`;
    } else if (status.stage === 'completed') {
      if (statusText) statusText.textContent = 'Calibrated (Zero reference established)';
      if (progressBar) progressBar.style.width = '100%';
      if (calibOffsets && status.offsets) {
        calibOffsets.textContent = `Thigh: ${status.offsets.thigh.toFixed(1)}° | Lower: ${status.offsets.lower.toFixed(1)}° | Angle Offset: ${status.offsets.angle.toFixed(1)}°`;
      }
      this.showToast('Calibration completed successfully.', 'success');
      this._updateCalibrationBadge();
    } else {
      if (statusText) statusText.textContent = 'Uncalibrated (Using raw IMU gravity angles)';
      if (progressBar) progressBar.style.width = '0%';
      this._updateCalibrationBadge();
    }
  }

  _updateCalibrationBadge() {
    const badge = document.getElementById('badge-calibration-status');
    if (badge) {
      if (window.kneeCalibrator && window.kneeCalibrator.calibrationStage === 'completed') {
        badge.className = 'badge badge-success';
        badge.textContent = 'Calibrated';
      } else {
        badge.className = 'badge badge-muted';
        badge.textContent = 'Uncalibrated';
      }
    }
  }

  // ==========================================
  // SESSION RECORDING CONTROLS
  // ==========================================

  startSession() {
    if (this.isRecording) return;
    
    const calibStatus = (window.kneeCalibrator && window.kneeCalibrator.calibrationStage === 'completed') 
      ? 'completed' : 'uncalibrated';

    this.currentSessionId = window.kneeDatabase.createSession('Standard clinical exercise session', calibStatus);
    window.currentSessionId = this.currentSessionId;
    this.isRecording = true;
    this.isPaused = false;
    this.sessionStartTime = Date.now();
    this.recordBatch = [];

    // UI Updates
    document.getElementById('btn-session-start').style.display = 'none';
    document.getElementById('btn-session-pause').style.display = 'inline-flex';
    document.getElementById('btn-session-stop').style.display = 'inline-flex';
    document.getElementById('session-indicator').classList.add('recording');
    document.getElementById('val-session-id').textContent = `#${this.currentSessionId}`;

    // Timer
    this._startTimer();
    this.showToast(`Started Recording Session #${this.currentSessionId}`, 'success');
  }

  pauseSession() {
    if (!this.isRecording) return;
    this.isPaused = !this.isPaused;
    const btn = document.getElementById('btn-session-pause');
    if (this.isPaused) {
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        Resume
      `;
      this.showToast('Session recording paused.', 'warning');
    } else {
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
        Pause
      `;
      this.showToast('Session recording resumed.', 'info');
    }
  }

  stopSession() {
    if (!this.isRecording) return;

    this._flushRecordBatch();
    window.kneeDatabase.endSession(this.currentSessionId);
    this._stopTimer();

    this.isRecording = false;
    this.isPaused = false;
    const stoppedId = this.currentSessionId;
    this.currentSessionId = null;
    window.currentSessionId = null;

    // Reset UI
    document.getElementById('btn-session-start').style.display = 'inline-flex';
    document.getElementById('btn-session-pause').style.display = 'none';
    document.getElementById('btn-session-stop').style.display = 'none';
    document.getElementById('session-indicator').classList.remove('recording');
    document.getElementById('val-session-id').textContent = 'None';
    document.getElementById('val-session-timer').textContent = '00:00:00';

    this.showToast(`Session #${stoppedId} saved to SQLite database.`, 'success');

    // Refresh history
    if (window.kneeHistory) {
      window.kneeHistory.loadHistory();
    }
  }

  _startTimer() {
    this._stopTimer();
    this.sessionTimer = setInterval(() => {
      if (!this.isPaused && this.sessionStartTime) {
        const elapsedSec = Math.floor((Date.now() - this.sessionStartTime) / 1000);
        const hrs = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
        const mins = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
        const secs = String(elapsedSec % 60).padStart(2, '0');
        const el = document.getElementById('val-session-timer');
        if (el) el.textContent = `${hrs}:${mins}:${secs}`;
      }
    }, 1000);
  }

  _stopTimer() {
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }
  }

  // ==========================================
  // BODY TEMPERATURE MODAL
  // ==========================================

  saveBodyTemperature(tempC, notes) {
    if (!tempC || isNaN(tempC) || tempC < 30 || tempC > 45) {
      alert('Please enter a physiologically valid body temperature (e.g. 36.5 - 39.0 °C).');
      return;
    }

    window.kneeDatabase.insertBodyTemperature(this.currentSessionId, tempC, notes);
    this.showToast(`Clinical body temperature of ${tempC}°C recorded in SQLite.`, 'success');
    document.getElementById('modal-body-temp').classList.remove('active');
  }

  // ==========================================
  // NAVIGATION & UI
  // ==========================================

  _setupTabNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.target;
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        const activePane = document.getElementById(target);
        if (activePane) activePane.classList.add('active');

        this.activeTab = target;

        // Resize 3D viewer if switching to 3D tab
        if (target === 'pane-3d' && window.knee3D) {
          setTimeout(() => window.knee3D.onWindowResize(), 100);
        }

        // Reload history if switching to history tab
        if (target === 'pane-history' && window.kneeHistory) {
          window.kneeHistory.loadHistory();
        }
      });
    });
  }

  _setupEventListeners() {
    // BLE Connect / Disconnect
    const btnConnect = document.getElementById('btn-ble-connect');
    if (btnConnect) {
      btnConnect.addEventListener('click', () => window.kneeBLE.connect());
    }

    const btnDisconnect = document.getElementById('btn-ble-disconnect');
    if (btnDisconnect) {
      btnDisconnect.addEventListener('click', () => window.kneeBLE.disconnect());
    }

    // Session controls
    const btnStart = document.getElementById('btn-session-start');
    if (btnStart) btnStart.addEventListener('click', () => this.startSession());

    const btnPause = document.getElementById('btn-session-pause');
    if (btnPause) btnPause.addEventListener('click', () => this.pauseSession());

    const btnStop = document.getElementById('btn-session-stop');
    if (btnStop) btnStop.addEventListener('click', () => this.stopSession());

    // Simulation Toggle
    const simCheckbox = document.getElementById('checkbox-simulate');
    const simSelect = document.getElementById('select-sim-mode');
    if (simCheckbox) {
      simCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          const mode = simSelect ? simSelect.value : 'walking';
          window.kneeSensors.startSimulation(mode);
          this.showToast(`Sensor simulation active (${mode} mode).`, 'info');
        } else {
          window.kneeSensors.stopSimulation();
          this.showToast('Sensor simulation disabled.', 'info');
        }
      });
    }

    if (simSelect) {
      simSelect.addEventListener('change', (e) => {
        window.kneeSensors.setSimMode(e.target.value);
      });
    }

    // Calibration
    const btnCalibStart = document.getElementById('btn-calib-start');
    if (btnCalibStart) {
      btnCalibStart.addEventListener('click', () => window.kneeCalibrator.startNeutralCalibration());
    }

    const btnCalibReset = document.getElementById('btn-calib-reset');
    if (btnCalibReset) {
      btnCalibReset.addEventListener('click', () => window.kneeCalibrator.reset());
    }

    // 3D Controls
    const btnDemo3D = document.getElementById('btn-3d-demo');
    if (btnDemo3D) {
      btnDemo3D.addEventListener('click', () => {
        if (!window.knee3D) return;
        const current = window.knee3D.isDemoMode;
        window.knee3D.toggleDemoMode(!current);
        btnDemo3D.textContent = !current ? 'Stop 3D Demo Loop' : 'Start 3D Demo Loop';
      });
    }

    const btnEnterAr = document.getElementById('btn-enter-ar');
    if (btnEnterAr) {
      btnEnterAr.addEventListener('click', () => {
        if (window.knee3D) window.knee3D.enterAR();
      });
    }

    // Manual Body Temp modal
    const btnOpenTemp = document.getElementById('btn-open-body-temp');
    if (btnOpenTemp) {
      btnOpenTemp.addEventListener('click', () => {
        document.getElementById('modal-body-temp').classList.add('active');
      });
    }

    const btnSaveTemp = document.getElementById('btn-save-body-temp');
    if (btnSaveTemp) {
      btnSaveTemp.addEventListener('click', () => {
        const val = parseFloat(document.getElementById('input-body-temp').value);
        const notes = document.getElementById('input-body-temp-notes').value;
        this.saveBodyTemperature(val, notes);
      });
    }

    // Database exports
    const btnExportDb = document.getElementById('btn-export-db');
    if (btnExportDb) {
      btnExportDb.addEventListener('click', () => window.kneeExport.exportSQLiteDatabase());
    }

    const btnExportJson = document.getElementById('btn-export-json');
    if (btnExportJson) {
      btnExportJson.addEventListener('click', () => window.kneeExport.exportJSONBackup());
    }

    const fileRestore = document.getElementById('input-restore-db');
    if (fileRestore) {
      fileRestore.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          window.kneeExport.restoreSQLiteDatabase(e.target.files[0]);
        }
      });
    }
  }

  updateDbStatusBadge(text, isError = false) {
    const el = document.getElementById('badge-db-status');
    if (el) {
      el.className = `badge ${isError ? 'badge-danger' : 'badge-success'}`;
      el.textContent = text;
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span>${message}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 4000);
  }
}

// Global initialization on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new SmartKneeApp();
  window.app.init();
});
