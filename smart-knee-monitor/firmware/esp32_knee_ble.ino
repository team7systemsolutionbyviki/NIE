/*
  ================================================================================
  SMART KNEE MONITOR — AI & AR: ESP32 BLE FIRMWARE
  Target Board: ESP32 DevKit V1 (ESP32-WROOM-32)
  ================================================================================
  
  HARDWARE WIRING:
  ----------------
  1. Thigh MPU-6050 (6-DOF IMU):
     - VCC  -> 3.3V
     - GND  -> GND
     - SDA  -> GPIO 21 (Default I2C Data)
     - SCL  -> GPIO 22 (Default I2C Clock)
     - AD0  -> GND (I2C Address = 0x68)

  2. Lower-Leg MPU-6050 (6-DOF IMU):
     - VCC  -> 3.3V
     - GND  -> GND
     - SDA  -> GPIO 21 (Shared I2C Data)
     - SCL  -> GPIO 22 (Shared I2C Clock)
     - AD0  -> 3.3V (I2C Address = 0x69)

  3. FSR (Force-Sensitive Resistor) Foot/Patella Pressure Sensor:
     - Pin 1 -> 3.3V
     - Pin 2 -> GPIO 34 (ADC1_CH6) with 10k Ohm pull-down resistor to GND

  4. DS18B20 Surface Temperature Sensor:
     - VDD  -> 3.3V
     - GND  -> GND
     - DATA -> GPIO 4 (with 4.7k Ohm pull-up resistor to 3.3V)

  5. Status LED:
     - Built-in LED on GPIO 2 (Blinks on advertising, solid when connected)
  ================================================================================
*/

#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <math.h>

// BLE UUID definitions (Must match js/ble.js)
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define DEVICE_NAME         "SMART-KNEE-ESP32"

// Pin Definitions
#define ONE_WIRE_BUS 4
#define FSR_PIN      34
#define STATUS_LED   2

// I2C Addresses
#define MPU_THIGH_ADDR 0x68
#define MPU_LOWER_ADDR 0x69

// Globals
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensors(&oneWire);

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;
uint32_t seqNumber = 0;
unsigned long lastSampleTime = 0;
const unsigned long sampleIntervalMs = 50; // 20 Hz transmission rate

// Sensor raw and calculated storage
struct IMUData {
  float ax, ay, az; // in g
  float gx, gy, gz; // in deg/s
  bool detected;
};

IMUData thighIMU = {0, 0, 0, 0, 0, 0, false};
IMUData lowerIMU = {0, 0, 0, 0, 0, 0, false};
float estimatedKneeAngle = 0.0f;
int rawFsrAdc = 0;
float surfaceTempC = 32.5f;

// Server Callbacks
class MyServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
    digitalWrite(STATUS_LED, HIGH);
    Serial.println("[BLE] Client connected successfully.");
  }

  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    digitalWrite(STATUS_LED, LOW);
    Serial.println("[BLE] Client disconnected. Restarting advertising...");
  }
};

// MPU-6050 helper functions
void initMPU(uint8_t addr, const char* label, bool &detected) {
  Wire.beginTransmission(addr);
  Wire.write(0x6B); // PWR_MGMT_1 register
  Wire.write(0);    // Wake up MPU-6050
  byte error = Wire.endTransmission();
  
  if (error == 0) {
    detected = true;
    Serial.printf("[I2C] %s initialized at 0x%02X\n", label, addr);
    
    // Set accelerometer sensitivity to +/- 4g
    Wire.beginTransmission(addr);
    Wire.write(0x1C);
    Wire.write(0x08);
    Wire.endTransmission();
    
    // Set gyro sensitivity to +/- 500 deg/s
    Wire.beginTransmission(addr);
    Wire.write(0x1B);
    Wire.write(0x08);
    Wire.endTransmission();
  } else {
    detected = false;
    Serial.printf("[I2C WARNING] %s not detected at 0x%02X (Error: %d)\n", label, addr, error);
  }
}

void readMPU(uint8_t addr, IMUData &data) {
  if (!data.detected) {
    // Fill dummy baseline if hardware not wired yet
    data.ax = 0.0f; data.ay = 0.98f; data.az = 0.15f;
    data.gx = 0.0f; data.gy = 0.0f;  data.gz = 0.0f;
    return;
  }

  Wire.beginTransmission(addr);
  Wire.write(0x3B); // Starting register for Accel X
  Wire.endTransmission(false);
  Wire.requestFrom(addr, (uint8_t)14, (uint8_t)true);

  if (Wire.available() >= 14) {
    int16_t rawAx = (Wire.read() << 8) | Wire.read();
    int16_t rawAy = (Wire.read() << 8) | Wire.read();
    int16_t rawAz = (Wire.read() << 8) | Wire.read();
    int16_t rawTemp = (Wire.read() << 8) | Wire.read();
    int16_t rawGx = (Wire.read() << 8) | Wire.read();
    int16_t rawGy = (Wire.read() << 8) | Wire.read();
    int16_t rawGz = (Wire.read() << 8) | Wire.read();

    // Sensitivity scale factors (+/- 4g = 8192 LSB/g; +/- 500 deg/s = 65.5 LSB/deg/s)
    data.ax = (float)rawAx / 8192.0f;
    data.ay = (float)rawAy / 8192.0f;
    data.az = (float)rawAz / 8192.0f;
    data.gx = (float)rawGx / 65.5f;
    data.gy = (float)rawGy / 65.5f;
    data.gz = (float)rawGz / 65.5f;
  }
}

