import { CONFIG } from '../config/settings.js';

export class FixedController {
    constructor() {
        this.greenDuration = CONFIG.SIGNAL.FIXED_TIMINGS.green * 1000;
    }

    onPhaseStart(approach) {
        // Nothing needed for fixed
    }

    getGreenDuration(approach) {
        return this.greenDuration;
    }
}
