import { CONFIG, DIRECTIONS } from '../config/settings.js';

export class Intersection {
    constructor() {
        this.center = CONFIG.CENTER_OFFSET;
        this.roadWidth = CONFIG.ROAD_WIDTH;
        this.laneWidth = CONFIG.LANE_WIDTH;
        
        // Stop line coordinates
        this.stopLines = {
            north: this.center - this.roadWidth, // Y coord
            south: this.center + this.roadWidth, // Y coord
            east: this.center + this.roadWidth,  // X coord
            west: this.center - this.roadWidth   // X coord
        };

        // Paths for each direction and lane
        this.paths = this.generatePaths();
    }

    generatePaths() {
        const paths = {};

        // Helper for lane positions based on LHT rules with Center=400, RoadWidth=240, LaneWidth=80
        // Leftmost lane: 200px from center. Middle: 120px from center. Rightmost: 40px from center.

        // North Approach (Coming from top, going down South)
        // Traveling South on left side means X > Center (East side)
        paths.north = {
            left: { start: {x: 600, y: -50}, end: {x: 850, y: 200}, type: 'curve', control: {x: 600, y: 200} }, // Turns East
            straight: { start: {x: 520, y: -50}, end: {x: 520, y: 850}, type: 'straight' }, // Goes South
            right: { start: {x: 440, y: -50}, end: {x: -50, y: 440}, type: 'curve', control: {x: 440, y: 440} } // Turns West (crosses)
        };

        // South Approach (Coming from bottom, going up North)
        // Traveling North on left side means X < Center (West side)
        paths.south = {
            left: { start: {x: 200, y: 850}, end: {x: -50, y: 600}, type: 'curve', control: {x: 200, y: 600} }, // Turns West
            straight: { start: {x: 280, y: 850}, end: {x: 280, y: -50}, type: 'straight' }, // Goes North
            right: { start: {x: 360, y: 850}, end: {x: 850, y: 360}, type: 'curve', control: {x: 360, y: 360} } // Turns East (crosses)
        };

        // East Approach (Coming from right, going left West)
        // Traveling West on left side means Y > Center (South side)
        paths.east = {
            left: { start: {x: 850, y: 600}, end: {x: 600, y: 850}, type: 'curve', control: {x: 600, y: 600} }, // Turns South
            straight: { start: {x: 850, y: 520}, end: {x: -50, y: 520}, type: 'straight' }, // Goes West
            right: { start: {x: 850, y: 440}, end: {x: 360, y: -50}, type: 'curve', control: {x: 360, y: 440} } // Turns North (crosses)
        };

        // West Approach (Coming from left, going right East)
        // Traveling East on left side means Y < Center (North side)
        paths.west = {
            left: { start: {x: -50, y: 200}, end: {x: 200, y: -50}, type: 'curve', control: {x: 200, y: 200} }, // Turns North
            straight: { start: {x: -50, y: 280}, end: {x: 850, y: 280}, type: 'straight' }, // Goes East
            right: { start: {x: -50, y: 360}, end: {x: 440, y: 850}, type: 'curve', control: {x: 440, y: 360} } // Turns South (crosses)
        };

        return paths;
    }

    getStopLine(approach) {
        return this.stopLines[approach];
    }
}
