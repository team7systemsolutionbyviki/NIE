/**
 * SMART KNEE MONITOR — Web Bluetooth API Module
 * 
 * Manages BLE connection to ESP32 DevKit V1, GATT service discovery,
 * characteristic subscriptions, packet decoding, and disconnection/reconnection cycles.
 */

class KneeBLEManager {
  constructor() {
    // BLE Service and Characteristic UUIDs (Must match ESP32 firmware)
    this.SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
    this.CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

    this.device = null;
    this.server = null;
    this.service = null;
    this.characteristic = null;
    this.isConnected = false;
    this.lastPacketTime = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;

    // Callbacks
    this.onPacketReceived = null;
    this.onStatusChanged = null;
    this.onError = null;

    this.textDecoder = new TextDecoder('utf-8');
    this.lastSeq = -1;
  }

  /**
   * Check if Web Bluetooth is supported in current context
   */
  isSupported() {
    const isAvailable = !!(navigator && navigator.bluetooth);
    const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return {
      supported: isAvailable,
      secureContext: isSecure,
      message: !isAvailable 
        ? 'Web Bluetooth API is not supported in this browser. (Recommended: Chrome or Edge on Windows, Mac, Linux, or Android)' 
        : (!isSecure ? 'Web Bluetooth requires an HTTPS connection or localhost.' : 'Web Bluetooth is supported.')
    };
  }

