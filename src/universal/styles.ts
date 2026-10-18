import {css} from 'lit';
export const universalStyles=css`
:host{display:block;color:var(--primary-text-color,#eee)}
ha-card{overflow:hidden;padding:8px;background:var(--ha-card-background,var(--card-background-color,#202b36))}
h3{margin:4px 8px 10px;font-size:1.1rem}
.upfc-canvas{display:block;width:100%;height:auto;min-height:340px;max-height:75vh;user-select:none;touch-action:none;border:1px solid var(--divider-color,#405060);border-radius:8px;background:var(--primary-background-color,#15212b)}
.upfc-bg{pointer-events:all}
.upfc-node{cursor:grab}
.upfc-node-box{fill:var(--card-background-color,#263340);stroke:var(--divider-color,#607080);stroke-width:2}
.upfc-node.selected .upfc-node-box{stroke:var(--primary-color,#03a9f4);stroke-width:4}
.upfc-node-title{fill:var(--primary-text-color,#eee);font-size:12px;font-weight:bold}
.upfc-node-status{fill:var(--secondary-text-color,#aaa);font-size:11px}
.upfc-port{cursor:crosshair}
.upfc-edge-hit{stroke:transparent;stroke-width:18;fill:none;pointer-events:stroke;cursor:pointer}
.upfc-waypoint{fill:var(--primary-color,#03a9f4);stroke:white;stroke-width:2;cursor:move}
.upfc-toolbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:7px 0}
button,select,input,textarea{box-sizing:border-box;background:var(--card-background-color,#263340);border:1px solid var(--divider-color,#69757d);color:var(--primary-text-color,#eee);border-radius:5px;padding:7px;font:inherit;max-width:100%}
button{cursor:pointer}
button:disabled{opacity:.4;cursor:default}
button.primary{background:var(--primary-color,#0288d1);color:white}
button.danger{color:var(--error-color,#f55)}
input,textarea{width:100%}
.upfc-layout{display:grid;grid-template-columns:minmax(0,1fr) 265px;gap:10px}
.upfc-inspector{border:1px solid var(--divider-color,#506070);padding:10px;border-radius:8px;min-width:0;max-height:75vh;overflow:auto}
.upfc-inspector label{display:block;font-size:12px;margin:10px 0 4px}
.upfc-inspector h4{margin:8px 0 12px}
.upfc-subtle{font-size:12px;opacity:.75}
.upfc-warning{color:var(--error-color,#e77575);font-size:12px;line-height:1.5}
.upfc-list{border-top:1px solid var(--divider-color,#506070);padding:6px 0}
.upfc-port-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.upfc-flow-legend{font-size:12px;opacity:.8;display:flex;gap:10px;flex-wrap:wrap;padding:5px}
.upfc-flow-legend span{display:flex;align-items:center;gap:4px}
.upfc-dot{display:inline-block;width:9px;height:9px;border-radius:50%}
@media(max-width:780px){.upfc-layout{grid-template-columns:1fr}.upfc-inspector{max-height:none}}
`;
