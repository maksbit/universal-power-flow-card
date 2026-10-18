import {css} from 'lit';
export const universalStyles=css`
:host{display:block;color:var(--primary-text-color,#eee)}
ha-card{overflow:hidden;padding:8px;background:var(--ha-card-background,var(--card-background-color,#202b36))}
h3{margin:4px 8px 10px;font-size:1.1rem}
.upfc-canvas{display:block;width:100%;height:auto;min-height:270px;max-height:75vh;user-select:none;touch-action:none;border:1px solid var(--divider-color,#405060);border-radius:8px;background:var(--primary-background-color,#15212b)}
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
.upfc-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
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

.upfc-canvas-shell{min-width:0;min-height:270px;overflow:hidden}
.upfc-editor-card{min-width:0}
.upfc-editor-card .upfc-primarybar{gap:8px}
.upfc-toolbar h3{margin-right:auto}
.upfc-primarybar select{flex:1 1 160px;min-width:100px}
.upfc-palette{margin:8px 2px;border:1px solid var(--divider-color,#526371);border-radius:8px;padding:8px}
.upfc-palette summary{cursor:pointer;font-size:13px}
.upfc-dialog{position:fixed;box-sizing:border-box;width:calc(100vw - 32px);max-width:none;
  height:calc(100dvh - 28px);max-height:none;margin:auto;padding:14px;
  overflow:auto;border:1px solid var(--divider-color,#546776);border-radius:12px;
  background:var(--ha-card-background,var(--card-background-color,#192630));color:var(--primary-text-color,#eee)}
.upfc-dialog::backdrop{background:rgba(0,0,0,.7)}
.upfc-dialog .upfc-layout{grid-template-columns:minmax(0,1fr) 315px;align-items:start}
.upfc-dialog .upfc-canvas{width:100%;height:calc(100dvh - 275px);min-height:450px;max-height:none}
.upfc-dialog .upfc-canvas-shell{min-height:450px}
.upfc-dialog .upfc-inspector{max-height:calc(100dvh - 250px);overflow:auto}
.upfc-edge.selected path:not(.upfc-edge-hit){filter:drop-shadow(0 0 3px var(--primary-color,#03a9f4))}
@media(max-width:850px){
  .upfc-dialog .upfc-layout{grid-template-columns:1fr}
  .upfc-dialog .upfc-canvas{height:60vh;min-height:300px}
  .upfc-dialog .upfc-inspector{max-height:none}
}

`;
