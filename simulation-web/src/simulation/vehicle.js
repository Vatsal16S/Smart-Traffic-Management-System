import { CONFIG } from '../config/settings.js';

export class Vehicle {
    constructor(id, approach, lane, config, path) {
        this.id = id;
        this.approach = approach;
        this.lane = lane;
        this.type = config.type;
        this.width = config.width;
        this.length = config.length;
        this.color = config.color;
        this.maxSpeed = config.maxSpeed;
        this.accel = config.accel;
        this.decel = config.decel;
        this.isEmergency = config.type === 'ambulance';
        
        this.path = path;
        this.progress = 0; // 0 to 1 along the path
        this.speed = this.maxSpeed; // Start at max speed
        this.x = path.start.x;
        this.y = path.start.y;
        this.angle = this.calculateInitialAngle();
        this.distanceTraveled = 0;
        this.totalPathLength = this.calculatePathLength();
        
        // State
        this.state = 'moving'; // moving, stopping, waiting
        this.waitTime = 0; // ms
        this.queuePos = 0;
    }

    calculateInitialAngle() {
        if (this.path.type === 'straight') {
            return Math.atan2(this.path.end.y - this.path.start.y, this.path.end.x - this.path.start.x);
        } else {
            // For curves, initial angle is towards the control point
            return Math.atan2(this.path.control.y - this.path.start.y, this.path.control.x - this.path.start.x);
        }
    }

    calculatePathLength() {
        if (this.path.type === 'straight') {
            return Math.hypot(this.path.end.x - this.path.start.x, this.path.end.y - this.path.start.y);
        } else {
            // Approximation for quadratic bezier
            // A precise calculation involves integration, but an approximation is fine for speed mapping
            const p0 = this.path.start, p1 = this.path.control, p2 = this.path.end;
            const cord = Math.hypot(p2.x - p0.x, p2.y - p0.y);
            const cont_net = Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y);
            return (2 * cord + cont_net) / 3;
        }
    }

    update(deltaTime, trafficLight, vehiclesAhead, simulationSpeed) {
        // Handle wait time
        if (this.speed < 0.1) {
            this.waitTime += deltaTime * simulationSpeed;
        }

        let targetSpeed = this.maxSpeed;

        // 1. Traffic Light Logic
        const distToIntersection = this.getDistanceToIntersection();
        if (distToIntersection > 0 && distToIntersection < 150) { // Approaching
            if (trafficLight === 'red' || (trafficLight === 'yellow' && distToIntersection > 50)) {
                // Need to stop
                targetSpeed = 0;
            }
        }

        // 2. Car-following logic (Collision avoidance)
        let minFollowDistance = Infinity;
        for (const v of vehiclesAhead) {
            // Only care about cars in the same approach and lane
            if (v.approach === this.approach && v.lane === this.lane && v.id !== this.id) {
                const dist = v.distanceTraveled - this.distanceTraveled;
                if (dist > 0 && dist < minFollowDistance) {
                    minFollowDistance = dist;
                }
            }
        }

        const safeDist = this.length + 15; // 15px gap
        if (minFollowDistance < safeDist + 100) {
            // Slow down
            if (minFollowDistance <= safeDist) {
                targetSpeed = 0;
            } else {
                targetSpeed = this.maxSpeed * ((minFollowDistance - safeDist) / 100);
            }
        }

        // 3. Emergency Vehicle Overrides (they don't stop for red if path is clear, but we will make them stop for cars ahead)
        // Wait, emergency vehicles can cross red. But we actually switch the light to green for them! So normal logic applies.

        // Adjust speed
        if (this.speed < targetSpeed) {
            this.speed = Math.min(this.speed + this.accel * simulationSpeed, targetSpeed);
        } else if (this.speed > targetSpeed) {
            this.speed = Math.max(this.speed - this.decel * simulationSpeed, targetSpeed);
        }

        // Move vehicle
        const distToMove = this.speed * simulationSpeed;
        this.distanceTraveled += distToMove;
        this.progress = Math.min(1, this.distanceTraveled / this.totalPathLength);

        // Update Position and Angle
        if (this.path.type === 'straight') {
            this.x = this.path.start.x + (this.path.end.x - this.path.start.x) * this.progress;
            this.y = this.path.start.y + (this.path.end.y - this.path.start.y) * this.progress;
            // Angle remains constant
        } else {
            // Quadratic Bezier
            const t = this.progress;
            const p0 = this.path.start;
            const p1 = this.path.control;
            const p2 = this.path.end;
            
            this.x = Math.pow(1-t, 2) * p0.x + 2 * (1-t) * t * p1.x + Math.pow(t, 2) * p2.x;
            this.y = Math.pow(1-t, 2) * p0.y + 2 * (1-t) * t * p1.y + Math.pow(t, 2) * p2.y;
            
            // Derivative for angle
            const dx = 2 * (1-t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
            const dy = 2 * (1-t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
            this.angle = Math.atan2(dy, dx);
        }
    }

    getDistanceToIntersection() {
        const C = CONFIG.CENTER_OFFSET;
        const RW = CONFIG.ROAD_WIDTH;
        // The distance traveled when the vehicle hits the stop line
        // Depends on approach
        let distToStopLine = 0;
        
        // We know start positions are at -50 or 850, and stop lines are at C - RW or C + RW
        // Let's calculate based on coordinates
        if (this.approach === 'north') {
            distToStopLine = (C - RW - 10) - this.path.start.y;
        } else if (this.approach === 'south') {
            distToStopLine = this.path.start.y - (C + RW + 10);
        } else if (this.approach === 'east') {
            distToStopLine = this.path.start.x - (C + RW + 10);
        } else if (this.approach === 'west') {
            distToStopLine = (C - RW - 10) - this.path.start.x;
        }
        
        // Stop the front bumper at the stop line, not the center of the vehicle
        return distToStopLine - this.distanceTraveled - (this.length / 2) - 5;
    }
}
