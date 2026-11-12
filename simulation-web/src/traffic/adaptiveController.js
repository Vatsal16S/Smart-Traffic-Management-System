import { CONFIG } from '../config/settings.js';

export class AdaptiveController {
    constructor(yoloCounter) {
        this.yoloCounter = yoloCounter;
        this.currentGreenDuration = CONFIG.SIGNAL.FIXED_TIMINGS.green * 1000;
        this.currentPriority = null;
    }

    onPhaseStart(approach) {
        // Calculate based on density
        const stats = this.yoloCounter.getStats(approach);
        let durationSec = 15; // default low

        if (stats.density === 'VERY HIGH') {
            durationSec = CONFIG.SIGNAL.ADAPTIVE_THRESHOLDS.very_high.maxGreen;
            this.currentPriority = approach;
        } else if (stats.density === 'HIGH') {
            durationSec = CONFIG.SIGNAL.ADAPTIVE_THRESHOLDS.high.maxGreen;
            this.currentPriority = approach;
        } else if (stats.density === 'MEDIUM') {
            durationSec = CONFIG.SIGNAL.ADAPTIVE_THRESHOLDS.medium.maxGreen;
            this.currentPriority = null;
        } else {
            durationSec = CONFIG.SIGNAL.ADAPTIVE_THRESHOLDS.low.maxGreen;
            this.currentPriority = null;
        }

        this.currentGreenDuration = durationSec * 1000;
        
        // Let's also check if another lane is extremely congested while this one is empty
        // In a more advanced implementation, we might skip phases.
    }

    getGreenDuration(approach) {
        return this.currentGreenDuration;
    }
}
