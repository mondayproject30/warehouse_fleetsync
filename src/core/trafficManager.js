/**
 * Central TrafficManager - Single Authority for Warehouse Fleet
 *
 * Responsibilities:
 * 1. Intersection & Resource Reservations (node reservations, stop lines, priority resolution)
 * 2. Deterministic Priority Engine (inside zone > cargo/urgent > low battery > lower robot ID)
 * 3. Deadlock Detection & Recovery (wait-for graph, cycle detection, backup along lane, re-planning)
 * 4. Hard No-Overlap Guarantee (post-step collision cancel & non-overlap enforcement)
 * 5. Single-Capacity Resource Locks (conveyor input, charging slots, shelf bays)
 */

import { CONFIG } from './config.js';
import { events } from './events.js';

export class TrafficManager {
  constructor(world) {
    this.world = world;

    // Node / Resource Reservations:
    // nodeId -> { robotId, status: 'RESERVED' | 'OCCUPIED', reservedAt, zoneRadius }
    this.reservations = new Map();

    // Single-capacity spot locks:
    // spotId -> { robotId, lockedAt }
    this.spotLocks = new Map();

    // Wait-For Graph:
    // robotId -> Array<{ blockerId, reason, resourceId }>
    this.waitForGraph = new Map();

    // Robot Traffic Status:
    // robotId -> { status: 'NORMAL' | 'YIELDING' | 'DEADLOCK_RECOVERY' | 'OVERTAKING',
    //              yieldReason: string, blockerId: number | null, stuckTimer: number, backupDist: number }
    this.robotStatus = new Map();

    // Deadlock tracking
    this.activeDeadlockCycles = [];
    this.stuckThresholdSec = 3.0;

    // Configuration constants
    this.ZONE_RADIUS = 22;       // Intersection zone radius around node (px)
    this.STOP_LINE_DIST = 26;    // Stop line before entering zone boundary (~1.5 robot lengths = 24px)
    this.MIN_GAP = 24;           // Hard stop gap (1.5 robot lengths = 24px)
    this.LOOKAHEAD_DIST = 80;    // 5 meters = 80px
  }

  reset() {
    this.reservations.clear();
    this.spotLocks.clear();
    this.waitForGraph.clear();
    this.robotStatus.clear();
    this.activeDeadlockCycles = [];
  }

  getStatus(robotId) {
    if (!this.robotStatus.has(robotId)) {
      this.robotStatus.set(robotId, {
        status: 'NORMAL',
        yieldReason: '',
        blockerId: null,
        stuckTimer: 0,
        backupProgress: 0,
        replanCooldown: 0,
        resumeWaitTimer: 0,
      });
    }
    return this.robotStatus.get(robotId);
  }

  /**
   * Deterministic Priority Rule (No ties):
   * 1. Robot already inside the intersection zone
   * 2. Robot carrying cargo or on an Urgent / High priority job
   * 3. Robot with battery below 20%
   * 4. Lower robot ID
   *
   * @param {Robot} rA
   * @param {Robot} rB
   * @param {string} nodeId
   * @returns {number} positive if rA > rB, negative if rB > rA
   */
  comparePriority(rA, rB, nodeId = null) {
    if (!rA || !rB || rA.id === rB.id) return 0;

    // 1. Robot already inside intersection zone
    if (nodeId) {
      const node = this.world.roadNetwork.graph.getNode(nodeId);
      if (node) {
        const distA = Math.hypot(rA.x - node.x, rA.y - node.y);
        const distB = Math.hypot(rB.x - node.x, rB.y - node.y);
        const insideA = distA <= this.ZONE_RADIUS;
        const insideB = distB <= this.ZONE_RADIUS;
        if (insideA && !insideB) return 1;
        if (!insideA && insideB) return -1;
      }
    }

    // 2. Robot carrying cargo or on an Urgent/High job
    const aHasCargo = rA.carriedItem !== null || (rA.currentJob && rA.currentJob.priority === 'HIGH');
    const bHasCargo = rB.carriedItem !== null || (rB.currentJob && rB.currentJob.priority === 'HIGH');
    if (aHasCargo && !bHasCargo) return 1;
    if (!aHasCargo && bHasCargo) return -1;

    // 3. Robot with battery below 20%
    const aLowBatt = rA.battery < CONFIG.BATTERY.LOW_THRESHOLD;
    const bLowBatt = rB.battery < CONFIG.BATTERY.LOW_THRESHOLD;
    if (aLowBatt && !bLowBatt) return 1;
    if (!aLowBatt && bLowBatt) return -1;

    // 4. Lower robot ID
    return rB.id - rA.id; // Lower ID yields positive (e.g. 1 vs 2 -> 2 - 1 = +1 => rA has priority)
  }

