import { CONFIG, DIRECTIONS } from '../config/settings.js';

/**
 * YoloAPIInterface — handles the WebSocket connection to the Python backend,
 * renders camera feeds with bounding boxes, and maintains a stable per-vehicle
 * state map so positions can be smoothly interpolated on the simulation canvas.
 *
 * Protocol (new single-message format):
 *   Backend sends ONE JSON message per frame with shape:
 *   {
 *     timestamp, frame_id, fps, latency_ms, tracked,
 *     detections: [...],          // flat list of all detections
 *     directions: {
 *       north: {
 *         detections, roi_count, class_breakdown,
 *         fps, latency_ms, roi_coords,  // [x0,y0,x1,y1] normalised 0-1
 *         frame_b64, healthy, timestamp, age_ms
 *       },
 *       east: { ... }, south: { ... }, west: { ... }
 *     }
 *   }
 *
 * No separate IMAGES: message — images are embedded as base64 in the JSON.
 */
export class YoloAPIInterface {
    constructor(counterInstance) {
        this.counter = counterInstance;
        this.isConnected = false;
        this.ws = null;
        this._reconnectTimer = null;
        this._reconnectDelay = 1000;  // ms, doubles on each failure up to 30 s

        // Canvas rendering contexts for the 4 side-panel camera tiles
        this.camCtx = {};
        this.camCanvas = {};
        DIRECTIONS.forEach(dir => {
            const canvas = document.getElementById(`cam-${dir}`);
            if (canvas) {
                this.camCanvas[dir] = canvas;
                this.camCtx[dir] = canvas.getContext('2d');
            }
        });

        // ----------------------------------------------------------------
        // Stable vehicle identity map
        //   key  : vehicle_id (e.g. "north_7")
        //   value: { x, y, targetX, targetY, type, color, approach, speed,
        //            in_roi, lastSeen (ms timestamp) }
        // ----------------------------------------------------------------
        this._vehicleMap = new Map();

        // Public read — consumed by app.js every animation frame
        this.mappedVehicles = [];

        // Per-direction health from last backend message
        this.directionHealth = {};
        DIRECTIONS.forEach(dir => {
            this.directionHealth[dir] = { healthy: false, fps: 0, latency_ms: 0, age_ms: 0 };
        });

        // Callbacks wired by app.js
        this.onStatusChange  = null;
        this.onMetricsUpdate = null;

        // Track last message timestamp to detect local stale state
        this._lastMsgTime = 0;
    }

    // ======================================================================
    // CONNECTION
    // ======================================================================

    connect(url = 'ws://localhost:8000/ws/video') {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        clearTimeout(this._reconnectTimer);

        console.log(`[YOLO] Connecting to ${url} …`);
        if (this.onStatusChange) this.onStatusChange('CONNECTING');

        try {
            this.ws = new WebSocket(url);
        } catch (e) {
            console.error('[YOLO] WebSocket creation failed:', e);
            this._scheduleReconnect(url);
            return;
        }

        this.ws.onopen = () => {
            console.log('[YOLO] Connected.');
            this.isConnected = true;
            this._reconnectDelay = 1000;  // reset back-off
            if (this.onStatusChange) this.onStatusChange('RUNNING');
        };

        this.ws.onmessage = (event) => {
            this._lastMsgTime = Date.now();
            try {
                const data = JSON.parse(event.data);
                this._processMessage(data);
            } catch (e) {
                console.warn('[YOLO] Non-JSON message or parse error:', e.message);
            }
        };

        this.ws.onclose = (ev) => {
            console.warn(`[YOLO] Connection closed (code ${ev.code}).`);
            this.isConnected = false;
            if (this.onStatusChange) this.onStatusChange('NOT CONNECTED');
            this._scheduleReconnect(url);
        };

        this.ws.onerror = (err) => {
            console.error('[YOLO] WebSocket error:', err);
            this.isConnected = false;
            if (this.onStatusChange) this.onStatusChange('ERROR');
            // onclose fires right after onerror, which handles the reconnect
        };
    }

