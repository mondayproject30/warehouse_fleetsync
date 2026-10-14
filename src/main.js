/**
 * Warehouse Robot Fleet Simulator - Application Bootstrap
 */

import { World } from './world/world.js';
import { CanvasRenderer } from './ui/canvasRenderer.js';
import { Engine } from './core/engine.js';
import { Dashboard } from './ui/dashboard.js';
import { events } from './core/events.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('sim-canvas');
  if (!canvas) {
    console.error('Canvas element #sim-canvas not found!');
    return;
  }

  // 1. Initialize World Simulation
  const world = new World();

  // 2. Initialize Canvas Renderer
  const renderer = new CanvasRenderer(canvas);

  // 3. Initialize 60Hz Physics Engine
  const engine = new Engine(world, renderer);

  // 4. Initialize UI Dashboard
  const dashboard = new Dashboard(engine, world, renderer);

  // Expose to window for testing / automated verification
  window.sim = {
    world,
    engine,
    renderer,
    dashboard,
    events,
  };

  // Start engine loop
  engine.start();

  events.log('system', 'Autonomous Warehouse Fleet Simulator initialized (60Hz Fixed Timestep).', 'success');
  events.log('system', 'Fleet operational: 4 robots in depot. Center-lane following and dynamic overtaking active.', 'info');
});
