import {css} from 'lit';
export const universalStyles=css`
:host{display:block;color:var(--primary-text-color,#eee)}
ha-card{overflow:hidden;padding:8px;background:var(--ha-card-background,var(--card-background-color,#202b36))}
h3{margin:4px 8px 10px;font-size:1.1rem}
.upfc-canvas{display:block;width:100%;height:auto;min-height:270px;max-height:75vh;user-select:none;touch-action:none;border:1px solid var(--divider-color,#405060);border-radius:8px;background:var(--primary-background-color,#15212b)}
.upfc-bg{pointer-events:all}
.upfc-node{cursor:grab}
/* Decorative vector art must not steal hit testing from the enclosing equipment. */
.upfc-node > g > svg,.upfc-node > g > svg *,.upfc-node > g > text{pointer-events:none}
.upfc-node:active{cursor:grabbing}
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
/* Popover renders IN the current browser tab's top layer above HA's dialog.
 * It is never browser / operating-system fullscreen. */
.upfc-dialog{box-sizing:border-box;border:1px solid var(--divider-color,#546776);
  border-radius:10px;background:var(--ha-card-background,var(--card-background-color,#192630));
  color:var(--primary-text-color,#eee);padding:12px 16px;overscroll-behavior:contain;
  box-shadow:0 16px 54px rgba(0,0,0,.65)}
.upfc-dialog:not(:popover-open),.upfc-compact-workspace[hidden]{display:none!important}
.upfc-fullscreen-workspace:popover-open{
  position:fixed!important;inset:0!important;display:flex!important;flex-direction:column;
  box-sizing:border-box;width:100vw!important;height:100dvh!important;
  min-width:0!important;min-height:0!important;max-width:none!important;
  max-height:none!important;margin:0!important;
  border:0!important;border-radius:0!important;
  overflow:hidden!important;padding:12px 16px!important;
}
.upfc-fullscreen-workspace:popover-open .upfc-toolbar{flex:0 0 auto}
.upfc-fullscreen-workspace:popover-open .upfc-layout{
  display:grid;grid-template-columns:minmax(0,1fr) minmax(310px,24vw);
  grid-template-rows:minmax(0,1fr);flex:1 1 auto;min-height:0;min-width:0;
  overflow:hidden;align-items:stretch;gap:12px
}
.upfc-fullscreen-workspace:popover-open .upfc-canvas-shell{
  min-height:0;height:100%;min-width:0;overflow:hidden
}
.upfc-fullscreen-workspace:popover-open .upfc-canvas{
  box-sizing:border-box;width:100%;height:100%!important;min-height:0!important;
  max-height:none!important
}
.upfc-fullscreen-workspace:popover-open .upfc-inspector{
  min-height:0;max-height:none;height:100%;overflow-y:auto
}
.upfc-fullscreen-workspace:popover-open .upfc-palette,
.upfc-fullscreen-workspace:popover-open .upfc-subtle{flex-shrink:0}
.upfc-dialog button,.upfc-dialog select,.upfc-dialog input{pointer-events:auto}
.upfc-node{touch-action:none}
.upfc-node.selected{filter:drop-shadow(0 0 4px var(--primary-color,#03a9f4))}
@media(max-width:850px){
  .upfc-fullscreen-workspace:popover-open .upfc-layout{
    grid-template-columns:minmax(0,1fr) minmax(220px,34vw)
  }
}
.upfc-edge.selected path:not(.upfc-edge-hit){filter:drop-shadow(0 0 3px var(--primary-color,#03a9f4))}


.upfc-entity-picker{padding:5px 0 8px;border-bottom:1px dotted var(--divider-color,#5b6770)}
.upfc-entity-search{margin-top:5px;width:100%;border-color:var(--primary-color,#189ad4)}
.upfc-entity-results{display:grid;gap:3px;max-height:250px;overflow-y:auto;padding:5px 0}
.upfc-entity-results button{display:flex;gap:7px;justify-content:space-between;align-items:center;text-align:left;
  font-size:12px;padding:7px;max-width:100%;border:1px solid var(--divider-color,#667786)}
.upfc-entity-results button:hover{border-color:var(--primary-color,#189ad4)}
.upfc-entity-results span{min-width:0;overflow-wrap:anywhere}
.upfc-entity-results small{display:block;font-size:10px;opacity:.68;word-break:break-all}
.upfc-entity-results strong{white-space:nowrap;font-size:12px}
.upfc-compact-workspace[hidden]{display:none}

.upfc-diagnostic{margin:10px 0;padding:10px;border:1px solid var(--divider-color,#667582);
  background:var(--secondary-background-color,var(--primary-background-color,#192c38));border-radius:7px;
  font-size:12px;line-height:1.5;overflow-wrap:anywhere}
.upfc-diagnostic strong{display:block;margin-bottom:6px}
.upfc-diagnostic p{margin:4px 0}
.upfc-flow-dot{pointer-events:none;filter:drop-shadow(0 0 3px rgba(255,255,255,.65))}
@media(max-width:850px){
  .upfc-dialog .upfc-layout{grid-template-columns:1fr}
  .upfc-dialog .upfc-canvas{height:60vh;min-height:300px}
  .upfc-dialog .upfc-inspector{max-height:none}
}

`;
