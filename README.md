# Autonomous Warehouse Robot Fleet Simulator (2D Real-Time)

A browser-based, high-fidelity 2D simulator of an autonomous warehouse fleet featuring 4 robots with simulated LiDAR raycasting, 3-lane road navigation with dynamic side-lane overtaking, intelligent job scheduling, automated conveyor routing, and battery management.

Built with **HTML5 Canvas** and **vanilla JavaScript (ES modules)** without external frameworks.

---

## 🚀 Key Features

### 1. 3-Lane Road Network & Dynamic Overtaking
- **Center Lane Preference:** Robots default to traveling in the center lane (`Y=375`).
- **Dynamic Overtaking:** When simulated LiDAR detects a slower, stopped, or blocked robot ahead:
  1. Robot slows down to maintain a safe following buffer.
  2. Scans left and right adjacent lanes using LiDAR side check rays.
  3. Chooses a clear lane (prioritizing preferred side and legality) and smoothly changes lanes using smoothstep interpolation (no teleporting).
  4. Accelerates to pass the obstacle with safety margins.
  5. Performs a rear-clearance check and smoothly merges back to the center lane.
- **Deadlock Avoidance & Yielding:** If both side lanes are blocked, robots stop, yield, and apply random backoff timers.
- **Right-of-Way Priority:** Robots carrying cargo take priority over empty ones; lower robot IDs break ties.
- **Intersection & Bay Reservations:** Guarantees only one robot enters a pickup bay or intersection at any given time.

### 2. Simulated 31-Ray LiDAR Sensor
- Each robot continuously casts 31 rays over a 120° forward arc with range ~135px.
- Detects other robots (circle-ray intersection), shelves (AABB ray-box intersection), and perimeter walls.
- Color-coded visualization toggle (**Green** = clear, **Red** = obstacle hit).
- Two active thresholds:
  - **SLOW Zone (95px):** Decelerates robot to match lead vehicle.
  - **DANGER Zone (42px):** Triggers emergency stop and overtaking evasion.

### 3. Automated Dual-Station Conveyor & Diverter
- Carries dropped packages from the conveyor input via animated motorized belts.
- **Mechanical Splitter/Diverter:** Inspects package destination tags and automatically diverts:
  - **UP** belt → **Packaging Station**
  - **DOWN** belt → **Delivery Station**
- **Input Backpressure Management:** If the conveyor belt reaches maximum capacity, inbound robots wait at the input dock.

### 4. Job Management & Auto-Assignment
- Full lifecycle state machine:
  `IDLE` → `GO_TO_INVENTORY` → `PICKING_FROM_INVENTORY` → `GO_TO_SHELF_BAY` → `PICKING_FROM_SHELF` → `CARRYING_TO_CONVEYOR` → `DROPPING_ON_CONVEYOR` → `RETURNING` → `IDLE`
- Manual job dispatcher: Select Robot (1–4 or Auto), Shelf (1–4), Destination (Packaging/Delivery), and Priority (High, Normal, Low).
- Presets: "+ Random (x10)", "Stress Test (all 4 simultaneously)", "Clear Queue".

### 5. Battery & Autonomous Charging Station
- Robots drain battery while moving (higher drain under cargo load).
- If battery falls below 20%, robot completes its drop-off, then autonomously navigates to one of the 2 fast-charge slots at the Charging Station.
- Once charged to 95%+, it resumes fleet duties.

---

## 📁 Project Structure

