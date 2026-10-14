/**
 * Warehouse Job Management & Dispatch System
 * Handles job creation, priority queues, automated assignment, and lifecycle tracking.
 */

import { events } from '../core/events.js';

let nextJobId = 1;

export class Job {
  constructor(options = {}) {
    this.id = options.id || nextJobId++;
    this.robotId = options.robotId || 'auto'; // 'auto' or 1, 2, 3, 4
    this.assignedRobotId = null;
    this.shelf = Number(options.shelf) || 1;
    this.destination = options.destination || 'DELIVERY'; // 'PACKAGING' | 'DELIVERY'
    this.priority = options.priority || 'NORMAL'; // 'HIGH', 'NORMAL', 'LOW'
    this.status = 'PENDING'; // 'PENDING', 'IN_PROGRESS', 'DONE', 'FAILED'
    this.createdAt = performance.now();
    this.startedAt = null;
    this.completedAt = null;
    this.item = {
      id: this.id,
      jobId: this.id,
      shelfId: this.shelf,
      destination: this.destination,
      color: this.destination === 'PACKAGING' ? '#ec4899' : '#06b6d4',
    };
  }

  get priorityWeight() {
    if (this.priority === 'HIGH') return 3;
    if (this.priority === 'NORMAL') return 2;
    return 1;
  }
}

export class JobSystem {
  constructor() {
    this.jobs = [];
    this.completedCount = 0;
    this.totalDurationMs = 0;
    this.completedTimestamps = []; // for throughput per minute
  }

  createJob(options) {
    const job = new Job(options);
    this.jobs.push(job);
    events.log('jobs', `Created Job #${job.id}: Shelf ${job.shelf} -> ${job.destination} [Robot: ${job.robotId}, Pri: ${job.priority}]`, 'info');
    events.emit('job_created', job);
    return job;
  }

  addRandomJobs(count = 10) {
    for (let i = 0; i < count; i++) {
      const shelf = Math.floor(Math.random() * 4) + 1;
      const destination = Math.random() > 0.5 ? 'PACKAGING' : 'DELIVERY';
      const priorities = ['LOW', 'NORMAL', 'HIGH'];
      const priority = priorities[Math.floor(Math.random() * priorities.length)];
      this.createJob({
        robotId: 'auto',
        shelf,
        destination,
        priority,
      });
    }
  }

  createStressTestJobs() {
    // Stress test: all 4 robots are immediately assigned jobs heading through the lanes to conveyor
    for (let r = 1; r <= 4; r++) {
      this.createJob({
        robotId: r,
        shelf: (r % 2 === 1) ? 1 : 2, // Shelves 1 and 2
        destination: r % 2 === 1 ? 'PACKAGING' : 'DELIVERY',
        priority: 'HIGH',
      });
    }
    // Add 16 additional jobs to complete the 20 jobs stress test
    for (let i = 0; i < 16; i++) {
      const shelf = Math.floor(Math.random() * 4) + 1;
      const destination = Math.random() > 0.5 ? 'PACKAGING' : 'DELIVERY';
      const priorities = ['LOW', 'NORMAL', 'HIGH'];
      this.createJob({
        robotId: 'auto',
        shelf,
        destination,
        priority: priorities[Math.floor(Math.random() * priorities.length)],
      });
    }
    events.log('jobs', `Stress Test launched: 20 jobs queued across Robots 1-4 simultaneously!`, 'warning');
  }

  clearQueue() {
    // Remove pending jobs only; keep in-progress until they finish
    this.jobs = this.jobs.filter(j => j.status === 'IN_PROGRESS');
    events.log('jobs', 'Pending job queue cleared.', 'info');
    events.emit('jobs_updated');
  }

  /**
   * Dispatches pending jobs to available idle robots
   * @param {Array<Robot>} robots
   */
  dispatch(robots) {
    const pendingJobs = this.jobs
      .filter(j => j.status === 'PENDING')
      .sort((a, b) => b.priorityWeight - a.priorityWeight);

    if (pendingJobs.length === 0) return;

    for (const job of pendingJobs) {
      let targetRobot = null;

      if (job.robotId !== 'auto') {
        const candidate = robots.find(r => r.id === Number(job.robotId));
        if (candidate && candidate.isAvailableForJob()) {
          targetRobot = candidate;
        }
      } else {
        // Auto-assign: find nearest available robot with adequate battery
        let bestDist = Infinity;
        for (const r of robots) {
          if (r.isAvailableForJob()) {
            const dist = Math.hypot(r.x - 170, r.y - 540); // distance to inventory
            if (dist < bestDist) {
              bestDist = dist;
              targetRobot = r;
            }
          }
        }
      }

      if (targetRobot) {
        job.status = 'IN_PROGRESS';
        job.assignedRobotId = targetRobot.id;
        job.startedAt = performance.now();
        targetRobot.assignJob(job);
        events.log('jobs', `Job #${job.id} dispatched to Robot ${targetRobot.id} [Shelf ${job.shelf} -> ${job.destination}]`, 'info');
        events.emit('job_assigned', { job, robot: targetRobot });
      }
    }
  }

  completeJob(jobId) {
    const job = this.jobs.find(j => j.id === jobId);
    if (job) {
      job.status = 'DONE';
      job.completedAt = performance.now();
      const durationMs = job.completedAt - (job.startedAt || job.createdAt);
      this.completedCount++;
      this.totalDurationMs += durationMs;
      this.completedTimestamps.push(performance.now());
      events.log('jobs', `Job #${job.id} COMPLETED in ${(durationMs / 1000).toFixed(1)}s!`, 'success');
      events.emit('job_completed', job);
    }
  }

  getMetrics() {
    const now = performance.now();
    // Count jobs completed in the last 60 seconds
    const oneMinAgo = now - 60000;
    this.completedTimestamps = this.completedTimestamps.filter(t => t >= oneMinAgo);
    const throughputPerMin = this.completedTimestamps.length;

    const avgTimeSec = this.completedCount > 0 ? (this.totalDurationMs / this.completedCount / 1000).toFixed(1) : '0.0';

    return {
      completedCount: this.completedCount,
      avgTimeSec,
      throughputPerMin,
      pendingCount: this.jobs.filter(j => j.status === 'PENDING').length,
      inProgressCount: this.jobs.filter(j => j.status === 'IN_PROGRESS').length,
    };
  }

  reset() {
    this.jobs = [];
    this.completedCount = 0;
    this.totalDurationMs = 0;
    this.completedTimestamps = [];
  }
}