  /**
   * Request device & establish connection
   */
  async connect() {
    const check = this.isSupported();
    if (!check.supported || !check.secureContext) {
      const msg = `${check.message}`;
      this._emitError(msg);
      throw new Error(msg);
    }

    try {
      this._emitStatus('scanning', 'Scanning for ESP32 Smart Knee device...');
      console.log('[BLE] Requesting Bluetooth Device...');

      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'SMART-KNEE' },
          { services: [this.SERVICE_UUID] }
        ],
        optionalServices: [this.SERVICE_UUID]
      }).catch(async (filterErr) => {
        // Fallback filter if custom names differ
        console.warn('[BLE] Filtered scan cancelled or failed, trying acceptAllDevices fallback:', filterErr);
        return await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [this.SERVICE_UUID]
        });
      });

      if (!this.device) {
        throw new Error('No Bluetooth device selected.');
      }

      console.log(`[BLE] Device selected: ${this.device.name || 'Unnamed'} (${this.device.id})`);
      this.device.addEventListener('gattserverdisconnected', (e) => this._onDisconnected(e));

      // Connect to GATT Server
      this._emitStatus('connecting', `Connecting to ${this.device.name || 'ESP32'}...`);
      this.server = await this.device.gatt.connect();

      // Discover GATT Service
      this._emitStatus('discovering', 'Discovering Smart Knee GATT Service...');
      this.service = await this.server.getPrimaryService(this.SERVICE_UUID);

      // Discover Characteristic
      this._emitStatus('subscribing', 'Subscribing to telemetry notifications...');
      this.characteristic = await this.service.getCharacteristic(this.CHARACTERISTIC_UUID);

      // Start Notifications
      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', (event) => this._handleNotification(event));

      this.isConnected = true;
      this.reconnectAttempts = 0;
      this._emitStatus('connected', `Connected to ${this.device.name || 'ESP32 Smart Knee'}`);
      console.log('[BLE] Notifications subscribed and active.');
      return true;
    } catch (err) {
      console.error('[BLE] Connection failed:', err);
      this.isConnected = false;
      this._emitStatus('disconnected', `Connection failed: ${err.message || err}`);
      this._emitError(err.message || 'BLE connection error');
      throw err;
    }
  }

  /**
   * Handle incoming BLE notifications
   */
  _handleNotification(event) {
    const value = event.target.value;
    this.lastPacketTime = new Date();

    try {
      const decodedString = this.textDecoder.decode(value);
      const parsed = this._parsePacket(decodedString, value);

      if (parsed && this.onPacketReceived) {
        this.onPacketReceived(parsed);
      }
    } catch (err) {
      console.warn('[BLE] Packet parsing warning:', err);
    }
  }

  /**
   * Parse and validate sensor packet
   */
  _parsePacket(rawText, rawBuffer) {
    // 1. Try parsing JSON format
    if (rawText.startsWith('{') && rawText.endsWith('}')) {
      try {
        const data = JSON.parse(rawText);
        return this._validateAndNormalize(data);
      } catch (e) {
        // partial packet or format error
      }
    }

    // 2. Fallback compact binary packet (32 bytes format)
    if (rawBuffer && rawBuffer.byteLength >= 28) {
      const view = new DataView(rawBuffer.buffer);
      // Format: seq(uint16), tAx, tAy, tAz (int16/1000), tGx, tGy, tGz (int16/10), lAx, lAy, lAz, lGx, lGy, lGz, ang(int16/10), fsr(uint16), temp(int16/100)
      try {
        const seq = view.getUint16(0, true);
        const tAx = view.getInt16(2, true) / 1000.0;
        const tAy = view.getInt16(4, true) / 1000.0;
        const tAz = view.getInt16(6, true) / 1000.0;
        const tGx = view.getInt16(8, true) / 10.0;
        const tGy = view.getInt16(10, true) / 10.0;
        const tGz = view.getInt16(12, true) / 10.0;

        const lAx = view.getInt16(14, true) / 1000.0;
        const lAy = view.getInt16(16, true) / 1000.0;
        const lAz = view.getInt16(18, true) / 1000.0;
        const lGx = view.getInt16(20, true) / 10.0;
        const lGy = view.getInt16(22, true) / 10.0;
        const lGz = view.getInt16(24, true) / 10.0;

        const ang = view.getInt16(26, true) / 10.0;
        const fsr = view.getUint16(28, true);
        const temp = view.byteLength >= 32 ? (view.getInt16(30, true) / 100.0) : 32.5;

        return this._validateAndNormalize({
          seq, tAx, tAy, tAz, tGx, tGy, tGz,
          lAx, lAy, lAz, lGx, lGy, lGz,
          ang, fsr, temp, st: 'OK'
        });
      } catch (binErr) {
        console.warn('[BLE] Binary decoding failed:', binErr);
      }
    }

    return null;
  }

  /**
   * Validate and normalize packet fields
   */
  _validateAndNormalize(d) {
    return {
      sequence_number: Number(d.seq || 0),
      timestamp: new Date().toISOString(),
      thigh_ax: Number(d.tAx ?? 0),
      thigh_ay: Number(d.tAy ?? 0),
      thigh_az: Number(d.tAz ?? 0),
      thigh_gx: Number(d.tGx ?? 0),
      thigh_gy: Number(d.tGy ?? 0),
      thigh_gz: Number(d.tGz ?? 0),
      lower_ax: Number(d.lAx ?? 0),
      lower_ay: Number(d.lAy ?? 0),
      lower_az: Number(d.lAz ?? 0),
      lower_gx: Number(d.lGx ?? 0),
      lower_gy: Number(d.lGy ?? 0),
      lower_gz: Number(d.lGz ?? 0),
      knee_angle: Math.max(0, Math.min(160, Number(d.ang ?? 0))),
      fsr_adc: Math.max(0, Math.min(4095, Number(d.fsr ?? 0))),
      surface_temperature: Number(d.temp ?? 32.5),
      sensor_status: d.st || 'OK',
      is_simulated: false
    };
  }

  /**
   * Disconnect from device
   */
  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      console.log('[BLE] Disconnecting from GATT Server...');
      this.device.gatt.disconnect();
    }
    this.isConnected = false;
    this._emitStatus('disconnected', 'Disconnected.');
  }

  /**
   * Handle unexpected disconnection
   */
  _onDisconnected(event) {
    console.warn('[BLE] Device disconnected unexpectedly:', event);
    this.isConnected = false;
    this._emitStatus('disconnected', 'Device disconnected.');

    // Attempt automatic reconnect if not user-initiated
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[BLE] Attempting auto-reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(async () => {
        try {
          if (this.device && !this.device.gatt.connected) {
            this.server = await this.device.gatt.connect();
            this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
            this.characteristic = await this.service.getCharacteristic(this.CHARACTERISTIC_UUID);
            await this.characteristic.startNotifications();
            this.characteristic.addEventListener('characteristicvaluechanged', (e) => this._handleNotification(e));
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this._emitStatus('connected', `Reconnected to ${this.device.name || 'ESP32'}`);
          }
        } catch (reErr) {
          console.warn('[BLE] Auto-reconnect failed:', reErr);
        }
      }, 2000);
    }
  }

  _emitStatus(state, message) {
    if (this.onStatusChanged) {
      this.onStatusChanged({
        state,
        message,
        deviceName: this.device ? this.device.name : 'None',
        lastPacketTime: this.lastPacketTime
      });
    }
  }

  _emitError(msg) {
    if (this.onError) {
      this.onError(msg);
    }
  }
}

// Global instance
window.kneeBLE = new KneeBLEManager();
