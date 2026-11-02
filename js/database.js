/**
 * SMART KNEE MONITOR — Database Module (SQLite WASM + IndexedDB Persistence)
 * 
 * Provides robust SQLite relational database in the browser using WebAssembly.
 * Persists the binary SQLite file to IndexedDB for seamless reload survival without
 * requiring server-side COOP/COEP headers. Supports direct .db binary export & restore.
 */

class KneeDatabase {
  constructor() {
    this.db = null;
    this.SQL = null;
    this.isInitialized = false;
    this.dbName = 'knee_monitor.db';
    this.idbStoreName = 'sqlite_blobs';
    this.idbKey = 'knee_monitor_db_file';
    this.autoSaveTimer = null;
    this.isDirty = false;
  }

  /**
   * Initialize SQL.js and load or create database
   */
  async init() {
    if (this.isInitialized) return this.db;

    try {
      console.log('[SQLite WASM] Loading sql.js engine...');
      
      // Load sql.js wasm from cdn
      const config = {
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
      };

      if (typeof initSqlJs !== 'function') {
        throw new Error('sql.js library not loaded. Check script imports.');
      }

      this.SQL = await initSqlJs(config);

      // Check if existing database image exists in IndexedDB
      const savedBinary = await this._loadFromIndexedDB();
      if (savedBinary && savedBinary.byteLength > 0) {
        console.log(`[SQLite WASM] Restoring existing database (${savedBinary.byteLength} bytes) from IndexedDB`);
        this.db = new this.SQL.Database(new Uint8Array(savedBinary));
      } else {
        console.log('[SQLite WASM] Initializing fresh SQLite database instance');
        this.db = new this.SQL.Database();
      }

      // Initialize schema
      this._createTables();
      this.isInitialized = true;
      this._scheduleAutoSave();

      console.log('[SQLite WASM] Database initialization complete.');
      return this.db;
    } catch (err) {
      console.error('[SQLite WASM] Initialization failed:', err);
      throw err;
    }
  }

  /**
   * Create all required tables per specification
   */
  _createTables() {
    const schema = `
      CREATE TABLE IF NOT EXISTS monitoring_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_seconds INTEGER DEFAULT 0,
        notes TEXT,
        calibration_status TEXT DEFAULT 'uncalibrated'
      );

      CREATE TABLE IF NOT EXISTS sensor_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        timestamp TEXT NOT NULL,
        sequence_number INTEGER,
        thigh_ax REAL,
        thigh_ay REAL,
        thigh_az REAL,
        thigh_gx REAL,
        thigh_gy REAL,
        thigh_gz REAL,
        lower_ax REAL,
        lower_ay REAL,
        lower_az REAL,
        lower_gx REAL,
        lower_gy REAL,
        lower_gz REAL,
        knee_angle REAL,
        fsr_adc INTEGER,
        surface_temperature REAL,
        movement_class TEXT,
        sensor_status TEXT,
        FOREIGN KEY(session_id) REFERENCES monitoring_sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS body_temperature_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        timestamp TEXT NOT NULL,
        temperature_c REAL NOT NULL,
        notes TEXT,
        FOREIGN KEY(session_id) REFERENCES monitoring_sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS calibration_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        thigh_offset REAL DEFAULT 0.0,
        lower_leg_offset REAL DEFAULT 0.0,
        angle_offset REAL DEFAULT 0.0,
        calibration_notes TEXT
      );

      CREATE TABLE IF NOT EXISTS ai_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        timestamp TEXT NOT NULL,
        predicted_class TEXT NOT NULL,
        confidence REAL,
        model_version TEXT,
        FOREIGN KEY(session_id) REFERENCES monitoring_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sensor_readings_session ON sensor_readings(session_id);
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_time ON sensor_readings(timestamp);
      CREATE INDEX IF NOT EXISTS idx_body_temp_session ON body_temperature_entries(session_id);
    `;

    this.db.run(schema);
    this._markDirty();
  }

