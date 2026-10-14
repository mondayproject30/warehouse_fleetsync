/**
 * Directed Road Network Graph & A* Pathfinding
 * Models nodes, lanes, and edges with directional weights.
 */

export class GraphNode {
  constructor(id, x, y, options = {}) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.laneId = options.laneId || null;
    this.type = options.type || 'waypoint'; // 'waypoint', 'shelf_bay', 'charging_slot', 'inventory', 'conveyor_input', 'intersection'
    this.shelfId = options.shelfId || null;
    this.bayIndex = options.bayIndex !== undefined ? options.bayIndex : null;
    this.slotIndex = options.slotIndex !== undefined ? options.slotIndex : null;
    this.edges = [];
  }
}

export class GraphEdge {
  constructor(id, from, to, options = {}) {
    this.id = id;
    this.from = from; // GraphNode
    this.to = to;     // GraphNode
    this.laneId = options.laneId || 'center';
    this.direction = options.direction || 'east'; // 'east', 'west', 'north', 'south'
    this.isConnector = !!options.isConnector;
    this.isReturnLane = !!options.isReturnLane;
    this.distance = Math.hypot(to.x - from.x, to.y - from.y);
  }

  getCost(customPenalty = 0) {
    return this.distance + customPenalty;
  }
}

export class DirectedGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
  }

  addNode(id, x, y, options = {}) {
    const node = new GraphNode(id, x, y, options);
    this.nodes.set(id, node);
    return node;
  }

  getNode(id) {
    return this.nodes.get(id);
  }

  addEdge(fromId, toId, options = {}) {
    const from = this.nodes.get(fromId);
    const to = this.nodes.get(toId);
    if (!from || !to) {
      console.warn(`Cannot add edge between missing nodes: ${fromId} -> ${toId}`);
      return null;
    }

    const edgeId = `${fromId}->${toId}`;
    const edge = new GraphEdge(edgeId, from, to, options);
    from.edges.push(edge);
    this.edges.push(edge);
    return edge;
  }

  addBiEdge(nodeId1, nodeId2, options = {}) {
    const e1 = this.addEdge(nodeId1, nodeId2, { ...options, direction: options.dir1 || 'south' });
    const e2 = this.addEdge(nodeId2, nodeId1, { ...options, direction: options.dir2 || 'north' });
    return [e1, e2];
  }

  /**
   * Finds the closest node to given coordinates, optionally filtered by type or laneId
   */
  findClosestNode(x, y, filterFn = null) {
    let closest = null;
    let minDistSq = Infinity;

    for (const node of this.nodes.values()) {
      if (filterFn && !filterFn(node)) continue;
      const dx = node.x - x;
      const dy = node.y - y;
      const dSq = dx * dx + dy * dy;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        closest = node;
      }
    }
    return closest;
  }

  /**
   * A* Pathfinding with optional node/edge penalty callbacks
   * @param {string} startId
   * @param {string} targetId
   * @param {Object} options { penaltyCallback: (edge) => number, reservedNodes: Set<string> }
   * @returns {Array<GraphNode>} path of nodes from start to target
   */
  findPath(startId, targetId, options = {}) {
    if (startId === targetId) {
      const node = this.getNode(startId);
      return node ? [node] : [];
    }

    const startNode = this.getNode(startId);
    const targetNode = this.getNode(targetId);
    if (!startNode || !targetNode) return [];

    const openSet = new Set([startId]);
    const cameFrom = new Map();

    const gScore = new Map();
    gScore.set(startId, 0);

    const fScore = new Map();
    fScore.set(startId, this.heuristic(startNode, targetNode));

    const reservedNodes = options.reservedNodes || new Set();
    const penaltyCallback = options.penaltyCallback || null;

    while (openSet.size > 0) {
      // Find node with lowest fScore
      let currentId = null;
      let lowestF = Infinity;
      for (const id of openSet) {
        const f = fScore.get(id) ?? Infinity;
        if (f < lowestF) {
          lowestF = f;
          currentId = id;
        }
      }

      if (currentId === targetId) {
        return this.reconstructPath(cameFrom, currentId);
      }

      openSet.delete(currentId);
      const currentNode = this.getNode(currentId);

      for (const edge of currentNode.edges) {
        const neighbor = edge.to;
        const neighborId = neighbor.id;

        // Skip reserved nodes unless it is the final intended destination
        if (neighborId !== targetId && reservedNodes.has(neighborId)) {
          continue;
        }

        let edgePenalty = 0;
        if (penaltyCallback) {
          edgePenalty = penaltyCallback(edge);
        }

        // Slight preference for center lane when in the 3-lane trunk
        if (edge.laneId === 'lane_center') {
          edgePenalty -= 5;
        }

        const tentativeG = (gScore.get(currentId) ?? Infinity) + edge.getCost(edgePenalty);

        if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
          cameFrom.set(neighborId, currentNode);
          gScore.set(neighborId, tentativeG);
          fScore.set(neighborId, tentativeG + this.heuristic(neighbor, targetNode));

          if (!openSet.has(neighborId)) {
            openSet.add(neighborId);
          }
        }
      }
    }

    // No path found
    return [];
  }

  heuristic(a, b) {
    // Euclidean distance heuristic
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  reconstructPath(cameFrom, currentId) {
    const totalPath = [this.getNode(currentId)];
    while (cameFrom.has(currentId)) {
      const prev = cameFrom.get(currentId);
      totalPath.unshift(prev);
      currentId = prev.id;
    }
    return totalPath;
  }
}
