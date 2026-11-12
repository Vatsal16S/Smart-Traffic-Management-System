import { DIRECTIONS } from '../config/settings.js';

export class Dashboard {
    constructor() {
        this.elements = {};
        
        DIRECTIONS.forEach(dir => {
            this.elements[dir] = {
                indicator: document.querySelector(`#stat-${dir} .signal-indicator`),
                timer:     document.querySelector(`#stat-${dir} .timer`),
                count:     document.querySelector(`#stat-${dir} .count`),
                density:   document.querySelector(`#stat-${dir} .density`),
                queue:     document.querySelector(`#stat-${dir} .queue`),
                wait:      document.querySelector(`#stat-${dir} .wait`),
            };
        });

        this.avgWaitEl      = document.getElementById('metric-avg-wait');
        this.throughputEl   = document.getElementById('metric-throughput');
        this.improvementEl  = document.getElementById('metric-improvement');
        
        this.modeDisplay      = document.getElementById('mode-display');
        this.priorityDisplay  = document.getElementById('priority-display');
        this.emergencyAlert   = document.getElementById('emergency-alert');

        // YOLO aggregate metric elements (may not exist if YOLO panel is hidden)
        this.yoloFpsEl      = document.getElementById('yolo-fps');
        this.yoloLatencyEl  = document.getElementById('yolo-latency');
        this.yoloTrackedEl  = document.getElementById('yolo-tracked');
        this.yoloStatusEl   = document.getElementById('yolo-status');
    }

    // ------------------------------------------------------------------
    // Traffic stats (per-direction vehicle counts, queue, density)
    // ------------------------------------------------------------------

    updateTrafficStats(yoloStats) {
        DIRECTIONS.forEach(dir => {
            const el   = this.elements[dir];
            const stat = yoloStats[dir];
            if (!el || !stat) return;
            
            el.count.textContent = stat.count;
            el.queue.textContent = stat.queue;
            
            el.density.textContent = stat.density;
            el.density.className   = `density ${stat.density.toLowerCase().replace(' ', '-')}`;
        });
    }

    // ------------------------------------------------------------------
    // Traffic light states
    // ------------------------------------------------------------------

    updateSignals(lights) {
        DIRECTIONS.forEach(dir => {
            const el    = this.elements[dir];
            const state = lights[dir].state;
            if (!el) return;
            
            el.indicator.className = `signal-indicator ${state}`;
            
            const t = lights[dir].timer;
            el.timer.textContent   = t < 10 ? `0${t}` : t;
            el.timer.style.color   =
                state === 'red'    ? '#ef4444' :
                state === 'green'  ? '#22c55e' : '#eab308';
        });
    }

    // ------------------------------------------------------------------
    // Performance metrics panel
    // ------------------------------------------------------------------

    updateMetrics(metrics) {
        if (this.avgWaitEl)     this.avgWaitEl.textContent     = `${Math.round(metrics.avgWaitTime)}s`;
        if (this.throughputEl)  this.throughputEl.textContent  = `${Math.round(metrics.throughput)} veh/min`;
        
        if (this.improvementEl) {
            if (metrics.improvement > 0) {
                this.improvementEl.textContent  = `+${Math.round(metrics.improvement)}%`;
                this.improvementEl.style.color  = '#22c55e';
            } else {
                this.improvementEl.textContent  = `${Math.round(metrics.improvement)}%`;
                this.improvementEl.style.color  = '#94a3b8';
            }
        }
    }

    // ------------------------------------------------------------------
    // YOLO aggregate metrics (displayed in the YOLO panel header)
    // ------------------------------------------------------------------

    updateYoloMetrics(metrics) {
        if (this.yoloFpsEl)     this.yoloFpsEl.textContent     = metrics.fps ?? '—';
        if (this.yoloLatencyEl) this.yoloLatencyEl.textContent = metrics.latency != null ? `${metrics.latency} ms` : '—';
        if (this.yoloTrackedEl) this.yoloTrackedEl.textContent = metrics.tracked ?? '—';
    }

    setYoloStatus(status) {
        if (!this.yoloStatusEl) return;
        this.yoloStatusEl.textContent = status;
        this.yoloStatusEl.className =
            status === 'RUNNING'       ? 'text-green' :
            status === 'ERROR'         ? 'text-red'   :
            status === 'CONNECTING'    ? 'text-yellow' : 'text-secondary';
    }

    // ------------------------------------------------------------------
    // Mode / priority / emergency
    // ------------------------------------------------------------------

    setMode(mode) {
        if (this.modeDisplay) {
            this.modeDisplay.textContent = mode === 'adaptive' ? 'SMART ADAPTIVE' : 'FIXED TIME';
            this.modeDisplay.className   = `badge ${mode}`;
        }
    }

    setPriority(approach) {
        if (!this.priorityDisplay) return;
        if (approach) {
            this.priorityDisplay.textContent = approach.toUpperCase();
            this.priorityDisplay.className   = 'text-green';
        } else {
            this.priorityDisplay.textContent = 'NONE';
            this.priorityDisplay.className   = 'text-secondary';
        }
    }

    showEmergencyAlert(show) {
        if (!this.emergencyAlert) return;
        if (show) {
            this.emergencyAlert.classList.remove('hidden');
        } else {
            this.emergencyAlert.classList.add('hidden');
        }
    }
}
