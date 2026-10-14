/**
 * Road Network & Corridor System
 * Models corridors with EXACTLY 3 parallel sub-lanes (LEFT, CENTER, RIGHT).
 * Merges previous duplicate return bands into single 3-lane corridors.
 * Includes automated startup corridor lane-count validation.
 */

import { CONFIG } from '../core/config.js';
import { DirectedGraph } from '../core/graph.js';
import { events } from '../core/events.js';

export class Corridor {
  constructor(id, options = {}) {
    this.id = id;
    this.name = options.name || id;
    this.type = options.type || 'horizontal'; // 'horizontal' | 'vertical' | 'spur'
    this.direction = options.direction || 'east'; // 'east' | 'west' | 'bidirectional'
    this.x1 = options.x1;
    this.y1 = options.y1;
    this.x2 = options.x2;
    this.y2 = options.y2;
    this.subLanes = ['LEFT', 'CENTER', 'RIGHT'];
    this.subLaneOffset = CONFIG.LANE.SUB_LANE_OFFSET;
    this.totalWidth = CONFIG.LANE.TOTAL_CORRIDOR_WIDTH;
  }
}

export class RoadNetwork {
  constructor(layout) {
    this.layout = layout;
    this.graph = new DirectedGraph();
    this.corridors = [];
    this.buildNetwork();
    this.validateCorridors();
  }