  /**
   * IndexedDB persistence helper: Load binary database image
   */
  _loadFromIndexedDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('[IndexedDB] IndexedDB not supported by browser.');
        return resolve(null);
      }

      const request = indexedDB.open('SmartKneeDB', 1);
      request.onupgradeneeded = (e) => {
        const idb = e.target.result;
        if (!idb.objectStoreNames.contains(this.idbStoreName)) {
          idb.createObjectStore(this.idbStoreName);
        }
      };

      request.onsuccess = (e) => {
        const idb = e.target.result;
        const tx = idb.transaction(this.idbStoreName, 'readonly');
        const store = tx.objectStore(this.idbStoreName);
        const getReq = store.get(this.idbKey);

        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      };

      request.onerror = () => resolve(null);
    });
  }

  /**
   * IndexedDB persistence helper: Save binary database image
   */
  async saveToStorage() {
    if (!this.db || !this.isDirty) return;

    try {
      const data = this.db.export();
      await new Promise((resolve, reject) => {
        if (!window.indexedDB) return resolve(false);

        const request = indexedDB.open('SmartKneeDB', 1);
        request.onsuccess = (e) => {
          const idb = e.target.result;
          const tx = idb.transaction(this.idbStoreName, 'readwrite');
          const store = tx.objectStore(this.idbStoreName);
          store.put(data, this.idbKey);
          tx.oncomplete = () => {
            this.isDirty = false;
            resolve(true);
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
      console.log(`[SQLite WASM] Persisted ${data.byteLength} bytes to IndexedDB.`);
    } catch (err) {
      console.error('[SQLite WASM] Error saving to IndexedDB:', err);
    }
  }

  _markDirty() {
    this.isDirty = true;
  }

  _scheduleAutoSave() {
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
    // Periodically sync dirty database changes every 3 seconds
    this.autoSaveTimer = setInterval(() => {
      if (this.isDirty) {
        this.saveToStorage();
      }
    }, 3000);
  }

  // ==========================================
  // SESSION OPERATIONS
  // ==========================================

  createSession(notes = '', calibrationStatus = 'uncalibrated') {
    const startTime = new Date().toISOString();
    const stmt = this.db.prepare(
      `INSERT INTO monitoring_sessions (start_time, notes, calibration_status) VALUES (?, ?, ?)`
    );
    stmt.run([startTime, notes, calibrationStatus]);
    stmt.free();

    const res = this.db.exec("SELECT last_insert_rowid() AS id");
    const newId = res[0].values[0][0];
    this._markDirty();
    return newId;
  }

  endSession(sessionId, notes = null) {
    const endTime = new Date().toISOString();
    const query = notes !== null 
      ? `UPDATE monitoring_sessions 
         SET end_time = ?, notes = ?, 
             duration_seconds = CAST((strftime('%s', ?) - strftime('%s', start_time)) AS INTEGER)
         WHERE id = ?`
      : `UPDATE monitoring_sessions 
         SET end_time = ?, 
             duration_seconds = CAST((strftime('%s', ?) - strftime('%s', start_time)) AS INTEGER)
         WHERE id = ?`;

    const params = notes !== null 
      ? [endTime, notes, endTime, sessionId]
      : [endTime, endTime, sessionId];

    const stmt = this.db.prepare(query);
    stmt.run(params);
    stmt.free();
    this._markDirty();
    this.saveToStorage();
  }

  updateSessionCalibration(sessionId, status) {
    const stmt = this.db.prepare(`UPDATE monitoring_sessions SET calibration_status = ? WHERE id = ?`);
    stmt.run([status, sessionId]);
    stmt.free();
    this._markDirty();
  }

  // ==========================================
  // SENSOR RECORDINGS
  // ==========================================

  insertSensorReading(r) {
    const stmt = this.db.prepare(`
      INSERT INTO sensor_readings (
        session_id, timestamp, sequence_number,
        thigh_ax, thigh_ay, thigh_az,
        thigh_gx, thigh_gy, thigh_gz,
        lower_ax, lower_ay, lower_az,
        lower_gx, lower_gy, lower_gz,
        knee_angle, fsr_adc, surface_temperature,
        movement_class, sensor_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      r.session_id || null,
      r.timestamp || new Date().toISOString(),
      r.sequence_number || 0,
      r.thigh_ax ?? 0, r.thigh_ay ?? 0, r.thigh_az ?? 0,
      r.thigh_gx ?? 0, r.thigh_gy ?? 0, r.thigh_gz ?? 0,
      r.lower_ax ?? 0, r.lower_ay ?? 0, r.lower_az ?? 0,
      r.lower_gx ?? 0, r.lower_gy ?? 0, r.lower_gz ?? 0,
      r.knee_angle ?? 0,
      r.fsr_adc ?? 0,
      r.surface_temperature ?? 0,
      r.movement_class || 'Unknown',
      r.sensor_status || 'OK'
    ]);
    stmt.free();
    this._markDirty();
  }

  /**
   * Fast Batch Insert using a Single SQL Transaction
   */
  insertSensorBatch(batch) {
    if (!batch || batch.length === 0) return;

    this.db.run('BEGIN TRANSACTION;');
    const stmt = this.db.prepare(`
      INSERT INTO sensor_readings (
        session_id, timestamp, sequence_number,
        thigh_ax, thigh_ay, thigh_az,
        thigh_gx, thigh_gy, thigh_gz,
        lower_ax, lower_ay, lower_az,
        lower_gx, lower_gy, lower_gz,
        knee_angle, fsr_adc, surface_temperature,
        movement_class, sensor_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of batch) {
      stmt.run([
        r.session_id || null,
        r.timestamp || new Date().toISOString(),
        r.sequence_number || 0,
        r.thigh_ax ?? 0, r.thigh_ay ?? 0, r.thigh_az ?? 0,
        r.thigh_gx ?? 0, r.thigh_gy ?? 0, r.thigh_gz ?? 0,
        r.lower_ax ?? 0, r.lower_ay ?? 0, r.lower_az ?? 0,
        r.lower_gx ?? 0, r.lower_gy ?? 0, r.lower_gz ?? 0,
        r.knee_angle ?? 0,
        r.fsr_adc ?? 0,
        r.surface_temperature ?? 0,
        r.movement_class || 'Unknown',
        r.sensor_status || 'OK'
      ]);
    }

    stmt.free();
    this.db.run('COMMIT;');
    this._markDirty();
  }

  // ==========================================
  // BODY TEMPERATURE & CALIBRATION & AI
  // ==========================================

  insertBodyTemperature(sessionId, tempC, notes = '') {
    const timestamp = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO body_temperature_entries (session_id, timestamp, temperature_c, notes)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run([sessionId || null, timestamp, parseFloat(tempC), notes]);
    stmt.free();
    this._markDirty();
    this.saveToStorage();
  }

  saveCalibrationProfile(thighOffset, lowerLegOffset, angleOffset, notes = '') {
    const createdAt = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO calibration_profiles (created_at, thigh_offset, lower_leg_offset, angle_offset, calibration_notes)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run([createdAt, thighOffset, lowerLegOffset, angleOffset, notes]);
    stmt.free();
    this._markDirty();
    this.saveToStorage();
  }

  getLatestCalibrationProfile() {
    const res = this.db.exec(`
      SELECT * FROM calibration_profiles ORDER BY id DESC LIMIT 1
    `);
    if (res.length > 0 && res[0].values.length > 0) {
      const cols = res[0].columns;
      const vals = res[0].values[0];
      const obj = {};
      cols.forEach((c, idx) => obj[c] = vals[idx]);
      return obj;
    }
    return null;
  }

  insertAiPrediction(sessionId, predictedClass, confidence, modelVersion = 'v1.2-rf-ensemble') {
    const timestamp = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO ai_predictions (session_id, timestamp, predicted_class, confidence, model_version)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run([sessionId || null, timestamp, predictedClass, confidence, modelVersion]);
    stmt.free();
    this._markDirty();
  }

  // ==========================================
  // QUERIES & HISTORY
  // ==========================================

  getAllSessions() {
    const res = this.db.exec(`
      SELECT s.*, 
        COUNT(r.id) as sample_count,
        MIN(r.knee_angle) as min_angle,
        MAX(r.knee_angle) as max_angle,
        AVG(r.knee_angle) as avg_angle,
        AVG(r.surface_temperature) as avg_temp
      FROM monitoring_sessions s
      LEFT JOIN sensor_readings r ON s.id = r.session_id
      GROUP BY s.id
      ORDER BY s.id DESC
    `);

    if (res.length === 0) return [];
    const cols = res[0].columns;
    return res[0].values.map(row => {
      const item = {};
      cols.forEach((col, idx) => item[col] = row[idx]);
      return item;
    });
  }

  getSessionReadings(sessionId) {
    const stmt = this.db.prepare(`
      SELECT * FROM sensor_readings WHERE session_id = ? ORDER BY id ASC
    `);
    stmt.bind([sessionId]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  getSessionBodyTemps(sessionId) {
    const stmt = this.db.prepare(`
      SELECT * FROM body_temperature_entries WHERE session_id = ? ORDER BY id ASC
    `);
    stmt.bind([sessionId]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  deleteSession(sessionId) {
    this.db.run('BEGIN TRANSACTION;');
    const s1 = this.db.prepare('DELETE FROM sensor_readings WHERE session_id = ?');
    s1.run([sessionId]);
    s1.free();

    const s2 = this.db.prepare('DELETE FROM body_temperature_entries WHERE session_id = ?');
    s2.run([sessionId]);
    s2.free();

    const s3 = this.db.prepare('DELETE FROM ai_predictions WHERE session_id = ?');
    s3.run([sessionId]);
    s3.free();

    const s4 = this.db.prepare('DELETE FROM monitoring_sessions WHERE id = ?');
    s4.run([sessionId]);
    s4.free();

    this.db.run('COMMIT;');
    this._markDirty();
    this.saveToStorage();
  }

  // ==========================================
  // EXPORT & RESTORE
  // ==========================================

  exportDatabaseBinary() {
    if (!this.db) return null;
    return this.db.export();
  }

  async importDatabaseBinary(arrayBuffer) {
    try {
      const uint8 = new Uint8Array(arrayBuffer);
      const testDb = new this.SQL.Database(uint8);
      // Validate schema
      const tables = testDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
      const tableNames = tables.length > 0 ? tables[0].values.map(v => v[0]) : [];
      
      if (!tableNames.includes('monitoring_sessions') || !tableNames.includes('sensor_readings')) {
        throw new Error('Invalid SQLite backup: required tables are missing.');
      }

      this.db.close();
      this.db = testDb;
      this.isDirty = true;
      await this.saveToStorage();
      console.log('[SQLite WASM] Database restored successfully.');
      return true;
    } catch (err) {
      console.error('[SQLite WASM] Database restore failed:', err);
      throw err;
    }
  }

  exportDatabaseJSON() {
    const sessions = this.getAllSessions();
    const data = {
      exported_at: new Date().toISOString(),
      version: '1.0',
      sessions: []
    };

    for (const s of sessions) {
      const readings = this.getSessionReadings(s.id);
      const temps = this.getSessionBodyTemps(s.id);
      data.sessions.push({
        session: s,
        readings: readings,
        body_temperatures: temps
      });
    }

    return JSON.stringify(data, null, 2);
  }

  async clearAllData() {
    this.db.run('BEGIN TRANSACTION;');
    this.db.run('DELETE FROM sensor_readings;');
    this.db.run('DELETE FROM body_temperature_entries;');
    this.db.run('DELETE FROM calibration_profiles;');
    this.db.run('DELETE FROM ai_predictions;');
    this.db.run('DELETE FROM monitoring_sessions;');
    this.db.run('COMMIT;');
    this._markDirty();
    await this.saveToStorage();
  }
}

// Global instance
window.kneeDatabase = new KneeDatabase();
