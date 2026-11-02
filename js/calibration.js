/**
 * SMART KNEE MONITOR — Calibration Module
 * 
 * Manages dual IMU anatomical zeroing, pitch alignment, neutral stance calibration,
 * 90-degree reference verification, and profile persistence to SQLite.
 */

class KneeCalibrator {
  constructor() {
    this.samples = [];
    this.maxSamples = 30; // 1.5 seconds of 20Hz samples
    this.isCalibrating = false;
    this.calibrationStage = 'idle'; // 'idle', 'collecting_neutral', 'completed'
    
    this.thighOffset = 0.0;
    this.lowerLegOffset = 0.0;
    this.angleOffset = 0.0;
    this.calibratedAt = null;

    this.onStatusChanged = null;
  }

  /**
   * Start 0-degree neutral standing calibration routine
   */
  startNeutralCalibration() {
    this.samples = [];
    this.isCalibrating = true;
    this.calibrationStage = 'collecting_neutral';
    this._notify('Collecting neutral position samples... Please stand upright and keep your leg straight.');
  }

  /**
   * Feed real-time incoming sensor sample during calibration
   */
  feedSample(reading) {
    if (!this.isCalibrating || this.calibrationStage !== 'collecting_neutral') return;

    // Calculate instantaneous pitch angles
    const thighPitch = Math.atan2(
      -reading.thigh_ax,
      Math.sqrt(reading.thigh_ay * reading.thigh_ay + reading.thigh_az * reading.thigh_az)
    ) * (180.0 / Math.PI);

    const lowerPitch = Math.atan2(
      -reading.lower_ax,
      Math.sqrt(reading.lower_ay * reading.lower_ay + reading.lower_az * reading.lower_az)
    ) * (180.0 / Math.PI);

    const diff = Math.abs(lowerPitch - thighPitch);

    this.samples.push({ thighPitch, lowerPitch, diff });

    if (this.onStatusChanged) {
      this.onStatusChanged({
        stage: this.calibrationStage,
        progress: Math.min(100, Math.round((this.samples.length / this.maxSamples) * 100)),
        currentAngle: diff
      });
    }

    if (this.samples.length >= this.maxSamples) {
      this._finalizeNeutralCalibration();
    }
  }

  /**
   * Compute average offsets and apply to sensor processor
   */
  _finalizeNeutralCalibration() {
    let sumThigh = 0, sumLower = 0, sumDiff = 0;
    for (const s of this.samples) {
      sumThigh += s.thighPitch;
      sumLower += s.lowerPitch;
      sumDiff += s.diff;
    }

    const n = this.samples.length;
    this.thighOffset = sumThigh / n;
    this.lowerLegOffset = sumLower / n;
    this.angleOffset = sumDiff / n;
    this.calibratedAt = new Date().toISOString();
    this.isCalibrating = false;
    this.calibrationStage = 'completed';

    // Apply to sensor engine
    if (window.kneeSensors) {
      window.kneeSensors.setCalibrationOffsets(this.thighOffset, this.lowerLegOffset, this.angleOffset);
    }

    // Persist to SQLite
    if (window.kneeDatabase && window.kneeDatabase.isInitialized) {
      window.kneeDatabase.saveCalibrationProfile(
        Number(this.thighOffset.toFixed(2)),
        Number(this.lowerLegOffset.toFixed(2)),
        Number(this.angleOffset.toFixed(2)),
        'Standard upright neutral standing calibration'
      );
    }

    this._notify(`Calibration completed. Zero reference established (Angle offset: ${this.angleOffset.toFixed(1)}°).`);
  }

  /**
   * Reset calibration back to raw factory zero
   */
  reset() {
    this.thighOffset = 0.0;
    this.lowerLegOffset = 0.0;
    this.angleOffset = 0.0;
    this.calibratedAt = null;
    this.isCalibrating = false;
    this.calibrationStage = 'idle';

    if (window.kneeSensors) {
      window.kneeSensors.resetCalibration();
    }
    this._notify('Calibration reset to raw IMU uncalibrated orientation.');
  }

  /**
   * Load previous calibration profile from database
   */
  async loadFromDatabase() {
    if (!window.kneeDatabase || !window.kneeDatabase.isInitialized) return false;
    try {
      const profile = window.kneeDatabase.getLatestCalibrationProfile();
      if (profile) {
        this.thighOffset = profile.thigh_offset || 0.0;
        this.lowerLegOffset = profile.lower_leg_offset || 0.0;
        this.angleOffset = profile.angle_offset || 0.0;
        this.calibratedAt = profile.created_at;
        this.calibrationStage = 'completed';

        if (window.kneeSensors) {
          window.kneeSensors.setCalibrationOffsets(this.thighOffset, this.lowerLegOffset, this.angleOffset);
        }
        console.log('[Calibration] Loaded latest profile from SQLite:', profile);
        return true;
      }
    } catch (e) {
      console.warn('[Calibration] Could not load profile:', e);
    }
    return false;
  }

  _notify(message) {
    if (this.onStatusChanged) {
      this.onStatusChanged({
        stage: this.calibrationStage,
        message,
        calibratedAt: this.calibratedAt,
        offsets: {
          thigh: this.thighOffset,
          lower: this.lowerLegOffset,
          angle: this.angleOffset
        }
      });
    }
  }
}

// Global instance
window.kneeCalibrator = new KneeCalibrator();