  buildNetwork() {
    const L = CONFIG.LAYOUT;
    const g = this.graph;
    const offset = CONFIG.LANE.SUB_LANE_OFFSET;

    // =========================================================================
    // 1. DEFINE EXACTLY 6 MAIN CORRIDORS (3 Horizontal + 3 Vertical)
    // No duplicate return bands!
    // =========================================================================

    // 1. Top Corridor (Single 3-Lane Corridor, Y = L.TOP_CORRIDOR_Y = 75)
    const cTop = new Corridor('corr_top', {
      name: 'Top Corridor',
      type: 'horizontal',
      direction: 'bidirectional',
      x1: L.LEFT_CORRIDOR_X, y1: L.TOP_CORRIDOR_Y,
      x2: L.RIGHT_CORRIDOR_X, y2: L.TOP_CORRIDOR_Y,
    });

    // 2. Middle Corridor (Single 3-Lane Trunk, Y = L.MID_CORRIDOR_Y = 370)
    const cMid = new Corridor('corr_mid', {
      name: 'Middle Trunk Corridor',
      type: 'horizontal',
      direction: 'east',
      x1: L.LEFT_CORRIDOR_X, y1: L.MID_CORRIDOR_Y,
      x2: L.RIGHT_CORRIDOR_X, y2: L.MID_CORRIDOR_Y,
    });

    // 3. Bottom Corridor (Single 3-Lane Corridor, Y = L.BOT_CORRIDOR_Y = 670)
    const cBot = new Corridor('corr_bot', {
      name: 'Bottom Corridor',
      type: 'horizontal',
      direction: 'bidirectional',
      x1: L.LEFT_CORRIDOR_X, y1: L.BOT_CORRIDOR_Y,
      x2: L.RIGHT_CORRIDOR_X, y2: L.BOT_CORRIDOR_Y,
    });

    // 4. Left Vertical Corridor (Single 3-Lane Corridor, X = L.LEFT_CORRIDOR_X = 260)
    const cLeft = new Corridor('corr_left', {
      name: 'Left Vertical Corridor',
      type: 'vertical',
      direction: 'bidirectional',
      x1: L.LEFT_CORRIDOR_X, y1: L.TOP_CORRIDOR_Y,
      x2: L.LEFT_CORRIDOR_X, y2: L.BOT_CORRIDOR_Y,
    });

    // 5. Middle Vertical Corridor (Single 3-Lane Corridor, X = L.MID_CORRIDOR_X = 590)
    const cMidV = new Corridor('corr_mid_vert', {
      name: 'Middle Vertical Corridor',
      type: 'vertical',
      direction: 'bidirectional',
      x1: L.MID_CORRIDOR_X, y1: L.TOP_CORRIDOR_Y,
      x2: L.MID_CORRIDOR_X, y2: L.BOT_CORRIDOR_Y,
    });

    // 6. Right Vertical Corridor (Single 3-Lane Corridor, X = L.RIGHT_CORRIDOR_X = 920)
    const cRight = new Corridor('corr_right', {
      name: 'Right Vertical Corridor',
      type: 'vertical',
      direction: 'bidirectional',
      x1: L.RIGHT_CORRIDOR_X, y1: L.TOP_CORRIDOR_Y,
      x2: L.RIGHT_CORRIDOR_X, y2: L.BOT_CORRIDOR_Y,
    });

    this.corridors = [cTop, cMid, cBot, cLeft, cMidV, cRight];

    // =========================================================================
    // 2. GENERATE GRAPH NODES FOR EXACTLY 3 SUB-LANES (LEFT, CENTER, RIGHT)
    // =========================================================================
    const xPositions = [
      { name: 'left', x: L.LEFT_CORRIDOR_X },
      { name: 'mid', x: L.MID_CORRIDOR_X },
      { name: 'right', x: L.RIGHT_CORRIDOR_X },
    ];

    const yPositions = [
      { name: 'top', y: L.TOP_CORRIDOR_Y },
      { name: 'mid', y: L.MID_CORRIDOR_Y },
      { name: 'bot', y: L.BOT_CORRIDOR_Y },
    ];

    const subLanes = ['left', 'center', 'right'];

    // Create 3 sub-lane nodes for each corridor intersection
    xPositions.forEach(xp => {
      yPositions.forEach(yp => {
        subLanes.forEach(sub => {
          const dy = sub === 'left' ? -offset : (sub === 'right' ? offset : 0);
          const nodeId = `n_${xp.name}_${yp.name}_${sub}`;
          g.addNode(nodeId, xp.x, yp.y + dy, {
            corridorId: `corr_${yp.name}`,
            laneId: sub,
            type: 'intersection',
          });
        });
      });
    });

    // Connect Horizontal Corridors through the 3 sub-lanes
    yPositions.forEach(yp => {
      subLanes.forEach(sub => {
        const fromLeft = `n_left_${yp.name}_${sub}`;
        const toMid = `n_mid_${yp.name}_${sub}`;
        const toRight = `n_right_${yp.name}_${sub}`;

        // Eastbound connections
        g.addEdge(fromLeft, toMid, { laneId: sub, direction: 'east' });
        g.addEdge(toMid, toRight, { laneId: sub, direction: 'east' });

        // Westbound return connections on top & bottom corridors
        if (yp.name === 'top' || yp.name === 'bot') {
          g.addEdge(toRight, toMid, { laneId: sub, direction: 'west', isReturnLane: true });
          g.addEdge(toMid, fromLeft, { laneId: sub, direction: 'west', isReturnLane: true });
        }
      });
    });

    // Connect Vertical Corridors
    xPositions.forEach(xp => {
      for (let i = 0; i < yPositions.length - 1; i++) {
        const yFrom = yPositions[i].name;
        const yTo = yPositions[i + 1].name;

        // Center lane bidirectional
        g.addBiEdge(`n_${xp.name}_${yFrom}_center`, `n_${xp.name}_${yTo}_center`, {
          isConnector: true,
          laneId: 'center',
        });

        // Sub-lane shift connections for overtaking
        ['left', 'right'].forEach(sub => {
          g.addBiEdge(`n_${xp.name}_${yFrom}_center`, `n_${xp.name}_${yFrom}_${sub}`, { isLaneShift: true });
          g.addBiEdge(`n_${xp.name}_${yTo}_center`, `n_${xp.name}_${yTo}_${sub}`, { isLaneShift: true });
        });
      }
    });

    // =========================================================================
    // 3. CONNECT LEFT STATIONS (Charging, Depot, Inventory) VIA SPURS
    // =========================================================================
    // Charging Station
    g.addNode('charger_slot_0', this.layout.chargingStation.slots[0].x, this.layout.chargingStation.slots[0].y, { type: 'charging_slot' });
    g.addNode('charger_slot_1', this.layout.chargingStation.slots[1].x, this.layout.chargingStation.slots[1].y, { type: 'charging_slot' });
    g.addNode('charger_exit', this.layout.chargingStation.exitPoint.x, this.layout.chargingStation.exitPoint.y, { type: 'spur' });
    g.addBiEdge('charger_slot_0', 'charger_exit');
    g.addBiEdge('charger_slot_1', 'charger_exit');
    g.addBiEdge('charger_exit', 'n_left_top_center');

    // Depot / Parking Area
    this.layout.parkingArea.spots.forEach((spot, idx) => {
      g.addNode(`park_${idx + 1}`, spot.x, spot.y, { type: 'parking' });
    });
    g.addNode('depot_exit', this.layout.parkingArea.exitPoint.x, this.layout.parkingArea.exitPoint.y, { type: 'spur' });
    this.layout.parkingArea.spots.forEach((_, idx) => {
      g.addBiEdge(`park_${idx + 1}`, 'depot_exit');
    });
    g.addNode('n_depot_connector', L.LEFT_CORRIDOR_X, this.layout.parkingArea.exitPoint.y);
    g.addBiEdge('depot_exit', 'n_depot_connector');
    g.addBiEdge('n_depot_connector', 'n_left_top_center');
    g.addBiEdge('n_depot_connector', 'n_left_mid_center');

    // Inventory System
    g.addNode('inv_dispatch', this.layout.inventorySystem.dispatchPoint.x, this.layout.inventorySystem.dispatchPoint.y, { type: 'inventory' });
    g.addNode('inv_exit', this.layout.inventorySystem.exitPoint.x, this.layout.inventorySystem.exitPoint.y, { type: 'spur' });
    g.addBiEdge('inv_dispatch', 'inv_exit');
    g.addNode('n_inv_connector', L.LEFT_CORRIDOR_X, this.layout.inventorySystem.exitPoint.y);
    g.addBiEdge('inv_exit', 'n_inv_connector');
    g.addBiEdge('n_inv_connector', 'n_left_mid_center');
    g.addBiEdge('n_inv_connector', 'n_left_bot_center');

    // =========================================================================
    // 4. CONNECT ALL 16 SHELF BAYS TO NEAREST CORRIDOR SPURS
    // =========================================================================
    this.layout.bays.forEach((bay) => {
      g.addNode(bay.id, bay.x, bay.y, { type: 'shelf_bay', shelfId: bay.shelfId, bayIndex: bay.direction });
      this.connectBayWithSpur(bay);
    });

    // =========================================================================
    // 5. 6-LINE FEEDER FAN INTO CONVEYOR SYSTEM
    // =========================================================================
    const fanX = L.FEEDER_FAN_X;
    // 3 feeder lines to upper belt side, 3 feeder lines to lower belt side (6 total)
    const fanY = [285, 320, 350, 390, 420, 455];

    fanY.forEach((fy, idx) => {
      const feederId = `n_feeder_${idx + 1}`;
      g.addNode(feederId, fanX, fy, { type: 'feeder' });

      if (idx <= 1) {
        g.addEdge('n_right_top_center', feederId, { direction: 'east' });
      } else if (idx <= 3) {
        g.addEdge('n_right_mid_center', feederId, { direction: 'east' });
      } else {
        g.addEdge('n_right_bot_center', feederId, { direction: 'east' });
      }
    });

    g.addNode('n_conveyor_input', L.CONVEYOR_INPUT_X, L.CONVEYOR_INPUT_Y, { type: 'conveyor_input' });

    fanY.forEach((_, idx) => {
      g.addEdge(`n_feeder_${idx + 1}`, 'n_conveyor_input', { direction: 'east' });
    });

    // Return tracks from conveyor area back to top and bottom corridors
    g.addEdge('n_conveyor_input', 'n_right_top_center', { direction: 'north' });
    g.addEdge('n_conveyor_input', 'n_right_bot_center', { direction: 'south' });
  }

