export class MetricsCalculator {
    constructor() {
        this.totalVehiclesPassed = 0;
        this.totalWaitTime = 0;
        this.startTime = Date.now();
        
        // For comparison
        this.fixedModeAvgWait = 25; // Base assumption for demo purposes if not run yet
    }

    recordVehiclePass(waitTimeSec) {
        this.totalVehiclesPassed++;
        this.totalWaitTime += waitTimeSec;
    }

    getMetrics(currentMode) {
        const elapsedMin = (Date.now() - this.startTime) / 60000;
        const avgWait = this.totalVehiclesPassed > 0 ? (this.totalWaitTime / this.totalVehiclesPassed) : 0;
        const throughput = elapsedMin > 0 ? (this.totalVehiclesPassed / elapsedMin) : 0;

        let improvement = 0;
        if (currentMode === 'adaptive') {
            if (avgWait > 0) {
                improvement = ((this.fixedModeAvgWait - avgWait) / this.fixedModeAvgWait) * 100;
            }
        } else {
            // Update baseline if we are running in fixed mode
            if (this.totalVehiclesPassed > 10) {
                this.fixedModeAvgWait = avgWait;
            }
            improvement = 0;
        }

        return {
            avgWaitTime: avgWait,
            throughput: throughput,
            improvement: improvement
        };
    }
}