  /**
   * Check if a node is an intersection or waypoint where traffic crosses/merges
   */
  isIntersectionNode(node) {
    if (!node) return false;
    if (node.type === 'intersection') return true;
    if (node.id.startsWith('n_')) return true;
    return false;
  }

  /**
   * Request reservation for an upcoming node
   * Returns: { granted: boolean, stopDistance: number, blockerId: number | null, reason: string }
   */
  requestNodeAccess(robot, node, distToNode) {
    if (!this.isIntersectionNode(node)) {
      return { granted: true, stopDistance: Infinity, blockerId: null, reason: '' };
    }

    const nodeId = node.id;
    const existing = this.reservations.get(nodeId);

    // If currently held by this robot
    if (existing && existing.robotId === robot.id) {
      // Update status if inside zone
      if (distToNode <= this.ZONE_RADIUS) {
        existing.status = 'OCCUPIED';
      }
      return { granted: true, stopDistance: Infinity, blockerId: null, reason: '' };
    }

    // Stop line is located at (ZONE_RADIUS + STOP_LINE_DIST) before node
    const stopLineDistToNode = this.ZONE_RADIUS + this.STOP_LINE_DIST;
    const distToStopLine = Math.max(0, distToNode - stopLineDistToNode);

    // If node is free, grant reservation when approaching
    if (!existing) {
      // Only reserve once within approach distance (e.g. ~60px)
      if (distToNode <= stopLineDistToNode + 30) {
        this.reservations.set(nodeId, {
          robotId: robot.id,
          status: distToNode <= this.ZONE_RADIUS ? 'OCCUPIED' : 'RESERVED',
          reservedAt: this.world.simTime,
          zoneRadius: this.ZONE_RADIUS,
        });
        return { granted: true, stopDistance: Infinity, blockerId: null, reason: '' };
      }
      return { granted: true, stopDistance: Infinity, blockerId: null, reason: '' };
    }

    // Node is reserved by other robot
    const otherRobot = this.world.robots.find(r => r.id === existing.robotId);
    if (!otherRobot) {
      // Reserving robot no longer exists; clear reservation
      this.reservations.delete(nodeId);
      return { granted: true, stopDistance: Infinity, blockerId: null, reason: '' };
    }

    // Priority conflict resolution
    const priorityDiff = this.comparePriority(robot, otherRobot, nodeId);
    const otherDist = Math.hypot(otherRobot.x - node.x, otherRobot.y - node.y);
    const otherInside = otherDist <= this.ZONE_RADIUS;

    if (priorityDiff > 0 && !otherInside) {
      // Higher priority and other is not yet inside zone: preempt
      existing.robotId = robot.id;
      existing.status = 'RESERVED';
      existing.reservedAt = this.world.simTime;
      return { granted: true, stopDistance: Infinity, blockerId: null, reason: '' };
    }

    // Denied reservation -> Robot must decelerate and stop BEFORE stop line
    return {
      granted: false,
      stopDistance: distToStopLine,
      blockerId: otherRobot.id,
      reason: `Node ${nodeId} reserved by Robot #${otherRobot.id}`,
    };
  }

  /**
   * Release node reservation once robot has exited intersection zone
   */
  releaseNode(robot, nodeId) {
    const existing = this.reservations.get(nodeId);
    if (existing && existing.robotId === robot.id) {
      this.reservations.delete(nodeId);
    }
  }

  releaseNodeIfPassed(robot, node) {
    if (!node) return;
    const existing = this.reservations.get(node.id);
    if (existing && existing.robotId === robot.id) {
      const dist = Math.hypot(robot.x - node.x, robot.y - node.y);
      if (dist > this.ZONE_RADIUS) {
        this.reservations.delete(node.id);
      }
    }
  }

  releaseAllNodesForRobot(robotId) {
    for (const [nodeId, res] of this.reservations.entries()) {
      if (res.robotId === robotId) {
        this.reservations.delete(nodeId);
      }
    }
  }

