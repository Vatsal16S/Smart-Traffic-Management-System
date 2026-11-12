import { CONFIG, DIRECTIONS } from '../config/settings.js';

/**
 * YoloCounter — tracks vehicle counts per direction.
 *
 * In YOLO mode:
 *   The backend already performs authoritative ROI counting.
 *   Call updateFromYolo(directionHealth) to consume those counts directly.
 *   This avoids double-counting or canvas-geometry mismatches.
 *
 * In simulation mode:
 *   Call update(vehicles, deltaTime, simulationSpeed) as before.
 *   ROI membership is checked geometrically on the simulation canvas.
 */
export class YoloCounter {
    constructor() {
        this.stats = {
            north: { count: 0, queue: 0, waitTime: 0, density: 'LOW' },
            south: { count: 0, queue: 0, waitTime: 0, density: 'LOW' },
            east:  { count: 0, queue: 0, waitTime: 0, density: 'LOW' },
            west:  { count: 0, queue: 0, waitTime: 0, density: 'LOW' }
        };
    }

    // ------------------------------------------------------------------
    // YOLO mode — consume pre-computed ROI counts from backend
    // ------------------------------------------------------------------

    /**
     * @param {Object} directionHealth  — from yoloAPI.directionHealth
     *   { north: { roi_count, class_breakdown, healthy, ... }, ... }
     */
    updateFromYolo(directionHealth) {
        DIRECTIONS.forEach(dir => {
            const h = directionHealth[dir];
            if (!h) return;

            const count = h.healthy ? (h.roi_count ?? 0) : this.stats[dir].count;
            this.stats[dir].count = count;
            // In YOLO mode we don't have per-vehicle speed from backend,
            // so approximate queue length as vehicles in ROI (all are waiting at red)
            this.stats[dir].queue = count;
            this.stats[dir].density = this._toDensity(count);
        });
    }

    // ------------------------------------------------------------------
    // Simulation mode — geometric ROI membership check on canvas coords
    // ------------------------------------------------------------------

    update(vehicles, deltaTime, simulationSpeed) {
        // Reset counts
        DIRECTIONS.forEach(dir => {
            this.stats[dir].count = 0;
            this.stats[dir].queue = 0;
        });

        const C  = CONFIG.CENTER_OFFSET;
        const RW = CONFIG.ROAD_WIDTH;
        const L  = CONFIG.ROI.LENGTH;

        vehicles.forEach(v => {
            if (this.isVehicleInROI(v, C, RW, L)) {
                this.stats[v.approach].count++;
                if (v.speed < 0.1) {
                    this.stats[v.approach].queue++;
                }
            }
        });

        DIRECTIONS.forEach(dir => {
            this.stats[dir].density = this._toDensity(this.stats[dir].count);
        });
    }

    // ------------------------------------------------------------------
    // Geometric ROI check (simulation mode only)
    // LHT: North → X > C side; South → X < C side
    //      East  → Y > C side; West  → Y < C side
    // ------------------------------------------------------------------

    isVehicleInROI(v, C, RW, L) {
        if (v.approach === 'north') {
            return (v.x >= C && v.x <= C + RW) && (v.y >= C - RW - L && v.y <= C - RW);
        } else if (v.approach === 'south') {
            return (v.x >= C - RW && v.x <= C) && (v.y >= C + RW && v.y <= C + RW + L);
        } else if (v.approach === 'east') {
            return (v.x >= C + RW && v.x <= C + RW + L) && (v.y >= C && v.y <= C + RW);
        } else if (v.approach === 'west') {
            return (v.x >= C - RW - L && v.x <= C - RW) && (v.y >= C - RW && v.y <= C);
        }
        return false;
    }

    // ------------------------------------------------------------------

    _toDensity(count) {
        if (count > 15) return 'VERY HIGH';
        if (count > 10) return 'HIGH';
        if (count > 5)  return 'MEDIUM';
        return 'LOW';
    }

    getStats(approach) {
        return this.stats[approach];
    }
}