// Compute relative anatomical knee flexion/extension angle
float calculateKneeAngle(const IMUData &thigh, const IMUData &lower) {
  // Pitch angle of segment relative to gravity vector
  float thighPitch = atan2(-thigh.ax, sqrt(thigh.ay * thigh.ay + thigh.az * thigh.az)) * 180.0f / M_PI;
  float lowerPitch = atan2(-lower.ax, sqrt(lower.ay * lower.ay + lower.az * lower.az)) * 180.0f / M_PI;
  
  float relativeAngle = fabs(lowerPitch - thighPitch);
  if (relativeAngle < 0.0f) relativeAngle = 0.0f;
  if (relativeAngle > 150.0f) relativeAngle = 150.0f;
  return relativeAngle;
}

void setup() {
  Serial.begin(115200);
  pinMode(STATUS_LED, OUTPUT);
  pinMode(FSR_PIN, INPUT);
  digitalWrite(STATUS_LED, LOW);

  Serial.println("=========================================");
  Serial.println(" SMART KNEE MONITOR - ESP32 FIRMWARE     ");
  Serial.println("=========================================");

  // Initialize I2C bus
  Wire.begin(21, 22, 400000); // 400 kHz Fast Mode I2C
  initMPU(MPU_THIGH_ADDR, "Thigh MPU6050", thighIMU.detected);
  initMPU(MPU_LOWER_ADDR, "Lower-Leg MPU6050", lowerIMU.detected);

  // Initialize DS18B20 OneWire temperature sensor
  tempSensors.begin();
  tempSensors.setWaitForConversion(false);
  tempSensors.requestTemperatures();

  // Initialize BLE Stack
  BLEDevice::init(DEVICE_NAME);
  // Request higher MTU for clean JSON payloads
  BLEDevice::setMTU(512);

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );

  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.println("[BLE] BLE Advertising started. Waiting for Web Bluetooth pairing...");
}

void loop() {
  unsigned long now = millis();

  // Sensor sampling & transmission loop (20 Hz)
  if (now - lastSampleTime >= sampleIntervalMs) {
    lastSampleTime = now;
    seqNumber++;

    // 1. Read IMUs
    readMPU(MPU_THIGH_ADDR, thighIMU);
    readMPU(MPU_LOWER_ADDR, lowerIMU);

    // 2. Read FSR ADC (0 - 4095)
    rawFsrAdc = analogRead(FSR_PIN);

    // 3. Estimate Knee Angle
    estimatedKneeAngle = calculateKneeAngle(thighIMU, lowerIMU);

    // 4. Read DS18B20 temperature periodically (~1 Hz)
    if (seqNumber % 20 == 0) {
      float t = tempSensors.getTempCByIndex(0);
      if (t > -50.0f && t < 85.0f) {
        surfaceTempC = t;
      }
      tempSensors.requestTemperatures();
    }

    // 5. Send packet over BLE if connected
    if (deviceConnected) {
      char payload[220];
      // Compact JSON representation for Web Bluetooth
      snprintf(payload, sizeof(payload),
        "{\"seq\":%u,\"tAx\":%.2f,\"tAy\":%.2f,\"tAz\":%.2f,"
        "\"tGx\":%.1f,\"tGy\":%.1f,\"tGz\":%.1f,"
        "\"lAx\":%.2f,\"lAy\":%.2f,\"lAz\":%.2f,"
        "\"lGx\":%.1f,\"lGy\":%.1f,\"lGz\":%.1f,"
        "\"ang\":%.1f,\"fsr\":%d,\"temp\":%.2f,\"st\":\"%s\"}",
        seqNumber,
        thighIMU.ax, thighIMU.ay, thighIMU.az,
        thighIMU.gx, thighIMU.gy, thighIMU.gz,
        lowerIMU.ax, lowerIMU.ay, lowerIMU.az,
        lowerIMU.gx, lowerIMU.gy, lowerIMU.gz,
        estimatedKneeAngle,
        rawFsrAdc,
        surfaceTempC,
        (thighIMU.detected && lowerIMU.detected) ? "OK" : "EMU"
      );

      pCharacteristic->setValue((uint8_t*)payload, strlen(payload));
      pCharacteristic->notify();
    }
  }

  // Handle BLE disconnect / reconnect cycle
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    Serial.println("[BLE] Re-advertising initiated.");
    oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }
}