  /**
   * Single-capacity resource locks (Conveyor, Charging slots, Shelf bays)
   */
  requestSpotLock(spotId, robotId) {
    const lock = this.spotLocks.get(spotId);
    if (!lock || lock.robotId === robotId) {
      this.spotLocks.set(spotId, { robotId, lockedAt: this.world.simTime });
      return true;
    }
    return false;
  }

  releaseSpotLock(spotId, robotId) {
    const lock = this.spotLocks.get(spotId);
    if (lock && lock.robotId === robotId) {
      this.spotLocks.delete(spotId);
    }
  }

  isSpotLockedByOther(spotId, robotId) {
    const lock = this.spotLocks.get(spotId);
    return lock && lock.robotId !== robotId;
  }

  getSpotLockOwner(spotId) {
    const lock = this.spotLocks.get(spotId);
    return lock ? lock.robotId : null;
  }

  /**
   * Main Traffic Update Step
   */
  update(dt, robots) {
    // 1. Clean up expired, passed, or stale reservations
    for (const [nodeId, res] of this.reservations.entries()) {
      const robot = robots.find(r => r.id === res.robotId);
      if (!robot) {
        this.reservations.delete(nodeId);
        continue;
      }
      const node = this.world.roadNetwork.graph.getNode(nodeId);
      if (node) {
        const d = Math.hypot(robot.x - node.x, robot.y - node.y);
        const isUpcoming = robot.lanePath && robot.lanePath.slice(robot.laneWaypointIndex, robot.laneWaypointIndex + 6)
          .some(wp => wp.nodeId === nodeId);
        if (!isUpcoming && d > this.ZONE_RADIUS) {
          this.reservations.delete(nodeId);
        }
      }
    }

    // 2. Build wait-for graph
    this.buildWaitForGraph(robots, dt);

    // 3. Detect and resolve deadlocks
    this.detectAndResolveDeadlocks(dt, robots);
  }

  /**
   * Construct wait-for graph every frame:
   * Robot A -> Robot B if A is waiting or stopped because of B
   */
  buildWaitForGraph(robots, dt) {
    this.waitForGraph.clear();

    for (const robot of robots) {
      const status = this.getStatus(robot.id);

      // Decrement timers
      if (status.resumeWaitTimer > 0) {
        status.resumeWaitTimer = Math.max(0, status.resumeWaitTimer - dt);
      }
      if (status.replanCooldown > 0) {
        status.replanCooldown = Math.max(0, status.replanCooldown - dt);
      }

      if (status.blockerId !== null && status.status === 'YIELDING') {
        const blockerList = this.waitForGraph.get(robot.id) || [];
        blockerList.push({ blockerId: status.blockerId, reason: status.yieldReason });
        this.waitForGraph.set(robot.id, blockerList);

        if (robot.speed < 5) {
          status.stuckTimer += dt;
        } else {
          status.stuckTimer = 0;
        }
      } else {
        status.stuckTimer = 0;
      }
    }
  }

  /**
   * Deadlock detection and hierarchical recovery:
   * Cycles in wait-for graph OR stuck > 3s
   */
  detectAndResolveDeadlocks(dt, robots) {
    this.activeDeadlockCycles = [];

    // Find cycles in wait-for graph
    const visited = new Set();
    const stack = [];

    const findCycles = (currId) => {
      visited.add(currId);
      stack.push(currId);

      const edges = this.waitForGraph.get(currId) || [];
      for (const edge of edges) {
        const nextId = edge.blockerId;
        const stackIdx = stack.indexOf(nextId);
        if (stackIdx !== -1) {
          // Cycle found!
          const cycle = stack.slice(stackIdx);
          this.activeDeadlockCycles.push(cycle);
        } else if (!visited.has(nextId)) {
          findCycles(nextId);
        }
      }
      stack.pop();
    };

    for (const r of robots) {
      if (!visited.has(r.id)) {
        findCycles(r.id);
      }
    }

    // Check stuck timer (> 3.0s with a blocker)
    const stuckRobots = robots.filter(r => {
      const st = this.getStatus(r.id);
      return st.stuckTimer >= this.stuckThresholdSec && st.blockerId !== null && st.status !== 'DEADLOCK_RECOVERY';
    });

    // Execute Recovery for detected deadlocks
    for (const cycle of this.activeDeadlockCycles) {
      this.resolveCycleDeadlock(cycle, robots);
    }

    for (const stuckRobot of stuckRobots) {
      this.resolveStuckRobot(stuckRobot, robots);
    }
  }

