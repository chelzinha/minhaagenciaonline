/*
  AGF Address Service - configuração compartilhada do front-end.
  Depois de publicar o Apps Script como Web App, cole a URL em serviceUrl.
*/
window.AGF_ADDRESS_CONFIG = {
  serviceUrl: "https://script.google.com/macros/s/AKfycbwo2YSCwq7pyxy3Lq1wOOUtmDX-jDXHcIYib4xgEAMM2Ia5K9FaPwkWe6VAfb5LROjM/exec", 
  defaultUf: "CE",
  defaultCidade: "Fortaleza",
  timeoutMs: 90000,
  debounceMs: 280,
  minAddressChars: 3,
  maxResults: 30,
  appName: "AGF Consulta CEP"
};
