import {LitElement,html,nothing,css} from 'lit';
import {customElement,property,state} from 'lit/decorators.js';
import type {HassLike} from './render';
import {filteredEntities,SensorKind,EntityOption} from './entities';

/** Dedicated picker: HA parent/editor re-renders do not reset typing or focus. */
@customElement('upfc-entity-picker')
export class UpfcEntityPicker extends LitElement{
  static styles=css`
    :host{display:block;position:relative;min-width:0;margin:4px 0 12px}
    input{box-sizing:border-box;width:100%;padding:9px;border:1px solid var(--divider-color,#617584);
      background:var(--card-background-color,#21313d);color:var(--primary-text-color,#eee);
      border-radius:6px;font:inherit}
    input:focus{outline:2px solid var(--primary-color,#08a9e4);outline-offset:1px}
    .heading{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:4px 0;font-size:12px}
    .heading span{opacity:.8}
    .selected{display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap;font-size:12px}
    .selected code{font-size:12px;overflow-wrap:anywhere}
    .selected button,.mode{border:1px solid var(--divider-color,#667582);
      color:var(--primary-text-color,#eee);background:transparent;border-radius:5px;padding:4px 7px;cursor:pointer}
    .selected button{color:var(--error-color,#ef7474)}
    .results{border:1px solid var(--primary-color,#148ac4);border-radius:5px;
      max-height:250px;overflow-y:auto;margin-top:4px;background:var(--card-background-color,#1c2e38)}
    .result{width:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;
      gap:10px;padding:8px 7px;border:0;border-bottom:1px solid var(--divider-color,#485b6a);
      color:var(--primary-text-color,#eee);background:transparent;text-align:left;cursor:pointer}
    .result:hover,.result:focus{background:var(--primary-color,#1476ab);outline:none}
    .result span{min-width:0;overflow-wrap:anywhere;font-size:12px}
    .result small{display:block;opacity:.75;font-size:10px}
    .result strong{flex-shrink:0;font-size:12px}
    .message{font-size:12px;opacity:.8;padding:6px}
    .mode{font-size:11px}
  `;
  @property({attribute:false}) hass?:HassLike;
  @property({type:String}) kind:SensorKind='power';
  @property({type:String}) value='';
  @property({type:String}) fieldKey='';
  @state() private search='';
  @state() private focused=false;
  @state() private showAll=false;
  private lastKey='';
  protected willUpdate():void{
    if(this.fieldKey!==this.lastKey){
      this.lastKey=this.fieldKey;
      this.search='';
      this.focused=false;
      this.showAll=false;
    }
  }
  private choose(value:string):void{
    this.focused=false;
    this.search='';
    this.dispatchEvent(new CustomEvent('entity-selected',{detail:{value},bubbles:true,composed:true}));
  }
  private get candidates():EntityOption[]{
    // Always offer visible discovery even without a search query. Expand to all
    // sensors when device_class/unit metadata are missing on custom integrations.
    return filteredEntities(this.hass,this.showAll?'any':this.kind,this.search,25);
  }
  private onKeyDown(e:KeyboardEvent):void{
    if(e.key==='Escape'){this.focused=false;return;}
    if(e.key==='Enter'){
      e.preventDefault();
      const first=this.candidates[0];
      const raw=this.search.trim();
      this.choose(first?.id??(raw.includes('.')?raw:this.value));
    }
  }
  protected render(){
    const matches=this.candidates;
    const current=this.value?this.hass?.states?.[this.value]:undefined;
    const unit=String(current?.attributes?.unit_of_measurement??'');
    const display=String(current?.attributes?.friendly_name??this.value??'');
    const showResults=this.focused;
    return html`
      <div class="heading">
        <span>${this.kind==='power'?'Мощность (W / kW / MW)':this.kind==='soc'?'Заряд батареи (%)':
          this.kind==='voltage'?'Напряжение':this.kind==='current'?'Ток':
          this.kind==='energy'?'Энергия':'Сущность Home Assistant'}</span>
        <button type="button" class="mode" @click=${()=>{this.showAll=!this.showAll;this.focused=true;}}>
          ${this.showAll?'✓ Все датчики':'Показать все сенсоры'}
        </button>
      </div>
      ${this.value?html`<div class="selected">
        <code title="${display}">${this.value}</code>
        <span>${current?`${current.state} ${unit}`:'нет данных / сущность не найдена'}</span>
        <button type="button" @click=${()=>this.choose('')}>✕</button>
      </div>`:nothing}
      <input type="search" autocomplete="off" spellcheck="false" aria-label="Поиск сущности Home Assistant"
        placeholder="🔎 Начните вводить название или entity_id"
        .value=${this.search}
        @focus=${()=>this.focused=true}
        @input=${(ev:Event)=>{this.search=(ev.currentTarget as HTMLInputElement).value;this.focused=true;}}
        @keydown=${(ev:KeyboardEvent)=>this.onKeyDown(ev)}/>
      ${showResults?html`<div class="results" role="listbox">
        ${matches.length?matches.map(item=>html`<button class="result" type="button" role="option"
          aria-selected="${item.id===this.value}" @click=${()=>this.choose(item.id)}>
          <span>${item.label}<small>${item.id}</small></span>
          <strong>${item.state} ${item.unit}</strong>
        </button>`):
        html`<p class="message">Нет подходящих сенсоров. Включите «Показать все сенсоры» или введите entity_id целиком и нажмите Enter.</p>`}
        ${this.search.includes('.')?html`<button class="result" type="button"
          @click=${()=>this.choose(this.search.trim())}>Использовать вручную: ${this.search.trim()}</button>`:nothing}
      </div>`:nothing}
    `;
  }
}
