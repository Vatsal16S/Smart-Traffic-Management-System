import { CONFIG, DIRECTIONS, LANES } from './config/settings.js';
import { Intersection } from './simulation/intersection.js';
import { Renderer } from './simulation/renderer.js';
import { Vehicle } from './simulation/vehicle.js';
import { TrafficLightManager } from './simulation/trafficLight.js';
import { FixedController } from './traffic/fixedController.js';
import { AdaptiveController } from './traffic/adaptiveController.js';
import { MetricsCalculator } from './traffic/metrics.js';
import { YoloCounter } from './detection/counter.js';
import { Dashboard } from './ui/dashboard.js';
import { YoloAPIInterface } from './detection/yoloInterface.js';

class SimulationApp {
    constructor() {
        this.renderer     = new Renderer('simCanvas');
        this.intersection = new Intersection();
        this.yoloCounter  = new YoloCounter();
        this.dashboard    = new Dashboard();
        this.metrics      = new MetricsCalculator();
        this.yoloAPI      = new YoloAPIInterface(this.yoloCounter);
        
        this.trafficLights = new TrafficLightManager();
        this.controllers   = {
            fixed:    new FixedController(),
            adaptive: new AdaptiveController(this.yoloCounter)
        };
        
        this.activeMode      = 'adaptive';
        this.densityLevel    = 'medium';
        this.simulationSpeed = 1;
        this.detectionSource = 'simulation';
        
        this.vehicles        = [];
        this.vehicleIdCounter = 0;
        
        this.isRunning = false;
        this.lastTime  = performance.now();
        
        this._bindControls();
        
        // Initial signal state
        this.trafficLights.currentState = 'green';
        this.controllers[this.activeMode].onPhaseStart('north');
        
        requestAnimationFrame(this._loop.bind(this));
    }

    // ======================================================================
    // CONTROLS
    // ======================================================================

    _bindControls() {
        document.getElementById('btn-start').addEventListener('click', () => {
            this.isRunning = true;
            this.lastTime  = performance.now();
        });
        document.getElementById('btn-pause').addEventListener('click', () => {
            this.isRunning = false;
        });
        document.getElementById('btn-reset').addEventListener('click', () => {
            this.reset();
        });
        
        document.getElementById('density-select').addEventListener('change', e => {
            this.densityLevel = e.target.value;
        });
        
        document.getElementById('mode-select').addEventListener('change', e => {
            this.activeMode = e.target.value;
            this.dashboard.setMode(this.activeMode);
        });
        
        document.getElementById('speed-select').addEventListener('change', e => {
            this.simulationSpeed = parseFloat(e.target.value);
        });
        
        document.getElementById('btn-spawn-emergency').addEventListener('click', () => {
            this._spawnEmergencyVehicle();
        });
        
        document.getElementById('btn-toggle-roi').addEventListener('click', () => {
            CONFIG.ROI.SHOW = !CONFIG.ROI.SHOW;
        });

        // ---- YOLO source callbacks ----
        this.yoloAPI.onStatusChange = (status) => {
            // Defensive: support both new dashboard method and direct DOM fallback
            if (typeof this.dashboard.setYoloStatus === 'function') {
                this.dashboard.setYoloStatus(status);
            } else {
                const el = document.getElementById('yolo-status');
                if (el) {
                    el.textContent = status;
                    el.className = status === 'RUNNING' ? 'text-green'
                                 : status === 'ERROR'   ? 'text-red'
                                 : status === 'CONNECTING' ? 'text-yellow'
                                 : 'text-secondary';
                }
            }
        };

        this.yoloAPI.onMetricsUpdate = (metrics) => {
            // Defensive: support both new dashboard method and direct DOM fallback
            if (typeof this.dashboard.updateYoloMetrics === 'function') {
                this.dashboard.updateYoloMetrics(metrics);
            } else {
                const fps = document.getElementById('yolo-fps');
                const lat = document.getElementById('yolo-latency');
                const trk = document.getElementById('yolo-tracked');
                if (fps) fps.textContent = metrics.fps ?? '—';
                if (lat) lat.textContent = metrics.latency != null ? `${metrics.latency} ms` : '—';
                if (trk) trk.textContent = metrics.tracked ?? '—';
            }
        };

        // ---- Detection source selector ----
        document.getElementById('source-select').addEventListener('change', e => {
            this.detectionSource = e.target.value;
            if (this.detectionSource === 'yolo') {
                document.getElementById('yolo-panel').classList.remove('hidden');
                document.getElementById('camera-panel').classList.remove('hidden');
                document.getElementById('btn-connect-yolo').style.display = 'inline-block';
                if (!this.yoloAPI.isConnected) {
                    this.yoloAPI.connect();
                }
            } else {
                document.getElementById('yolo-panel').classList.add('hidden');
                document.getElementById('camera-panel').classList.add('hidden');
                document.getElementById('btn-connect-yolo').style.display = 'none';
                this.yoloAPI.disconnect();
            }
        });
        
        document.getElementById('btn-connect-yolo').addEventListener('click', () => {
            this.yoloAPI.connect();
        });

        document.getElementById('btn-run-demo').addEventListener('click', () => this._runDemoScenario());
        
        // Presentation mode
        document.getElementById('btn-presentation-mode').addEventListener('click', () => {
            document.getElementById('presentation-overlay').classList.remove('hidden');
        });
        document.getElementById('btn-exit-presentation').addEventListener('click', () => {
            document.getElementById('presentation-overlay').classList.add('hidden');
        });
    }

