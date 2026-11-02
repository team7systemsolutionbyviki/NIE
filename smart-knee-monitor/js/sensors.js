/**
 * SMART KNEE MONITOR — Sensors & Processing Module
 * 
 * Handles sensor filtering, anatomical angle estimation with complementary filter,
 * FSR pressure normalization, and high-fidelity realistic sensor simulation.
 */

class SensorProcessor {
  constructor() {
    this.alpha = 0.96; // Complementary filter weight (gyro weight vs accel weight)
    this.lastTimestamp = null;
    this.fusedKneeAngle = 0.0;
    
    // Calibration offsets
    this.thighPitchOffset = 0.0;
    this.lowerPitchOffset = 0.0;
    this.kneeAngleOffset = 0.0;
    this.isCalibrated = false;

    // Simulation engine state
    this.isSimulating = false;
    this.simTimer = null;
    this.simSeq = 0;
    this.simMode = 'walking'; // 'walking', 'flexion_extension', 'stationary'
    this.simTimeSec = 0.0;

    // Listeners
    this.listeners = [];
  }

  setCalibrationOffsets(thighOffset, lowerOffset, angleOffset) {
    this.thighPitchOffset = thighOffset || 0.0;
    this.lowerPitchOffset = lowerOffset || 0.0;
    this.kneeAngleOffset = angleOffset || 0.0;
    this.isCalibrated = true;
  }

  resetCalibration() {
    this.thighPitchOffset = 0.0;
    this.lowerPitchOffset = 0.0;
    this.kneeAngleOffset = 0.0;
    this.isCalibrated = false;
  }

  /**
   * Process raw reading, apply complementary filter & calibration
   */
  processReading(raw) {
    const now = performance.now();
    let dt = 0.05; // Default 50ms (20Hz)
    if (this.lastTimestamp) {
      dt = Math.min(0.2, (now - this.lastTimestamp) / 1000.0);
    }
    this.lastTimestamp = now;

    // 1. Calculate raw accelerometer pitch angles
    // Pitch = atan2(-ax, sqrt(ay^2 + az^2))
    const thighAccPitch = Math.atan2(
      -raw.thigh_ax,
      Math.sqrt(raw.thigh_ay * raw.thigh_ay + raw.thigh_az * raw.thigh_az)
    ) * (180.0 / Math.PI) - this.thighPitchOffset;

    const lowerAccPitch = Math.atan2(
      -raw.lower_ax,
      Math.sqrt(raw.lower_ay * raw.lower_ay + raw.lower_az * raw.lower_az)
    ) * (180.0 / Math.PI) - this.lowerPitchOffset;

    const accelKneeAngle = Math.abs(lowerAccPitch - thighAccPitch);

    // 2. Gyroscope differential angular velocity (sagittal plane rotation)
    // Using lateral axis gyro (gx or gz depending on sensor placement; default gz for sagittal)
    const gyroRate = (raw.lower_gz || 0) - (raw.thigh_gz || 0);

    // 3. Complementary Filter Fusion
    if (this.fusedKneeAngle === 0.0 && accelKneeAngle > 0) {
      this.fusedKneeAngle = accelKneeAngle;
    } else {
      this.fusedKneeAngle = this.alpha * (this.fusedKneeAngle + gyroRate * dt) + (1.0 - this.alpha) * accelKneeAngle;
    }

    // Apply overall angle zero calibration and anatomical clamps (0 deg to 150 deg)
    let calibratedAngle = this.fusedKneeAngle - this.kneeAngleOffset;
    calibratedAngle = Math.max(0.0, Math.min(150.0, calibratedAngle));

    // 4. Normalized FSR calculation
    const rawFsr = raw.fsr_adc || 0;
    const normalizedFsr = Math.min(100.0, (rawFsr / 4095.0) * 100.0);

    const processed = {
      ...raw,
      timestamp: raw.timestamp || new Date().toISOString(),
      raw_knee_angle: raw.knee_angle,
      knee_angle: Number(calibratedAngle.toFixed(1)),
      thigh_pitch: Number(thighAccPitch.toFixed(1)),
      lower_pitch: Number(lowerAccPitch.toFixed(1)),
      fsr_normalized: Number(normalizedFsr.toFixed(1)),
      is_calibrated: this.isCalibrated,
      is_simulated: !!raw.is_simulated
    };

    // Broadcast to registered listeners
    this._broadcast(processed);
    return processed;
  }

  addListener(fn) {
    this.listeners.push(fn);
  }

  removeListener(fn) {
    this.listeners = this.listeners.filter(l => l !== fn);
  }

  _broadcast(data) {
    for (const listener of this.listeners) {
      try {
        listener(data);
      } catch (err) {
        console.error('[Sensors] Listener error:', err);
      }
    }
  }

  // ==========================================
  // REALISTIC SENSOR SIMULATION ENGINE
  // ==========================================

