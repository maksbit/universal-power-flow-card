/** Universal electrical topology model. No HA dependencies: safe to test in isolation. */
export type PortKind = 'ac' | 'dc' | 'pv' | 'dc+' | 'dc-' | 'pv+' | 'pv-' | 'signal';
export type PortDirection = 'in' | 'out' | 'both';
export type PortSide = 'left' | 'right' | 'top' | 'bottom';
export type Point = { x: number; y: number };
export interface PowerPort {
  id: string;
  label: string;
  kind: PortKind;
  direction: PortDirection;
  side: PortSide;
}
export interface PowerNode extends Point {
  id: string;
  type: string;
  name: string;
  icon?: string;
  /** Built-in editable vector artwork, not an external image URL. */
  modelId?: string;
  /** Signed equipment power reading (W/kW/MW). */
  powerEntity?: string;
  /** Optional explicit outgoing/incoming edge for device power telemetry. */
  powerFlowEdgeId?: string;
  /** How to interpret a positive device power value. */
  powerPositive?: 'out' | 'in';
  voltageEntity?: string;
  currentEntity?: string;
  width?: number;
  height?: number;
  rotation?: number;
  scale?: number;
  stateEntity?: string;
  socEntity?: string;
  ports: PowerPort[];
}
export interface PowerConnection {
  id: string;
  from: { node: string; port: string };
  to: { node: string; port: string };
  powerEntity?: string;
  invert?: boolean;
  waypoints?: Point[];
  /** Orthogonal routing preference; custom waypoints take precedence. */
  route?: 'auto' | 'horizontal' | 'vertical' | 'straight';
  /** Relative corridor displacement in SVG units. */
  routeOffset?: number;
  /** Optional per-wire visual controls (do not affect measurements). */
  color?: string;
  lineWidth?: number;
  animationSpeed?: number;
  name?: string;
}
export interface PowerDiagram {
  schemaVersion: 1;
  width: number;
  height: number;
  nodes: PowerNode[];
  connections: PowerConnection[];
}
export interface CardConfig {
  type: string;
  title?: string;
  diagram?: PowerDiagram;
  /** Extra component designs serialized with the card; exported with JSON. */
  library?: PowerNode[];
  animation?: boolean;
}
export const PORT_KINDS: PortKind[] = ['ac','dc','pv','dc+','dc-','pv+','pv-','signal'];
export const PORT_SIDES: PortSide[] = ['left','right','top','bottom'];
export const PORT_DIRECTIONS: PortDirection[] = ['in','out','both'];
const validId = (s: unknown): s is string => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(s);
const validNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
export const cloneDiagram = (d: PowerDiagram): PowerDiagram => JSON.parse(JSON.stringify(d)) as PowerDiagram;
export function emptyDiagram(): PowerDiagram {
  return { schemaVersion: 1, width: 1500, height: 900, nodes: [], connections: [] };
}
export function portCompatible(a: PowerPort, b: PowerPort): boolean {
  if (a.kind !== b.kind) return false;
  if (a.direction === 'in' && b.direction === 'in') return false;
  if (a.direction === 'out' && b.direction === 'out') return false;
  return true;
}
export function validateDiagram(d: PowerDiagram): string[] {
  const errors: string[] = [];
  if (d.schemaVersion !== 1) errors.push('Unsupported diagram schemaVersion (expected 1)');
  if (!validNumber(d.width) || d.width < 200 || d.width > 10000 ||
      !validNumber(d.height) || d.height < 200 || d.height > 10000) errors.push('Invalid canvas size');
  if (!Array.isArray(d.nodes) || !Array.isArray(d.connections)) return [...errors,'Nodes and connections must be arrays'];
  if (d.nodes.length > 400 || d.connections.length > 1000) errors.push('Diagram exceeds size limits');
  const ids = new Set<string>();
  const nodes = new Map<string,PowerNode>();
  for (const n of d.nodes) {
    if (!n || !validId(n.id)) { errors.push('Invalid node id'); continue; }
    if (ids.has(n.id)) errors.push(`Duplicate node id: ${n.id}`);
    ids.add(n.id); nodes.set(n.id, n);
    if (typeof n.name !== 'string' || n.name.length > 120) errors.push(`Invalid node name: ${n.id}`);
    if (!validNumber(n.x) || !validNumber(n.y) || Math.abs(n.x) > 10000 || Math.abs(n.y) > 10000)
      errors.push(`Invalid node coordinates: ${n.id}`);
    if (n.scale !== undefined && (!validNumber(n.scale) || n.scale < 0.5 || n.scale > 3))
      errors.push(`Invalid node scale: ${n.id}`);
    if (n.rotation !== undefined && ![0,90,180,270].includes(n.rotation))
      errors.push(`Invalid node rotation: ${n.id}`);
    if (!Array.isArray(n.ports) || n.ports.length > 30) {errors.push(`Invalid ports: ${n.id}`); continue;}
    const pids = new Set<string>();
    for (const p of n.ports) {
      if (!p || !validId(p.id) || pids.has(p.id) || !PORT_KINDS.includes(p.kind) ||
          !PORT_SIDES.includes(p.side) || !PORT_DIRECTIONS.includes(p.direction))
        errors.push(`Invalid/duplicate port: ${n.id}/${p?.id ?? '?'}`);
      if (typeof p?.label !== 'string' || p.label.length > 40) errors.push(`Invalid port label: ${n.id}`);
      pids.add(p?.id);
    }
  }
  const edgeIds = new Set<string>();
  const pairs = new Set<string>();
  for (const e of d.connections) {
    if (!e || !validId(e.id) || edgeIds.has(e.id)) { errors.push('Invalid/duplicate connection id'); continue; }
    edgeIds.add(e.id);
    const aNode = nodes.get(e.from?.node), bNode = nodes.get(e.to?.node);
    const a = aNode?.ports?.find(p=>p.id===e.from?.port);
    const b = bNode?.ports?.find(p=>p.id===e.to?.port);
    if (!a || !b) { errors.push(`Dangling connection: ${e.id}`); continue; }
    if (e.from.node === e.to.node) errors.push(`Self-connection: ${e.id}`);
    if (!portCompatible(a,b)) errors.push(`Incompatible ports: ${e.id} (${a.kind}/${b.kind})`);
    const p1 = `${e.from.node}/${e.from.port}`, p2 = `${e.to.node}/${e.to.port}`;
    const pair = [p1,p2].sort().join('|');
    if (pairs.has(pair)) errors.push(`Duplicate connection: ${e.id}`);
    pairs.add(pair);
    if (e.route !== undefined && !['auto','horizontal','vertical','straight'].includes(e.route))
      errors.push(`Invalid routing mode: ${e.id}`);
    if (e.routeOffset !== undefined && (!validNumber(e.routeOffset) || Math.abs(e.routeOffset)>600))
      errors.push(`Invalid lane offset: ${e.id}`);
    if (e.lineWidth !== undefined && (!validNumber(e.lineWidth) || e.lineWidth<1 || e.lineWidth>12))
      errors.push(`Invalid line width: ${e.id}`);
    if (e.animationSpeed !== undefined && (!validNumber(e.animationSpeed) || e.animationSpeed<0.25 || e.animationSpeed>8))
      errors.push(`Invalid flow speed: ${e.id}`);
    if (e.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(e.color))
      errors.push(`Invalid wire color: ${e.id}`);
    if (e.waypoints !== undefined && (!Array.isArray(e.waypoints) || e.waypoints.length > 30 ||
      e.waypoints.some(p=>!validNumber(p.x) || !validNumber(p.y) || Math.abs(p.x)>10000 || Math.abs(p.y)>10000)))
      errors.push(`Invalid waypoints: ${e.id}`);
  }
  for(const n of d.nodes){
    if(n.powerFlowEdgeId!==undefined){
      const edge=d.connections.find(e=>e.id===n.powerFlowEdgeId);
      if(!edge||![edge.from.node,edge.to.node].includes(n.id))
        errors.push(`Invalid flow connection selection: ${n.id}`);
    }
  }
  return errors;
}
/** Verify shape before accepting imported JSON. Never blindly render unknown nested objects. */
export function parseDiagram(input: unknown): PowerDiagram {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Diagram must be an object');
  const d = input as PowerDiagram;
  const errors = validateDiagram(d);
  if (errors.length) throw Error(errors.join('; '));
  return cloneDiagram(d);
}
export function makeId(prefix: string): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0,12) :
    Math.random().toString(36).slice(2,14);
  return `${prefix}_${id}`;
}