    // ======================================================================
    // RESET
    // ======================================================================

    reset() {
        this.vehicles          = [];
        this.vehicleIdCounter  = 0;
        this.metrics           = new MetricsCalculator();
        this.trafficLights     = new TrafficLightManager();
        this.controllers[this.activeMode].onPhaseStart('north');
        this.renderer.clear();
        this.dashboard.showEmergencyAlert(false);
    }

    // ======================================================================
    // VEHICLE SPAWNING (simulation mode only)
    // ======================================================================

    _spawnVehicle(forceEmergency = false) {
        if (this.detectionSource === 'yolo') return; // Never spawn in YOLO mode

        const approach = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
        const lane     = LANES[Math.floor(Math.random() * LANES.length)];
        const path     = this.intersection.paths[approach][lane];
        
        let config;
        if (forceEmergency) {
            config = CONFIG.SIMULATION.EMERGENCY_VEHICLE;
        } else {
            const rand = Math.random();
            let probSum = 0;
            for (const type of CONFIG.SIMULATION.VEHICLE_TYPES) {
                probSum += type.prob;
                if (rand <= probSum) { config = type; break; }
            }
            if (!config) config = CONFIG.SIMULATION.VEHICLE_TYPES[0];
        }

        const vehicle = new Vehicle(this.vehicleIdCounter++, approach, lane, config, path);
        this.vehicles.push(vehicle);
    }

    _spawnEmergencyVehicle() {
        this._spawnVehicle(true);
        if (this.vehicles.length > 0) {
            const v = this.vehicles[this.vehicles.length - 1];
            this.trafficLights.triggerEmergency(v.approach);
            this.dashboard.showEmergencyAlert(true);
            setTimeout(() => {
                this.trafficLights.clearEmergency();
                this.dashboard.showEmergencyAlert(false);
            }, 15000 / this.simulationSpeed);
        }
    }

    // ======================================================================
    // DEMO SCENARIO
    // ======================================================================

    _runDemoScenario() {
        this.reset();
        this.isRunning       = true;
        this.activeMode      = 'adaptive';
        this.detectionSource = 'simulation';
        this.dashboard.setMode('adaptive');
        document.getElementById('mode-select').value   = 'adaptive';
        document.getElementById('source-select').value = 'simulation';
        document.getElementById('yolo-panel').classList.add('hidden');
        document.getElementById('btn-connect-yolo').style.display = 'none';
        
        this.densityLevel = 'medium';
        document.getElementById('density-select').value = 'medium';
        
        // North traffic burst at +10 s
        setTimeout(() => {
            const burstId = setInterval(() => {
                if (Math.random() < 0.2 && this.isRunning) {
                    const lane = LANES[Math.floor(Math.random() * LANES.length)];
                    const path = this.intersection.paths['north'][lane];
                    const vehicle = new Vehicle(
                        this.vehicleIdCounter++, 'north', lane,
                        CONFIG.SIMULATION.VEHICLE_TYPES[0], path
                    );
                    this.vehicles.push(vehicle);
                }
            }, 500);
            setTimeout(() => clearInterval(burstId), 15000);
        }, 10000);

        // Emergency vehicle at +30 s
        setTimeout(() => {
            if (this.isRunning) this._spawnEmergencyVehicle();
        }, 30000);
    }

    // ======================================================================
    // MAIN ANIMATION LOOP
    // ======================================================================

