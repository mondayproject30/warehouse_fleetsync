/**
 * Warehouse Map Layout Coordinates & Structural Boundaries
 * Updated with exact 3-lane corridors, Picking Station (top-right), Delivery Station (bottom-right).
 */
import { CONFIG } from '../core/config.js';

export class MapLayout {
  constructor() {
    const L = CONFIG.LAYOUT;
    this.width = CONFIG.CANVAS_WIDTH;
    this.height = CONFIG.CANVAS_HEIGHT;

    // 1. LEFT STATIONS (Charging, Depot, Inventory)
    this.chargingStation = {
      x: L.LEFT_ZONE_X,
      y: L.CHARGER_Y,
      width: L.CHARGER_WIDTH,
      height: L.CHARGER_HEIGHT,
      name: 'Charging Station',
      slots: [
        { id: 'charge_slot_1', x: L.LEFT_ZONE_X + 45, y: L.CHARGER_Y + 55, occupiedBy: null },
        { id: 'charge_slot_2', x: L.LEFT_ZONE_X + 115, y: L.CHARGER_Y + 55, occupiedBy: null },
      ],
      exitPoint: { x: L.LEFT_ZONE_X + L.CHARGER_WIDTH, y: L.CHARGER_Y + 55 }
    };

    // 4 robots park in separate non-overlapping slots at least 2 body widths apart
    this.parkingArea = {
      x: L.LEFT_ZONE_X,
      y: L.PARKING_Y,
      width: L.PARKING_WIDTH,
      height: L.PARKING_HEIGHT,
      name: 'Robot Depot',
      spots: [
        { id: 'park_1', x: L.LEFT_ZONE_X + 45, y: L.PARKING_Y + 50 },
        { id: 'park_2', x: L.LEFT_ZONE_X + 115, y: L.PARKING_Y + 50 },
        { id: 'park_3', x: L.LEFT_ZONE_X + 45, y: L.PARKING_Y + 130 },
        { id: 'park_4', x: L.LEFT_ZONE_X + 115, y: L.PARKING_Y + 130 },
      ],
      exitPoint: { x: L.LEFT_ZONE_X + L.PARKING_WIDTH, y: L.PARKING_Y + 90 }
    };

    this.inventorySystem = {
      x: L.LEFT_ZONE_X,
      y: L.INVENTORY_Y,
      width: L.INVENTORY_WIDTH,
      height: L.INVENTORY_HEIGHT,
      name: 'Inventory System',
      dispatchPoint: { x: L.LEFT_ZONE_X + 120, y: L.INVENTORY_Y + 135 },
      exitPoint: { x: L.LEFT_ZONE_X + L.INVENTORY_WIDTH, y: L.INVENTORY_Y + 135 }
    };

    // 2. CENTER SHELVES (2x2 grid)
    this.shelves = [
      {
        id: 1,
        name: 'Shelf 1',
        x: L.SHELF_COL_1_X,
        y: L.SHELF_ROW_1_Y,
        width: L.SHELF_WIDTH,
        height: L.SHELF_HEIGHT,
      },
      {
        id: 2,
        name: 'Shelf 2',
        x: L.SHELF_COL_2_X,
        y: L.SHELF_ROW_1_Y,
        width: L.SHELF_WIDTH,
        height: L.SHELF_HEIGHT,
      },
      {
        id: 3,
        name: 'Shelf 3',
        x: L.SHELF_COL_1_X,
        y: L.SHELF_ROW_2_Y,
        width: L.SHELF_WIDTH,
        height: L.SHELF_HEIGHT,
      },
      {
        id: 4,
        name: 'Shelf 4',
        x: L.SHELF_COL_2_X,
        y: L.SHELF_ROW_2_Y,
        width: L.SHELF_WIDTH,
        height: L.SHELF_HEIGHT,
      },
    ];

    // Compute 4 Pickup Bays per Shelf (North, East, South, West) = 16 total
    this.bays = [];
    const bayDistance = CONFIG.LAYOUT.BAY_OFFSET;
    this.shelves.forEach((shelf) => {
      const cx = shelf.x + shelf.width / 2;
      const cy = shelf.y + shelf.height / 2;
      const shelfBays = [
        {
          id: `bay_${shelf.id}_N`,
          shelfId: shelf.id,
          direction: 'N',
          x: cx,
          y: shelf.y - bayDistance,
          reservedBy: null,
        },
        {
          id: `bay_${shelf.id}_E`,
          shelfId: shelf.id,
          direction: 'E',
          x: shelf.x + shelf.width + bayDistance,
          y: cy,
          reservedBy: null,
        },
        {
          id: `bay_${shelf.id}_S`,
          shelfId: shelf.id,
          direction: 'S',
          x: cx,
          y: shelf.y + shelf.height + bayDistance,
          reservedBy: null,
        },
        {
          id: `bay_${shelf.id}_W`,
          shelfId: shelf.id,
          direction: 'W',
          x: shelf.x - bayDistance,
          y: cy,
          reservedBy: null,
        },
      ];
      shelf.bays = shelfBays;
      this.bays.push(...shelfBays);
    });

    // 3. RIGHT STATIONS & DUAL CONVEYOR BELTS
    // Top-Right: Picking / Packaging Station (Beige station box above Conveyor A)
    this.pickingStation = {
      x: L.CANVAS_WIDTH - L.PICKING_STATION_WIDTH - 20,
      y: L.PICKING_STATION_Y,
      width: L.PICKING_STATION_WIDTH,
      height: L.PICKING_STATION_HEIGHT,
      name: 'Picking Station',
      packageQueue: 0,
      itemCount: 0,
      pickBay: {
        id: 'bay_picking_station',
        x: L.CANVAS_WIDTH - L.PICKING_STATION_WIDTH - 35,
        y: L.PICKING_STATION_Y + L.PICKING_STATION_HEIGHT / 2,
        reservedBy: null,
      }
    };
    this.packagingStation = this.pickingStation;

    // Bottom-Right: Delivery Station (Beige station box below Conveyor B)
    this.deliveryStation = {
      x: L.CANVAS_WIDTH - L.DELIVERY_STATION_WIDTH - 20,
      y: L.DELIVERY_STATION_Y,
      width: L.DELIVERY_STATION_WIDTH,
      height: L.DELIVERY_STATION_HEIGHT,
      name: 'Delivery Station',
      itemCount: 0,
      dropBay: {
        id: 'bay_delivery_station',
        x: L.CANVAS_WIDTH - L.DELIVERY_STATION_WIDTH - 35,
        y: L.DELIVERY_STATION_Y + L.DELIVERY_STATION_HEIGHT / 2,
        reservedBy: null,
      }
    };

    // Dual Conveyor Belts:
    // Conveyor A flows UP toward Picking Station
    // Conveyor B flows DOWN toward Delivery Station
    this.conveyor = {
      inputX: L.CONVEYOR_INPUT_X,
      inputY: L.CONVEYOR_INPUT_Y,
      splitterX: L.CONVEYOR_SPLITTER_X,
      width: L.CONVEYOR_WIDTH,
      topY: L.PICKING_STATION_Y + L.PICKING_STATION_HEIGHT / 2,
      bottomY: L.DELIVERY_STATION_Y + L.DELIVERY_STATION_HEIGHT / 2,
      items: [],
    };
  }

