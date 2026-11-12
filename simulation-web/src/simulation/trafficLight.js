export class TrafficLightManager {
    constructor() {
        this.lights = {
            north: { state: 'red', timer: 0 },
            east: { state: 'red', timer: 0 },
            south: { state: 'red', timer: 0 },
            west: { state: 'red', timer: 0 }
        };
        
        // 4-phase sequence: N -> E -> S -> W
        this.sequence = ['north', 'east', 'south', 'west'];
        this.currentPhaseIndex = 0;
        
        this.currentState = 'green'; // green, yellow, red
        this.timeInState = 0; // ms
        
        // Default timings
        this.greenDuration = 30000;
        this.yellowDuration = 5000;
        this.allRedDuration = 2000; // Safety buffer
        
        this.isEmergencyOverride = false;
        this.emergencyPriority = null;
    }

    update(deltaTime, activeModeController, simulationSpeed) {
        if (this.isEmergencyOverride && this.emergencyPriority) {
            // Keep priority green, all others red
            this.setAllRed();
            this.lights[this.emergencyPriority].state = 'green';
            return;
        }

        this.timeInState += deltaTime * simulationSpeed;

        const currentApproach = this.sequence[this.currentPhaseIndex];

        if (this.currentState === 'green') {
            // Ask the active controller how long green should be
            const currentGreenDuration = activeModeController.getGreenDuration(currentApproach);
            
            // Update UI timer
            this.lights[currentApproach].timer = Math.max(0, Math.ceil((currentGreenDuration - this.timeInState) / 1000));
            this.setAllRed();
            this.lights[currentApproach].state = 'green';

            if (this.timeInState >= currentGreenDuration) {
                this.currentState = 'yellow';
                this.timeInState = 0;
            }
        } 
        else if (this.currentState === 'yellow') {
            this.lights[currentApproach].timer = Math.max(0, Math.ceil((this.yellowDuration - this.timeInState) / 1000));
            this.setAllRed();
            this.lights[currentApproach].state = 'yellow';

            if (this.timeInState >= this.yellowDuration) {
                this.currentState = 'all_red';
                this.timeInState = 0;
            }
        }
        else if (this.currentState === 'all_red') {
            this.setAllRed();
            
            if (this.timeInState >= this.allRedDuration) {
                // Next phase
                this.currentPhaseIndex = (this.currentPhaseIndex + 1) % this.sequence.length;
                this.currentState = 'green';
                this.timeInState = 0;
                
                // When starting a new green phase, trigger the controller to calculate (for adaptive)
                activeModeController.onPhaseStart(this.sequence[this.currentPhaseIndex]);
            }
        }
    }

    setAllRed() {
        for (const dir in this.lights) {
            this.lights[dir].state = 'red';
            if (this.currentState !== 'green' && this.currentState !== 'yellow') {
                 this.lights[dir].timer = 0; // Or calculate time until green
            }
        }
    }

    triggerEmergency(approach) {
        this.isEmergencyOverride = true;
        this.emergencyPriority = approach;
    }

    clearEmergency() {
        this.isEmergencyOverride = false;
        this.emergencyPriority = null;
        // Resume from where we were, or reset to a safe state
        this.currentState = 'all_red';
        this.timeInState = 0;
    }
}
