/**
 * Robot Fleet Agent Implementation
 * Features:
 * - 60Hz Physics & Steering following permanent 2-lane right-hand traffic polylines
 * - Smooth corner curves avoiding centerline collapse
 * - Central TrafficManager integration (node reservations, stop-line yielding, priority rules)
 * - Look-ahead speed control combining LIDAR, path obstacles, and stop lines
 * - Deadlock recovery backup and alternate route re-planning
 * - Hard no-overlap guarantee support
 * - Dynamic overtaking with smooth 1.5s lateral shift
 * - Battery management & full job lifecycle state machine
 */

import { CONFIG } from '../core/config.js';
import { Vector2, normalizeAngle } from '../core/vector.js';
import { LidarSensor } from './lidar.js';
import { RobotState } from './stateMachine.js';
import { events } from '../core/events.js';

export class Robot {
  constructor(id, x, y, options = {}) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.heading = options.heading || 0; // radians
    this.speed = 0;
    this.targetSpeed = CONFIG.ROBOT.MAX_SPEED;
    this.radius = CONFIG.ROBOT.RADIUS; // 8px
    this.color = CONFIG.ROBOT.COLORS[id - 1] || '#3b82f6';
    this.glowColor = CONFIG.ROBOT.GLOW_COLORS[id - 1] || 'rgba(59, 130, 246, 0.4)';

    // State & Workload
    this.state = RobotState.IDLE;
    this.previousState = RobotState.IDLE;
    this.currentJob = null;
    this.carriedItem = null;
    this.currentBayId = null;
    this.chargingSlotId = null;

    // Navigation & Lane Polyline Path
    this.path = [];             // Array of GraphNode objects
    this.pathIndex = 0;
    this.lanePath = [];         // Array of smooth 2-lane polyline waypoints
    this.laneWaypointIndex = 0;
    this.lastReservedNodeId = null;

    // Battery System
    this.battery = options.battery !== undefined ? options.battery : 100;
    this.lowBatteryWarningTriggered = false;

    // LiDAR Sensor
    this.lidar = new LidarSensor(this);

    // Dynamic Overtaking & Smooth Lateral Shift (over 1.5s)
    this.isOvertaking = false;
    this.overtakeStage = 'none'; // 'none' | 'shifting_out' | 'passing' | 'shifting_in'
    this.overtakeObstacle = null;
    this.lateralOffset = 0;       // Current lateral offset (px)
    this.lateralOffsetStart = 0;
    this.lateralOffsetTarget = 0;
    this.lateralShiftTimer = 0;
    this.lateralShiftDuration = 1.5; // Smooth 1.5s transition
    this.overtakeWaitTimer = 0;

    // Traffic Management & Yielding
    this.isYielding = false;
    this.trafficLabel = '';       // 'YIELDING' | 'DEADLOCK RECOVERY' | 'OVERTAKING' | ''
    this.isDeadlockRecovering = false;
    this.deadlockBackupDist = 0;
    this.resumeWaitTimer = 0;
    this.isForceStopped = false;  // Set via UI to block robot for overtaking tests!

    // Operational Timers
    this.actionTimer = 0;
    this.waitTime = 0;

