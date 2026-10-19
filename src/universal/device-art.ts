import {svg} from 'lit';

/** All drawings are native inline SVG: scalable, theme-aware and offline. */
export const SVG_MODELS:Record<string,string>={
  hybrid_inverter:'Hybrid inverter · cabinet',
  power_inverter:'Inverter · wall unit',
  battery_rack:'Battery · telecom rack',
  battery_cell:'Battery · module',
  rectifier_rack:'AC/DC · rectifier shelf',
  rectifier_box:'AC/DC · power converter',
  dc_busbar:'DC bus · busbar',
  ac_bus:'AC distribution · breaker panel',
  pv_panels:'Solar · PV array',
  genset:'Diesel generator',
  grid_tower:'Electric utility',
  telecom_server:'Telecom rack / server',
  generic:'Generic device',
};
export function defaultModel(type:string):string {
  return ({
    inverter:'hybrid_inverter',battery:'battery_rack',rectifier:'rectifier_rack',
    dc_bus:'dc_busbar',ac_bus:'ac_bus',solar:'pv_panels',generator:'genset',
    grid:'grid_tower',ac_load:'telecom_server',dc_load:'telecom_server',
  } as Record<string,string>)[type]??'generic';
}
/** SVG artwork is rendered INSIDE the existing device rect, not fetched remotely. */
export function drawDeviceModel(model:string){
  switch(model){
  case 'hybrid_inverter':return svg`
    <rect x="18" y="5" width="64" height="74" rx="7" fill="#283c48" stroke="#a4c3d4" stroke-width="3"/>
    <rect x="27" y="13" width="46" height="28" rx="3" fill="#132a37" stroke="#55b2d7"/>
    <path d="M31 29 Q37 17 43 29 T56 29 T69 29" stroke="#74dfbf" stroke-width="3" fill="none"/>
    <circle cx="67" cy="51" r="4" fill="#67cf81"/><circle cx="54" cy="51" r="4" fill="#e9ba56"/>
    <path d="M27 64h46M36 72h28" stroke="#7294a9" stroke-width="3"/>
  `;
  case 'power_inverter':return svg`
    <rect x="9" y="12" width="82" height="62" rx="12" fill="#2c4552" stroke="#bfd0d8" stroke-width="3"/>
    <circle cx="38" cy="44" r="20" fill="#172c36" stroke="#6aa5c2" stroke-width="3"/>
    <path d="M23 44q7-17 15 0t15 0" fill="none" stroke="#7bd3ab" stroke-width="3"/>
    <path d="M66 36h16M66 45h16M66 54h16" stroke="#88abba" stroke-width="3"/>
  `;
  case 'battery_rack':return svg`
    <rect x="21" y="5" width="58" height="76" rx="4" fill="#243a46" stroke="#aabfc9" stroke-width="3"/>
    ${[0,1,2,3].map(i=>svg`<g>
      <rect x="28" y="${12+i*16}" width="44" height="13" rx="2" fill="#142832" stroke="#627e8e"/>
      <circle cx="35" cy="${18+i*16}" r="2" fill="#65cba2"/>
      <path d="M44 ${18+i*16}h19" stroke="#739caf" stroke-width="2"/>
    </g>`)}
    <path d="M46 76h8" stroke="#7c96a3" stroke-width="2"/>
  `;
  case 'battery_cell':return svg`
    <rect x="18" y="20" width="64" height="49" rx="5" stroke="#accbd3" stroke-width="3" fill="#274650"/>
    <rect x="40" y="14" width="20" height="7" rx="2" fill="#7ea3b3"/>
    <rect x="26" y="28" width="48" height="33" rx="3" fill="#122b37"/>
    <path d="M37 45h26M50 32v25" stroke="#77dda8" stroke-width="4"/>
  `;
  case 'rectifier_rack':return svg`
    <rect x="9" y="12" width="82" height="65" rx="5" fill="#2c414c" stroke="#a5c0ce" stroke-width="3"/>
    ${[0,1,2].map(i=>svg`<g><rect x="16" y="${19+18*i}" width="68" height="14" rx="2" fill="#132b37" stroke="#648da3"/>
      <path d="M22 ${26+18*i}h37" stroke="#7596a6" stroke-width="2"/>
      <circle cx="72" cy="${26+18*i}" r="3" fill="#69ce87"/></g>`)}
  `;
  case 'rectifier_box':return svg`
    <rect x="10" y="14" width="80" height="57" rx="8" stroke="#aac7d2" fill="#28434f" stroke-width="3"/>
    <path d="M18 43h22m-8-9 8 9-8 9M60 35v18m-9-9h18" fill="none" stroke="#f2c567" stroke-width="4" stroke-linecap="round"/>
    <path d="M53 58h14" stroke="#77debd" stroke-width="3"/>
  `;
  case 'dc_busbar':return svg`
    <rect x="8" y="10" width="84" height="66" rx="4" stroke="#839fae" stroke-width="2" fill="#203844"/>
    <path d="M21 29h58" stroke="#e65457" stroke-width="8" stroke-linecap="round"/>
    <path d="M21 56h58" stroke="#596778" stroke-width="8" stroke-linecap="round"/>
    ${[0,1,2,3].map(i=>svg`<g><circle cx="${25+i*16}" cy="29" r="4" fill="#f1a0a1"/>
      <circle cx="${25+i*16}" cy="56" r="4" fill="#b4b7be"/></g>`)}
  `;
  case 'ac_bus':return svg`
    <rect x="14" y="8" width="72" height="70" rx="5" stroke="#9fbdce" fill="#283c47" stroke-width="3"/>
    ${[0,1,2].map(i=>svg`<g><rect x="${22+i*21}" y="18" width="17" height="48" rx="2" fill="#112632" stroke="#6b899b"/>
      <path d="M${30+i*21} 26v13" stroke="#f4c05e" stroke-width="3"/>
      <circle cx="${30+i*21}" cy="53" r="3" fill="#6ec9a8"/></g>`)}
  `;
  case 'pv_panels':return svg`
    <path d="M12 18h76l-8 50H20z" fill="#183e61" stroke="#8cc3e1" stroke-width="3"/>
    <path d="M16 42h67M36 18l-6 50M59 18l-2 50" stroke="#9ccde7" stroke-width="2"/>
    <path d="M33 77h34M50 68v9" stroke="#a6b5c0" stroke-width="3"/>
  `;
  case 'genset':return svg`
    <rect x="10" y="25" width="80" height="39" rx="5" fill="#3d4951" stroke="#abc2d0" stroke-width="3"/>
    <circle cx="39" cy="44" r="12" fill="#152e38" stroke="#67b6d0" stroke-width="3"/>
    <path d="M28 44q6-10 11 0t11 0" stroke="#e8c46f" fill="none" stroke-width="2"/>
    <path d="M65 35h16M65 44h16M65 53h16M22 64v9m57-9v9" stroke="#869eaa" stroke-width="3"/>
  `;
  case 'grid_tower':return svg`
    <path d="M50 7 26 75h48L50 7ZM33 54h34M38 41h24M43 27h14M15 29h70M8 42h84" stroke="#aac3d2" stroke-width="3" fill="none"/>
    <path d="M15 29l20 12m50-12L65 41" stroke="#f0bd54" stroke-width="2"/>
  `;
  case 'telecom_server':return svg`
    <rect x="20" y="5" width="60" height="75" rx="4" fill="#2b404d" stroke="#a7bac4" stroke-width="3"/>
    ${[0,1,2,3].map(i=>svg`<g>
      <rect x="26" y="${11+i*16}" width="48" height="13" rx="2" fill="#102532" stroke="#66869a"/>
      <circle cx="33" cy="${17+i*16}" r="2.5" fill="#5dddaf"/>
      <path d="M43 ${17+i*16}h22" stroke="#7495a8" stroke-width="2"/></g>`)}
  `;
  default:return svg`
    <rect x="19" y="12" width="62" height="61" rx="9" stroke="#a4c5d6" stroke-width="3" fill="#2b414f"/>
    <circle cx="50" cy="43" r="19" stroke="#6fbbda" stroke-width="3" fill="none"/>
    <path d="M43 43h14M50 36v14" stroke="#8cdec3" stroke-width="4"/>
  `;
  }
}
