/**
 * Canvas Renderer - Warehouse Floor, Exact 3-Lane Corridors, Shelves, Conveyors, and Fleet
 * High-DPI support, crisp vector rendering, exactly 3 lanes per route, animated conveyor belts, and LiDAR rays.
 */

import { CONFIG } from '../core/config.js';

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Rendering Toggles
    this.showLidar = true;
    this.showPaths = true;
    this.showLanes = true;
    this.showGraphNodes = false;
    this.showSafetyDistance = true; // 5m safety ring overlay toggle
    this.showReservations = true;   // TrafficManager node reservations overlay
    this.showWaitFor = true;        // Wait-for graph arrows & labels overlay
    this.selectedRobot = null;

    this.setupHighDPI();
  }

  setupHighDPI() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = CONFIG.CANVAS_WIDTH * dpr;
    this.canvas.height = CONFIG.CANVAS_HEIGHT * dpr;
    this.canvas.style.width = `${CONFIG.CANVAS_WIDTH}px`;
    this.canvas.style.height = `${CONFIG.CANVAS_HEIGHT}px`;
    this.ctx.scale(dpr, dpr);
  }

  render(world) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

    // 1. Draw Floor & Grid
    this.drawFloor(ctx);

    // 2. Draw EXACTLY 3-Lane Corridors Everywhere (No duplicate return bands!)
    if (this.showLanes) {
      this.draw3LaneCorridors(ctx, world.roadNetwork, world.layout);
    }

    // 3. Draw Stations (Left Charging/Depot/Inventory, and Right Picking/Delivery)
    this.drawStations(ctx, world.layout);

    // 4. Draw Shelves and 16 Pickup Bays (Red Ring Markers)
    this.drawShelvesAndBays(ctx, world.layout);

    // 5. Draw Dual Conveyor System (Conveyor A flowing UP to Picking Station, Conveyor B flowing DOWN to Delivery Station)
    this.drawConveyorSystem(ctx, world.conveyor, world.layout);

    // 6. Draw Scale Bar (1m = 16px, 5m = 80px)
    this.drawScaleBar(ctx);

    // 7. Draw Graph Nodes Debug Overlay
    if (this.showGraphNodes) {
      this.drawGraphDebug(ctx, world.roadNetwork.graph);
    }

    // 8. Draw Traffic Manager Node Reservations Overlay
    if (this.showReservations && world.trafficManager) {
      this.drawTrafficReservations(ctx, world.trafficManager, world.roadNetwork, world.robots);
    }

    // 9. Draw Wait-For Graph Arrows Overlay
    if (this.showWaitFor && world.trafficManager) {
      this.drawWaitForGraph(ctx, world.trafficManager, world.robots);
    }

    // 10. Draw Robot Planned Paths Overlay (Lane polylines with curves)
    if (this.showPaths) {
      this.drawRobotPaths(ctx, world.robots);
    }

    // 11. Draw LiDAR Rays
    if (this.showLidar) {
      this.drawLidarRays(ctx, world.robots);
    }

    // 12. Draw Safety Distance (5m) Rings
    if (this.showSafetyDistance) {
      this.drawSafetyRings(ctx, world.robots);
    }

    // 13. Draw Robots on TOP layer
    this.drawRobots(ctx, world.robots);
  }

  drawFloor(ctx) {
    ctx.fillStyle = CONFIG.THEME.BG_COLOR;
    ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

    // Subtle warehouse floor grid
    ctx.strokeStyle = CONFIG.THEME.FLOOR_GRID;
    ctx.lineWidth = 1;
    const gridSize = 40;

    ctx.beginPath();
    for (let x = 0; x < CONFIG.CANVAS_WIDTH; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CONFIG.CANVAS_HEIGHT);
    }
    for (let y = 0; y < CONFIG.CANVAS_HEIGHT; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(CONFIG.CANVAS_WIDTH, y);
    }
    ctx.stroke();
  }

  /**
   * Renders EXACTLY 3 LANES PER ROUTE:
   * 3 Horizontal Corridors: Top (Y=75), Middle (Y=370), Bottom (Y=670).
   * 3 Vertical Corridors: Left (X=260), Middle (X=590), Right (X=920).
   * Each has exactly 3 parallel sub-lanes (LEFT, CENTER, RIGHT). Total width = 54px.
   * NO separate duplicate return bands.
   */
  draw3LaneCorridors(ctx, roadNetwork, layout) {
    const L = CONFIG.LAYOUT;
    const halfWidth = CONFIG.LANE.TOTAL_CORRIDOR_WIDTH / 2; // 27px
    const subOffset = CONFIG.LANE.SUB_LANE_OFFSET; // 18px

    ctx.save();

    // Helper: Draw a single 3-lane horizontal corridor
    const drawHorizontalCorridor = (x1, x2, yCenter, name, dir = 'east') => {
      // Asphalt road surface
      ctx.fillStyle = CONFIG.THEME.CORRIDOR_SURFACE;
      ctx.fillRect(x1, yCenter - halfWidth, x2 - x1, CONFIG.LANE.TOTAL_CORRIDOR_WIDTH);

      // Outer boundary borders
      ctx.strokeStyle = CONFIG.THEME.CORRIDOR_BORDER;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, yCenter - halfWidth);
      ctx.lineTo(x2, yCenter - halfWidth);
      ctx.moveTo(x1, yCenter + halfWidth);
      ctx.lineTo(x2, yCenter + halfWidth);
      ctx.stroke();

      // Two dashed divider lines separating the 3 sub-lanes
      ctx.strokeStyle = CONFIG.THEME.LANE_DIVIDER_DASH;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);

      const divider1Y = yCenter - (subOffset / 2);
      const divider2Y = yCenter + (subOffset / 2);

      ctx.beginPath();
      ctx.moveTo(x1, divider1Y);
      ctx.lineTo(x2, divider1Y);
      ctx.moveTo(x1, divider2Y);
      ctx.lineTo(x2, divider2Y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Yellow directional arrows on all 3 sub-lanes
      const angle = dir === 'east' ? 0 : Math.PI;
      const step = 85;

      for (let x = x1 + 45; x < x2 - 20; x += step) {
        // Center lane arrow
        this.drawArrow(ctx, x, yCenter, angle, CONFIG.THEME.LANE_MARKER, 6);
        // Left sub-lane arrow
        this.drawArrow(ctx, x, yCenter - subOffset, angle, 'rgba(234, 179, 8, 0.45)', 5);
        // Right sub-lane arrow
        this.drawArrow(ctx, x, yCenter + subOffset, angle, 'rgba(234, 179, 8, 0.45)', 5);
      }
    };

    // Helper: Draw a single 3-lane vertical corridor
    const drawVerticalCorridor = (y1, y2, xCenter, name) => {
      ctx.fillStyle = CONFIG.THEME.CORRIDOR_SURFACE;
      ctx.fillRect(xCenter - halfWidth, y1, CONFIG.LANE.TOTAL_CORRIDOR_WIDTH, y2 - y1);

      ctx.strokeStyle = CONFIG.THEME.CORRIDOR_BORDER;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xCenter - halfWidth, y1);
      ctx.lineTo(xCenter - halfWidth, y2);
      ctx.moveTo(xCenter + halfWidth, y1);
      ctx.lineTo(xCenter + halfWidth, y2);
      ctx.stroke();

      ctx.strokeStyle = CONFIG.THEME.LANE_DIVIDER_DASH;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);

      const divider1X = xCenter - (subOffset / 2);
      const divider2X = xCenter + (subOffset / 2);

      ctx.beginPath();
      ctx.moveTo(divider1X, y1);
      ctx.lineTo(divider1X, y2);
      ctx.moveTo(divider2X, y1);
      ctx.lineTo(divider2X, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    // Draw the 3 Horizontal Corridors (Single band per route, exactly 3 lanes)
    drawHorizontalCorridor(L.LEFT_CORRIDOR_X, L.RIGHT_CORRIDOR_X, L.TOP_CORRIDOR_Y, 'Top Route', 'east');
    drawHorizontalCorridor(L.LEFT_CORRIDOR_X, L.RIGHT_CORRIDOR_X, L.MID_CORRIDOR_Y, 'Middle Route', 'east');
    drawHorizontalCorridor(L.LEFT_CORRIDOR_X, L.RIGHT_CORRIDOR_X, L.BOT_CORRIDOR_Y, 'Bottom Route', 'east');

    // Draw the 3 Vertical Corridors (Single band per route, exactly 3 lanes)
    drawVerticalCorridor(L.TOP_CORRIDOR_Y, L.BOT_CORRIDOR_Y, L.LEFT_CORRIDOR_X, 'Left Route');
    drawVerticalCorridor(L.TOP_CORRIDOR_Y, L.BOT_CORRIDOR_Y, L.MID_CORRIDOR_X, 'Middle Route');
    drawVerticalCorridor(L.TOP_CORRIDOR_Y, L.BOT_CORRIDOR_Y, L.RIGHT_CORRIDOR_X, 'Right Route');

    // Draw Spurs to all 16 Shelf Bays
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.45)';
    ctx.lineWidth = 4;
    ctx.setLineDash([4, 4]);

    layout.bays.forEach((bay) => {
      let targetX = bay.x;
      let targetY = bay.y;

      if (bay.direction === 'N') {
        targetY = (bay.shelfId <= 2) ? L.TOP_CORRIDOR_Y : L.MID_CORRIDOR_Y;
      } else if (bay.direction === 'S') {
        targetY = (bay.shelfId <= 2) ? L.MID_CORRIDOR_Y : L.BOT_CORRIDOR_Y;
      } else if (bay.direction === 'W') {
        targetX = (bay.shelfId === 1 || bay.shelfId === 3) ? L.LEFT_CORRIDOR_X : L.MID_CORRIDOR_X;
      } else if (bay.direction === 'E') {
        targetX = (bay.shelfId === 1 || bay.shelfId === 3) ? L.MID_CORRIDOR_X : L.RIGHT_CORRIDOR_X;
      }

      ctx.beginPath();
      ctx.moveTo(bay.x, bay.y);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Station Spurs
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.4)';
    ctx.lineWidth = 5;
    // Depot
    ctx.beginPath();
    ctx.moveTo(layout.parkingArea.exitPoint.x, layout.parkingArea.exitPoint.y);
    ctx.lineTo(L.LEFT_CORRIDOR_X, layout.parkingArea.exitPoint.y);
    ctx.stroke();
    // Charging
    ctx.beginPath();
    ctx.moveTo(layout.chargingStation.exitPoint.x, layout.chargingStation.exitPoint.y);
    ctx.lineTo(L.LEFT_CORRIDOR_X, layout.chargingStation.exitPoint.y);
    ctx.stroke();
    // Inventory
    ctx.beginPath();
    ctx.moveTo(layout.inventorySystem.exitPoint.x, layout.inventorySystem.exitPoint.y);
    ctx.lineTo(L.LEFT_CORRIDOR_X, layout.inventorySystem.exitPoint.y);
    ctx.stroke();

    // Feeder Fan: 3 lines to upper belt side, 3 lines to lower belt side (6 total)
    const fanY = [285, 320, 350, 390, 420, 455];
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)';
    ctx.lineWidth = 2;

    fanY.forEach((fy) => {
      ctx.beginPath();
      ctx.moveTo(L.RIGHT_CORRIDOR_X + halfWidth, fy < 340 ? L.TOP_CORRIDOR_Y : fy > 400 ? L.BOT_CORRIDOR_Y : L.MID_CORRIDOR_Y);
      ctx.lineTo(L.FEEDER_FAN_X, fy);
      ctx.lineTo(L.CONVEYOR_INPUT_X, L.CONVEYOR_INPUT_Y);
      ctx.stroke();

      this.drawArrow(ctx, L.FEEDER_FAN_X - 10, fy, Math.atan2(L.CONVEYOR_INPUT_Y - fy, L.CONVEYOR_INPUT_X - L.FEEDER_FAN_X), CONFIG.THEME.LANE_MARKER, 5);
    });

    // Return tracks from conveyor back to top & bottom corridors
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.35)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(L.CONVEYOR_INPUT_X, L.CONVEYOR_INPUT_Y);
    ctx.lineTo(L.CONVEYOR_INPUT_X + 20, L.TOP_CORRIDOR_Y);
    ctx.lineTo(L.RIGHT_CORRIDOR_X, L.TOP_CORRIDOR_Y);
    ctx.moveTo(L.CONVEYOR_INPUT_X, L.CONVEYOR_INPUT_Y);
    ctx.lineTo(L.CONVEYOR_INPUT_X + 20, L.BOT_CORRIDOR_Y);
    ctx.lineTo(L.RIGHT_CORRIDOR_X, L.BOT_CORRIDOR_Y);
    ctx.stroke();

    ctx.restore();
  }

  drawArrow(ctx, x, y, angleRad, color, size = 6) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angleRad);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size, -size * 0.6);
    ctx.lineTo(-size * 0.5, 0);
    ctx.lineTo(-size, size * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawStations(ctx, layout) {
    const drawStationBox = (box, title, subtitle, isBeige = true) => {
      ctx.save();
      ctx.fillStyle = isBeige ? CONFIG.THEME.STATION_BG : '#141b26';
      ctx.strokeStyle = isBeige ? CONFIG.THEME.STATION_BEIGE : '#3b82f6';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.width, box.height, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isBeige ? CONFIG.THEME.STATION_BEIGE : '#93c5fd';
      ctx.font = 'bold 12px Inter, system-ui, sans-serif';
      ctx.fillText(title, box.x + 12, box.y + 22);

      if (subtitle) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillText(subtitle, box.x + 12, box.y + 38);
      }
      ctx.restore();
    };

    // 1. Charging Station
    drawStationBox(layout.chargingStation, '⚡ CHARGING STATION', '2 Fast-charge slots');
    layout.chargingStation.slots.forEach((slot, idx) => {
      ctx.save();
      ctx.fillStyle = slot.occupiedBy ? 'rgba(34, 197, 94, 0.3)' : 'rgba(234, 179, 8, 0.15)';
      ctx.strokeStyle = slot.occupiedBy ? '#22c55e' : '#eab308';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(slot.x - 16, slot.y - 16, 32, 32);
      ctx.fillRect(slot.x - 16, slot.y - 16, 32, 32);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`CHG ${idx + 1}`, slot.x, slot.y + 4);
      ctx.restore();
    });

    // 2. Depot / Parking Area
    drawStationBox(layout.parkingArea, '🏭 ROBOT DEPOT', 'Staging & Parking (4 Slots)', false);
    layout.parkingArea.spots.forEach((spot, idx) => {
      ctx.save();
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(spot.x - 14, spot.y - 14, 28, 28);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.6)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`BAY ${idx + 1}`, spot.x, spot.y + 3);
      ctx.restore();
    });

    // 3. Inventory System
    drawStationBox(layout.inventorySystem, '📦 INVENTORY SYSTEM', 'Cargo Storage & Dispatch');
    ctx.save();
    for (let r = 0; r < 4; r++) {
      const iy = layout.inventorySystem.y + 55 + r * 48;
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#334155';
      ctx.fillRect(layout.inventorySystem.x + 15, iy, 115, 30);
      ctx.strokeRect(layout.inventorySystem.x + 15, iy, 115, 30);

      const colors = ['#f59e0b', '#3b82f6', '#ec4899', '#10b981'];
      for (let b = 0; b < 3; b++) {
        ctx.fillStyle = colors[(r + b) % colors.length];
        ctx.fillRect(layout.inventorySystem.x + 22 + b * 36, iy + 5, 24, 20);
      }
    }
    // Dispatch indicator
    ctx.strokeStyle = '#22c55e';
    ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
    ctx.beginPath();
    ctx.arc(layout.inventorySystem.dispatchPoint.x, layout.inventorySystem.dispatchPoint.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DISPATCH', layout.inventorySystem.dispatchPoint.x, layout.inventorySystem.dispatchPoint.y + 3);
    ctx.restore();

    // 4. TOP-RIGHT: PICKING STATION (Beige station box above Conveyor A)
    drawStationBox(layout.pickingStation, '📦 PICKING STATION', `Waiting Packages: ${layout.pickingStation.packageQueue}`);
    // Pick Bay
    ctx.save();
    ctx.strokeStyle = layout.pickingStation.pickBay.reservedBy ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(layout.pickingStation.pickBay.x, layout.pickingStation.pickBay.y, CONFIG.LAYOUT.BAY_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = layout.pickingStation.pickBay.reservedBy ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.15)';
    ctx.fill();
    ctx.fillStyle = '#fca5a5';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PICK', layout.pickingStation.pickBay.x, layout.pickingStation.pickBay.y + 3);
    ctx.restore();

    // 5. BOTTOM-RIGHT: DELIVERY STATION (Beige station box below Conveyor B)
    drawStationBox(layout.deliveryStation, '🚚 DELIVERY STATION', `Dispatched: ${layout.deliveryStation.itemCount}`);
  }

  drawShelvesAndBays(ctx, layout) {
    // 4 Shelves in 2x2 arrangement
    layout.shelves.forEach((shelf) => {
      ctx.save();
      ctx.fillStyle = CONFIG.THEME.SHELF_BG;
      ctx.strokeStyle = CONFIG.THEME.SHELF_BORDER;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(shelf.x, shelf.y, shelf.width, shelf.height, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#334155';
      const numRacks = 4;
      const rackH = (shelf.height - 20) / numRacks;
      for (let i = 0; i < numRacks; i++) {
        const ry = shelf.y + 10 + i * rackH;
        ctx.fillRect(shelf.x + 8, ry, shelf.width - 16, rackH - 4);
        ctx.fillStyle = (i % 2 === 0) ? '#3b82f6' : '#f59e0b';
        ctx.fillRect(shelf.x + 12, ry + 3, 14, rackH - 10);
        ctx.fillRect(shelf.x + 32, ry + 3, 14, rackH - 10);
        ctx.fillRect(shelf.x + 52, ry + 3, 14, rackH - 10);
        ctx.fillStyle = '#334155';
      }

      ctx.fillStyle = CONFIG.THEME.SHELF_TEXT;
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(shelf.name, shelf.x + shelf.width / 2, shelf.y + shelf.height / 2 + 4);
      ctx.restore();
    });

    // 16 Pickup Bays around the 4 shelves
    layout.bays.forEach((bay) => {
      ctx.save();
      const isReserved = bay.reservedBy !== null;
      ctx.strokeStyle = isReserved ? CONFIG.THEME.BAY_ACTIVE : CONFIG.THEME.BAY_MARKER;
      ctx.lineWidth = 2.5;

      ctx.beginPath();
      ctx.arc(bay.x, bay.y, CONFIG.LAYOUT.BAY_RADIUS, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = isReserved ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.15)';
      ctx.fill();

      ctx.fillStyle = isReserved ? '#22c55e' : '#fca5a5';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isReserved ? `R${bay.reservedBy}` : bay.direction, bay.x, bay.y + 3);
      ctx.restore();
    });
  }

  drawConveyorSystem(ctx, conveyor, layout) {
    const L = CONFIG.LAYOUT;
    ctx.save();

    // Drop input dock
    ctx.fillStyle = 'rgba(234, 179, 8, 0.2)';
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2;
    ctx.strokeRect(L.CONVEYOR_INPUT_X - 14, L.CONVEYOR_INPUT_Y - 14, 28, 28);
    ctx.fillRect(L.CONVEYOR_INPUT_X - 14, L.CONVEYOR_INPUT_Y - 14, 28, 28);
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DROP', L.CONVEYOR_INPUT_X, L.CONVEYOR_INPUT_Y + 3);

    // Infeed belt
    this.drawBeltSection(ctx, L.CONVEYOR_INPUT_X, L.CONVEYOR_INPUT_Y - 10, L.CONVEYOR_SPLITTER_X - L.CONVEYOR_INPUT_X, 20, 'horizontal', conveyor.beltOffset);

    // Diverter Splitter
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.fillRect(L.CONVEYOR_SPLITTER_X - 10, L.CONVEYOR_INPUT_Y - 12, 24, 24);
    ctx.strokeRect(L.CONVEYOR_SPLITTER_X - 10, L.CONVEYOR_INPUT_Y - 12, 24, 24);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 7px sans-serif';
    ctx.fillText('SPLIT', L.CONVEYOR_SPLITTER_X + 2, L.CONVEYOR_INPUT_Y + 3);

    // Conveyor A (Flows UP toward Picking Station)
    const pickCenterY = layout.pickingStation.y + layout.pickingStation.height / 2;
    const upBeltHeight = L.CONVEYOR_INPUT_Y - pickCenterY;
    this.drawBeltSection(ctx, L.CONVEYOR_SPLITTER_X - 10, pickCenterY, 20, upBeltHeight, 'vertical_up', conveyor.beltOffset);
    // Direction arrow pointing UP
    this.drawArrow(ctx, L.CONVEYOR_SPLITTER_X, pickCenterY + 25, -Math.PI / 2, '#38bdf8', 6);

    // Conveyor B (Flows DOWN toward Delivery Station)
    const delivCenterY = layout.deliveryStation.y + layout.deliveryStation.height / 2;
    const downBeltHeight = delivCenterY - L.CONVEYOR_INPUT_Y;
    this.drawBeltSection(ctx, L.CONVEYOR_SPLITTER_X - 10, L.CONVEYOR_INPUT_Y, 20, downBeltHeight, 'vertical_down', conveyor.beltOffset);
    // Direction arrow pointing DOWN
    this.drawArrow(ctx, L.CONVEYOR_SPLITTER_X, delivCenterY - 25, Math.PI / 2, '#06b6d4', 6);

    // Items on belts
    conveyor.items.forEach((item) => {
      ctx.save();
      ctx.fillStyle = item.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = item.color;
      ctx.shadowBlur = 6;

      ctx.beginPath();
      ctx.roundRect(item.x - 7, item.y - 7, 14, 14, 3);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`J${item.jobId}`, item.x, item.y + 3);
      ctx.restore();
    });

    ctx.restore();
  }

  drawBeltSection(ctx, x, y, width, height, dir, offset) {
    ctx.save();
    ctx.fillStyle = CONFIG.THEME.CONVEYOR_BELT;
    ctx.strokeStyle = CONFIG.THEME.CONVEYOR_ROLLER;
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);

    ctx.strokeStyle = '#3f3f46';
    ctx.lineWidth = 1;

    if (dir === 'horizontal') {
      const step = 10;
      for (let px = x + (offset % step); px < x + width; px += step) {
        ctx.beginPath();
        ctx.moveTo(px, y);
        ctx.lineTo(px, y + height);
        ctx.stroke();
      }
    } else {
      const step = 10;
      for (let py = y + (offset % step); py < y + height; py += step) {
        ctx.beginPath();
        ctx.moveTo(x, py);
        ctx.lineTo(x + width, py);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Scale Bar Overlay: 1m = 16px, 5m = 80px
   */
  drawScaleBar(ctx) {
    const scalePx = 5 * CONFIG.METERS_TO_PX; // 80px = 5m
    const x = 30;
    const y = CONFIG.CANVAS_HEIGHT - 25;

    ctx.save();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;

    // Horizontal scale line
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + scalePx, y);
    // End ticks
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.moveTo(x + scalePx, y - 4);
    ctx.lineTo(x + scalePx, y + 4);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('Scale: 5 m (80 px)', x + scalePx + 8, y + 3);
    ctx.restore();
  }

  /**
   * Safety Distance Overlay: Translucent ring with 2.5m radius (40px)
   * Two touching rings = exactly 5m.
   * Turns yellow below 8m and red below 5m.
   */
  drawSafetyRings(ctx, robots) {
    const radiusPx = (CONFIG.SAFE_DISTANCE_M / 2) * CONFIG.METERS_TO_PX; // 2.5m = 40px

    robots.forEach((robot) => {
      ctx.save();
      ctx.translate(robot.x, robot.y);

      let ringColor = CONFIG.THEME.SAFETY_RING_SAFE;
      let strokeColor = 'rgba(34, 197, 94, 0.4)';

      // Check distance to closest other robot
      let minGapPx = Infinity;
      robots.forEach(other => {
        if (other.id !== robot.id) {
          const d = Math.hypot(robot.x - other.x, robot.y - other.y);
          if (d < minGapPx) minGapPx = d;
        }
      });

      const distM = minGapPx / CONFIG.METERS_TO_PX;
      if (distM < CONFIG.SAFE_DISTANCE_M) {
        ringColor = CONFIG.THEME.SAFETY_RING_DANGER;
        strokeColor = '#ef4444';
      } else if (distM < CONFIG.SLOW_DISTANCE_M) {
        ringColor = CONFIG.THEME.SAFETY_RING_SLOW;
        strokeColor = '#eab308';
      }

      ctx.fillStyle = ringColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.arc(0, 0, radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    });
  }

  drawTrafficReservations(ctx, trafficManager, roadNetwork, robots) {
    if (!trafficManager) return;

    ctx.save();
    for (const [nodeId, res] of trafficManager.reservations.entries()) {
      const node = roadNetwork.graph.getNode(nodeId);
      if (!node) continue;
      const robot = robots.find(r => r.id === res.robotId);
      const color = robot ? robot.color : '#3b82f6';

      // Draw reservation zone circle
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(node.x, node.y, trafficManager.ZONE_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Fill with transparent glow
      ctx.fillStyle = robot ? robot.glowColor : 'rgba(59, 130, 246, 0.2)';
      ctx.fill();

      // Small badge: R#
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(node.x, node.y - trafficManager.ZONE_RADIUS - 4, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`R${res.robotId}`, node.x, node.y - trafficManager.ZONE_RADIUS - 1);
    }
    ctx.restore();
  }

  drawWaitForGraph(ctx, trafficManager, robots) {
    if (!trafficManager) return;

    ctx.save();
    for (const [waitingId, edges] of trafficManager.waitForGraph.entries()) {
      const waitingRobot = robots.find(r => r.id === waitingId);
      if (!waitingRobot) continue;

      for (const edge of edges) {
        const blockerRobot = robots.find(r => r.id === edge.blockerId);
        if (!blockerRobot) continue;

        // Draw wait-for arrow from waitingRobot to blockerRobot
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);

        ctx.beginPath();
        ctx.moveTo(waitingRobot.x, waitingRobot.y);
        ctx.lineTo(blockerRobot.x, blockerRobot.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw arrowhead at blocker robot
        const angle = Math.atan2(blockerRobot.y - waitingRobot.y, blockerRobot.x - waitingRobot.x);
        const arrowDist = Math.hypot(blockerRobot.x - waitingRobot.x, blockerRobot.y - waitingRobot.y);
        const arrowX = waitingRobot.x + Math.cos(angle) * Math.max(0, arrowDist - 12);
        const arrowY = waitingRobot.y + Math.sin(angle) * Math.max(0, arrowDist - 12);

        this.drawArrow(ctx, arrowX, arrowY, angle, '#f59e0b', 8);
      }
    }
    ctx.restore();
  }

  drawRobotPaths(ctx, robots) {
    robots.forEach((robot) => {
      const pathPts = (robot.lanePath && robot.lanePath.length > 0) ? robot.lanePath : robot.path;
      const startIdx = (robot.lanePath && robot.lanePath.length > 0) ? robot.laneWaypointIndex : robot.pathIndex;

      if (!pathPts || pathPts.length === 0 || startIdx >= pathPts.length) return;

      ctx.save();
      ctx.strokeStyle = robot.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(robot.x, robot.y);

      for (let i = startIdx; i < pathPts.length; i++) {
        const pt = pathPts[i];
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      const finalNode = pathPts[pathPts.length - 1];
      ctx.fillStyle = robot.color;
      ctx.beginPath();
      ctx.arc(finalNode.x, finalNode.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  drawLidarRays(ctx, robots) {
    robots.forEach((robot) => {
      if (!robot.lidar || robot.lidar.rays.length === 0) return;

      ctx.save();
      ctx.lineWidth = 1;

      robot.lidar.rays.forEach((ray) => {
        ctx.strokeStyle = ray.hit ? CONFIG.THEME.LIDAR_HIT : CONFIG.THEME.LIDAR_CLEAR;
        ctx.beginPath();
        ctx.moveTo(robot.x, robot.y);
        ctx.lineTo(ray.hitPoint.x, ray.hitPoint.y);
        ctx.stroke();

        if (ray.hit) {
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(ray.hitPoint.x, ray.hitPoint.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      ctx.restore();
    });
  }

  /**
   * Robots rendered on TOP layer:
   * Unique color, bold ID number, direction arrow, thin outline, status badges.
   */
  drawRobots(ctx, robots) {
    robots.forEach((robot) => {
      ctx.save();
      ctx.translate(robot.x, robot.y);

      const isSelected = this.selectedRobot && this.selectedRobot.id === robot.id;

      // Outer safety glow
      ctx.shadowColor = robot.glowColor;
      ctx.shadowBlur = isSelected ? 16 : 8;

      // Robot chassis circle
      ctx.fillStyle = robot.isForceStopped ? '#dc2626' : robot.color;
      ctx.strokeStyle = isSelected ? '#ffffff' : '#f8fafc';
      ctx.lineWidth = isSelected ? 2.5 : 1.5;

      ctx.beginPath();
      ctx.arc(0, 0, robot.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Heading directional pointer arrow
      ctx.rotate(robot.heading);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(robot.radius - 1, 0);
      ctx.lineTo(robot.radius - 5, -3.5);
      ctx.lineTo(robot.radius - 5, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.rotate(-robot.heading);

      // Carried Cargo
      if (robot.carriedItem) {
        ctx.fillStyle = robot.carriedItem.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(-5, -5, 10, 10, 2);
        ctx.fill();
        ctx.stroke();
      }

      // Bold Robot ID
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(robot.id.toString(), 0, robot.carriedItem ? -8 : 3);

      // Battery bar under robot
      const barW = 20;
      const barH = 3;
      const barY = robot.radius + 4;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(-barW / 2, barY, barW, barH);

      const battPct = Math.max(0, robot.battery / 100);
      const battColor = robot.battery > 50 ? '#22c55e' : (robot.battery > 20 ? '#eab308' : '#ef4444');
      ctx.fillStyle = battColor;
      ctx.fillRect(-barW / 2, barY, barW * battPct, barH);

      // Traffic Status Label Badge (YIELDING, DEADLOCK RECOVERY, OVERTAKING, CHARGING)
      if (robot.trafficLabel) {
        ctx.font = 'bold 8px Inter, sans-serif';
        const txt = robot.trafficLabel;
        const metrics = ctx.measureText(txt);
        const pad = 5;
        const bW = metrics.width + pad * 2;
        const bH = 13;
        const bY = -robot.radius - 17;

        let bgColor = '#f59e0b'; // Amber for YIELDING
        if (txt === 'DEADLOCK RECOVERY') bgColor = '#ef4444'; // Red for DEADLOCK RECOVERY
        else if (txt === 'OVERTAKING') bgColor = '#06b6d4';   // Cyan for OVERTAKING
        else if (txt === 'CHARGING') bgColor = '#10b981';     // Green for CHARGING

        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.roundRect(-bW / 2, bY, bW, bH, 3);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(txt, 0, bY + 9);
      }

      ctx.restore();
    });
  }

  drawGraphDebug(ctx, graph) {
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 1;
    for (const edge of graph.edges) {
      ctx.beginPath();
      ctx.moveTo(edge.from.x, edge.from.y);
      ctx.lineTo(edge.to.x, edge.to.y);
      ctx.stroke();
    }

    for (const node of graph.nodes.values()) {
      ctx.fillStyle = node.type === 'intersection' ? '#f59e0b' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(node.x, node.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