    // Statistics
    this.overtakeCount = 0;
    this.nearMissCount = 0;
    this.collisionCount = 0;
    this.distanceTraveled = 0;
    this.activeWorkingTime = 0;
  }

  isAvailableForJob() {
    return this.state === RobotState.IDLE && this.battery >= CONFIG.BATTERY.LOW_THRESHOLD && !this.isForceStopped;
  }

  hasPriorityOver(otherRobot) {
    // 1. Carrying item has priority over empty robot
    const meHasItem = this.carriedItem !== null || (this.currentJob && this.currentJob.priority === 'HIGH');
    const otherHasItem = otherRobot.carriedItem !== null || (otherRobot.currentJob && otherRobot.currentJob.priority === 'HIGH');
    if (meHasItem && !otherHasItem) return true;
    if (!meHasItem && otherHasItem) return false;

    // 2. Battery below 20%
    const meLow = this.battery < CONFIG.BATTERY.LOW_THRESHOLD;
    const otherLow = otherRobot.battery < CONFIG.BATTERY.LOW_THRESHOLD;
    if (meLow && !otherLow) return true;
    if (!meLow && otherLow) return false;

    // 3. Tie-break: lower robot ID has right-of-way
    return this.id < otherRobot.id;
  }

  assignJob(job) {
    this.currentJob = job;
    this.state = RobotState.GO_TO_INVENTORY;
    this.actionTimer = 0;
    events.emit('robot_state_changed', { robot: this, state: this.state });
  }

  forceStop(blocked = true) {
    this.isForceStopped = blocked;
    if (blocked) {
      this.speed = 0;
      events.log('robots', `Robot #${this.id} MANUALLY BLOCKED/FORCE STOPPED for testing!`, 'warning');
    } else {
      events.log('robots', `Robot #${this.id} unblocked and resuming.`, 'info');
    }
  }

  update(dt, world) {
    if (this.state !== RobotState.IDLE && this.state !== RobotState.CHARGING) {
      this.activeWorkingTime += dt;
    }

    // 1. Update Battery
    this.updateBattery(dt, world);

    // 2. If force-stopped, hold position and update LiDAR only
    if (this.isForceStopped) {
      this.speed = 0;
      this.lidar.update(world.robots, world.layout.shelves, { width: world.layout.width, height: world.layout.height });
      return;
    }

    // 3. Update LiDAR Sensor against other robots, shelves, and walls
    this.lidar.update(world.robots, world.layout.shelves, { width: world.layout.width, height: world.layout.height });

    // 4. Physical Collision & Near-Miss Monitoring
    this.checkCollisionsAndNearMisses(world.robots);

    // 5. Update State Machine
    this.updateStateMachine(dt, world);

    // 6. Execute Movement & Steering
    this.updatePhysicsAndSteering(dt, world);
  }

  updateBattery(dt, world) {
    if (this.state === RobotState.CHARGING) {
      this.battery = Math.min(100, this.battery + CONFIG.BATTERY.CHARGE_RATE * dt);
      if (this.battery >= CONFIG.BATTERY.FULL_THRESHOLD) {
        this.battery = 100;
        // Finished charging
        if (this.chargingSlotId) {
          world.trafficManager.releaseSpotLock(this.chargingSlotId, this.id);
          const slot = world.layout.chargingStation.slots.find(s => s.id === this.chargingSlotId);
          if (slot) slot.occupiedBy = null;
          this.chargingSlotId = null;
        }
        events.log('battery', `Robot #${this.id} fully charged (100%). Resuming fleet service!`, 'success');
        this.state = RobotState.IDLE;
        this.lowBatteryWarningTriggered = false;
        events.emit('robot_state_changed', { robot: this, state: this.state });
      }
      return;
    }

    // Battery drain while operating
    let drainRate = CONFIG.BATTERY.DRAIN_RATE_IDLE;
    if (this.speed > 5) {
      drainRate = this.carriedItem ? CONFIG.BATTERY.DRAIN_RATE_LOADED : CONFIG.BATTERY.DRAIN_RATE_EMPTY;
    }
    this.battery = Math.max(0, this.battery - drainRate * dt);

    // Trigger charge need if low and not already dropping item
    if (this.battery < CONFIG.BATTERY.LOW_THRESHOLD && !this.lowBatteryWarningTriggered) {
      this.lowBatteryWarningTriggered = true;
      events.log('battery', `Robot #${this.id} battery low (${this.battery.toFixed(0)}%). Will recharge upon completing current transport.`, 'warning');
    }
  }

  checkCollisionsAndNearMisses(otherRobots) {
    for (const other of otherRobots) {
      if (other.id === this.id) continue;
      const d = Math.hypot(this.x - other.x, this.y - other.y);
      const collisionThreshold = this.radius + other.radius; // 16px

      if (d < collisionThreshold) {
        // Physical Collision!
        this.collisionCount++;
        events.log('collision', `CRITICAL COLLISION: Robot #${this.id} collided with Robot #${other.id}!`, 'danger');
        events.emit('collision_detected', { robot1: this, robot2: other });
      } else if (d < collisionThreshold + 8) {
        // Near-Miss!
        this.nearMissCount++;
        events.log('safety', `Near-miss detected between Robot #${this.id} and Robot #${other.id} (${d.toFixed(1)}px)`, 'warning');
        events.emit('near_miss_detected', { robot1: this, robot2: other });
      }
    }
  }

  updateStateMachine(dt, world) {
    const layout = world.layout;
    const roadNetwork = world.roadNetwork;

    switch (this.state) {
      case RobotState.IDLE:
        this.speed = 0;
        this.trafficLabel = '';
        if (this.battery < CONFIG.BATTERY.LOW_THRESHOLD) {
          this.planPathToCharger(world);
        }
        break;

      case RobotState.GO_TO_INVENTORY:
        if (this.lanePath.length === 0) {
          const invNode = roadNetwork.graph.getNode('inv_dispatch');
          this.planPathToNode(invNode, roadNetwork);
        }
        if (this.isAtEndOfPath()) {
          this.state = RobotState.PICKING_FROM_INVENTORY;
          this.actionTimer = 0;
          this.speed = 0;
          events.log('robots', `Robot #${this.id} arrived at Inventory System. Preparing job cargo...`, 'info');
        }
        break;

      case RobotState.PICKING_FROM_INVENTORY:
        this.speed = 0;
        this.actionTimer += dt;
        if (this.actionTimer >= CONFIG.TIMINGS.INVENTORY_DISPATCH_TIME) {
          this.carriedItem = { ...this.currentJob.item };
          this.actionTimer = 0;
          this.state = RobotState.GO_TO_SHELF_BAY;
          events.log('robots', `Robot #${this.id} picked cargo for Shelf ${this.currentJob.shelf}. En route to pickup bay.`, 'info');
          this.planPathToShelfBay(world);
        }
        break;

      case RobotState.GO_TO_SHELF_BAY:
        if (this.lanePath.length === 0) {
          this.planPathToShelfBay(world);
        }
        if (this.isAtEndOfPath()) {
          this.state = RobotState.PICKING_FROM_SHELF;
          this.actionTimer = 0;
          this.speed = 0;
          events.log('robots', `Robot #${this.id} docked at Shelf ${this.currentJob.shelf} Bay. Picking item inventory...`, 'info');
        }
        break;

      case RobotState.PICKING_FROM_SHELF:
        this.speed = 0;
        this.actionTimer += dt;
        if (this.actionTimer >= CONFIG.TIMINGS.SHELF_PICK_TIME) {
          this.actionTimer = 0;
          if (this.currentBayId) {
            world.layout.releaseBay(this.currentBayId, this.id);
            world.trafficManager.releaseSpotLock(this.currentBayId, this.id);
            this.currentBayId = null;
          }
          this.state = RobotState.CARRYING_TO_CONVEYOR;
          events.log('robots', `Robot #${this.id} loaded cargo from Shelf. Moving to Conveyor Drop...`, 'info');
          const conveyorNode = roadNetwork.graph.getNode('n_conveyor_input');
          this.planPathToNode(conveyorNode, roadNetwork);
        }
        break;

      case RobotState.CARRYING_TO_CONVEYOR:
        if (this.lanePath.length === 0) {
          const conveyorNode = roadNetwork.graph.getNode('n_conveyor_input');
          this.planPathToNode(conveyorNode, roadNetwork);
        }
        if (this.isAtEndOfPath()) {
          this.state = RobotState.DROPPING_ON_CONVEYOR;
          this.actionTimer = 0;
          this.speed = 0;
        }
        break;

      case RobotState.DROPPING_ON_CONVEYOR:
        this.speed = 0;
        if (world.conveyor.isFull) {
          this.state = RobotState.WAITING;
          this.previousState = RobotState.DROPPING_ON_CONVEYOR;
          events.log('conveyor', `Robot #${this.id} waiting at Conveyor: Belt full!`, 'warning');
          return;
        }

        this.actionTimer += dt;
        if (this.actionTimer >= CONFIG.TIMINGS.CONVEYOR_DROP_TIME) {
          const accepted = world.conveyor.dropItem(this.carriedItem);
          if (accepted) {
            this.carriedItem = null;
            this.actionTimer = 0;
            world.trafficManager.releaseSpotLock('n_conveyor_input', this.id);

            if (this.currentJob) {
              world.jobSystem.completeJob(this.currentJob.id);
              this.currentJob = null;
            }

            if (this.battery < CONFIG.BATTERY.LOW_THRESHOLD) {
              events.log('battery', `Robot #${this.id} finished drop; low battery (${this.battery.toFixed(0)}%). Proceeding to Charging Station.`, 'info');
              this.planPathToCharger(world);
            } else {
              this.state = RobotState.RETURNING;
              this.planReturnPath(world);
            }
          }
        }
        break;

      case RobotState.RETURNING:
        if (this.lanePath.length === 0) {
          this.planReturnPath(world);
        }
        if (this.isAtEndOfPath()) {
          this.state = RobotState.IDLE;
          this.speed = 0;
          this.trafficLabel = '';
          events.log('robots', `Robot #${this.id} returned to depot. Ready for next job.`, 'info');
        }
        break;

      case RobotState.GO_TO_CHARGER:
        if (this.lanePath.length === 0) {
          this.planPathToCharger(world);
        }
        if (this.isAtEndOfPath()) {
          this.state = RobotState.CHARGING;
          this.speed = 0;
          this.trafficLabel = 'CHARGING';
          events.log('battery', `Robot #${this.id} docked at Charging Slot. Beginning fast recharge.`, 'success');
        }
        break;

      case RobotState.WAITING:
        this.speed = 0;
        this.waitTime += dt;

        if (this.previousState === RobotState.DROPPING_ON_CONVEYOR) {
          if (!world.conveyor.isFull) {
            this.state = RobotState.DROPPING_ON_CONVEYOR;
            this.waitTime = 0;
          }
          return;
        }

        if (this.lidar.nearestDist > CONFIG.LIDAR.SLOW_ZONE_DIST) {
          this.state = this.previousState || RobotState.CARRYING_TO_CONVEYOR;
          this.waitTime = 0;
          events.log('robots', `Robot #${this.id} obstacle cleared, resuming journey.`, 'info');
        }
        break;

      case RobotState.OVERTAKING:
        // Handled in physics & steering
        break;
    }
  }

  planPathToNode(targetNode, roadNetwork, forbiddenNodes = new Set()) {
    if (!targetNode) return;
    const startNode = roadNetwork.graph.findClosestNode(this.x, this.y);
    if (!startNode) return;

    this.path = roadNetwork.graph.findPath(startNode.id, targetNode.id, { reservedNodes: forbiddenNodes });
    this.pathIndex = 0;

    // Convert node path to permanent 2-lane right-hand traffic polyline with smooth corner arcs
    this.lanePath = roadNetwork.generateLanePolyline(this.path, 10, 18);
    this.laneWaypointIndex = 0;
  }

  planPathToShelfBay(world) {
    const bay = world.layout.getAvailableBay(this.currentJob.shelf, this.id);
    if (!bay) {
      events.log('robots', `Robot #${this.id}: All pickup bays for Shelf ${this.currentJob.shelf} reserved. Waiting for free bay...`, 'warning');
      this.state = RobotState.WAITING;
      this.previousState = RobotState.GO_TO_SHELF_BAY;
      return;
    }

    world.layout.reserveBay(bay.id, this.id);
    world.trafficManager.requestSpotLock(bay.id, this.id);
    this.currentBayId = bay.id;

    const bayNode = world.roadNetwork.graph.getNode(bay.id);
    this.planPathToNode(bayNode, world.roadNetwork);
  }

  planReturnPath(world) {
    const depotSpot = world.roadNetwork.graph.getNode(`park_${this.id}`) || world.roadNetwork.graph.getNode('depot_exit');
    this.planPathToNode(depotSpot, world.roadNetwork);
  }

  planPathToCharger(world) {
    const slots = world.layout.chargingStation.slots;
    const freeSlot = slots.find(s => !s.occupiedBy || s.occupiedBy === this.id);

    if (freeSlot && world.trafficManager.requestSpotLock(freeSlot.id, this.id)) {
      freeSlot.occupiedBy = this.id;
      this.chargingSlotId = freeSlot.id;
      const chargerNode = world.roadNetwork.graph.getNode(freeSlot.id === 'charge_slot_1' ? 'charger_slot_0' : 'charger_slot_1');
      this.state = RobotState.GO_TO_CHARGER;
      this.planPathToNode(chargerNode, world.roadNetwork);
    } else {
      events.log('battery', `Robot #${this.id}: Charging slots occupied. Queuing at charging entry...`, 'warning');
      const entryNode = world.roadNetwork.graph.getNode('charger_exit') || world.roadNetwork.graph.getNode('n_left_top_center');
      this.state = RobotState.GO_TO_CHARGER;
      this.planPathToNode(entryNode, world.roadNetwork);
    }
  }

  isAtEndOfPath() {
    return this.lanePath.length === 0 || this.laneWaypointIndex >= this.lanePath.length;
  }

  /**
   * Deadlock Recovery: Back up along lane to clear way for higher-priority robot
   */
  startDeadlockRecovery(world) {
    // Check if there is space to back up safely
    for (const other of world.robots) {
      if (other.id === this.id) continue;
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      const longDist = dx * Math.cos(this.heading) + dy * Math.sin(this.heading);
      const d = Math.hypot(dx, dy);
      if (longDist < 0 && d < 36) {
        // Blocker behind us: re-plan alternate path instead of backing up
        this.replanAlternatePath(world, [other]);
        return;
      }
    }

    this.isDeadlockRecovering = true;
    this.deadlockBackupDist = 32; // ~2 robot lengths backup
    this.trafficLabel = 'DEADLOCK RECOVERY';
    this.speed = 0;
    const status = world.trafficManager.getStatus(this.id);
    status.status = 'DEADLOCK_RECOVERY';
  }

  /**
   * Re-plan alternate route with A*, treating blocked nodes as impassable
   */
  replanAlternatePath(world, blockerRobots) {
    const forbidden = new Set();
    for (const b of blockerRobots) {
      const closestNode = world.roadNetwork.graph.findClosestNode(b.x, b.y);
      if (closestNode) forbidden.add(closestNode.id);
    }

    if (this.path && this.path.length > 0) {
      const targetNode = this.path[this.path.length - 1];
      this.planPathToNode(targetNode, world.roadNetwork, forbidden);
    }
  }

  /**
   * Core Movement, Look-Ahead Speed Control, and Steering Loop
   */
  updatePhysicsAndSteering(dt, world) {
    // 0. Cache previous position for hard no-overlap guarantee
    this.prevX = this.x;
    this.prevY = this.y;

    // Stationary states
    if (this.state === RobotState.IDLE || this.state === RobotState.CHARGING ||
        this.state === RobotState.PICKING_FROM_INVENTORY || this.state === RobotState.PICKING_FROM_SHELF ||
        this.state === RobotState.DROPPING_ON_CONVEYOR || this.state === RobotState.WAITING || this.isForceStopped) {
      this.speed = Math.max(0, this.speed - CONFIG.ROBOT.ACCELERATION * 3 * dt);
      return;
    }

    // Deadlock Recovery: backing up along current lane
    if (this.isDeadlockRecovering) {
      this.trafficLabel = 'DEADLOCK RECOVERY';
      const backupSpeed = 28;
      this.x -= Math.cos(this.heading) * backupSpeed * dt;
      this.y -= Math.sin(this.heading) * backupSpeed * dt;
      this.deadlockBackupDist -= backupSpeed * dt;

      if (this.deadlockBackupDist <= 0) {
        this.isDeadlockRecovering = false;
        this.resumeWaitTimer = 0.2 + Math.random() * 0.6; // Small random wait (0.2-0.8s)
        const status = world.trafficManager.getStatus(this.id);
        status.status = 'NORMAL';
        this.trafficLabel = '';
      }
      return;
    }

    // Resume wait timer (after deadlock recovery)
    if (this.resumeWaitTimer > 0) {
      this.resumeWaitTimer -= dt;
      this.speed = 0;
      this.trafficLabel = 'YIELDING';
      return;
    }

    // 1. Process Smooth Lateral Shift for Overtaking (ramped smoothly over 1.5s)
    if (this.lateralShiftTimer < this.lateralShiftDuration) {
      this.lateralShiftTimer += dt;
      const progress = Math.min(1, this.lateralShiftTimer / this.lateralShiftDuration);
      // Smoothstep interpolation (3t^2 - 2t^3)
      const t = progress * progress * (3 - 2 * progress);
      this.lateralOffset = this.lateralOffsetStart + (this.lateralOffsetTarget - this.lateralOffsetStart) * t;
    } else {
      this.lateralOffset = this.lateralOffsetTarget;
    }

    // 2. Look-Ahead Speed Control & Stop Line Detection
    let minObsDist = Infinity;
    let stopLineDist = Infinity;
    let leadRobotDist = Infinity;
    let upcomingIntersectionNode = null;

    // Scan upcoming waypoints in lane path (next ~80px / 5m)
    if (this.lanePath && this.laneWaypointIndex < this.lanePath.length) {
      let accumulatedDist = 0;
      let currX = this.x;
      let currY = this.y;

      for (let i = this.laneWaypointIndex; i < Math.min(this.lanePath.length, this.laneWaypointIndex + 8); i++) {
        const wp = this.lanePath[i];
        accumulatedDist += Math.hypot(wp.x - currX, wp.y - currY);
        currX = wp.x;
        currY = wp.y;

        if (wp.nodeId && !upcomingIntersectionNode) {
          const node = world.roadNetwork.graph.getNode(wp.nodeId);
          if (node && world.trafficManager.isIntersectionNode(node)) {
            upcomingIntersectionNode = node;
            const distToNode = accumulatedDist;
            const access = world.trafficManager.requestNodeAccess(this, node, distToNode);

            if (!access.granted) {
              stopLineDist = access.stopDistance;
              this.isYielding = true;
              this.trafficLabel = 'YIELDING';
              const status = world.trafficManager.getStatus(this.id);
              status.status = 'YIELDING';
              status.blockerId = access.blockerId;
              status.yieldReason = access.reason;
            } else {
              this.isYielding = false;
              if (!this.isOvertaking) this.trafficLabel = '';
              const status = world.trafficManager.getStatus(this.id);
              if (status.status === 'YIELDING') status.status = 'NORMAL';
            }
          }
        }
      }
    }

    // Check Single-Capacity Spot Lock (Conveyor Input)
    if (this.state === RobotState.CARRYING_TO_CONVEYOR) {
      const distToConveyor = Math.hypot(this.x - CONFIG.LAYOUT.CONVEYOR_INPUT_X, this.y - CONFIG.LAYOUT.CONVEYOR_INPUT_Y);
      if (distToConveyor < 90) {
        const lockedByOther = world.trafficManager.isSpotLockedByOther('n_conveyor_input', this.id);
        if (lockedByOther) {
          const conveyorStopDist = Math.max(0, distToConveyor - 42);
          stopLineDist = Math.min(stopLineDist, conveyorStopDist);
          this.isYielding = true;
          this.trafficLabel = 'YIELDING';
          const status = world.trafficManager.getStatus(this.id);
          status.status = 'YIELDING';
          status.blockerId = world.trafficManager.getSpotLockOwner('n_conveyor_input');
          status.yieldReason = 'Conveyor input locked';
        } else {
          world.trafficManager.requestSpotLock('n_conveyor_input', this.id);
        }
      }
    }

    // Check Lead Robots in forward trajectory
    for (const other of world.robots) {
      if (other.id === this.id) continue;
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      const d = Math.hypot(dx, dy);

      // Project onto forward and right normal
      const cosH = Math.cos(this.heading);
      const sinH = Math.sin(this.heading);
      const longDist = dx * cosH + dy * sinH;
      const latDist = Math.abs(-dx * sinH + dy * cosH);

      // If other robot is behind us, ignore
      if (longDist < -5) continue;

      // Check if other robot is in the oncoming opposite lane (right-hand traffic separation)
      const headingDot = Math.cos(this.heading - other.heading);
      const isOppositeTraffic = headingDot < -0.3;
      if (isOppositeTraffic && latDist >= 13) {
        // Opposite lane traffic with lateral clearance: let them pass freely!
        continue;
      }

      // If robot is in front of us in our lane (latDist < 16) and within look-ahead range
      if (longDist > 0 && latDist < 16 && d < 120) {
        const gap = d - (this.radius + other.radius);
        if (gap < leadRobotDist) {
          leadRobotDist = gap;
        }

        // Check for Dynamic Overtake Condition (Scenario B):
        // If lead robot is stationary/force-stopped in the center trunk lane ahead of us
        const inTrunk = this.x >= 280 && this.x <= 880 && Math.abs(this.y - CONFIG.LAYOUT.CENTER_LANE_Y) < 30;
        if (inTrunk && !this.isOvertaking && (other.isForceStopped || other.speed < 5) && d > 20 && d < 90) {
          this.initiateDynamicOvertake(world, other);
        }
      }
    }

    // LiDAR distance (ignoring oncoming opposite-lane traffic)
    let lidarDist = Infinity;
    if (this.lidar.nearestObstacle && this.lidar.nearestObstacle.type === 'robot') {
      const other = this.lidar.nearestObstacle.target;
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      const headingDot = Math.cos(this.heading - other.heading);
      const latDist = Math.abs(-dx * Math.sin(this.heading) + dy * Math.cos(this.heading));

      if (!(headingDot < -0.3 && latDist >= 13)) {
        lidarDist = this.lidar.nearestDist - (this.radius + CONFIG.ROBOT.RADIUS);
      }
    }

    // Minimum distance to obstacle
    minObsDist = Math.min(stopLineDist, leadRobotDist, lidarDist);

    // Dynamic Overtaking State Progression
    if (this.isOvertaking) {
      this.handleDynamicOvertakeProgression(dt, world);
    }

    // Safe Speed Formula (Look-ahead speed control):
    // Safe speed: v = clamp(k * (distance_to_obstacle - min_gap), 0, v_max)
    // Start slowing at ~5 m (80px); hard-stop at min_gap = 1.5 robot lengths (24px)
    const minGap = 24;   // 1.5 robot lengths (24px)
    const slowDist = 80; // 5 meters (80px)
    const k = CONFIG.ROBOT.MAX_SPEED / (slowDist - minGap); // ~1.785

    let safeSpeed = CONFIG.ROBOT.MAX_SPEED;
    if (minObsDist <= minGap) {
      safeSpeed = 0;
    } else if (minObsDist < slowDist) {
      safeSpeed = Math.min(CONFIG.ROBOT.MAX_SPEED, k * (minObsDist - minGap));
    }

    // Apply safe speed clamp
    this.targetSpeed = Math.min(CONFIG.ROBOT.MAX_SPEED, safeSpeed);

    // If safeSpeed is 0 and we are close to min_gap, stop hard
    if (safeSpeed === 0 && minObsDist <= minGap + 4) {
      this.speed = Math.max(0, this.speed - CONFIG.ROBOT.ACCELERATION * 4 * dt);
      if (this.speed < 2) this.speed = 0;
    }

    // Path Following along lane waypoints
    if (this.lanePath && this.laneWaypointIndex < this.lanePath.length) {
      const wp = this.lanePath[this.laneWaypointIndex];

      // Calculate lateral shift offset perpendicular to segment
      const dx = wp.x - this.x;
      const dy = wp.y - this.y;
      const distToWaypoint = Math.hypot(dx, dy);

      // Target position includes any dynamic lateral offset (e.g. for overtake)
      const forwardDir = distToWaypoint > 0.001 ? { x: dx / distToWaypoint, y: dy / distToWaypoint } : { x: 1, y: 0 };
      const rightNorm = { x: -forwardDir.y, y: forwardDir.x };
      const targetX = wp.x + rightNorm.x * this.lateralOffset;
      const targetY = wp.y + rightNorm.y * this.lateralOffset;

      const targetDx = targetX - this.x;
      const targetDy = targetY - this.y;
      const targetDist = Math.hypot(targetDx, targetDy);

      // Desired heading
      const desiredHeading = Math.atan2(targetDy, targetDx);
      const angleDiff = normalizeAngle(desiredHeading - this.heading);

      // Smooth steering
      const maxRot = CONFIG.ROBOT.ROTATION_SPEED * dt;
      if (Math.abs(angleDiff) < maxRot) {
        this.heading = desiredHeading;
      } else {
        this.heading += Math.sign(angleDiff) * maxRot;
        this.heading = normalizeAngle(this.heading);
      }

      // Slow down on sharp turns
      if (Math.abs(angleDiff) > Math.PI / 4) {
        this.targetSpeed = Math.min(this.targetSpeed, 40);
      }

      this.accelerate(dt);

      // Advance along heading
      const moveDist = this.speed * dt;
      this.x += Math.cos(this.heading) * moveDist;
      this.y += Math.sin(this.heading) * moveDist;
      this.distanceTraveled += moveDist;

      // Waypoint arrival check
      if (targetDist < 12) {
        if (wp.nodeId) {
          world.trafficManager.releaseNode(this, wp.nodeId);
        }
        this.laneWaypointIndex++;
        if (this.isAtEndOfPath()) {
          world.trafficManager.releaseAllNodesForRobot(this.id);
        }
      }
    } else {
      this.speed = Math.max(0, this.speed - CONFIG.ROBOT.ACCELERATION * 2 * dt);
    }
  }

  /**
   * Initiate Dynamic Overtake:
   * Smoothly shift to adjacent left lane over 1.5 seconds (never teleport)
   */
  initiateDynamicOvertake(world, obstacle) {
    this.isOvertaking = true;
    this.overtakeStage = 'shifting_out';
    this.overtakeObstacle = obstacle;
    this.trafficLabel = 'OVERTAKING';
    this.overtakeCount++;

    // Start smooth lateral shift over 1.5s
    this.lateralOffsetStart = this.lateralOffset;
    this.lateralOffsetTarget = -20; // 20px to the left lane
    this.lateralShiftTimer = 0;
    this.lateralShiftDuration = 1.5;

    events.log('overtake', `OVERTAKE INITIATED: Robot #${this.id} smoothly shifting to LEFT lane over 1.5s to pass Robot #${obstacle.id}`, 'info');
    events.emit('overtake_started', { robot: this, obstacle });
  }

  /**
   * Handle Overtake Progression:
   * Pass obstacle, verify rear clearance, then smoothly merge back over 1.5s
   */
  handleDynamicOvertakeProgression(dt, world) {
    if (this.overtakeStage === 'shifting_out') {
      if (this.lateralShiftTimer >= this.lateralShiftDuration) {
        this.overtakeStage = 'passing';
      }
    } else if (this.overtakeStage === 'passing') {
      if (!this.overtakeObstacle) {
        this.overtakeStage = 'shifting_in';
        return;
      }

      // Check if we have passed the obstacle by safe margin (dx > 70px)
      const dxAhead = this.x - this.overtakeObstacle.x;
      if (dxAhead > 65) {
        // Check rear clearance
        const rearSafe = this.lidar.checkRearClearance(world.robots, CONFIG.LAYOUT.CENTER_LANE_Y);
        if (rearSafe) {
          this.overtakeStage = 'shifting_in';
          this.lateralOffsetStart = this.lateralOffset;
          this.lateralOffsetTarget = 0; // Merge back to default lane
          this.lateralShiftTimer = 0;
          this.lateralShiftDuration = 1.5;
          events.log('overtake', `Robot #${this.id} passed Robot #${this.overtakeObstacle.id}. Merging back to lane over 1.5s.`, 'success');
        }
      }
    } else if (this.overtakeStage === 'shifting_in') {
      if (this.lateralShiftTimer >= this.lateralShiftDuration) {
        this.isOvertaking = false;
        this.overtakeStage = 'none';
        this.overtakeObstacle = null;
        this.lateralOffset = 0;
        this.trafficLabel = '';
        events.log('overtake', `Robot #${this.id} returned to right-hand lane. Overtake completed.`, 'success');
        events.emit('overtake_completed', { robot: this });
      }
    }
  }

  accelerate(dt) {
    if (this.speed < this.targetSpeed) {
      this.speed = Math.min(this.targetSpeed, this.speed + CONFIG.ROBOT.ACCELERATION * dt);
    } else if (this.speed > this.targetSpeed) {
      this.speed = Math.max(this.targetSpeed, this.speed - CONFIG.ROBOT.ACCELERATION * 2.5 * dt);
    }
  }

  reset(x, y, heading = 0) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.heading = heading;
    this.speed = 0;
    this.state = RobotState.IDLE;
    this.currentJob = null;
    this.carriedItem = null;
    this.currentBayId = null;
    this.chargingSlotId = null;
    this.path = [];
    this.pathIndex = 0;
    this.lanePath = [];
    this.laneWaypointIndex = 0;
    this.battery = 100;
    this.isOvertaking = false;
    this.overtakeStage = 'none';
    this.overtakeObstacle = null;
    this.lateralOffset = 0;
    this.lateralOffsetTarget = 0;
    this.lateralShiftTimer = 0;
    this.isYielding = false;
    this.isDeadlockRecovering = false;
    this.trafficLabel = '';
    this.isForceStopped = false;
    this.overtakeCount = 0;
    this.nearMissCount = 0;
    this.collisionCount = 0;
  }
}
