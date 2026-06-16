import { APP_CONFIG } from '../js/config.js';
const listeners = new Set();
const defaultState = { unit:null, user:null, availability:[], currentEtiqueta:null, currentForm:null, currentSuccess:null };
let state = {
  ...defaultState,
  unit: JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.UNIT) || 'null'),
  user: JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.USER) || 'null'),
  currentForm: JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.FLOW) || 'null')
};
function notify(){ listeners.forEach(fn=>{ try{fn(state)}catch(e){console.error(e)} }) }
export const Store = {
  getState(){ return state; },
  subscribe(fn){ listeners.add(fn); return ()=>listeners.delete(fn); },
  setUnit(unit, availability=[]){ state={...state, unit, availability}; localStorage.setItem(APP_CONFIG.STORAGE_KEYS.UNIT, JSON.stringify(unit)); notify(); },
  setUser(user){ state={...state, user}; localStorage.setItem(APP_CONFIG.STORAGE_KEYS.USER, JSON.stringify(user)); notify(); },
  setEtiqueta(etiqueta){ state={...state, currentEtiqueta:etiqueta}; notify(); },
  setForm(form){ state={...state, currentForm:form}; localStorage.setItem(APP_CONFIG.STORAGE_KEYS.FLOW, JSON.stringify(form)); notify(); },
  setSuccess(data){ state={...state, currentSuccess:data}; notify(); },
  logoutUser(){ state={...state, user:null, currentEtiqueta:null, currentForm:null, currentSuccess:null}; localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.USER); localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.FLOW); notify(); },
  clearSession(){ state={...defaultState}; localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.UNIT); localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.USER); localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.FLOW); notify(); }
};
