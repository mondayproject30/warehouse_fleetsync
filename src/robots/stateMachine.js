/**
 * Robot State Machine Constants and Helper
 */

export const RobotState = {
  IDLE: 'IDLE',
  GO_TO_INVENTORY: 'GO_TO_INVENTORY',
  PICKING_FROM_INVENTORY: 'PICKING_FROM_INVENTORY',
  GO_TO_SHELF_BAY: 'GO_TO_SHELF_BAY',
  PICKING_FROM_SHELF: 'PICKING_FROM_SHELF',
  CARRYING_TO_CONVEYOR: 'CARRYING_TO_CONVEYOR',
  DROPPING_ON_CONVEYOR: 'DROPPING_ON_CONVEYOR',
  RETURNING: 'RETURNING',
  OVERTAKING: 'OVERTAKING',
  WAITING: 'WAITING',
  GO_TO_CHARGER: 'GO_TO_CHARGER',
  CHARGING: 'CHARGING',
};

export function getStateDescription(state) {
  switch (state) {
    case RobotState.IDLE: return 'Idle in Depot';
    case RobotState.GO_TO_INVENTORY: return 'Navigating to Inventory';
    case RobotState.PICKING_FROM_INVENTORY: return 'Collecting Job Dispatch';
    case RobotState.GO_TO_SHELF_BAY: return 'Heading to Shelf Bay';
    case RobotState.PICKING_FROM_SHELF: return 'Picking Item from Shelf';
    case RobotState.CARRYING_TO_CONVEYOR: return 'Carrying Item to Conveyor';
    case RobotState.DROPPING_ON_CONVEYOR: return 'Transferring to Belt';
    case RobotState.RETURNING: return 'Returning via Loop';
    case RobotState.OVERTAKING: return 'Executing Dynamic Overtake';
    case RobotState.WAITING: return 'Yielding / Safe Standstill';
    case RobotState.GO_TO_CHARGER: return 'Heading to Charger';
    case RobotState.CHARGING: return 'Recharging Battery';
    default: return state;
  }
}
