/**
 * Warehouse World Simulation Coordinator
 * Manages layout, road network, central TrafficManager, 4-robot fleet, conveyor belts, job dispatcher, and acceptance scenarios.
 */

import { CONFIG } from '../core/config.js';
import { MapLayout } from './mapLayout.js';
import { RoadNetwork } from './roadNetwork.js';
import { TrafficManager } from '../core/trafficManager.js';
import { ConveyorSystem } from './conveyor.js';
import { JobSystem } from './jobSystem.js';
import { Robot } from '../robots/robot.js';
import { events } from '../core/events.js';

export class World {
  constructor() {
    this.layout = new MapLayout();
    this.roadNetwork = new RoadNetwork(this.layout);
    this.trafficManager = new TrafficManager(this);
    this.conveyor = new ConveyorSystem(this.layout);
    this.jobSystem = new JobSystem();
    this.robots = [];
    this.simTime = 0;

    // Metrics Tracking
    this.metrics = {
      totalOvertakes: 0,
      totalNearMisses: 0,
      totalCollisions: 0,
    };

    this.initFleet();
    this.setupEventListeners();
  }

  initFleet() {
    this.robots = [];
    const spots = this.layout.parkingArea.spots;

    for (let i = 0; i < CONFIG.ROBOT.COUNT; i++) {
      const spot = spots[i];
      const robot = new Robot(i + 1, spot.x, spot.y, { heading: 0 });
      this.robots.push(robot);
    }
  }

  setupEventListeners() {
    events.on('overtake_started', () => {
      this.metrics.totalOvertakes++;
    });
    events.on('near_miss_detected', () => {
      this.metrics.totalNearMisses++;
    });
    events.on('collision_detected', () => {
      this.metrics.totalCollisions++;
    });
  }

  update(dt) {
    this.simTime += dt;

    // 1. Update Conveyor System
    this.conveyor.update(dt);

    // 2. Dispatch pending jobs to available idle robots
    this.jobSystem.dispatch(this.robots);

    // 3. Central TrafficManager Update (Reservations, Wait-For Graph, Deadlock Recovery)
    this.trafficManager.update(dt, this.robots);

    // 4. Update all Robots
    for (const robot of this.robots) {
      robot.update(dt, this);
    }

    // 5. Hard No-Overlap Guarantee: cancel moves if distance < 2*radius and ensure separation
    this.trafficManager.enforceNoOverlap(this.robots);
  }

  reset() {
    this.simTime = 0;
    this.metrics.totalOvertakes = 0;
    this.metrics.totalNearMisses = 0;
    this.metrics.totalCollisions = 0;

    const spots = this.layout.parkingArea.spots;
    this.robots.forEach((robot, idx) => {
      robot.reset(spots[idx].x, spots[idx].y, 0);
    });

    this.layout.releaseAllBaysForRobot(1);
    this.layout.releaseAllBaysForRobot(2);
    this.layout.releaseAllBaysForRobot(3);
    this.layout.releaseAllBaysForRobot(4);

    this.trafficManager.reset();
    this.conveyor.reset();
    this.jobSystem.reset();
    events.log('system', 'Warehouse simulation reset to initial state.', 'info');
  }

  /**
   * Acceptance Test Scenario A:
   * Robot 1 executes Shelf 1 -> Delivery end-to-end.
   */
  runScenarioA() {
    this.reset();
    events.log('scenario', '--- SCENARIO A: Robot 1: Shelf 1 -> Delivery ---', 'info');
    this.jobSystem.createJob({
      robotId: 1,
      shelf: 1,
      destination: 'DELIVERY',
      priority: 'HIGH',
    });
  }