    _loop(timestamp) {
        // Always advance YOLO vehicle interpolation so positions stay smooth
        // even while the simulation is paused.
        if (this.detectionSource === 'yolo') {
            this.yoloAPI.advance();
            // Update counts even when paused so Real-time Analysis panel is live
            this.yoloCounter.updateFromYolo(this.yoloAPI.directionHealth);
            // Keep backend informed of current signal states
            this.yoloAPI.sendSignalStates(this.trafficLights.lights);
        }

        if (!this.isRunning) {
            this.lastTime = timestamp;
            this._renderPaused();
            // Still update dashboard stats so the panel shows live YOLO counts
            if (this.detectionSource === 'yolo') {
                this.dashboard.updateTrafficStats(this.yoloCounter.stats);
            }
            requestAnimationFrame(this._loop.bind(this));
            return;
        }

        const rawDelta  = timestamp - this.lastTime;
        this.lastTime   = timestamp;
        // Cap deltaTime so a tab-backgrounding spike doesn't cause a huge jump
        const deltaTime = Math.min(rawDelta, 100) * this.simulationSpeed;

        // ---- Spawn (simulation mode) ----
        if (this.detectionSource === 'simulation') {
            const spawnRate = CONFIG.SIMULATION.SPAWN_RATES[this.densityLevel] * this.simulationSpeed;
            if (Math.random() < spawnRate) {
                this._spawnVehicle();
            }
        }

        // ---- Update traffic lights ----
        this.trafficLights.update(deltaTime, this.controllers[this.activeMode], this.simulationSpeed);

        // ---- Update counters ----
        if (this.detectionSource === 'yolo') {
            // counts already updated in the always-runs block above (works paused too)
        } else {
            this.yoloCounter.update(this.vehicles, deltaTime, this.simulationSpeed);
        }

        // ---- Update & prune simulation vehicles ----
        for (let i = this.vehicles.length - 1; i >= 0; i--) {
            const v          = this.vehicles[i];
            const lightState = this.trafficLights.lights[v.approach].state;
            v.update(deltaTime, lightState, this.vehicles, this.simulationSpeed);

            if (v.progress >= 1) {
                this.metrics.recordVehiclePass(v.waitTime / 1000);
                this.vehicles.splice(i, 1);
            }
        }

        // ---- Render ----
        this._render();

        // ---- UI updates ----
        this.dashboard.updateTrafficStats(this.yoloCounter.stats);
        this.dashboard.updateSignals(this.trafficLights.lights);
        this.dashboard.updateMetrics(this.metrics.getMetrics(this.activeMode));
        
        const priority =
            this.trafficLights.isEmergencyOverride ? this.trafficLights.emergencyPriority :
            (this.activeMode === 'adaptive' ? this.controllers.adaptive.currentPriority : null);
        this.dashboard.setPriority(priority);

        requestAnimationFrame(this._loop.bind(this));
    }

    // ======================================================================
    // RENDERING HELPERS
    // ======================================================================

    _renderPaused() {
        this.renderer.clear();
        this.renderer.drawIntersection(this.intersection);
        this.renderer.drawROI(CONFIG.ROI);
        if (this.detectionSource === 'yolo') {
            this._drawYoloVehicles();
        } else {
            this.renderer.drawVehicles(this.vehicles);
        }
        this.renderer.drawTrafficLights(this.trafficLights.lights);
    }

    _render() {
        this.renderer.clear();
        this.renderer.drawIntersection(this.intersection);
        this.renderer.drawROI(CONFIG.ROI);

        if (this.detectionSource === 'yolo') {
            this._drawYoloVehicles();
        } else {
            this.renderer.drawVehicles(this.vehicles);
        }

        this.renderer.drawTrafficLights(this.trafficLights.lights);
    }

    /**
     * Draw YOLO-detected vehicles on the simulation canvas using their
     * current interpolated canvas positions.
     *
     * Vehicles are drawn as filled rectangles whose size reflects their type,
     * with rotation matching their approach direction (LHT).
     */
    _drawYoloVehicles() {
        const ctx = this.renderer.ctx;

        for (const v of this.yoloAPI.mappedVehicles) {
            // Determine vehicle dimensions by type
            let w = 20, h = 40;
            if      (v.type === 'motorcycle')   { w = 10; h = 20; }
            else if (v.type === 'autorickshaw') { w = 16; h = 28; }
            else if (v.type === 'bus')          { w = 24; h = 70; }
            else if (v.type === 'truck')        { w = 24; h = 60; }
            else if (v.type === 'ambulance')    { w = 22; h = 50; }

            ctx.save();
            ctx.translate(v.x, v.y);

            // Rotate so vehicle faces the direction of travel (LHT)
            // North approach: vehicles travel southward (downward) → face down (0 rad)
            // South approach: vehicles travel northward (upward)   → face up (π rad)
            // East  approach: vehicles travel westward (leftward)  → face left (-π/2 rad, i.e. 3π/2)
            // West  approach: vehicles travel eastward (rightward) → face right (π/2 rad)
            if      (v.approach === 'south') ctx.rotate(Math.PI);
            else if (v.approach === 'east')  ctx.rotate(-Math.PI / 2);
            else if (v.approach === 'west')  ctx.rotate(Math.PI / 2);
            // north: no rotation needed

            // Vehicle body
            ctx.fillStyle = v.color || '#3b82f6';
            ctx.fillRect(-w / 2, -h / 2, w, h);

            // Windscreen highlight (top 20% of rectangle)
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h * 0.2);

            // Type label (first 3 chars)
            ctx.fillStyle = '#fff';
            ctx.font      = '7px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(v.type.slice(0, 3), 0, h * 0.1);

            ctx.restore();
        }
    }
}

// Initialise when DOM is ready
window.onload = () => {
    window.app = new SimulationApp();
};