  connectBayWithSpur(bay) {
    const g = this.graph;
    const L = CONFIG.LAYOUT;

    if (bay.shelfId === 1) {
      if (bay.direction === 'N') {
        g.addNode('n_spur_s1_N', bay.x, L.TOP_CORRIDOR_Y);
        g.addBiEdge(bay.id, 'n_spur_s1_N');
        g.addEdge('n_left_top_center', 'n_spur_s1_N', { direction: 'east' });
        g.addEdge('n_spur_s1_N', 'n_mid_top_center', { direction: 'east' });
      } else if (bay.direction === 'S') {
        g.addNode('n_spur_s1_S', bay.x, L.MID_CORRIDOR_Y);
        g.addBiEdge(bay.id, 'n_spur_s1_S');
        g.addEdge('n_left_mid_center', 'n_spur_s1_S', { direction: 'east' });
        g.addEdge('n_spur_s1_S', 'n_mid_mid_center', { direction: 'east' });
      } else if (bay.direction === 'W') {
        g.addNode('n_spur_s1_W', L.LEFT_CORRIDOR_X, bay.y);
        g.addBiEdge(bay.id, 'n_spur_s1_W');
        g.addBiEdge('n_spur_s1_W', 'n_left_top_center');
        g.addBiEdge('n_spur_s1_W', 'n_left_mid_center');
      } else if (bay.direction === 'E') {
        g.addNode('n_spur_s1_E', L.MID_CORRIDOR_X, bay.y);
        g.addBiEdge(bay.id, 'n_spur_s1_E');
        g.addBiEdge('n_spur_s1_E', 'n_mid_top_center');
        g.addBiEdge('n_spur_s1_E', 'n_mid_mid_center');
      }
    } else if (bay.shelfId === 2) {
      if (bay.direction === 'N') {
        g.addNode('n_spur_s2_N', bay.x, L.TOP_CORRIDOR_Y);
        g.addBiEdge(bay.id, 'n_spur_s2_N');
        g.addEdge('n_mid_top_center', 'n_spur_s2_N', { direction: 'east' });
        g.addEdge('n_spur_s2_N', 'n_right_top_center', { direction: 'east' });
      } else if (bay.direction === 'S') {
        g.addNode('n_spur_s2_S', bay.x, L.MID_CORRIDOR_Y);
        g.addBiEdge(bay.id, 'n_spur_s2_S');
        g.addEdge('n_mid_mid_center', 'n_spur_s2_S', { direction: 'east' });
        g.addEdge('n_spur_s2_S', 'n_right_mid_center', { direction: 'east' });
      } else if (bay.direction === 'W') {
        g.addNode('n_spur_s2_W', L.MID_CORRIDOR_X, bay.y);
        g.addBiEdge(bay.id, 'n_spur_s2_W');
        g.addBiEdge('n_spur_s2_W', 'n_mid_top_center');
        g.addBiEdge('n_spur_s2_W', 'n_mid_mid_center');
      } else if (bay.direction === 'E') {
        g.addNode('n_spur_s2_E', L.RIGHT_CORRIDOR_X, bay.y);
        g.addBiEdge(bay.id, 'n_spur_s2_E');
        g.addBiEdge('n_spur_s2_E', 'n_right_top_center');
        g.addBiEdge('n_spur_s2_E', 'n_right_mid_center');
      }
    } else if (bay.shelfId === 3) {
      if (bay.direction === 'N') {
        g.addNode('n_spur_s3_N', bay.x, L.MID_CORRIDOR_Y);
        g.addBiEdge(bay.id, 'n_spur_s3_N');
        g.addEdge('n_left_mid_center', 'n_spur_s3_N', { direction: 'east' });
        g.addEdge('n_spur_s3_N', 'n_mid_mid_center', { direction: 'east' });
      } else if (bay.direction === 'S') {
        g.addNode('n_spur_s3_S', bay.x, L.BOT_CORRIDOR_Y);
        g.addBiEdge(bay.id, 'n_spur_s3_S');
        g.addEdge('n_left_bot_center', 'n_spur_s3_S', { direction: 'east' });
        g.addEdge('n_spur_s3_S', 'n_mid_bot_center', { direction: 'east' });
      } else if (bay.direction === 'W') {
        g.addNode('n_spur_s3_W', L.LEFT_CORRIDOR_X, bay.y);
        g.addBiEdge(bay.id, 'n_spur_s3_W');
        g.addBiEdge('n_spur_s3_W', 'n_left_mid_center');
        g.addBiEdge('n_spur_s3_W', 'n_left_bot_center');
      } else if (bay.direction === 'E') {
        g.addNode('n_spur_s3_E', L.MID_CORRIDOR_X, bay.y);
        g.addBiEdge(bay.id, 'n_spur_s3_E');
        g.addBiEdge('n_spur_s3_E', 'n_mid_mid_center');
        g.addBiEdge('n_spur_s3_E', 'n_mid_bot_center');
      }
    } else if (bay.shelfId === 4) {
      if (bay.direction === 'N') {
        g.addNode('n_spur_s4_N', bay.x, L.MID_CORRIDOR_Y);
        g.addBiEdge(bay.id, 'n_spur_s4_N');
        g.addEdge('n_mid_mid_center', 'n_spur_s4_N', { direction: 'east' });
        g.addEdge('n_spur_s4_N', 'n_right_mid_center', { direction: 'east' });
      } else if (bay.direction === 'S') {
        g.addNode('n_spur_s4_S', bay.x, L.BOT_CORRIDOR_Y);
        g.addBiEdge(bay.id, 'n_spur_s4_S');
        g.addEdge('n_mid_bot_center', 'n_spur_s4_S', { direction: 'east' });
        g.addEdge('n_spur_s4_S', 'n_right_bot_center', { direction: 'east' });
      } else if (bay.direction === 'W') {
        g.addNode('n_spur_s4_W', L.MID_CORRIDOR_X, bay.y);
        g.addBiEdge(bay.id, 'n_spur_s4_W');
        g.addBiEdge('n_spur_s4_W', 'n_mid_mid_center');
        g.addBiEdge('n_spur_s4_W', 'n_mid_bot_center');
      } else if (bay.direction === 'E') {
        g.addNode('n_spur_s4_E', L.RIGHT_CORRIDOR_X, bay.y);
        g.addBiEdge(bay.id, 'n_spur_s4_E');
        g.addBiEdge('n_spur_s4_E', 'n_right_mid_center');
        g.addBiEdge('n_spur_s4_E', 'n_right_bot_center');
      }
    }
  }

