import { CONFIG } from '../config/settings.js';

export class Renderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;
    }

    clear() {
        this.ctx.fillStyle = '#1e293b'; // Background color (grass/buildings area)
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    drawIntersection(intersection) {
        const C = intersection.center;
        const RW = intersection.roadWidth;
        const TotalW = RW * 2; // Total road width for both directions

        this.ctx.fillStyle = '#334155'; // Road color

        // N-S Road
        this.ctx.fillRect(C - RW, 0, TotalW, this.height);
        
        // E-W Road
        this.ctx.fillRect(0, C - RW, this.width, TotalW);

        // Center square (intersection)
        this.ctx.fillRect(C - RW, C - RW, TotalW, TotalW);

        this.drawRoadMarkings(C, RW, intersection.laneWidth);
        this.drawStopLines(C, RW);
    }

    drawRoadMarkings(C, RW, LW) {
        // Center lines (Solid Double Yellow with a slight gap to look like a small median)
        this.ctx.fillStyle = '#eab308';
        
        // N-S Center Median
        this.ctx.fillRect(C - 2, 0, 4, C - RW);
        this.ctx.fillRect(C - 2, C + RW, 4, this.height - (C + RW));
        
        // E-W Center Median
        this.ctx.fillRect(0, C - 2, C - RW, 4);
        this.ctx.fillRect(C + RW, C - 2, this.width - (C + RW), 4);

        this.ctx.strokeStyle = '#f8fafc';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([20, 20]);

        // Draw lane dividers
        const drawDividers = (xStart, yStart, xEnd, yEnd) => {
            this.ctx.beginPath();
            this.ctx.moveTo(xStart, yStart);
            this.ctx.lineTo(xEnd, yEnd);
            this.ctx.stroke();
        };

        // North Approach lanes (traveling South, X > C)
        drawDividers(C + LW, 0, C + LW, C - RW);
        drawDividers(C + 2*LW, 0, C + 2*LW, C - RW);

        // South Approach lanes (traveling North, X < C)
        drawDividers(C - LW, C + RW, C - LW, this.height);
        drawDividers(C - 2*LW, C + RW, C - 2*LW, this.height);

        // East Approach lanes (traveling West, Y > C) -> LHT
        drawDividers(C + RW, C + LW, this.width, C + LW);
        drawDividers(C + RW, C + 2*LW, this.width, C + 2*LW);

        // West Approach lanes (traveling East, Y < C) -> LHT
        drawDividers(0, C - LW, C - RW, C - LW);
        drawDividers(0, C - 2*LW, C - RW, C - 2*LW);

        this.ctx.setLineDash([]); // Reset
        
        // Draw Zebra Crossings
        this.drawZebraCrossings(C, RW);
        // Draw Lane Arrows
        this.drawLaneArrows(C, RW, LW);
    }

    drawZebraCrossings(C, RW) {
        this.ctx.fillStyle = '#f8fafc';
        const stripeWidth = 10;
        const gap = 10;
        const crossingWidth = 30;
        
        // Helper to draw a zebra crossing area
        const drawCross = (startX, startY, width, height, isVertical) => {
            if (isVertical) {
                for (let y = startY + gap; y < startY + height; y += stripeWidth + gap) {
                    this.ctx.fillRect(startX, y, crossingWidth, stripeWidth);
                }
            } else {
                for (let x = startX + gap; x < startX + width; x += stripeWidth + gap) {
                    this.ctx.fillRect(x, startY, stripeWidth, crossingWidth);
                }
            }
        };

        // Zebra crossings are placed at the edge of the intersection (C - RW)
        // North crossing
        drawCross(C - RW, C - RW, RW * 2, crossingWidth, false);
        // South crossing
        drawCross(C - RW, C + RW - crossingWidth, RW * 2, crossingWidth, false);
        // East crossing
        drawCross(C + RW - crossingWidth, C - RW, crossingWidth, RW * 2, true);
        // West crossing
        drawCross(C - RW, C - RW, crossingWidth, RW * 2, true);
    }

    drawLaneArrows(C, RW, LW) {
        this.ctx.fillStyle = '#f8fafc';
        const arrowSize = 15;
        
        const drawArrow = (x, y, dir, type) => {
            this.ctx.save();
            this.ctx.translate(x, y);
            if (dir === 'south') this.ctx.rotate(0);
            if (dir === 'north') this.ctx.rotate(Math.PI);
            if (dir === 'west') this.ctx.rotate(Math.PI / 2);
            if (dir === 'east') this.ctx.rotate(-Math.PI / 2);

            this.ctx.beginPath();
            // Base straight arrow
            this.ctx.rect(-2, -20, 4, 30);
            this.ctx.fill();
            
            if (type === 'straight' || type === 'mixed') {
                this.ctx.beginPath();
                this.ctx.moveTo(0, 20);
                this.ctx.lineTo(-8, 5);
                this.ctx.lineTo(8, 5);
                this.ctx.fill();
            }
            if (type === 'left' || type === 'mixed') {
                this.ctx.beginPath();
                this.ctx.rect(2, 0, 10, 4);
                this.ctx.fill();
                this.ctx.beginPath();
                this.ctx.moveTo(15, 2);
                this.ctx.lineTo(5, 10);
                this.ctx.lineTo(5, -6);
                this.ctx.fill();
            }
            if (type === 'right' || type === 'mixed') {
                this.ctx.beginPath();
                this.ctx.rect(-12, 0, 10, 4);
                this.ctx.fill();
                this.ctx.beginPath();
                this.ctx.moveTo(-15, 2);
                this.ctx.lineTo(-5, 10);
                this.ctx.lineTo(-5, -6);
                this.ctx.fill();
            }
            
            this.ctx.restore();
        };

        const offset = C - RW - 100; // Position before stop line
        
        // North Approach (Southbound)
        drawArrow(C + 0.5*LW, offset, 'south', 'right');
        drawArrow(C + 1.5*LW, offset, 'south', 'straight');
        drawArrow(C + 2.5*LW, offset, 'south', 'left');

        // South Approach (Northbound)
        drawArrow(C - 0.5*LW, this.height - offset, 'north', 'right');
        drawArrow(C - 1.5*LW, this.height - offset, 'north', 'straight');
        drawArrow(C - 2.5*LW, this.height - offset, 'north', 'left');

        // East Approach (Westbound)
        drawArrow(this.width - offset, C + 0.5*LW, 'west', 'right');
        drawArrow(this.width - offset, C + 1.5*LW, 'west', 'straight');
        drawArrow(this.width - offset, C + 2.5*LW, 'west', 'left');

        // West Approach (Eastbound)
        drawArrow(offset, C - 0.5*LW, 'east', 'right');
        drawArrow(offset, C - 1.5*LW, 'east', 'straight');
        drawArrow(offset, C - 2.5*LW, 'east', 'left');
    }

    drawStopLines(C, RW) {
        this.ctx.fillStyle = '#f8fafc';
        
        // Stop lines are drawn just before the zebra crossings.
        // North Stop Line (for vehicles going South on X > C)
        this.ctx.fillRect(C, C - RW - 10, RW, 10);
        
        // South Stop Line (for vehicles going North on X < C)
        this.ctx.fillRect(C - RW, C + RW, RW, 10);
        
        // East Stop Line (for vehicles going West on Y > C)
        this.ctx.fillRect(C + RW, C, 10, RW);
        
        // West Stop Line (for vehicles going East on Y < C)
        this.ctx.fillRect(C - RW - 10, C - RW, 10, RW);
    }

    drawVehicles(vehicles) {
        for (const v of vehicles) {
            this.ctx.save();
            this.ctx.translate(v.x, v.y);
            this.ctx.rotate(v.angle);
            
            this.ctx.fillStyle = v.color;
            // Draw rectangle centered on its position
            this.ctx.fillRect(-v.width / 2, -v.length / 2, v.width, v.length);
            
            // Draw emergency lights if it's an emergency vehicle
            if (v.isEmergency) {
                const time = Date.now();
                this.ctx.fillStyle = Math.floor(time / 200) % 2 === 0 ? '#ef4444' : '#3b82f6';
                this.ctx.fillRect(-v.width / 2, -v.length / 2, v.width, 10); // Lightbar
            }
            
            this.ctx.restore();
        }
    }

    drawTrafficLights(lights) {
        const C = CONFIG.CENTER_OFFSET;
        const RW = CONFIG.ROAD_WIDTH;
        const offset = 20;

        const drawLight = (x, y, state) => {
            this.ctx.fillStyle = '#1e293b';
            this.ctx.fillRect(x - 15, y - 45, 30, 90);
            this.ctx.strokeStyle = '#000';
            this.ctx.strokeRect(x - 15, y - 45, 30, 90);

            // Red
            this.ctx.beginPath();
            this.ctx.arc(x, y - 25, 10, 0, Math.PI * 2);
            this.ctx.fillStyle = state === 'red' ? '#ef4444' : '#451a1a';
            this.ctx.fill();

            // Yellow
            this.ctx.beginPath();
            this.ctx.arc(x, y, 10, 0, Math.PI * 2);
            this.ctx.fillStyle = state === 'yellow' ? '#eab308' : '#4d3b00';
            this.ctx.fill();

            // Green
            this.ctx.beginPath();
            this.ctx.arc(x, y + 25, 10, 0, Math.PI * 2);
            this.ctx.fillStyle = state === 'green' ? '#22c55e' : '#0a381b';
            this.ctx.fill();
        };

        drawLight(C + RW + offset, C - RW - offset, lights.north.state);
        drawLight(C - RW - offset, C + RW + offset, lights.south.state);
        drawLight(C + RW + offset, C + RW + offset, lights.east.state);
        drawLight(C - RW - offset, C - RW - offset, lights.west.state);
    }
    
    drawROI(roiConfig) {
        if (!roiConfig.SHOW) return;
        
        const C = CONFIG.CENTER_OFFSET;
        const RW = CONFIG.ROAD_WIDTH;
        const L = CONFIG.ROI.LENGTH;
        
        this.ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        this.ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        
        // North ROI (covers X > C, from C-RW-L to C-RW)
        this.ctx.fillRect(C, C - RW - L, RW, L);
        this.ctx.strokeRect(C, C - RW - L, RW, L);
        this.ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
        this.ctx.fillText("NORTH ROI", C + 10, C - RW - L - 10);
        
        this.ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        // South ROI (covers X < C, from C+RW to C+RW+L)
        this.ctx.fillRect(C - RW, C + RW, RW, L);
        this.ctx.strokeRect(C - RW, C + RW, RW, L);
        this.ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
        this.ctx.fillText("SOUTH ROI", C - RW + 10, C + RW + L + 20);

        this.ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        // East ROI (covers Y > C, from C+RW to C+RW+L) -> LHT
        this.ctx.fillRect(C + RW, C, L, RW);
        this.ctx.strokeRect(C + RW, C, L, RW);
        this.ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
        this.ctx.fillText("EAST ROI", C + RW + L + 10, C + 20);

        this.ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        // West ROI (covers Y < C, from C-RW-L to C-RW) -> LHT
        this.ctx.fillRect(C - RW - L, C - RW, L, RW);
        this.ctx.strokeRect(C - RW - L, C - RW, L, RW);
        this.ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
        this.ctx.fillText("WEST ROI", C - RW - L - 60, C - RW + 20);

        this.ctx.setLineDash([]);
    }
}
