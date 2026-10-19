import {HassLike} from './render';
export type SensorKind='power'|'soc'|'voltage'|'current'|'energy'|'any';
export interface EntityOption {id:string;label:string;state:string;unit:string;score:number}
const classes:Record<Exclude<SensorKind,'any'>,string[]>={
 power:['power'],soc:['battery','battery_level'],voltage:['voltage'],current:['current'],energy:['energy','energy_storage']
};
const units:Record<Exclude<SensorKind,'any'>,string[]>={
 power:['w','kw','mw'],soc:['%'],voltage:['v','mv'],current:['a','ma'],energy:['wh','kwh','mwh']
};
export function powerUnit(unit:string):boolean{return ['w','kw','mw'].includes(unit.trim().toLowerCase());}
export function filteredEntities(hass:HassLike|undefined,kind:SensorKind,query:string,limit=15):EntityOption[]{
 if(!hass?.states)return [];
 const q=query.trim().toLocaleLowerCase();
 const keys=q.split(/\s+/).filter(Boolean);
 const options:EntityOption[]=[];
 for(const [id,state] of Object.entries(hass.states)){
   // Typed filters prefer sensors; expanded search can find input_number and other
   // numeric entities used by custom integrations as power signals.
   if(kind!=='any'&&!id.startsWith('sensor.'))continue;
   const attrs=state.attributes??{};
   const unit=String(attrs.unit_of_measurement??'');
   const label=String(attrs.friendly_name??id);
   const dc=String(attrs.device_class??'').toLowerCase();
   const name=(label+' '+id).toLocaleLowerCase();
   const u=unit.toLowerCase().trim();
   const typeMatched=kind==='any'||classes[kind].includes(dc)||units[kind].includes(u)||
      (kind==='power'&&/(^|_|\s)(power|watt|battery_power|charge_power|discharge_power)(_|\s|$)/.test(name))||
      (kind==='soc'&&/(^|_|\s)(soc|state_of_charge|battery_level)(_|\s|$)/.test(name));
   if(!typeMatched)continue;
   if(!keys.every(token=>name.includes(token)))continue;
   const matchedClass=kind!=='any'&&classes[kind].includes(dc);
   const matchedUnit=kind!=='any'&&units[kind].includes(u);
   const exactId=id.toLowerCase()===q;
   options.push({id,label,state:state.state,unit,score:(exactId?100:0)+(matchedClass?20:0)+(matchedUnit?10:0)});
 }
 options.sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label)||a.id.localeCompare(b.id));
 return options.slice(0,Math.max(1,Math.min(100,limit)));
}
