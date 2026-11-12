export const CONFIG = {
    CANVAS_SIZE: 800,
    ROAD_WIDTH: 240, // Total width of one approach (80px per lane * 3 lanes)
    LANE_WIDTH: 80,
    CENTER_OFFSET: 400, // Center of the canvas (800 / 2)
    
    // Left-hand traffic configuration (Indian style)
    // Lane 1 (Leftmost): Left Turn
    // Lane 2 (Middle): Straight
    // Lane 3 (Rightmost): Right Turn (crosses traffic)
    
    SIMULATION: {
        SPEED: 1, // Multiplier
        FPS: 60,
        SPAWN_RATES: {
            low: 0.005,
            medium: 0.015,
            high: 0.03,
            very_high: 0.05
        },
        VEHICLE_TYPES: [
            { type: 'car',          width: 20, length: 40, maxSpeed: 2,   accel: 0.05, decel: 0.1,  color: '#3b82f6', prob: 0.55 },
            { type: 'motorcycle',   width: 10, length: 20, maxSpeed: 2.5, accel: 0.08, decel: 0.15, color: '#eab308', prob: 0.20 },
            { type: 'autorickshaw', width: 16, length: 28, maxSpeed: 1.8, accel: 0.06, decel: 0.12, color: '#f97316', prob: 0.10 },
            { type: 'bus',          width: 24, length: 70, maxSpeed: 1.2, accel: 0.02, decel: 0.05, color: '#22c55e', prob: 0.08 },
            { type: 'truck',        width: 24, length: 60, maxSpeed: 1.5, accel: 0.03, decel: 0.06, color: '#a855f7', prob: 0.07 }
        ],
        EMERGENCY_VEHICLE: {
            type: 'ambulance', width: 22, length: 50, maxSpeed: 3, accel: 0.1, decel: 0.2, color: '#ef4444'
        }
    },

    SIGNAL: {
        FIXED_TIMINGS: {
            green: 30,
            yellow: 5,
            red: 35
        },
        ADAPTIVE_THRESHOLDS: {
            low: { maxGreen: 15 },
            medium: { maxGreen: 25 },
            high: { maxGreen: 40 },
            very_high: { maxGreen: 50 }
        }
    },

    ROI: {
        LENGTH: 150, // How far back from the stop line the ROI extends (simulation canvas px)
        SHOW: true
    },

    // -----------------------------------------------------------------------
    // YOLO / real-time integration settings
    // -----------------------------------------------------------------------
    YOLO: {
        // Mark a camera stale if no update received for this long (ms)
        STALE_MS: 5000,
        // Position-interpolation rate per animation frame (0 = no movement, 1 = instant snap)
        // Lower = smoother, Higher = more responsive
        INTERP_SPEED: 0.12,
        // Spacing (px) between queued vehicles shown on the simulation canvas
        VEHICLE_SPACING: 32,
    },

    // Canonical vehicle colour map (used by both simulation and YOLO overlay)
    VEHICLE_COLORS: {
        car:          '#3b82f6',
        motorcycle:   '#eab308',
        autorickshaw: '#f97316',
        bus:          '#22c55e',
        truck:        '#a855f7',
        ambulance:    '#ef4444',
    }
};

export const DIRECTIONS = ['north', 'east', 'south', 'west'];
export const LANES = ['left', 'straight', 'right'];
