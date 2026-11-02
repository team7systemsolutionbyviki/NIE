/**
 * SMART KNEE MONITOR — Session History & Analytics Module
 * 
 * Manages stored SQLite monitoring sessions: inspection, side-by-side comparison,
 * metric aggregation (ROM, average angles, temperature profiles), and session deletion.
 */

class KneeHistoryManager {
  constructor() {
    this.selectedSessionId = null;
    this.comparisonSessions = [];
    this.detailChart = null;
  }

  /**
   * Load and render all sessions from SQLite to table/card list
   */
  async loadHistory() {
    const container = document.getElementById('history-sessions-list');
    if (!container) return;

    if (!window.kneeDatabase || !window.kneeDatabase.isInitialized) {
      container.innerHTML = `
        <div class="empty-state">
          <p>Database initializing or unavailable. Please wait...</p>
        </div>`;
      return;
    }

    try {
      const sessions = window.kneeDatabase.getAllSessions();

      if (!sessions || sessions.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <p>No monitoring sessions recorded yet.</p>
            <span class="subtext">Start a new session on the Live Dashboard to begin recording kinematics.</span>
          </div>`;
        return;
      }

      let html = '';
      for (const s of sessions) {
        const start = s.start_time ? new Date(s.start_time).toLocaleString() : 'Unknown';
        const dur = s.duration_seconds ? `${s.duration_seconds}s` : 'In progress / short';
        const minAng = s.min_angle !== null ? `${Number(s.min_angle).toFixed(1)}°` : '--';
        const maxAng = s.max_angle !== null ? `${Number(s.max_angle).toFixed(1)}°` : '--';
        const avgAng = s.avg_angle !== null ? `${Number(s.avg_angle).toFixed(1)}°` : '--';
        const avgTemp = s.avg_temp !== null ? `${Number(s.avg_temp).toFixed(1)}°C` : '--';
        const samples = s.sample_count || 0;

        html += `
          <div class="history-card" data-id="${s.id}">
            <div class="history-card-header">
              <div class="session-badge">
                <span class="session-id">Session #${s.id}</span>
                <span class="badge ${s.calibration_status === 'completed' ? 'badge-calibrated' : 'badge-uncalibrated'}">
                  ${s.calibration_status === 'completed' ? 'Calibrated' : 'Uncalibrated'}
                </span>
              </div>
              <span class="session-time">${start}</span>
            </div>

            <div class="history-metrics-grid">
              <div class="hist-metric">
                <span class="hist-label">Duration</span>
                <span class="hist-val">${dur}</span>
              </div>
              <div class="hist-metric">
                <span class="hist-label">ROM (Min - Max)</span>
                <span class="hist-val text-cyan">${minAng} - ${maxAng}</span>
              </div>
              <div class="hist-metric">
                <span class="hist-label">Avg Angle</span>
                <span class="hist-val">${avgAng}</span>
              </div>
              <div class="hist-metric">
                <span class="hist-label">Avg Surface Temp</span>
                <span class="hist-val text-amber">${avgTemp}</span>
              </div>
              <div class="hist-metric">
                <span class="hist-label">Data Points</span>
                <span class="hist-val">${samples}</span>
              </div>
            </div>

            ${s.notes ? `<div class="history-notes"><p><strong>Notes:</strong> ${s.notes}</p></div>` : ''}

            <div class="history-actions">
              <button class="btn btn-sm btn-outline" onclick="window.kneeHistory.viewDetails(${s.id})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                Inspect
              </button>
              <button class="btn btn-sm btn-outline" onclick="window.kneeExport.exportSessionCSV(${s.id})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                CSV
              </button>
              <button class="btn btn-sm btn-outline text-danger" onclick="window.kneeHistory.deleteSession(${s.id})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Delete
              </button>
            </div>
          </div>
        `;
      }

      container.innerHTML = html;
    } catch (err) {
      console.error('[History] Error loading history:', err);
      container.innerHTML = `<div class="error-banner">Failed to query session records: ${err.message}</div>`;
    }
  }

  /**
   * Open full session inspector modal
   */
  viewDetails(sessionId) {
    this.selectedSessionId = sessionId;
    const modal = document.getElementById('modal-session-detail');
    if (!modal) return;

    const readings = window.kneeDatabase.getSessionReadings(sessionId);
    const bodyTemps = window.kneeDatabase.getSessionBodyTemps(sessionId);
    const titleEl = document.getElementById('modal-detail-title');
    const contentEl = document.getElementById('modal-detail-content');

    if (titleEl) titleEl.textContent = `Session #${sessionId} Detailed Analysis`;

    if (!readings || readings.length === 0) {
      if (contentEl) contentEl.innerHTML = '<p class="p-4 text-muted">No telemetry samples recorded for this session.</p>';
      modal.classList.add('active');
      return;
    }

    // Compute metrics
    const angles = readings.map(r => r.knee_angle);
    const minAngle = Math.min(...angles).toFixed(1);
    const maxAngle = Math.max(...angles).toFixed(1);
    const avgAngle = (angles.reduce((a, b) => a + b, 0) / angles.length).toFixed(1);

    // Movement class distribution
    const classCounts = {};
    readings.forEach(r => {
      const cls = r.movement_class || 'Unknown';
      classCounts[cls] = (classCounts[cls] || 0) + 1;
    });

    let classBreakdown = Object.entries(classCounts)
      .map(([k, v]) => `<span><strong>${k}:</strong> ${v} samples (${Math.round((v / readings.length) * 100)}%)</span>`)
      .join(' &bull; ');

    let bodyTempHtml = '';
    if (bodyTemps && bodyTemps.length > 0) {
      bodyTempHtml = `
        <div class="modal-section">
          <h4>Clinical Body Temperatures Entered</h4>
          <ul>
            ${bodyTemps.map(bt => `<li>${new Date(bt.timestamp).toLocaleTimeString()} - <strong>${bt.temperature_c}°C</strong> ${bt.notes ? `(${bt.notes})` : ''}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    contentEl.innerHTML = `
      <div class="session-detail-summary">
        <div class="stats-cards-row">
          <div class="stat-mini-card">
            <span class="label">Total Samples</span>
            <span class="val">${readings.length}</span>
          </div>
          <div class="stat-mini-card">
            <span class="label">Knee ROM</span>
            <span class="val text-cyan">${minAngle}° - ${maxAngle}°</span>
          </div>
          <div class="stat-mini-card">
            <span class="label">Mean Angle</span>
            <span class="val">${avgAngle}°</span>
          </div>
        </div>

        <div class="modal-section mt-3">
          <h4>Movement Classification Distribution</h4>
          <div class="class-distribution-bar">${classBreakdown}</div>
        </div>

        ${bodyTempHtml}

        <div class="modal-section mt-3">
          <h4>Session Angle Progression</h4>
          <div class="modal-chart-wrap" style="height: 220px; position: relative;">
            <canvas id="chart-session-detail"></canvas>
          </div>
        </div>

        <div class="modal-actions-row mt-4">
          <button class="btn btn-primary" onclick="window.kneeExport.generateReport(${sessionId})">
            Generate Session Report
          </button>
          <button class="btn btn-outline" onclick="window.kneeExport.exportSessionCSV(${sessionId})">
            Export Session CSV
          </button>
          <button class="btn btn-outline" onclick="document.getElementById('modal-session-detail').classList.remove('active')">
            Close
          </button>
        </div>
      </div>
    `;

    modal.classList.add('active');

    // Render detail line chart
    setTimeout(() => {
      const ctx = document.getElementById('chart-session-detail');
      if (ctx && typeof Chart !== 'undefined') {
        const labels = readings.map((_, i) => i);
        if (this.detailChart) this.detailChart.destroy();
        this.detailChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Knee Angle (°)',
              data: angles,
              borderColor: '#06b6d4',
              borderWidth: 2,
              fill: false,
              pointRadius: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { display: false },
              y: {
                min: 0,
                max: 140,
                ticks: { callback: v => v + '°' }
              }
            }
          }
        });
      }
    }, 100);
  }

  async deleteSession(sessionId) {
    if (!confirm(`Are you sure you want to delete Session #${sessionId}? This will permanently remove its sensor readings from your browser SQLite database.`)) {
      return;
    }

    try {
      window.kneeDatabase.deleteSession(sessionId);
      console.log(`[History] Session #${sessionId} deleted.`);
      this.loadHistory();
    } catch (err) {
      alert(`Could not delete session: ${err.message}`);
    }
  }
}

// Global instance
window.kneeHistory = new KneeHistoryManager();
