/**
 * SMART KNEE MONITOR — Three.js 3D Knee Kinematics & WebXR AR Module
 * 
 * Renders an anatomical 3D knee biomechanical model consisting of femur,
 * tibia, fibula, patella, and flexion hinge axis.
 * Animates in real-time according to live sensor angle or demo loop.
 * Includes WebXR AR surface projection where supported with fallback to WebGL.
 */

class Knee3DViewer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    
    // 3D Model Hierarchies
    this.rootGroup = null;
    this.femurGroup = null;
    this.tibiaGroup = null;
    this.patellaMesh = null;
    this.jointPivot = null;
    this.angleArcMesh = null;

    // Animation & State
    this.targetAngle = 0.0;
    this.currentAngle = 0.0;
    this.isDemoMode = false;
    this.demoTime = 0.0;
    this.animationFrameId = null;

    // WebXR state
    this.xrSession = null;
    this.isArSupported = false;
  }

  /**
   * Initialize Three.js scene, lighting, materials, and models
   */
  init() {
    if (!this.container || typeof THREE === 'undefined') {
      console.warn('[3D] Three.js not loaded or container not found.');
      return;
    }

    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 350;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e131f); // Deep dark cyber-medical background

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(2.8, 1.2, 4.2);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.xr.enabled = true;
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // OrbitControls
    if (typeof THREE.OrbitControls === 'function') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.target.set(0, 0, 0);
      this.controls.maxDistance = 12;
      this.controls.minDistance = 1.5;
    }

    // Lighting
    this._setupLighting();

    // Build anatomical model
    this._buildAnatomicalKneeModel();

    // Check WebXR AR support
    this._checkWebXR();

    // Handle Resize
    window.addEventListener('resize', () => this.onWindowResize());

    // Start render loop
    this._animate();
    console.log('[3D] Anatomical Knee 3D Model initialized.');
  }

  _setupLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(ambient);

    const mainLight = new THREE.DirectionalLight(0x4fd1c5, 1.2); // Cyan medical accent
    mainLight.position.set(5, 8, 6);
    this.scene.add(mainLight);

    const rimLight = new THREE.DirectionalLight(0x818cf8, 0.8); // Indigo rim
    rimLight.position.set(-6, -2, -4);
    this.scene.add(rimLight);

    const grid = new THREE.GridHelper(8, 16, 0x1e293b, 0x0f172a);
    grid.position.y = -2.2;
    this.scene.add(grid);
  }

  /**
   * Build clean, stylized anatomical segments (Femur, Tibia, Fibula, Patella)
   */
  _buildAnatomicalKneeModel() {
    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    // Bone Material (Pearlescent bone ivory with gentle sheen)
    const boneMaterial = new THREE.MeshStandardMaterial({
      color: 0xecf0f1,
      roughness: 0.35,
      metalness: 0.15
    });

    const jointMaterial = new THREE.MeshStandardMaterial({
      color: 0x06b6d4, // Cyan joint capsule accent
      roughness: 0.2,
      metalness: 0.5,
      transparent: true,
      opacity: 0.85
    });

    const cartilageMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.7
    });

    // 1. Femur (Thigh Segment) - Fixed above pivot
    this.femurGroup = new THREE.Group();
    
    // Femoral Shaft
    const femurShaftGeom = new THREE.CylinderGeometry(0.24, 0.28, 2.0, 24);
    const femurShaft = new THREE.Mesh(femurShaftGeom, boneMaterial);
    femurShaft.position.set(0, 1.1, 0);
    this.femurGroup.add(femurShaft);

    // Femoral Condyles (Medial & Lateral)
    const condyleGeom = new THREE.SphereGeometry(0.34, 24, 20);
    const condyleMedial = new THREE.Mesh(condyleGeom, boneMaterial);
    condyleMedial.position.set(0.28, 0.15, -0.05);
    condyleMedial.scale.set(0.9, 1.1, 1.2);
    this.femurGroup.add(condyleMedial);

    const condyleLateral = new THREE.Mesh(condyleGeom, boneMaterial);
    condyleLateral.position.set(-0.28, 0.15, -0.05);
    condyleLateral.scale.set(0.9, 1.1, 1.2);
    this.femurGroup.add(condyleLateral);

    // Femoral Cartilage Cap
    const cartilageGeom = new THREE.CylinderGeometry(0.38, 0.38, 0.12, 24);
    const cartilage = new THREE.Mesh(cartilageGeom, cartilageMaterial);
    cartilage.rotation.z = Math.PI / 2;
    cartilage.position.set(0, 0.05, -0.05);
    this.femurGroup.add(cartilage);

    this.rootGroup.add(this.femurGroup);

    // 2. Joint Pivot Axis (Hinge origin at (0, 0, 0))
    this.jointPivot = new THREE.Group();
    this.jointPivot.position.set(0, 0, 0);

    // Joint hinge cylinder marker
    const hingeGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.9, 16);
    const hinge = new THREE.Mesh(hingeGeom, jointMaterial);
    hinge.rotation.z = Math.PI / 2;
    this.jointPivot.add(hinge);

    // 3. Lower Leg (Tibia & Fibula) - Attached to Joint Pivot so it bends backward
    this.tibiaGroup = new THREE.Group();

    // Tibial Plateau (Top of shin)
    const plateauGeom = new THREE.BoxGeometry(0.72, 0.18, 0.55);
    const plateau = new THREE.Mesh(plateauGeom, boneMaterial);
    plateau.position.set(0, -0.15, -0.05);
    this.tibiaGroup.add(plateau);

    // Tibia Shaft (Main Shin bone)
    const tibiaShaftGeom = new THREE.CylinderGeometry(0.25, 0.20, 2.1, 24);
    const tibiaShaft = new THREE.Mesh(tibiaShaftGeom, boneMaterial);
    tibiaShaft.position.set(-0.06, -1.2, 0);
    this.tibiaGroup.add(tibiaShaft);

    // Fibula (Lateral slender bone)
    const fibulaGeom = new THREE.CylinderGeometry(0.08, 0.07, 1.9, 16);
    const fibula = new THREE.Mesh(fibulaGeom, boneMaterial);
    fibula.position.set(0.32, -1.15, -0.08);
    this.tibiaGroup.add(fibula);

    // Tibial Tuberosity bump (anterior attachment)
    const tuberosityGeom = new THREE.ConeGeometry(0.12, 0.25, 16);
    const tuberosity = new THREE.Mesh(tuberosityGeom, boneMaterial);
    tuberosity.position.set(-0.06, -0.45, 0.24);
    tuberosity.rotation.x = Math.PI / 2.6;
    this.tibiaGroup.add(tuberosity);

    this.jointPivot.add(this.tibiaGroup);
    this.rootGroup.add(this.jointPivot);

    // 4. Patella (Kneecap)
    const patellaGeom = new THREE.SphereGeometry(0.22, 20, 16);
    const patellaMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3 });
    this.patellaMesh = new THREE.Mesh(patellaGeom, patellaMat);
    this.patellaMesh.scale.set(0.9, 1.2, 0.5);
    this.patellaMesh.position.set(0, 0.25, 0.40);
    this.rootGroup.add(this.patellaMesh);
  }

  /**
   * Set target knee angle in degrees (0 = Full extension, 140 = Deep flexion)
   */
  setAngle(deg) {
    this.targetAngle = Math.max(0.0, Math.min(150.0, deg));
  }

  toggleDemoMode(enabled) {
    this.isDemoMode = enabled;
  }

  /**
   * Render loop
   */
  _animate() {
    this.animationFrameId = requestAnimationFrame(() => this._animate());

    if (this.controls) {
      this.controls.update();
    }

    if (this.isDemoMode) {
      this.demoTime += 0.03;
      // Cycle from 5 to 110 degrees smoothly
      this.targetAngle = 55.0 + Math.sin(this.demoTime) * 48.0;
    }

    // Smooth lerp to target angle
    this.currentAngle += (this.targetAngle - this.currentAngle) * 0.15;

    // Rotate tibia backwards around X axis (Flexion rotates around transverse axis)
    if (this.jointPivot) {
      const rad = (this.currentAngle * Math.PI) / 180.0;
      this.jointPivot.rotation.x = rad; // Sagittal flexion bend
    }

    // Dynamic patella tracking along trochlear groove
    if (this.patellaMesh) {
      const rad = (this.currentAngle * Math.PI) / 180.0;
      // Patella slides inferiorly and posteriorly with flexion
      this.patellaMesh.position.y = 0.25 - Math.sin(rad * 0.8) * 0.22;
      this.patellaMesh.position.z = 0.40 - (1.0 - Math.cos(rad * 0.7)) * 0.18;
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  onWindowResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Check WebXR AR capabilities
   */
  async _checkWebXR() {
    if (navigator.xr && typeof navigator.xr.isSessionSupported === 'function') {
      try {
        this.isArSupported = await navigator.xr.isSessionSupported('immersive-ar');
        console.log(`[WebXR] AR Immersive supported: ${this.isArSupported}`);
        const arBtn = document.getElementById('btn-enter-ar');
        if (arBtn) {
          arBtn.style.display = this.isArSupported ? 'inline-flex' : 'none';
        }
      } catch (e) {
        this.isArSupported = false;
      }
    }
  }

  /**
   * Start WebXR AR Session if available
   */
  async enterAR() {
    if (!this.isArSupported || !navigator.xr) {
      alert('WebXR Augmented Reality is not available on this device/browser. Interactive 3D WebGL mode is active.');
      return;
    }

    try {
      this.xrSession = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test', 'local-floor']
      });
      this.renderer.xr.setReferenceSpaceType('local-floor');
      await this.renderer.xr.setSession(this.xrSession);
      console.log('[WebXR] AR Session started.');

      this.xrSession.addEventListener('end', () => {
        this.xrSession = null;
        console.log('[WebXR] AR Session ended.');
      });
    } catch (err) {
      console.warn('[WebXR] Failed to start AR session:', err);
      alert('Could not start AR session: ' + err.message);
    }
  }
}

// Global instance
window.knee3D = null;