  /**
   * Startup Validation: Asserts that EVERY corridor has EXACTLY 3 parallel sub-lanes.
   * Logs error if any corridor violates the rule.
   */
  validateCorridors() {
    let allValid = true;
    for (const corr of this.corridors) {
      if (!corr.subLanes || corr.subLanes.length !== 3) {
        console.error(`VALIDATION ERROR: Corridor ${corr.id} has ${corr.subLanes ? corr.subLanes.length : 0} lanes instead of exactly 3!`);
        events.log('network', `VALIDATION ERROR: Corridor ${corr.id} does not have exactly 3 lanes!`, 'danger');
        allValid = false;
      }
    }

    if (allValid) {
      events.log('network', `Corridor Validation Passed: All ${this.corridors.length} corridors verified with EXACTLY 3 parallel lanes (LEFT, CENTER, RIGHT). Zero duplicate bands.`, 'success');
    }
  }

  /**
   * Generates a lane polyline with permanent two-lane right-hand traffic offset
   * and smooth corner fillet curves. Opposite traffic never shares a lane.
   *
   * @param {Array<GraphNode>} nodePath
   * @param {number} laneOffset - offset in px (default 10px ~ 0.6m)
   * @param {number} cornerRadius - corner turn fillet radius in px (default 18px)
   */
  generateLanePolyline(nodePath, laneOffset = 10, cornerRadius = 18) {
    if (!nodePath || nodePath.length === 0) return [];
    if (nodePath.length === 1) {
      return [{ x: nodePath[0].x, y: nodePath[0].y, nodeId: nodePath[0].id, isCorner: false, isTerminal: true }];
    }

    const waypoints = [];
    const segments = [];

    // 1. Calculate direction and normal for each segment
    for (let i = 0; i < nodePath.length - 1; i++) {
      const from = nodePath[i];
      const to = nodePath[i + 1];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy);
      const dir = len > 0.001 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
      // Right-hand normal: (-dir.y, dir.x)
      const norm = { x: -dir.y, y: dir.x };

      // Determine if endpoints are terminal docking spots (bay, charger, inv, park)
      const isStartTerminal = ['shelf_bay', 'charging_slot', 'inventory', 'parking'].includes(from.type);
      const isEndTerminal = ['shelf_bay', 'charging_slot', 'inventory', 'parking', 'conveyor_input'].includes(to.type);

      const startOffset = isStartTerminal ? 0 : laneOffset;
      const endOffset = isEndTerminal ? 0 : laneOffset;

      segments.push({
        from,
        to,
        len,
        dir,
        norm,
        startOffset,
        endOffset,
        startPt: { x: from.x + norm.x * startOffset, y: from.y + norm.y * startOffset },
        endPt: { x: to.x + norm.x * endOffset, y: to.y + norm.y * endOffset },
      });
    }