  getBayById(bayId) {
    if (bayId === 'bay_picking_station') return this.pickingStation.pickBay;
    if (bayId === 'bay_delivery_station') return this.deliveryStation.dropBay;
    return this.bays.find(b => b.id === bayId);
  }

  getAvailableBay(shelfId, robotId) {
    const shelf = this.shelves.find(s => s.id === shelfId);
    if (!shelf) return null;
    return shelf.bays.find(b => !b.reservedBy || b.reservedBy === robotId);
  }

  reserveBay(bayId, robotId) {
    const bay = this.getBayById(bayId);
    if (bay && (!bay.reservedBy || bay.reservedBy === robotId)) {
      bay.reservedBy = robotId;
      return true;
    }
    return false;
  }

  releaseBay(bayId, robotId) {
    const bay = this.getBayById(bayId);
    if (bay && bay.reservedBy === robotId) {
      bay.reservedBy = null;
    }
  }

  releaseAllBaysForRobot(robotId) {
    for (const bay of this.bays) {
      if (bay.reservedBy === robotId) {
        bay.reservedBy = null;
      }
    }
    if (this.pickingStation.pickBay.reservedBy === robotId) {
      this.pickingStation.pickBay.reservedBy = null;
    }
    if (this.deliveryStation.dropBay.reservedBy === robotId) {
      this.deliveryStation.dropBay.reservedBy = null;
    }
  }
}