  startSimulation(mode = 'walking') {
    if (this.isSimulating) return;
    this.isSimulating = true;
    this.simMode = mode;
    this.simSeq = 0;
    this.simTimeSec = 0.0;
    console.log(`[Sensors] Realistic Sensor Simulation started in '${mode}' mode.`);

    const interval = 50; // 20 Hz
    this.simTimer = setInterval(() => {
      this.simTimeSec += interval / 1000.0;
      this.simSeq++;
      const sample = this._generateSimulatedPacket();
      this.processReading(sample);
    }, interval);
  }

  stopSimulation() {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    this.isSimulating = false;
    console.log('[Sensors] Simulation stopped.');
  }

  setSimMode(mode) {
    this.simMode = mode;
  }

  _generateSimulatedPacket() {
    const t = this.simTimeSec;
    let angle = 0;
    let tAx = 0, tAy = 0.98, tAz = 0.1;
    let lAx = 0, lAy = 0.98, lAz = 0.1;
    let tGx = 0, tGy = 0, tGz = 0;
    let lGx = 0, lGy = 0, lGz = 0;
    let fsr = 250;
    let temp = 33.2 + Math.sin(t * 0.05) * 0.4 + (Math.random() - 0.5) * 0.08;

    const noise = (scale = 0.02) => (Math.random() - 0.5) * scale;

    if (this.simMode === 'stationary') {
      angle = 5.0 + Math.sin(t * 0.5) * 1.5 + noise(0.4);
      tAy = 0.98 + noise();
      lAy = 0.97 + noise();
      fsr = Math.floor(400 + Math.sin(t * 0.2) * 50 + noise(20));
      tGz = noise(1.0);
      lGz = noise(1.0);
    } 
    else if (this.simMode === 'flexion_extension') {
      // Smooth continuous deep knee bend (0.3 Hz)
      const phase = Math.sin(t * 1.8);
      // Knee angle ranges from 10 deg to 95 deg
      angle = 50 + phase * 42 + noise(0.8);
      
      const rad = (angle * Math.PI) / 180.0;
      tAx = -Math.sin(rad * 0.5) + noise(0.04);
      tAy = Math.cos(rad * 0.5) + noise(0.04);
      lAx = -Math.sin(rad) + noise(0.04);
      lAy = Math.cos(rad) + noise(0.04);

      const dAngleDt = Math.cos(t * 1.8) * 1.8 * 42;
      tGz = dAngleDt * 0.4 + noise(2.0);
      lGz = -dAngleDt * 0.6 + noise(2.0);

      // Higher joint contact load in deep flexion
      fsr = Math.floor(600 + (angle / 95.0) * 1800 + noise(80));
    } 
    else {
      // 'walking' gait cycle (~1.1 Hz typical human walking cadence)
      const omega = 2.0 * Math.PI * 1.1;
      const gait = (t * 1.1) % 1.0; // 0 to 1 gait phase

      if (gait < 0.6) {
        // Stance phase (heel strike, loading response, push-off)
        angle = 15.0 + Math.sin(gait * Math.PI * 2.0) * 8.0 + noise(0.8);
        fsr = Math.floor(1800 + Math.sin(gait * Math.PI) * 1600 + noise(100)); // Foot strike force
      } else {
        // Swing phase (rapid knee flexion up to ~65 deg, then extension)
        const swingProgress = (gait - 0.6) / 0.4;
        angle = 20.0 + Math.sin(swingProgress * Math.PI) * 45.0 + noise(1.0);
        fsr = Math.floor(200 + noise(40)); // Foot in the air
      }

      const rad = (angle * Math.PI) / 180.0;
      tAx = -0.3 * Math.sin(omega * t) + noise(0.05);
      tAy = 0.9 * Math.cos(rad * 0.4) + noise(0.05);
      lAx = -0.7 * Math.sin(omega * t) + noise(0.05);
      lAy = 0.9 * Math.cos(rad) + noise(0.05);

      tGz = 40.0 * Math.cos(omega * t) + noise(4.0);
      lGz = 75.0 * Math.cos(omega * t) + noise(5.0);
      tGx = 15.0 * Math.sin(omega * t) + noise(2.0);
      lGx = 20.0 * Math.sin(omega * t) + noise(2.0);
    }

    return {
      sequence_number: this.simSeq,
      timestamp: new Date().toISOString(),
      thigh_ax: Number(tAx.toFixed(3)),
      thigh_ay: Number(tAy.toFixed(3)),
      thigh_az: Number(tAz.toFixed(3)),
      thigh_gx: Number(tGx.toFixed(2)),
      thigh_gy: Number(tGy.toFixed(2)),
      thigh_gz: Number(tGz.toFixed(2)),
      lower_ax: Number(lAx.toFixed(3)),
      lower_ay: Number(lAy.toFixed(3)),
      lower_az: Number(lAz.toFixed(3)),
      lower_gx: Number(lGx.toFixed(2)),
      lower_gy: Number(lGy.toFixed(2)),
      lower_gz: Number(lGz.toFixed(2)),
      knee_angle: Number(angle.toFixed(1)),
      fsr_adc: Math.max(0, Math.min(4095, fsr)),
      surface_temperature: Number(temp.toFixed(2)),
      sensor_status: 'SIMULATED',
      is_simulated: true
    };
  }
}

// Global instance
window.kneeSensors = new SensorProcessor();