    disconnect() {
        clearTimeout(this._reconnectTimer);
        this._reconnectDelay = 1000;
        if (this.ws) {
            // Prevent the onclose handler from scheduling a reconnect
            this.ws.onclose = null;
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }

    sendSignalStates(lights) {
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const states = {};
        DIRECTIONS.forEach(dir => { states[dir] = lights[dir].state; });
        this.ws.send(`STATES:${JSON.stringify(states)}`);
    }

    // ======================================================================
    // MESSAGE PROCESSING
    // ======================================================================

    _processMessage(data) {
        // Expected: new merged format with 'directions' key
        if (!data || !data.directions) return;

        const now = Date.now();

        // ---- 1. Update per-direction camera feeds + health ----
        DIRECTIONS.forEach(dir => {
            const cam = data.directions[dir];
            if (!cam) return;

            // Update health info
            this.directionHealth[dir] = {
                healthy:         cam.healthy,
                fps:             cam.fps,
                latency_ms:      cam.latency_ms,
                age_ms:          cam.age_ms,
                roi_coords:      cam.roi_coords,
                roi_count:       cam.roi_count,
                class_breakdown: cam.class_breakdown || {},
            };

            // Render camera frame
            if (cam.frame_b64 && this.camCtx[dir]) {
                this._renderCameraFrame(dir, cam.frame_b64, cam.healthy);
            } else if (this.camCtx[dir] && !cam.frame_b64) {
                // No frame yet — show loading if we're connected, else disconnected
                if (this.isConnected) {
                    this._renderLoadingState(dir);
                } else {
                    this._renderDisconnectedState(dir);
                }
            }
        });

        // ---- 2. Update stable vehicle map ----
        const seenIds = new Set();

        for (const det of (data.detections || [])) {
            const id  = det.vehicle_id;
            const dir = det.approach;

            seenIds.add(id);

            // Compute target canvas position from backend's normalised coords
            // (same formula used in the original code, but now per-direction)
            const target = this._computeCanvasTarget(dir, det);

            if (this._vehicleMap.has(id)) {
                // Existing vehicle — update target; current pos will interpolate
                const v = this._vehicleMap.get(id);
                v.targetX   = target.x;
                v.targetY   = target.y;
                v.type      = det.vehicle_type;
                v.color     = CONFIG.VEHICLE_COLORS[det.vehicle_type] || '#ffffff';
                v.in_roi    = det.in_roi;
                v.lastSeen  = now;
            } else {
                // New vehicle — place immediately at target (no lerp lag on spawn)
                this._vehicleMap.set(id, {
                    id,
                    x:       target.x,
                    y:       target.y,
                    targetX: target.x,
                    targetY: target.y,
                    approach: dir,
                    type:     det.vehicle_type,
                    color:    CONFIG.VEHICLE_COLORS[det.vehicle_type] || '#ffffff',
                    speed:    0,
                    in_roi:   det.in_roi,
                    lastSeen: now,
                    width:    det.width,
                    height:   det.height,
                });
            }
        }

        // ---- 3. Age out vehicles no longer reported ----
        const staleMs = CONFIG.YOLO.STALE_MS;
        for (const [id, v] of this._vehicleMap) {
            if (!seenIds.has(id) && (now - v.lastSeen) > staleMs) {
                this._vehicleMap.delete(id);
            }
        }

        // ---- 4. Rebuild public array (interpolation is done in advance()) ----
        this.mappedVehicles = Array.from(this._vehicleMap.values());

        // ---- 5. Propagate aggregate metrics to UI ----
        if (this.onMetricsUpdate) {
            this.onMetricsUpdate({
                fps:     data.fps,
                latency: data.latency_ms,
                tracked: data.tracked,
            });
        }

        // Update per-direction health badges in the camera panel
        this._updateHealthBadges();
    }

    /**
     * Compute the simulation-canvas (x,y) target for a detected vehicle.
     *
     * In LHT layout (C=400, RW=240):
     *   North approach → right side of N-S road (x > C), vehicles move southward
     *   South approach → left side of N-S road (x < C), vehicles move northward
     *   East  approach → south side of E-W road (y > C), vehicles move westward
     *   West  approach → north side of E-W road (y < C), vehicles move eastward
     *
     * We distribute vehicles along the approach arm, spacing them evenly.
     * Position in queue is determined by the vehicle's order in _vehicleMap for
     * this direction (sorted by track_id for stability).
     */
    _computeCanvasTarget(dir, det) {
        const C  = CONFIG.CENTER_OFFSET;   // 400
        const RW = CONFIG.ROAD_WIDTH;      // 240
        const SP = CONFIG.YOLO.VEHICLE_SPACING; // 32

        // Count how many vehicles from same direction already have a slot
        // (use approach-order index for stable lane placement)
        let slotIndex = 0;
        for (const [id, v] of this._vehicleMap) {
            if (v.approach === dir && id !== det.vehicle_id) slotIndex++;
        }
        const offset = slotIndex * SP;

        let x = C, y = C;

        if (dir === 'north') {
            // Right half of N-S road, queued approaching south stop-line from above
            x = C + RW * 0.5;               // ~520
            y = (C - RW - 15) - offset;    // start at stop line, queue upward
            if (y < 5) y = 5;
        } else if (dir === 'south') {
            // Left half of N-S road, queued approaching north stop-line from below
            x = C - RW * 0.5;               // ~280
            y = (C + RW + 15) + offset;    // start at stop line, queue downward
            if (y > 795) y = 795;
        } else if (dir === 'east') {
            // Bottom half of E-W road, queued approaching west stop-line from right
            x = (C + RW + 15) + offset;   // start at stop line, queue rightward
            y = C + RW * 0.5;              // ~520
            if (x > 795) x = 795;
        } else if (dir === 'west') {
            // Top half of E-W road, queued approaching east stop-line from left
            x = (C - RW - 15) - offset;   // start at stop line, queue leftward
            y = C - RW * 0.5;             // ~280
            if (x < 5) x = 5;
        }

        return { x, y };
    }

    // ======================================================================
    // ANIMATION — call once per requestAnimationFrame to interpolate positions
    // ======================================================================

    /**
     * Smoothly interpolate each tracked vehicle toward its latest target.
     * Call this from the main animation loop every frame.
     */
    advance() {
        const alpha = CONFIG.YOLO.INTERP_SPEED;
        for (const v of this._vehicleMap.values()) {
            v.x += (v.targetX - v.x) * alpha;
            v.y += (v.targetY - v.y) * alpha;
        }
        // Rebuild array so app.js always sees fresh interpolated positions
        this.mappedVehicles = Array.from(this._vehicleMap.values());
    }

    // ======================================================================
    // CAMERA RENDERING
    // ======================================================================

    _renderCameraFrame(dir, frame_b64, healthy) {
        const ctx = this.camCtx[dir];
        if (!ctx) return;
        const canvas = this.camCanvas[dir];

        const img = new Image();
        img.onload = () => {
            // Draw the JPEG (bounding boxes already drawn by backend before encoding)
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Dim unhealthy feeds slightly so the stale state is obvious
            if (!healthy) {
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#ef4444';
                ctx.font = 'bold 14px monospace';
                ctx.fillText('STALE', 8, 20);
            }
        };
        img.src = 'data:image/jpeg;base64,' + frame_b64;
    }

    _renderDisconnectedState(dir) {
        const ctx = this.camCtx[dir];
        if (!ctx) return;
        const canvas = this.camCanvas[dir];

        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${dir.toUpperCase()} — NO FEED`, canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'left';
    }

    _renderLoadingState(dir) {
        const ctx = this.camCtx[dir];
        if (!ctx) return;
        const canvas = this.camCanvas[dir];

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Animated dots based on time
        const dots = '.'.repeat((Math.floor(Date.now() / 400) % 4));
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${dir.toUpperCase()} — Loading YOLO${dots}`, canvas.width / 2, canvas.height / 2 - 8);
        ctx.fillStyle = '#64748b';
        ctx.font = '11px monospace';
        ctx.fillText('Model warming up, please wait', canvas.width / 2, canvas.height / 2 + 12);
        ctx.textAlign = 'left';
    }

    // ======================================================================
    // HEALTH BADGES (per-direction FPS / latency / age shown below cameras)
    // ======================================================================

    _updateHealthBadges() {
        DIRECTIONS.forEach(dir => {
            const h = this.directionHealth[dir];
            if (!h) return;

            const fpsEl = document.getElementById(`cam-fps-${dir}`);
            const latEl = document.getElementById(`cam-lat-${dir}`);
            const cntEl = document.getElementById(`cam-cnt-${dir}`);

            if (fpsEl) fpsEl.textContent = h.healthy ? `${h.fps} fps` : 'STALE';
            if (latEl) latEl.textContent = h.healthy ? `${h.latency_ms} ms` : '—';
            if (cntEl) cntEl.textContent = h.healthy ? `${h.roi_count ?? 0} in ROI` : '—';
        });
    }

    // ======================================================================
    // AUTO-RECONNECT
    // ======================================================================

    _scheduleReconnect(url) {
        clearTimeout(this._reconnectTimer);
        const delay = Math.min(this._reconnectDelay, 3000);
        console.log(`[YOLO] Reconnecting in ${delay / 1000} s …`);
        this._reconnectTimer = setTimeout(() => {
            this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, 3000);
            this.connect(url);
        }, delay);
    }
}