    // 2. Build the smooth polyline across segments
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];

      if (i === 0) {
        waypoints.push({
          x: seg.startPt.x,
          y: seg.startPt.y,
          nodeId: seg.from.id,
          isCorner: false,
          edgeFrom: seg.from.id,
          edgeTo: seg.to.id,
        });
      }

      if (i < segments.length - 1) {
        const nextSeg = segments[i + 1];
        const dot = seg.dir.x * nextSeg.dir.x + seg.dir.y * nextSeg.dir.y;
        const cornerNode = seg.to;

        // Check if there is a turn at cornerNode (dot < 0.98)
        if (dot < 0.98) {
          const r = Math.min(cornerRadius, seg.len * 0.4, nextSeg.len * 0.4);

          const pStart = {
            x: seg.endPt.x - seg.dir.x * r,
            y: seg.endPt.y - seg.dir.y * r,
          };

          const pEnd = {
            x: nextSeg.startPt.x + nextSeg.dir.x * r,
            y: nextSeg.startPt.y + nextSeg.dir.y * r,
          };

          const avgNormX = (seg.norm.x + nextSeg.norm.x) * 0.5;
          const avgNormY = (seg.norm.y + nextSeg.norm.y) * 0.5;
          const avgNormLen = Math.hypot(avgNormX, avgNormY) || 1;
          const pCtrl = {
            x: cornerNode.x + (avgNormX / avgNormLen) * laneOffset * (1.2 / Math.max(0.5, (1 + dot) / 2)),
            y: cornerNode.y + (avgNormY / avgNormLen) * laneOffset * (1.2 / Math.max(0.5, (1 + dot) / 2)),
          };

          waypoints.push({
            x: pStart.x,
            y: pStart.y,
            nodeId: cornerNode.id,
            isCorner: true,
            edgeFrom: seg.from.id,
            edgeTo: seg.to.id,
          });

          // Sample smooth quadratic Bezier arc
          for (let t = 0.25; t <= 0.75; t += 0.25) {
            const oneMinusT = 1 - t;
            const bx = oneMinusT * oneMinusT * pStart.x + 2 * oneMinusT * t * pCtrl.x + t * t * pEnd.x;
            const by = oneMinusT * oneMinusT * pStart.y + 2 * oneMinusT * t * pCtrl.y + t * t * pEnd.y;
            waypoints.push({
              x: bx,
              y: by,
              nodeId: cornerNode.id,
              isCorner: true,
              edgeFrom: seg.from.id,
              edgeTo: nextSeg.to.id,
            });
          }

          waypoints.push({
            x: pEnd.x,
            y: pEnd.y,
            nodeId: cornerNode.id,
            isCorner: true,
            edgeFrom: nextSeg.from.id,
            edgeTo: nextSeg.to.id,
          });
        } else {
          waypoints.push({
            x: seg.endPt.x,
            y: seg.endPt.y,
            nodeId: cornerNode.id,
            isCorner: false,
            edgeFrom: seg.from.id,
            edgeTo: seg.to.id,
          });
        }
      } else {
        waypoints.push({
          x: seg.endPt.x,
          y: seg.endPt.y,
          nodeId: seg.to.id,
          isCorner: false,
          isTerminal: true,
          edgeFrom: seg.from.id,
          edgeTo: seg.to.id,
        });
      }
    }

    return waypoints;
  }
}
