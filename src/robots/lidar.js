/**
 * LiDAR Sensor Simulation
 * Multi-ray front arc raycasting, obstacle classification, and lane clearance detection.
 */

import { CONFIG } from '../core/config.js';
import { Vector2, intersectRayCircle, intersectRayBox } from '../core/vector.js';

export class LidarSensor {
  constructor(robot) {
    this.robot = robot;
    this.numRays = CONFIG.LIDAR.NUM_RAYS;
    this.fovRad = (CONFIG.LIDAR.FOV_DEG * Math.PI) / 180;
    this.maxRange = CONFIG.LIDAR.MAX_RANGE;
    this.slowDist = CONFIG.LIDAR.SLOW_ZONE_DIST;
    this.dangerDist = CONFIG.LIDAR.DANGER_ZONE_DIST;

    // Last computed ray readings for rendering and logic
    this.rays = [];
    this.nearestObstacle = null;
    this.nearestDist = Infinity;
    this.inSlowZone = false;
    this.inDangerZone = false;
  }

  /**
   * Cast rays against all potential obstacles: other robots, shelves, walls
   * @param {Array<Robot>} otherRobots
   * @param {Array<Shelf>} shelves
   * @param {Object} worldBounds { width, height }
   */
  update(otherRobots, shelves, worldBounds) {
    const origin = new Vector2(this.robot.x, this.robot.y);
    const heading = this.robot.heading;
    const halfFov = this.fovRad / 2;
    const angleStep = this.numRays > 1 ? this.fovRad / (this.numRays - 1) : 0;

    this.rays = [];
    let minDist = Infinity;
    let closestTarget = null;

    for (let i = 0; i < this.numRays; i++) {
      const rayAngle = heading - halfFov + i * angleStep;
      const rayDir = Vector2.fromAngle(rayAngle);

      let closestHit = null;
      let minRayDist = this.maxRange;

      // 1. Check other robots (circle obstacles)
      for (const other of otherRobots) {
        if (other.id === this.robot.id) continue;
        const otherPos = new Vector2(other.x, other.y);
        const hit = intersectRayCircle(origin, rayDir, otherPos, CONFIG.ROBOT.RADIUS + 3);
        if (hit && hit.dist < minRayDist) {
          minRayDist = hit.dist;
          closestHit = {
            dist: hit.dist,
            point: hit.point,
            type: 'robot',
            target: other,
          };
        }
      }

      // 2. Check shelves (box obstacles)
      for (const shelf of shelves) {
        const hit = intersectRayBox(origin, rayDir, {
          x: shelf.x,
          y: shelf.y,
          width: shelf.width,
          height: shelf.height,
        });
        if (hit && hit.dist < minRayDist) {
          minRayDist = hit.dist;
          closestHit = {
            dist: hit.dist,
            point: hit.point,
            type: 'shelf',
            target: shelf,
          };
        }
      }

      // 3. Check perimeter walls
      const wallBoxes = [
        { x: -50, y: -50, width: worldBounds.width + 100, height: 60 }, // Top wall
        { x: -50, y: worldBounds.height - 10, width: worldBounds.width + 100, height: 60 }, // Bottom wall
        { x: -50, y: -50, width: 60, height: worldBounds.height + 100 }, // Left wall
        { x: worldBounds.width - 10, y: -50, width: 60, height: worldBounds.height + 100 }, // Right wall
      ];
      for (const wall of wallBoxes) {
        const hit = intersectRayBox(origin, rayDir, wall);
        if (hit && hit.dist < minRayDist) {
          minRayDist = hit.dist;
          closestHit = {
            dist: hit.dist,
            point: hit.point,
            type: 'wall',
            target: wall,
          };
        }
      }

      const rayEnd = closestHit ? closestHit.point : origin.add(rayDir.scale(this.maxRange));

      this.rays.push({
        angle: rayAngle,
        dir: rayDir,
        hit: closestHit !== null,
        dist: minRayDist,
        hitPoint: rayEnd,
        type: closestHit ? closestHit.type : 'none',
      });

      if (minRayDist < minDist && closestHit) {
        minDist = minRayDist;
        closestTarget = closestHit;
      }
    }

    this.nearestDist = minDist;
    this.nearestObstacle = closestTarget;
    this.inSlowZone = minDist < this.slowDist;
    this.inDangerZone = minDist < this.dangerDist;
  }

  /**
   * Dedicated side clearance check for overtaking decisions
   * Checks lateral and diagonal forward clearances in the target lane
   * @param {string} side 'left' or 'right'
   * @param {Array<Robot>} otherRobots
   * @param {Array<Shelf>} shelves
   * @returns {boolean} true if side lane is clear of obstacles
   */
  checkSideClearance(side, otherRobots, shelves) {
    const origin = new Vector2(this.robot.x, this.robot.y);
    const sign = side === 'left' ? -1 : 1;
    // Check 3 fan rays to the side: -90 deg, -60 deg, -30 deg relative to heading
    const relativeAngles = [sign * Math.PI / 2, sign * Math.PI / 3, sign * Math.PI / 6];
    const checkDist = CONFIG.LIDAR.SIDE_CHECK_DIST;

    for (const relAngle of relativeAngles) {
      const angle = this.robot.heading + relAngle;
      const dir = Vector2.fromAngle(angle);

      // Check robots
      for (const other of otherRobots) {
        if (other.id === this.robot.id) continue;
        const otherPos = new Vector2(other.x, other.y);
        const hit = intersectRayCircle(origin, dir, otherPos, CONFIG.ROBOT.RADIUS + 8);
        if (hit && hit.dist < checkDist) {
          return false; // Obstacle detected in side corridor
        }
      }

      // Check shelves
      for (const shelf of shelves) {
        const hit = intersectRayBox(origin, dir, {
          x: shelf.x,
          y: shelf.y,
          width: shelf.width,
          height: shelf.height,
        });
        if (hit && hit.dist < checkDist) {
          return false;
        }
      }
    }

    return true; // Clear to transition
  }

  /**
   * Rear clearance check to safely merge back into center lane after overtaking
   * @param {Array<Robot>} otherRobots
   * @param {number} targetCenterY
   * @returns {boolean} true if space behind in center lane is safe
   */
  checkRearClearance(otherRobots, targetCenterY) {
    const myPos = new Vector2(this.robot.x, this.robot.y);
    const rearClearance = CONFIG.OVERTAKING.REAR_CLEARANCE;

    for (const other of otherRobots) {
      if (other.id === this.robot.id) continue;
      // Is other robot roughly in the center lane?
      if (Math.abs(other.y - targetCenterY) < 25) {
        // Is it behind us (smaller X if driving East) or too close?
        const dx = this.robot.x - other.x;
        if (dx > -10 && dx < rearClearance) {
          return false; // Still abreast or too close behind to merge back
        }
      }
    }
    return true;
  }
}
