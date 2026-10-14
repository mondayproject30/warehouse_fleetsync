/**
 * UI Dashboard Controller
 * Manages simulation controls, scenario buttons, job creation form, robot inspector,
 * job queue tables, metric cards, and live scrolling event log.
 */

import { events } from '../core/events.js';
import { getStateDescription } from '../robots/stateMachine.js';

export class Dashboard {
  constructor(engine, world, renderer) {
    this.engine = engine;
    this.world = world;
    this.renderer = renderer;

    this.selectedRobotId = 1;
    this.bindDOM();
    this.setupEvents();
    this.startMetricsTimer();
  }

  bindDOM() {
    // 1. Simulation Controls
    this.btnPlay = document.getElementById('btn-play');
    this.btnPause = document.getElementById('btn-pause');
    this.btnStep = document.getElementById('btn-step');
    this.btnReset = document.getElementById('btn-reset');
    this.speedButtons = document.querySelectorAll('.btn-speed');

    // 2. View Toggles
    this.chkLidar = document.getElementById('chk-lidar');
    this.chkPaths = document.getElementById('chk-paths');
    this.chkLanes = document.getElementById('chk-lanes');
    this.chkGraph = document.getElementById('chk-graph');
    this.chkSafety = document.getElementById('chk-safety');
    this.chkReservations = document.getElementById('chk-reservations');
    this.chkWaitFor = document.getElementById('chk-waitfor');

    // 3. Scenario Buttons
    this.btnScenA = document.getElementById('btn-scen-a');
    this.btnScenB = document.getElementById('btn-scen-b');
    this.btnScenC = document.getElementById('btn-scen-c');
    this.btnScenD = document.getElementById('btn-scen-d');
    this.btnScenE = document.getElementById('btn-scen-e');
    this.btnScenF = document.getElementById('btn-scen-f');

    // 4. Job Form
    this.jobRobotSelect = document.getElementById('job-robot');
    this.jobShelfSelect = document.getElementById('job-shelf');
    this.jobDestSelect = document.getElementById('job-dest');
    this.jobPrioritySelect = document.getElementById('job-priority');
    this.btnAddJob = document.getElementById('btn-add-job');
    this.btnAddRandomJobs = document.getElementById('btn-random-jobs');
    this.btnClearQueue = document.getElementById('btn-clear-queue');
    this.btnStressTest = document.getElementById('btn-stress-test');

    // 5. Tables & Containers
    this.jobTableBody = document.getElementById('job-table-body');
    this.eventLogContainer = document.getElementById('event-log-list');
    this.btnClearLogs = document.getElementById('btn-clear-logs');

    // 6. Metrics Elements
    this.metricCompleted = document.getElementById('metric-completed');
    this.metricAvgTime = document.getElementById('metric-avg-time');
    this.metricThroughput = document.getElementById('metric-throughput');
    this.metricOvertakes = document.getElementById('metric-overtakes');
    this.metricNearMisses = document.getElementById('metric-nearmisses');
    this.metricCollisions = document.getElementById('metric-collisions');

    // 7. Robot Inspector
    this.robotSelectTabs = document.querySelectorAll('.robot-tab');
    this.inspectorState = document.getElementById('insp-state');
    this.inspectorBattery = document.getElementById('insp-battery');
    this.inspectorBatteryBar = document.getElementById('insp-battery-bar');
    this.inspectorJob = document.getElementById('insp-job');
    this.inspectorLidar = document.getElementById('insp-lidar');
    this.btnToggleBlock = document.getElementById('btn-toggle-block');
  }

