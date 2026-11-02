/**
 * SMART KNEE MONITOR — Data Export, Backup & Restore Module
 * 
 * Supports Session CSV Export, SQLite Binary Database Export (.db),
 * Database Restore with schema validation, JSON Backup, and Printable Clinical Session Reports.
 */

class KneeExportManager {
  /**
   * Export a single session to CSV
   */
  exportSessionCSV(sessionId) {
    if (!window.kneeDatabase || !window.kneeDatabase.isInitialized) {
      alert('Database not ready.');
      return;
    }

    const readings = window.kneeDatabase.getSessionReadings(sessionId);
    if (!readings || readings.length === 0) {
      alert(`No sensor readings found for Session #${sessionId}`);
      return;
    }

    const headers = [
      'id', 'session_id', 'timestamp', 'sequence_number',
      'thigh_ax', 'thigh_ay', 'thigh_az',
      'thigh_gx', 'thigh_gy', 'thigh_gz',
      'lower_ax', 'lower_ay', 'lower_az',
      'lower_gx', 'lower_gy', 'lower_gz',
      'knee_angle', 'fsr_adc', 'surface_temperature',
      'movement_class', 'sensor_status'
    ];

    let csvContent = headers.join(',') + '\n';

    for (const r of readings) {
      const row = [
        r.id,
        r.session_id,
        `"${r.timestamp}"`,
        r.sequence_number,
        r.thigh_ax, r.thigh_ay, r.thigh_az,
        r.thigh_gx, r.thigh_gy, r.thigh_gz,
        r.lower_ax, r.lower_ay, r.lower_az,
        r.lower_gx, r.lower_gy, r.lower_gz,
        r.knee_angle,
        r.fsr_adc,
        r.surface_temperature,
        `"${r.movement_class || 'Unknown'}"`,
        `"${r.sensor_status || 'OK'}"`
      ];
      csvContent += row.join(',') + '\n';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = `smart_knee_session_${sessionId}_${new Date().toISOString().slice(0, 10)}.csv`;
    this._downloadBlob(blob, filename);
  }

  /**
   * Export the entire SQLite Database as a real .db binary file
   */
  exportSQLiteDatabase() {
    if (!window.kneeDatabase || !window.kneeDatabase.isInitialized) {
      alert('Database not ready.');
      return;
    }

    try {
      const binaryData = window.kneeDatabase.exportDatabaseBinary();
      if (!binaryData) {
        alert('Could not export database binary.');
        return;
      }

      const blob = new Blob([binaryData], { type: 'application/x-sqlite3' });
      const filename = `knee_monitor_backup_${new Date().toISOString().slice(0, 10)}.db`;
      this._downloadBlob(blob, filename);
      console.log(`[Export] Downloaded SQLite database binary (${binaryData.byteLength} bytes).`);
    } catch (err) {
      console.error('[Export] Database export failed:', err);
      alert('Export failed: ' + err.message);
    }
  }

  /**
   * Restore SQLite database from an uploaded .db binary file
   */
  async restoreSQLiteDatabase(file) {
    if (!file) return;

    if (!confirm('Restoring will replace the current local database with the uploaded backup. Continue?')) {
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      await window.kneeDatabase.importDatabaseBinary(buffer);
      alert('Database successfully restored from backup file.');
      
      // Refresh UI and history
      if (window.kneeHistory) {
        window.kneeHistory.loadHistory();
      }
    } catch (err) {
      console.error('[Export] Restore error:', err);
      alert(`Database restore failed: ${err.message}`);
    }
  }

  /**
   * Export full database in JSON format
   */
  exportJSONBackup() {
    if (!window.kneeDatabase || !window.kneeDatabase.isInitialized) return;

    try {
      const json = window.kneeDatabase.exportDatabaseJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const filename = `knee_monitor_backup_${new Date().toISOString().slice(0, 10)}.json`;
      this._downloadBlob(blob, filename);
    } catch (err) {
      alert('JSON export error: ' + err.message);
    }
  }

  /**
   * Generate Printable Clinical/Research Session Report
   */
  generateReport(sessionId) {
    if (!window.kneeDatabase) return;
    const readings = window.kneeDatabase.getSessionReadings(sessionId);
    const bodyTemps = window.kneeDatabase.getSessionBodyTemps(sessionId);
    if (!readings || readings.length === 0) return;

    const angles = readings.map(r => r.knee_angle);
    const minAngle = Math.min(...angles).toFixed(1);
    const maxAngle = Math.max(...angles).toFixed(1);
    const avgAngle = (angles.reduce((a, b) => a + b, 0) / angles.length).toFixed(1);
    const avgTemp = (readings.reduce((a, b) => a + b.surface_temperature, 0) / readings.length).toFixed(1);

    const reportWindow = window.open('', '_blank');
    if (!reportWindow) {
      alert('Pop-up blocked. Please allow pop-ups to view the printable session report.');
      return;
    }

    reportWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SMART KNEE MONITOR - Clinical Session Report #${sessionId}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; padding: 30px; max-width: 800px; margin: 0 auto; line-height: 1.5; }
          .header { border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0; }
          .meta { font-size: 13px; color: #64748b; margin-top: 5px; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 25px 0; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
          .card-val { font-size: 20px; font-weight: bold; color: #0284c7; margin-top: 4px; }
          .card-lbl { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }
          .section { margin-top: 25px; }
          h3 { font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; color: #334155; }
          .disclaimer { margin-top: 40px; padding: 15px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; font-size: 12px; color: #92400e; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
          th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
          th { background: #f1f5f9; }
          .print-btn { background: #0284c7; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
          @media print { .print-btn { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h1 class="title">SMART KNEE MONITOR &mdash; SESSION REPORT</h1>
            <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
          </div>
          <div class="meta">Session ID: #${sessionId} &bull; Generated: ${new Date().toLocaleString()} &bull; Origin: ${window.location.origin}</div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-lbl">Knee ROM</div>
            <div class="card-val">${minAngle}° &ndash; ${maxAngle}°</div>
          </div>
          <div class="card">
            <div class="card-lbl">Mean Angle</div>
            <div class="card-val">${avgAngle}°</div>
          </div>
          <div class="card">
            <div class="card-lbl">Avg Surface Temp</div>
            <div class="card-val">${avgTemp}°C</div>
          </div>
          <div class="card">
            <div class="card-lbl">Samples Recorded</div>
            <div class="card-val">${readings.length}</div>
          </div>
        </div>

        <div class="section">
          <h3>Telemetry Summary</h3>
          <p>Initial Reading: ${readings[0].timestamp} &bull; Concluding Reading: ${readings[readings.length - 1].timestamp}</p>
        </div>

        ${bodyTemps.length > 0 ? `
          <div class="section">
            <h3>Clinical Body Temperature Logs</h3>
            <table>
              <thead><tr><th>Time</th><th>Temperature (°C)</th><th>Clinical Notes</th></tr></thead>
              <tbody>
                ${bodyTemps.map(bt => `<tr><td>${bt.timestamp}</td><td><strong>${bt.temperature_c}°C</strong></td><td>${bt.notes || 'None'}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        <div class="disclaimer">
          <strong>Academic & Clinical Research Prototype Notice:</strong>
          This report is produced by an experimental dual-IMU wearable sensor platform. The joint angles, surface skin temperatures, and movement analyses are biomechanical estimates and are NOT certified diagnostic devices. They must not be used as standalone clinical proof of prosthetic loosening, arthrofibrosis, or infection.
        </div>
      </body>
      </html>
    `);
    reportWindow.document.close();
  }

  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }
}

// Global instance
window.kneeExport = new KneeExportManager();