  /**
   * Resolve a cycle deadlock:
   * The lowest-priority robot in the cycle backs up along its own lane to the last free node or depot bay.
   */
  resolveCycleDeadlock(cycleRobotIds, robots) {
    const cycleRobots = cycleRobotIds.map(id => robots.find(r => r.id === id)).filter(Boolean);
    if (cycleRobots.length === 0) return;

    // Find lowest-priority robot in cycle
    cycleRobots.sort((a, b) => this.comparePriority(a, b));
    const lowestRobot = cycleRobots[0]; // First element is lowest priority

    const status = this.getStatus(lowestRobot.id);
    if (status.status !== 'DEADLOCK_RECOVERY') {
      events.log('traffic', `DEADLOCK DETECTED in cycle [${cycleRobotIds.join(' -> ')}]. Robot #${lowestRobot.id} initiating DEADLOCK RECOVERY backup.`, 'warning');
      lowestRobot.startDeadlockRecovery(this.world);
    }
  }

  /**
   * Resolve a robot stuck > 3s:
   * First back up, or re-plan with A* avoiding blocked nodes
   */
  resolveStuckRobot(robot, robots) {
    const status = this.getStatus(robot.id);
    if (status.status === 'DEADLOCK_RECOVERY') return;

    const blocker = robots.find(r => r.id === status.blockerId);
    if (!blocker) return;

    // Check if robot has lower priority than blocker
    const prioDiff = this.comparePriority(robot, blocker);
    if (prioDiff < 0) {
      // Lower priority robot initiates recovery backup
      events.log('traffic', `Robot #${robot.id} stuck behind Robot #${blocker.id} > 3s. Initiating recovery backup.`, 'warning');
      robot.startDeadlockRecovery(this.world);
    } else if (status.stuckTimer > 4.5 && status.replanCooldown <= 0) {
      // Higher priority robot stuck due to blocker not yielding: re-plan alternate route
      events.log('traffic', `Robot #${robot.id} re-planning alternate route to bypass stuck traffic.`, 'info');
      robot.replanAlternatePath(this.world, [blocker]);
      status.replanCooldown = 3.0;
    }
  }

  /**
   * Hard No-Overlap Guarantee:
   * Executed after physics step. If distance < 2 * radius (16px),
   * cancel movement for the lower-priority robot (restore prevX, prevY)
   * and ensure minimum non-overlap spacing.
   */
  enforceNoOverlap(robots) {
    const n = robots.length;
    const minDistance = CONFIG.ROBOT.RADIUS * 2; // 16px

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const rA = robots[i];
        const rB = robots[j];

        const dx = rB.x - rA.x;
        const dy = rB.y - rA.y;
        const dist = Math.hypot(dx, dy);

        if (dist < minDistance) {
          // Hard overlap detected!
          // Deterministic priority: lower-priority robot cancels move
          const prioDiff = this.comparePriority(rA, rB);
          const lowerRobot = prioDiff >= 0 ? rB : rA;
          const higherRobot = prioDiff >= 0 ? rA : rB;

          // Revert position of lower robot
          if (lowerRobot.prevX !== undefined && lowerRobot.prevY !== undefined) {
            lowerRobot.x = lowerRobot.prevX;
            lowerRobot.y = lowerRobot.prevY;
            lowerRobot.speed = 0;
          }

          // If still overlapping (due to static spawn or boundary), push apart safely
          const currentDist = Math.hypot(rB.x - rA.x, rB.y - rA.y);
          if (currentDist < minDistance) {
            const overlap = minDistance - currentDist + 0.1;
            const nx = currentDist > 0.001 ? (rB.x - rA.x) / currentDist : 1;
            const ny = currentDist > 0.001 ? (rB.y - rA.y) / currentDist : 0;

            if (lowerRobot === rB) {
              rB.x += nx * overlap;
              rB.y += ny * overlap;
            } else {
              rA.x -= nx * overlap;
              rA.y -= ny * overlap;
            }
          }
        }
      }
    }
  }
}
