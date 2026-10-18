import {LitElement,html} from 'lit';
import {customElement,property} from 'lit/decorators.js';
import {HomeAssistant} from 'custom-card-helpers';
import {CardConfig,PowerDiagram,makeId,parseDiagram} from './model';
import {demoDiagram} from './presets';
import {renderDiagram} from './render';
import {universalStyles} from './styles';

@customElement('universal-power-flow-card')
export class UniversalPowerFlowCard extends LitElement {
  static styles=universalStyles;
  @property({attribute:false}) public hass?:HomeAssistant;
  @property({attribute:false}) private config:CardConfig={type:'custom:universal-power-flow-card'};
  private readonly instanceId=makeId('upfc');
  public setConfig(config:CardConfig):void {
    if(!config||typeof config!=='object')throw Error('Universal Power Flow: invalid configuration');
    this.config={...config,diagram:config.diagram?parseDiagram(config.diagram):demoDiagram()};
  }
  public static async getConfigElement():Promise<HTMLElement>{
    await import('./editor');
    return document.createElement('universal-power-flow-card-editor');
  }
  public static getStubConfig():CardConfig{
    return {type:'custom:universal-power-flow-card',title:'Telecom power flow',animation:true,diagram:demoDiagram()};
  }
  protected render(){
    const d:PowerDiagram=this.config.diagram??demoDiagram();
    return html`<ha-card>
      ${this.config.title?html`<h3>${this.config.title}</h3>`:''}
      ${renderDiagram({diagram:d,hass:this.hass,instanceId:this.instanceId,animate:this.config.animation!==false})}
      <div class="upfc-flow-legend">
        <span><i class="upfc-dot" style="background:#f8b84e"></i>AC</span>
        <span><i class="upfc-dot" style="background:#e94848"></i>DC+</span>
        <span><i class="upfc-dot" style="background:#555b67"></i>DC−</span>
        <span><i class="upfc-dot" style="background:#41a7db"></i>Control</span>
        <span>— no sensor data</span>
      </div>
    </ha-card>`;
  }
  public getCardSize():number{return 5;}
}
declare global {interface Window {customCards?:Array<{type:string;name:string;description:string;preview:boolean;configurable:boolean}>}}
window.customCards=window.customCards??[];
if(!window.customCards.some(c=>c.type==='universal-power-flow-card')){
  window.customCards.push({type:'universal-power-flow-card',name:'Universal Power Flow Card',
    description:'Drag-and-drop AC/DC topology designer for Home Assistant',preview:true,configurable:true});
}
console.info('%c Universal Power Flow Card 0.1.0 ','background:#15517b;color:white;font-weight:bold');