  setupEvents() {
    // Sim controls
    this.btnPlay.addEventListener('click', () => {
      this.engine.resume();
      this.updatePlayPauseUI();
    });
    this.btnPause.addEventListener('click', () => {
      this.engine.pause();
      this.updatePlayPauseUI();
    });
    this.btnStep.addEventListener('click', () => {
      this.engine.step();
      this.updatePlayPauseUI();
    });
    this.btnReset.addEventListener('click', () => {
      this.engine.reset();
      this.updatePlayPauseUI();
      this.updateUI();
    });

    // Speed buttons
    this.speedButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const speed = parseFloat(e.target.dataset.speed);
        this.engine.setSpeed(speed);
        this.speedButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      });
    });

    // Toggles
    this.chkLidar.addEventListener('change', (e) => {
      this.renderer.showLidar = e.target.checked;
    });
    this.chkPaths.addEventListener('change', (e) => {
      this.renderer.showPaths = e.target.checked;
    });
    this.chkLanes.addEventListener('change', (e) => {
      this.renderer.showLanes = e.target.checked;
    });
    this.chkGraph.addEventListener('change', (e) => {
      this.renderer.showGraphNodes = e.target.checked;
    });
    if (this.chkSafety) {
      this.chkSafety.addEventListener('change', (e) => {
        this.renderer.showSafetyDistance = e.target.checked;
      });
    }
    if (this.chkReservations) {
      this.chkReservations.addEventListener('change', (e) => {
        this.renderer.showReservations = e.target.checked;
      });
    }
    if (this.chkWaitFor) {
      this.chkWaitFor.addEventListener('change', (e) => {
        this.renderer.showWaitFor = e.target.checked;
      });
    }

    // Scenarios
    this.btnScenA.addEventListener('click', () => { this.world.runScenarioA(); this.engine.resume(); this.updatePlayPauseUI(); });
    this.btnScenB.addEventListener('click', () => { this.world.runScenarioB(); this.engine.resume(); this.updatePlayPauseUI(); });
    this.btnScenC.addEventListener('click', () => { this.world.runScenarioC(); this.engine.resume(); this.updatePlayPauseUI(); });
    this.btnScenD.addEventListener('click', () => { this.world.runScenarioD(); this.engine.resume(); this.updatePlayPauseUI(); });
    this.btnScenE.addEventListener('click', () => { this.world.runScenarioE(); this.engine.resume(); this.updatePlayPauseUI(); });
    this.btnScenF.addEventListener('click', () => { this.world.runScenarioF(); this.engine.resume(); this.updatePlayPauseUI(); });

    // Job Creation Form
    this.btnAddJob.addEventListener('click', () => {
      this.world.jobSystem.createJob({
        robotId: this.jobRobotSelect.value,
        shelf: parseInt(this.jobShelfSelect.value, 10),
        destination: this.jobDestSelect.value,
        priority: this.jobPrioritySelect.value,
      });
      this.updateUI();
    });

    this.btnAddRandomJobs.addEventListener('click', () => {
      this.world.jobSystem.addRandomJobs(10);
      this.updateUI();
    });

    this.btnClearQueue.addEventListener('click', () => {
      this.world.jobSystem.clearQueue();
      this.updateUI();
    });

    this.btnStressTest.addEventListener('click', () => {
      this.world.jobSystem.createStressTestJobs();
      this.engine.resume();
      this.updatePlayPauseUI();
      this.updateUI();
    });

    // Robot Tab Selection
    this.robotSelectTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.robotId, 10);
        this.selectRobot(id);
      });
    });

    // Toggle Block button
    this.btnToggleBlock.addEventListener('click', () => {
      const robot = this.world.robots.find(r => r.id === this.selectedRobotId);
      if (robot) {
        robot.forceStop(!robot.isForceStopped);
        this.updateInspector();
      }
    });

    // Canvas click detection for selecting robots
    this.renderer.canvas.addEventListener('click', (e) => {
      const rect = this.renderer.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      for (const robot of this.world.robots) {
        const d = Math.hypot(robot.x - clickX, robot.y - clickY);
        if (d <= robot.radius + 6) {
          this.selectRobot(robot.id);
          break;
        }
      }
    });

    // Event Bus Listeners
    events.on('log_added', (entry) => this.appendLogEntry(entry));
    events.on('logs_cleared', () => { this.eventLogContainer.innerHTML = ''; });
    this.btnClearLogs.addEventListener('click', () => events.clearLogs());

    // Initial select
    this.selectRobot(1);
  }

  selectRobot(id) {
    this.selectedRobotId = id;
    this.robotSelectTabs.forEach(tab => {
      if (parseInt(tab.dataset.robotId, 10) === id) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
    this.renderer.selectedRobot = this.world.robots.find(r => r.id === id);
    this.updateInspector();
  }

  updatePlayPauseUI() {
    if (this.engine.isRunning) {
      this.btnPlay.classList.add('active');
      this.btnPause.classList.remove('active');
    } else {
      this.btnPlay.classList.remove('active');
      this.btnPause.classList.add('active');
    }
  }

  updateInspector() {
    const robot = this.world.robots.find(r => r.id === this.selectedRobotId);
    if (!robot) return;

    this.inspectorState.textContent = robot.isForceStopped ? 'FORCE BLOCKED' : getStateDescription(robot.state);
    this.inspectorBattery.textContent = `${robot.battery.toFixed(1)}%`;
    this.inspectorBatteryBar.style.width = `${Math.max(0, robot.battery)}%`;
    this.inspectorBatteryBar.className = `battery-fill ${robot.battery > 50 ? 'high' : robot.battery > 20 ? 'med' : 'low'}`;

    if (robot.currentJob) {
      this.inspectorJob.textContent = `#${robot.currentJob.id}: S${robot.currentJob.shelf} -> ${robot.currentJob.destination}`;
    } else {
      this.inspectorJob.textContent = 'None (Available)';
    }

    if (robot.lidar && robot.lidar.nearestDist < Infinity) {
      const type = robot.lidar.nearestObstacle ? robot.lidar.nearestObstacle.type.toUpperCase() : 'CLEAR';
      this.inspectorLidar.textContent = `${robot.lidar.nearestDist.toFixed(0)}px (${type})`;
    } else {
      this.inspectorLidar.textContent = 'Path Clear';
    }

    // Toggle button text
    if (robot.isForceStopped) {
      this.btnToggleBlock.textContent = 'Unblock Robot';
      this.btnToggleBlock.classList.add('btn-danger-active');
    } else {
      this.btnToggleBlock.textContent = 'Force Stop / Block';
      this.btnToggleBlock.classList.remove('btn-danger-active');
    }
  }

  startMetricsTimer() {
    setInterval(() => {
      this.updateUI();
    }, 250);
  }

  updateUI() {
    // Update Metrics Cards
    const jobMetrics = this.world.jobSystem.getMetrics();
    this.metricCompleted.textContent = jobMetrics.completedCount;
    this.metricAvgTime.textContent = `${jobMetrics.avgTimeSec}s`;
    this.metricThroughput.textContent = `${jobMetrics.throughputPerMin}/min`;
    this.metricOvertakes.textContent = this.world.metrics.totalOvertakes;
    this.metricNearMisses.textContent = this.world.metrics.totalNearMisses;
    this.metricCollisions.textContent = this.world.metrics.totalCollisions;

    if (this.world.metrics.totalCollisions > 0) {
      this.metricCollisions.parentElement.classList.add('alert-danger');
    } else {
      this.metricCollisions.parentElement.classList.remove('alert-danger');
    }

    // Update Job Queue Table
    this.renderJobTable();

    // Update Selected Robot Inspector
    this.updateInspector();
  }

  renderJobTable() {
    const jobs = this.world.jobSystem.jobs.slice(-15); // Show latest 15 jobs
    if (jobs.length === 0) {
      this.jobTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No jobs in queue. Create one above!</td></tr>`;
      return;
    }

    this.jobTableBody.innerHTML = jobs.map(j => {
      let badgeClass = 'badge-pending';
      if (j.status === 'IN_PROGRESS') badgeClass = 'badge-progress';
      else if (j.status === 'DONE') badgeClass = 'badge-done';
      else if (j.status === 'FAILED') badgeClass = 'badge-failed';

      const priClass = j.priority === 'HIGH' ? 'text-danger' : j.priority === 'NORMAL' ? 'text-warning' : 'text-muted';

      return `
        <tr>
          <td>#${j.id}</td>
          <td><span class="badge ${badgeClass}">${j.status}</span></td>
          <td>Shelf ${j.shelf}</td>
          <td>${j.destination}</td>
          <td>${j.assignedRobotId ? `R${j.assignedRobotId}` : (j.robotId === 'auto' ? 'Auto' : `R${j.robotId}`)}</td>
          <td class="${priClass}">${j.priority}</td>
        </tr>
      `;
    }).join('');
  }

  appendLogEntry(entry) {
    const div = document.createElement('div');
    div.className = `log-entry log-${entry.level}`;
    div.innerHTML = `
      <span class="log-time">[${entry.simTime}]</span>
      <span class="log-category">[${entry.category.toUpperCase()}]</span>
      <span class="log-msg">${entry.message}</span>
    `;

    this.eventLogContainer.prepend(div);

    // Keep log container from overflowing memory
    while (this.eventLogContainer.children.length > 120) {
      this.eventLogContainer.removeChild(this.eventLogContainer.lastChild);
    }
  }
}
