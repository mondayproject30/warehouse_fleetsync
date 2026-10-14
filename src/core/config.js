/**
 * Warehouse Robot Fleet Simulator - Global Configuration
 * All tunables for world geometry, corridors, physics, LiDAR, lanes, battery, and timings.
 */

export const CONFIG = {
  // Canvas dimensions
  CANVAS_WIDTH: 1360,
  CANVAS_HEIGHT: 760,
  TICK_RATE: 60, // 60 Hz fixed timestep
  TIME_STEP: 1 / 60,

  // Real-World Physical Scale
  // 1 meter = 16 pixels -> 5m = 80px, 8m = 128px
  // Robot body ~0.8m width -> ~13-14px diameter (radius = 7px)
  METERS_TO_PX: 16,
  SAFE_DISTANCE_M: 5.0,  // 5m = 80px (center-to-center minimum hard limit)
  SLOW_DISTANCE_M: 8.0,  // 8m = 128px (start braking)

  // 3-Lane Corridor System Parameters
  // Exactly 3 parallel sub-lanes per corridor (LEFT, CENTER, RIGHT)
  LANE: {
    WIDTH: 18,               // Width of each individual sub-lane (px) ~ 1.2m
    SUB_LANE_OFFSET: 18,      // Distance from corridor centerline to Left/Right sub-lanes
    TOTAL_CORRIDOR_WIDTH: 54, // 3 * 18px = 54px
    SUB_LANES: ['LEFT', 'CENTER', 'RIGHT'],
  },

  // Warehouse Layout Dimensions
  LAYOUT: {
    // Left Zone (Charging, Parking Depot, Inventory)
    LEFT_ZONE_X: 25,
    LEFT_ZONE_WIDTH: 175,

    CHARGER_Y: 40,
    CHARGER_WIDTH: 165,
    CHARGER_HEIGHT: 110,
    CHARGER_SLOTS: 2,

    // Enlarged depot with 2 body-widths spacing between robots
    PARKING_Y: 180,
    PARKING_WIDTH: 165,
    PARKING_HEIGHT: 180,

    INVENTORY_Y: 390,
    INVENTORY_WIDTH: 165,
    INVENTORY_HEIGHT: 270,

    // Center Shelves (2x2 grid)
    SHELF_WIDTH: 110,
    SHELF_HEIGHT: 120,
    SHELF_COL_1_X: 410,
    SHELF_COL_2_X: 740,
    SHELF_ROW_1_Y: 175,
    SHELF_ROW_2_Y: 445,
    BAY_OFFSET: 28, // Distance of pickup bay from shelf edge
    BAY_RADIUS: 12,

    // EXACTLY 3 HORIZONTAL CORRIDORS (No duplicate return bands!)
    TOP_CORRIDOR_Y: 75,     // Single Top 3-Lane Corridor (above shelves 1 & 2)
    MID_CORRIDOR_Y: 370,    // Single Middle 3-Lane Corridor (between shelf rows)
    BOT_CORRIDOR_Y: 670,    // Single Bottom 3-Lane Corridor (below shelves 3 & 4)

    // Sub-lane aliases for middle trunk corridor
    CENTER_LANE_Y: 370,
    TOP_LANE_Y: 370 - 18,    // Left sub-lane of middle corridor
    BOTTOM_LANE_Y: 370 + 18, // Right sub-lane of middle corridor

    // EXACTLY 3 VERTICAL CORRIDORS
    LEFT_CORRIDOR_X: 260,   // Left vertical corridor next to depot/inventory
    MID_CORRIDOR_X: 590,    // Middle vertical corridor between shelf columns
    RIGHT_CORRIDOR_X: 920,  // Right vertical corridor before conveyor fan

    // Right Stations & Dual Conveyor System
    FEEDER_FAN_X: 1040,
    CONVEYOR_INPUT_X: 1110,
    CONVEYOR_INPUT_Y: 370,
    CONVEYOR_SPLITTER_X: 1180,
    CONVEYOR_WIDTH: 26,

    // Top-Right: Picking Station (Incoming packages arrive here)
    PICKING_STATION_Y: 45,
    PICKING_STATION_WIDTH: 155,
    PICKING_STATION_HEIGHT: 115,

    // Bottom-Right: Delivery Station (Outgoing packages dispatched here)
    DELIVERY_STATION_Y: 595,
    DELIVERY_STATION_WIDTH: 155,
    DELIVERY_STATION_HEIGHT: 115,
  },

  // Robots
  ROBOT: {
    COUNT: 4,
    RADIUS: 8,            // 0.8m diameter = 16px diameter, radius = 8px
    MAX_SPEED: 100,       // px/sec in center lane (~6.25 m/s)
    SLOW_SPEED: 40,       // px/sec when trailing an obstacle (~2.5 m/s)
    OVERTAKE_SPEED: 115,  // px/sec while passing in side lane
    ACCELERATION: 160,    // px/sec^2
    ROTATION_SPEED: 5.5,  // rad/sec
    COLORS: [
      '#2563eb', // Robot 1: Royal Blue
      '#059669', // Robot 2: Emerald Green
      '#d97706', // Robot 3: Amber / Orange
      '#9333ea', // Robot 4: Purple
    ],
    GLOW_COLORS: [
      'rgba(37, 99, 235, 0.4)',
      'rgba(5, 150, 105, 0.4)',
      'rgba(217, 119, 6, 0.4)',
      'rgba(147, 51, 234, 0.4)',
    ],
  },

  // LiDAR Sensor Simulation
  LIDAR: {
    NUM_FRONT_RAYS: 25,
    NUM_SIDE_RAYS: 5,
    NUM_REAR_RAYS: 5,
    FOV_DEG: 110,
    MAX_RANGE: 150,       // px (~9.3m)
    SLOW_ZONE_DIST: 128,  // 8m = 128px
    DANGER_ZONE_DIST: 80, // 5m = 80px (hard stop threshold)
    SIDE_CHECK_DIST: 80,  // 5m check in adjacent lane
    REAR_CHECK_DIST: 80,  // 5m rear clearance before merge back
  },

  // Overtaking & Lane Change Behavior
  OVERTAKING: {
    LANE_CHANGE_DURATION: 0.6,
    MIN_CLEAR_AHEAD: 80,  // 5m
    REAR_CLEARANCE: 80,   // 5m
    MERGE_AHEAD_MARGIN: 80, // 5m
    DEADLOCK_TIMEOUT: 2.5,
    PREFERRED_SIDE: 'left',
  },

  // Battery & Charging
  BATTERY: {
    DRAIN_RATE_EMPTY: 0.35,
    DRAIN_RATE_LOADED: 0.65,
    DRAIN_RATE_IDLE: 0.05,
    CHARGE_RATE: 15.0,
    LOW_THRESHOLD: 20.0,
    FULL_THRESHOLD: 95.0,
  },

  // Timings & Operations
  TIMINGS: {
    INVENTORY_DISPATCH_TIME: 1.0,
    SHELF_PICK_TIME: 1.2,
    CONVEYOR_DROP_TIME: 1.0,
    CONVEYOR_BELT_SPEED: 55,
    CONVEYOR_CAPACITY: 8,
  },

  // Visual Theme Colors
  THEME: {
    BG_COLOR: '#090c12',
    FLOOR_GRID: '#141a26',
    CORRIDOR_SURFACE: '#121722',
    CORRIDOR_BORDER: '#273449',
    LANE_DIVIDER_DASH: 'rgba(234, 179, 8, 0.35)',
    LANE_MARKER: '#eab308',
    SHELF_BG: '#1a2233',
    SHELF_BORDER: '#3b82f6',
    SHELF_TEXT: '#93c5fd',
    BAY_MARKER: '#ef4444',
    BAY_ACTIVE: '#22c55e',
    STATION_BEIGE: '#d4b996',
    STATION_BG: '#1d1915',
    STATION_BORDER: '#8c7658',
    CONVEYOR_BELT: '#242730',
    CONVEYOR_ROLLER: '#4a4e5c',
    LIDAR_CLEAR: 'rgba(34, 197, 94, 0.4)',
    LIDAR_HIT: 'rgba(239, 68, 68, 0.85)',
    COLLISION_ALERT: '#dc2626',
    SAFETY_RING_SAFE: 'rgba(34, 197, 94, 0.15)',
    SAFETY_RING_SLOW: 'rgba(234, 179, 8, 0.35)',
    SAFETY_RING_DANGER: 'rgba(239, 68, 68, 0.55)',
  }
};
