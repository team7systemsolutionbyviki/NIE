/**
 * SMART KNEE MONITOR — Chart.js Telemetry Visualization Module
 * 
 * Manages real-time multi-channel canvas charts for Knee Angle (°),
 * Surface Temperature (°C), FSR Pressure Load (%), and AI Activity.
 */

class KneeCharts {
  constructor() {
    this.angleChart = null;
    this.tempChart = null;
    this.fsrChart = null;
    this.maxPoints = 60; // 60 data points visible on rolling live charts
  }

  /**
   * Initialize all live monitoring charts
   */
  init() {
    if (typeof Chart === 'undefined') {
      console.warn('[Charts] Chart.js is not loaded.');
      return;
    }

    // Default chart font & colors
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

    this._initAngleChart();
    this._initTempChart();
    this._initFsrChart();
    console.log('[Charts] Live Chart.js canvases initialized.');
  }

  _initAngleChart() {
    const ctx = document.getElementById('chart-angle');
    if (!ctx) return;

    this.angleChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Knee Flexion Angle (°)',
          data: [],
          borderColor: '#06b6d4', // Neon Cyan
          backgroundColor: 'rgba(6, 182, 212, 0.12)',
          borderWidth: 2.5,
          tension: 0.3,
          fill: true,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: {
            display: false,
            grid: { display: false }
          },
          y: {
            min: 0,
            max: 140,
            ticks: {
              stepSize: 30,
              callback: v => v + '°'
            },
            grid: { color: 'rgba(255, 255, 255, 0.06)' }
          }
        }
      }
    });
  }

  _initTempChart() {
    const ctx = document.getElementById('chart-temperature');
    if (!ctx) return;

    this.tempChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Skin Surface Temp (°C)',
          data: [],
          borderColor: '#f59e0b', // Amber/gold
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          borderWidth: 2,
          tension: 0.25,
          fill: true,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { display: false },
          y: {
            min: 25,
            max: 42,
            ticks: {
              stepSize: 5,
              callback: v => v + '°C'
            },
            grid: { color: 'rgba(255, 255, 255, 0.06)' }
          }
        }
      }
    });
  }

  _initFsrChart() {
    const ctx = document.getElementById('chart-fsr');
    if (!ctx) return;

    this.fsrChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'FSR Joint Load (%)',
          data: [],
          borderColor: '#10b981', // Emerald green
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          tension: 0.2,
          fill: true,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { display: false },
          y: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 25,
              callback: v => v + '%'
            },
            grid: { color: 'rgba(255, 255, 255, 0.06)' }
          }
        }
      }
    });
  }

  /**
   * Push new real-time reading onto charts
   */
  updateLive(reading) {
    const timeLabel = new Date().toLocaleTimeString().split(' ')[0];

    // 1. Angle Chart
    if (this.angleChart) {
      const d = this.angleChart.data;
      d.labels.push(timeLabel);
      d.datasets[0].data.push(reading.knee_angle);
      if (d.labels.length > this.maxPoints) {
        d.labels.shift();
        d.datasets[0].data.shift();
      }
      this.angleChart.update('none');
    }

    // 2. Temp Chart
    if (this.tempChart) {
      const d = this.tempChart.data;
      d.labels.push(timeLabel);
      d.datasets[0].data.push(reading.surface_temperature);
      if (d.labels.length > this.maxPoints) {
        d.labels.shift();
        d.datasets[0].data.shift();
      }
      this.tempChart.update('none');
    }

    // 3. FSR Chart
    if (this.fsrChart) {
      const d = this.fsrChart.data;
      d.labels.push(timeLabel);
      d.datasets[0].data.push(reading.fsr_normalized || ((reading.fsr_adc / 4095.0) * 100.0));
      if (d.labels.length > this.maxPoints) {
        d.labels.shift();
        d.datasets[0].data.shift();
      }
      this.fsrChart.update('none');
    }
  }

  /**
   * Reset / clear live chart buffers
   */
  clear() {
    [this.angleChart, this.tempChart, this.fsrChart].forEach(chart => {
      if (chart) {
        chart.data.labels = [];
        chart.data.datasets.forEach(ds => ds.data = []);
        chart.update();
      }
    });
  }
}

// Global instance
window.kneeCharts = new KneeCharts();