  /**
   * Acceptance Test Scenario B:
   * Robot 2 is blocked in the center lane while Robot 1 is behind it carrying an item.
   * Robot 1 detects the blockage via LiDAR, smoothly changes to a free side lane, overtakes,
   * passes rear-clearance check, and merges back into the right-hand lane.
   */
  runScenarioB() {
    this.reset();
    events.log('scenario', '--- SCENARIO B: Dynamic Overtaking in 3-Lane Trunk ---', 'info');

    // Place Robot 1 behind Robot 2 carrying an item heading toward conveyor
    const robot1 = this.robots[0];
    robot1.x = 340;
    robot1.y = CONFIG.LAYOUT.CENTER_LANE_Y + 10;
    robot1.heading = 0;
    robot1.speed = CONFIG.ROBOT.MAX_SPEED;
    robot1.state = 'CARRYING_TO_CONVEYOR';
    robot1.carriedItem = {
      id: 99,
      jobId: 99,
      shelfId: 1,
      destination: 'DELIVERY',
      color: '#06b6d4',
    };

    const conveyorNode = this.roadNetwork.graph.getNode('n_conveyor_input');
    robot1.planPathToNode(conveyorNode, this.roadNetwork);

    // Place Robot 2 stopped directly in front of Robot 1 in the same right-hand lane
    const robot2 = this.robots[1];
    robot2.x = 520;
    robot2.y = robot1.lanePath && robot1.lanePath.length > 0 ? robot1.lanePath[0].y : CONFIG.LAYOUT.CENTER_LANE_Y + 10;
    robot2.heading = 0;
    robot2.speed = 0;
    robot2.forceStop(true);

    events.log('scenario', 'Robot 2 parked at X=520 in right-hand lane. Robot 1 approaching at X=340 carrying item -> watch smooth overtaking maneuver!', 'info');
  }

  /**
   * Acceptance Test Scenario C:
   * 4 robots, 20 jobs, auto-assignment mode, zero collisions.
   */
  runScenarioC() {
    this.reset();
    events.log('scenario', '--- SCENARIO C: 4 Robots, 20 Jobs Stress Test ---', 'info');
    this.jobSystem.addRandomJobs(20);
  }

  /**
   * Acceptance Test Scenario D:
   * Both side lanes blocked: Robot waits and resumes safely once path clears.
   */
  runScenarioD() {
    this.reset();
    events.log('scenario', '--- SCENARIO D: Both Side Lanes Blocked -> Yield & Standstill ---', 'info');

    // Robot 1 approaching
    const robot1 = this.robots[0];
    robot1.x = 340;
    robot1.y = CONFIG.LAYOUT.CENTER_LANE_Y + 10;
    robot1.heading = 0;
    robot1.state = 'CARRYING_TO_CONVEYOR';
    robot1.carriedItem = { id: 98, jobId: 98, shelfId: 1, destination: 'PACKAGING', color: '#ec4899' };
    const conveyorNode = this.roadNetwork.graph.getNode('n_conveyor_input');
    robot1.planPathToNode(conveyorNode, this.roadNetwork);

    // Block Center right-hand lane ahead of Robot 1
    const robot2 = this.robots[1];
    robot2.x = 520;
    robot2.y = robot1.y;
    robot2.forceStop(true);

    // Block Left/Top lane
    const robot3 = this.robots[2];
    robot3.x = 520;
    robot3.y = CONFIG.LAYOUT.TOP_LANE_Y;
    robot3.forceStop(true);

    // Block Right/Bottom lane
    const robot4 = this.robots[3];
    robot4.x = 520;
    robot4.y = CONFIG.LAYOUT.BOTTOM_LANE_Y;
    robot4.forceStop(true);

    events.log('scenario', 'All lanes blocked ahead at X=520. Robot 1 will safely slow down and wait. Click Robot 3 or 4 to unblock and watch resume!', 'warning');
  }

  /**
   * Acceptance Test Scenario E:
   * Low battery robot goes to charge and resumes.
   */
  runScenarioE() {
    this.reset();
    events.log('scenario', '--- SCENARIO E: Low Battery Recharging ---', 'info');
    const robot1 = this.robots[0];
    robot1.battery = 18; // Below 20% threshold
    this.jobSystem.createJob({
      robotId: 1,
      shelf: 2,
      destination: 'PACKAGING',
      priority: 'HIGH',
    });
    events.log('battery', 'Robot 1 spawned with 18% battery. It will complete pick and drop, then navigate to Charging Station to recharge.', 'info');
  }

  /**
   * Acceptance Test Scenario F:
   * Conveyor Splitter routing verification: alternating items to Packaging vs Delivery.
   */
  runScenarioF() {
    this.reset();
    events.log('scenario', '--- SCENARIO F: Conveyor Splitter Destination Routing ---', 'info');
    this.conveyor.dropItem({ id: 101, jobId: 101, destination: 'PACKAGING', color: '#ec4899' });
    this.conveyor.dropItem({ id: 102, jobId: 102, destination: 'DELIVERY', color: '#06b6d4' });
    this.conveyor.dropItem({ id: 103, jobId: 103, destination: 'PACKAGING', color: '#ec4899' });
    this.conveyor.dropItem({ id: 104, jobId: 104, destination: 'DELIVERY', color: '#06b6d4' });
  }
}
