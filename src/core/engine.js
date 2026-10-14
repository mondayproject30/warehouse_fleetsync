/**
 * Fixed-Timestep Simulation Engine
 * Runs fixed 60Hz physics steps decoupled from variable render frames,
 * with speed scaling (0.5x, 1x, 2x, 4x), step execution, and pause/resume.
 */

import { CONFIG } from './config.js';
import { setSimTime } from './events.js';

export class Engine {
  constructor(world, renderer) {
    this.world = world;
    this.renderer = renderer;

    this.isRunning = true;
    this.speedMultiplier = 1.0;
    this.fixedDt = CONFIG.TIME_STEP; // 1 / 60 = 0.016667s

    this.lastTime = 0;
    this.accumulator = 0;
    this.stepRequested = false;
    this.simTime = 0;

    this.animationFrameId = null;
  }

  start() {
    this.isRunning = true;
    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  pause() {
    this.isRunning = false;
  }

  resume() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.lastTime = performance.now();
    }
  }

  step() {
    this.isRunning = false;
    this.stepRequested = true;
  }

  setSpeed(multiplier) {
    this.speedMultiplier = Math.max(0.1, Math.min(10, multiplier));
  }

  reset() {
    this.world.reset();
    this.simTime = 0;
    this.accumulator = 0;
    setSimTime(0);
  }

  loop(currentTime) {
    this.animationFrameId = requestAnimationFrame(this.loop);

    if (this.lastTime === 0) {
      this.lastTime = currentTime;
    }

    let frameTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Prevent spiral of death on lag spikes
    if (frameTime > 0.2) frameTime = 0.2;

    if (this.stepRequested) {
      this.stepRequested = false;
      this.simTime += this.fixedDt;
      setSimTime(this.simTime);
      this.world.update(this.fixedDt);
    } else if (this.isRunning) {
      this.accumulator += frameTime * this.speedMultiplier;

      // Fixed timestep updates
      while (this.accumulator >= this.fixedDt) {
        this.simTime += this.fixedDt;
        setSimTime(this.simTime);
        this.world.update(this.fixedDt);
        this.accumulator -= this.fixedDt;
      }
    }

    // Render frame
    this.renderer.render(this.world);
  }
}