```
warehouse-robot-sim/
├── index.html               # Main simulation dashboard & layout
├── index.css                # Modern dark industrial styling & animations
├── README.md                # Documentation and scenario guides
└── src/
    ├── main.js              # Application entrypoint & engine bootstrap
    ├── core/
    │   ├── config.js        # Global configuration & tunables
    │   ├── vector.js        # 2D Vector math & raycasting intersection utilities
    │   ├── graph.js         # Directed road graph & A* pathfinding
    │   ├── events.js        # Decoupled EventBus and logging system
    │   └── engine.js        # 60Hz fixed-timestep physics loop & speed controller
    ├── robots/
    │   ├── robot.js         # Robot agent physics, steering, & overtaking logic
    │   ├── lidar.js         # Multi-ray LiDAR sensor simulation
    │   └── stateMachine.js  # Fleet lifecycle state constants
    ├── world/
    │   ├── mapLayout.js     # Exact warehouse zones, shelves, bays, & stations
    │   ├── roadNetwork.js   # 3-lane trunk, return loops, connectors & feeder fan
    │   ├── conveyor.js      # Conveyor belts, splitter routing, & backpressure
    │   ├── jobSystem.js     # Job queue, priority sorting, & auto-dispatch
    │   └── world.js         # World coordinator & scenario runners
    └── ui/
        ├── canvasRenderer.js# High-DPI canvas graphics & overlays
        └── dashboard.js     # UI buttons, metrics, inspector, & event log
```

---

## 🕹️ Running the Simulator

No build step or dependencies required. You can run it either:

### Method 1: Local HTTP Server (Recommended)
```bash
npx serve .
# or
python -m http.server 8080
```
Then open `http://localhost:3000` or `http://localhost:8080` in any modern web browser.

### Method 2: Direct File Open
Open `index.html` in Chrome, Edge, or Firefox.

---

## 🧪 Acceptance Test Scenarios (1-Click UI Buttons)

The dashboard includes dedicated one-click buttons to verify each core requirement:

| Button | Scenario | Description |
|---|---|---|
| **Scenario A** | *Shelf 1 → Delivery* | Robot 1 executes a complete end-to-end pickup from Shelf 1, traverses the center lane, drops cargo onto the conveyor, and returns to depot. |
| **Scenario B** | *Dynamic Overtake* | Robot 2 is parked/blocked in the center lane. Robot 1 approaches carrying cargo, detects the obstacle with LiDAR, changes to a free side lane, passes Robot 2, verifies rear clearance, and merges back into the center lane. |
| **Scenario C** | *4 Robots / 20 Jobs* | Stress tests all 4 robots with 20 auto-assigned jobs simultaneously with zero collisions. |
| **Scenario D** | *Deadlock & Wait* | Blocks both side lanes ahead. Robot safely slows down, yields, and waits for a clear path without deadlocking. |
| **Scenario E** | *Auto Recharge* | Spawns Robot 1 with 18% battery. Demonstrates finishing the delivery and immediately navigating to the Charging Station. |
| **Scenario F** | *Conveyor Splitter* | Drops multiple packages with alternating destinations to verify automated diverter routing to Packaging vs Delivery. |

### Interactive Robot Inspector & "Force Stop / Block"
Select any robot tab (R1–R4) in the sidebar or click directly on any robot on the canvas. Click **"Force Stop / Block This Robot"** to freeze that robot in place at any time, allowing you to observe other robots dynamically overtaking it in real-time.

---

## ⚙️ Configuration & Tunables

All tunable parameters can be adjusted in [`src/core/config.js`](file:///c:/z%20MAIN/Project/warehouse-robot-sim/src/core/config.js):
- **Speeds:** `ROBOT.MAX_SPEED`, `SLOW_SPEED`, `OVERTAKE_SPEED`, `ACCELERATION`
- **LiDAR:** `LIDAR.NUM_RAYS` (31), `FOV_DEG` (120°), `MAX_RANGE` (135px), `SLOW_ZONE_DIST`, `DANGER_ZONE_DIST`
- **Overtaking:** `LANE_CHANGE_DURATION`, `MERGE_AHEAD_MARGIN`, `REAR_CLEARANCE`, `PREFERRED_SIDE`
- **Battery:** `DRAIN_RATE_EMPTY`, `DRAIN_RATE_LOADED`, `CHARGE_RATE`, `LOW_THRESHOLD`
