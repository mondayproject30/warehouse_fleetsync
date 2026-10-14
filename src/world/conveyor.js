/**
 * Warehouse Conveyor System with Automated Diverter/Splitter
 * Handles input backpressure, belt transport animation, and routing to Packaging vs Delivery stations.
 */

import { CONFIG } from '../core/config.js';
import { events } from '../core/events.js';

export class ConveyorSystem {
  constructor(layout) {
    this.layout = layout;
    this.items = []; // Items currently traveling along belts
    this.speed = CONFIG.TIMINGS.CONVEYOR_BELT_SPEED;
    this.capacity = CONFIG.TIMINGS.CONVEYOR_CAPACITY;
    this.beltOffset = 0; // For animated belt texture rendering
  }

  get isFull() {
    return this.items.length >= this.capacity;
  }

  /**
   * Accepts an item dropped by a robot at conveyor input
   * @param {Object} item { id, jobId, destination, color }
   * @returns {boolean} true if accepted, false if backpressure rejected
   */
  dropItem(item) {
    if (this.isFull) {
      events.log('conveyor', `Conveyor input rejected item ${item.id}: Backpressure full (${this.items.length}/${this.capacity})`, 'warning');
      return false;
    }

    const newItem = {
      ...item,
      x: CONFIG.LAYOUT.CONVEYOR_INPUT_X,
      y: CONFIG.LAYOUT.CONVEYOR_INPUT_Y,
      state: 'FEEDING', // FEEDING -> SPLITTING -> ROUTED_UP / ROUTED_DOWN -> DELIVERED
      progress: 0,
      createdAt: performance.now(),
    };

    this.items.push(newItem);
    events.log('conveyor', `Item #${newItem.id} (Job ${newItem.jobId}) accepted on conveyor -> Bound for ${newItem.destination}`, 'info');
    return true;
  }

  update(dt) {
    // Animate belt tread
    this.beltOffset = (this.beltOffset + this.speed * dt) % 20;

    const splitterX = CONFIG.LAYOUT.CONVEYOR_SPLITTER_X;
    const inputX = CONFIG.LAYOUT.CONVEYOR_INPUT_X;
    const packY = (CONFIG.LAYOUT.PACKAGING_Y ?? CONFIG.LAYOUT.PICKING_STATION_Y) + (CONFIG.LAYOUT.PACKAGING_HEIGHT ?? CONFIG.LAYOUT.PICKING_STATION_HEIGHT) / 2;
    const delivY = (CONFIG.LAYOUT.DELIVERY_Y ?? CONFIG.LAYOUT.DELIVERY_STATION_Y) + (CONFIG.LAYOUT.DELIVERY_HEIGHT ?? CONFIG.LAYOUT.DELIVERY_STATION_HEIGHT) / 2;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];

      if (item.state === 'FEEDING') {
        // Move horizontally east towards the splitter
        item.x += this.speed * dt;
        if (item.x >= splitterX) {
          item.x = splitterX;
          item.state = item.destination === 'PACKAGING' ? 'ROUTED_UP' : 'ROUTED_DOWN';
          events.log('conveyor', `Diverter routed Item #${item.id} -> ${item.destination}`, 'info');
        }
      } else if (item.state === 'ROUTED_UP') {
        // Move UP toward Packaging Station
        item.y -= this.speed * dt;
        if (item.y <= packY) {
          // Delivered to Packaging!
          this.layout.packagingStation.itemCount++;
          events.log('station', `Item #${item.id} received at PACKAGING STATION (Total: ${this.layout.packagingStation.itemCount})`, 'success');
          events.emit('item_delivered', { item, station: 'PACKAGING' });
          this.items.splice(i, 1);
        }
      } else if (item.state === 'ROUTED_DOWN') {
        // Move DOWN toward Delivery Station
        item.y += this.speed * dt;
        if (item.y >= delivY) {
          // Delivered to Delivery!
          this.layout.deliveryStation.itemCount++;
          events.log('station', `Item #${item.id} received at DELIVERY STATION (Total: ${this.layout.deliveryStation.itemCount})`, 'success');
          events.emit('item_delivered', { item, station: 'DELIVERY' });
          this.items.splice(i, 1);
        }
      }
    }
  }

  reset() {
    this.items = [];
    this.layout.packagingStation.itemCount = 0;
    this.layout.deliveryStation.itemCount = 0;
  }
}
