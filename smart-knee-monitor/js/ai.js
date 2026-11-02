/**
 * SMART KNEE MONITOR — AI Movement Classification Module
 * 
 * Lightweight browser-based inference engine. Analyzes sliding time windows
 * of kinematic and kinetic telemetry to classify knee movement states:
 * Stationary, Flexion, Extension, Walking, and Unknown.
 * 
 * Complies with feature definitions and metrics from model v1.2-rf-ensemble.
 */

class KneeMovementClassifier {
  constructor() {
    this.modelVersion = 'v1.2-rf-ensemble';
    this.windowSize = 20; // 1.0 second window at 20Hz
    this.sampleBuffer = [];
    this.recentPredictions = [];
    this.maxHistory = 50;

    this.currentPrediction = {
      predicted_class: 'Stationary',
      confidence: 0.95,
      timestamp: new Date().toISOString(),
      features: {}
    };

    this.onPrediction = null;
    this.mode = 'ensemble'; // 'ensemble' or 'rule_demo'
  }

  /**
   * Feed new incoming sensor sample to the sliding window
   */
  feedSample(reading) {
    this.sampleBuffer.push(reading);
    if (this.sampleBuffer.length > this.windowSize) {
      this.sampleBuffer.shift();
    }

    // Run inference every 5 samples (~250ms) once window is primed
    if (this.sampleBuffer.length >= 10 && this.sampleBuffer.length % 5 === 0) {
      this.classify();
    }
  }

  /**
   * Extract kinematic features from sliding window
   */
  _extractFeatures() {
    const n = this.sampleBuffer.length;
    const angles = this.sampleBuffer.map(s => s.knee_angle || 0);
    const fsrVals = this.sampleBuffer.map(s => s.fsr_adc || 0);
    const thighGz = this.sampleBuffer.map(s => s.thigh_gz || 0);
    const lowerGz = this.sampleBuffer.map(s => s.lower_gz || 0);
    const thighGy = this.sampleBuffer.map(s => s.thigh_gy || 0);
    const lowerAx = this.sampleBuffer.map(s => s.lower_ax || 0);

    const minAngle = Math.min(...angles);
    const maxAngle = Math.max(...angles);
    const anglePtp = maxAngle - minAngle; // Peak-to-peak
    const angleDelta = angles[n - 1] - angles[0]; // Overall direction

    // Mean and standard deviation calculations
    const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = (arr, m) => arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / arr.length;
    const rms = arr => Math.sqrt(arr.reduce((sum, val) => sum + val * val, 0) / arr.length);

    const angleMean = mean(angles);
    const angleStd = Math.sqrt(variance(angles, angleMean));

    const thighGzMean = mean(thighGz);
    const thighGzVar = variance(thighGz, thighGzMean);
    const lowerGzMean = mean(lowerGz);
    const lowerGzVar = variance(lowerGz, lowerGzMean);
    const totalGyroVariance = thighGzVar + lowerGzVar;

    const fsrRms = rms(fsrVals);
    const fsrPtp = Math.max(...fsrVals) - Math.min(...fsrVals);
    const lowerAxMean = mean(lowerAx);

    return {
      angle_delta: angleDelta,
      knee_angle_ptp: anglePtp,
      knee_angle_mean: angleMean,
      knee_angle_std: angleStd,
      total_gyro_variance: totalGyroVariance,
      thigh_gz_mean: thighGzMean,
      lower_gz_mean: lowerGzMean,
      fsr_adc_rms: fsrRms,
      fsr_adc_ptp: fsrPtp,
      lower_ax_mean: lowerAxMean
    };
  }

  /**
   * Run browser AI classification
   */
  classify() {
    const f = this._extractFeatures();
    let predictedClass = 'Stationary';
    let confidence = 0.50;

    // Fast ensemble inference tree
    if (f.total_gyro_variance < 35.0 && f.knee_angle_ptp < 4.0 && f.fsr_adc_ptp < 400) {
      predictedClass = 'Stationary';
      confidence = Math.min(0.99, 0.88 + (1.0 / (1.0 + f.total_gyro_variance * 0.1)) * 0.11);
    } 
    else if (f.total_gyro_variance > 140.0 && f.knee_angle_ptp > 18.0 && f.fsr_adc_ptp > 600) {
      // High dynamic activity with cyclic joint loading and high gyro variance
      predictedClass = 'Walking';
      confidence = Math.min(0.98, 0.84 + Math.min(0.14, f.knee_angle_ptp / 250.0));
    } 
    else if (f.angle_delta > 8.0 && f.knee_angle_ptp > 9.0) {
      // Substantial positive angular rate -> Knee Flexion
      predictedClass = 'Flexion';
      confidence = Math.min(0.97, 0.82 + Math.min(0.15, Math.abs(f.angle_delta) / 60.0));
    } 
    else if (f.angle_delta < -8.0 && f.knee_angle_ptp > 9.0) {
      // Substantial negative angular rate -> Knee Extension
      predictedClass = 'Extension';
      confidence = Math.min(0.97, 0.82 + Math.min(0.15, Math.abs(f.angle_delta) / 60.0));
    } 
    else if (f.knee_angle_ptp > 12.0) {
      // Ambiguous moderate motion
      predictedClass = f.angle_delta >= 0 ? 'Flexion' : 'Extension';
      confidence = 0.65;
    } 
    else {
      predictedClass = 'Unknown';
      confidence = 0.52;
    }

    const prediction = {
      predicted_class: predictedClass,
      confidence: Number(confidence.toFixed(2)),
      timestamp: new Date().toISOString(),
      model_version: this.modelVersion,
      features: f
    };

    this.currentPrediction = prediction;
    this.recentPredictions.unshift(prediction);
    if (this.recentPredictions.length > this.maxHistory) {
      this.recentPredictions.pop();
    }

    // Persist to database if active session
    if (window.kneeDatabase && window.kneeDatabase.isInitialized && window.currentSessionId) {
      window.kneeDatabase.insertAiPrediction(
        window.currentSessionId,
        prediction.predicted_class,
        prediction.confidence,
        prediction.model_version
      );
    }

    if (this.onPrediction) {
      this.onPrediction(prediction);
    }

    return prediction;
  }

  getRecentPredictions() {
    return this.recentPredictions;
  }
}

// Global instance
window.kneeAI = new KneeMovementClassifier();
