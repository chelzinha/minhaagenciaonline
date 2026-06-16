function logoValue(unit = {}) {
  return String(
    unit.logo_unidade_url || unit.logoUnidadeUrl || unit.logo_url || unit.logoUrl || unit.url_logo_unidade || unit.urlLogoUnidade || unit.url_logo || unit.urlLogo || unit.logo_marca_url || unit.logoMarcaUrl || unit.unidade_logo_url || unit.unidadeLogoUrl || unit.logo_unidade || unit.logoUnidade || unit.imagem_logo || unit.imagemLogo || unit.logo || ''
  ).trim();
}

export function getUnitLogo(unit = {}) {
  const value = logoValue(unit);
  return /^(data:image\/|https?:\/\/|\.\/|\/)/i.test(value) ? value : '';
}

export function renderUnitBrandTitle(target, unit = {}, options = {}) {
  if (!target) return;
  const name = unit.nome_unidade || 'Unidade';
  const logo = getUnitLogo(unit);
  target.classList.toggle('has-unit-logo', Boolean(logo));
  target.setAttribute('aria-label', name);
  if (logo) {
    target.innerHTML = `<img src="${logo.replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[m]))}" alt="${name.replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[m]))}" class="unit-logo-title-img ${options.imgClass || ''}">`;
  } else {
    target.textContent = name;
  }
}
