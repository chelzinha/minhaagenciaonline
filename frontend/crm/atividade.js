/**
 * Tela da atividade (modal #activityModal) - v2, 03/10/2026.
 *
 * Layout desktop em 2 colunas, com cabeçalho e rodapé fixos:
 * - Esquerda (preparar): roteiro e texto sugerido (editável, com Copiar e Enviar no WhatsApp), cliente (Visão 360) e materiais.
 * - Direita (registrar): abas Concluir, Checklist Correios e Anotações.
 * No celular vira uma coluna só.
 *
 * O app.js continua dono dos dados e dos formulários (mesmos IDs e handlers).
 * Este arquivo só desenha cabeçalho, roteiro e cliente, e controla as abas.
 * Dados do cliente (gráfico e números) vêm de window.CRM_CIX (crm-integrado.js); sem ele, o card mostra só o cadastro.
 */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = (v) => String(v ?? '').trim();
  const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const num = (v) => Number(v) || 0;
  const MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const ICONES = { ATV_VISITA: 'directions_walk', ATV_LIGACAO: 'call', ATV_WHATSAPP: 'chat', ATV_EMAIL: 'mail', ATV_REUNIAO_ONLINE: 'videocam', ATV_PROPOSTA: 'description', ATV_RETORNO: 'reply', ATV_TREINAMENTO: 'school', ATV_REUNIAO_INTERNA: 'groups' };
  const STATUS = { plan: ['Planejada', 'st-plan', 'hourglass_empty'], late: ['Atrasada', 'st-late', 'schedule'], done: ['Concluída', 'st-done', 'task_alt'], cancel: ['Cancelada', 'st-cancel', 'block'] };
  const PRIO = { CRITICA: 'Crítica', ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' };
  const MARCA_TEXTO = 'Texto pronto (WhatsApp):';

  const brl = (v) => 'R$ ' + num(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const brlK = (v) => { v = num(v); return v >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi' : v >= 1e4 ? 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : brl(v); };
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const agoraHm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const dataObj = (v) => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const ddmm = (v) => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}` : ''; };
  const hm = (v) => { const m = String(v || '').match(/(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; };
  const diasEntre = (a, b) => { const x = dataObj(a), y = dataObj(b); return x && y ? Math.round((y - x) / 864e5) : null; };
  const digitos = (v) => { let d = String(v ?? '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return d; };
  const fone = (v) => { const d = String(v || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d; };
  const waUrl = (numero, msg) => { const d = digitos(numero); if (!d) return ''; const t = msg ? encodeURIComponent(msg) : ''; return MOBILE ? `https://wa.me/${d}${t ? '?text=' + t : ''}` : `https://web.whatsapp.com/send?phone=${d}${t ? '&text=' + t : ''}`; };
  const ms = (n) => `<span class="material-symbols-rounded" aria-hidden="true">${n}</span>`;

  let atual = null;   // { item, ent, opts }
  let avisar = (m, erro) => { if (erro) console.warn(m); };

  /* ---------------- regras ---------------- */
  function statusDe(item) {
    const s = norm(item.statusAtividade);
    if (s.startsWith('conclu')) return 'done';
    if (s.startsWith('cancel')) return 'cancel';
    const h = hoje(), d = text(item.dataProgramada);
    if (d && (d < h || (d === h && item.horaFimProgramada && hm(item.horaFimProgramada) < agoraHm()))) return 'late';
    return 'plan';
  }
  /** Observação planejada -> { plano, canal, texto, livre }. Formato da carga do Plano Comercial; qualquer outro texto vira "livre". */
  function roteiroDe(item) {
    const st = statusDe(item);
    const raw = text(item.obsPlanejada) || (st === 'done' ? '' : text(item.observacao));
    if (!raw) return null;
    const i = raw.indexOf(MARCA_TEXTO);
    const cab = (i >= 0 ? raw.slice(0, i) : raw).split('\n').map(text).filter(Boolean);
    const r = { plano: '', canal: '', texto: i >= 0 ? raw.slice(i + MARCA_TEXTO.length).trim() : '', livre: '' };
    const resto = [];
    cab.forEach((l) => {
      if (/^Plano Comercial/i.test(l)) r.plano = l.replace(/^Plano Comercial AGF\s*[\d/]*\s*·\s*/i, '');
      else if (/^Canal:/i.test(l)) r.canal = l.replace(/^Canal:\s*/i, '');
      else resto.push(l);
    });
    r.livre = i >= 0 || r.plano || r.canal ? resto.join('\n') : raw;
    return r;
  }
  /** Troca o que o sistema já sabe: [Seu nome] = responsável; [Nome] = pessoa de contato do cadastro. */
  function preencher(t, item, ent) {
    let s = String(t || '');
    const eu = text(atual && atual.opts && atual.opts.eu) || text(item.responsavelNome);
    if (eu) s = s.replace(/\[Seu nome\]/gi, eu);
    const contato = text(ent.pessoaContato || ent.contato).split(/\s+/)[0];
    if (contato) s = s.replace(/\[Nome\]/g, contato.charAt(0).toUpperCase() + contato.slice(1).toLowerCase());
    return s;
  }
  const pendencias = (s) => Array.from(new Set(String(s || '').match(/\[[^\]\n]{1,30}\]/g) || []));

  /* ---------------- cabeçalho ---------------- */
  function cabecalho(item, ent) {
    const st = statusDe(item), [stTxt, stCls, stIc] = STATUS[st];
    const cor = text(item.cor) || '#2F6FDB';
    const fant = text(ent.nomeFantasia), razao = text(item.titulo) || text(item.cliente) || 'Atividade';
    const titulo = item.avulsa ? razao : (fant || razao);
    const local = text(ent.local || item.local);
    const sub = item.avulsa ? 'Atividade avulsa, sem cliente vinculado'
      : [fant && norm(fant) !== norm(razao) ? razao : '', local ? 'LOCAL ' + local : ''].filter(Boolean).join(' · ');
    const ico = $('#activityTypeIcon');
    ico.style.setProperty('--atv-c', cor);
    ico.style.setProperty('--atv-bg', cor + '1F');
    ico.innerHTML = ms(text(item.icone) || ICONES[text(item.tipoAtividadeId)] || 'event');
    const h = $('#activityTitle'); h.textContent = titulo; h.title = titulo;
    $('#activitySub').textContent = sub;
    const d = dataObj(item.dataProgramada);
    const quando = d ? `${DIAS[d.getDay()]} ${ddmm(item.dataProgramada)}` : 'Sem data';
    const hora = hm(item.horaProgramada) ? `${hm(item.horaProgramada)}${hm(item.horaFimProgramada) ? ' - ' + hm(item.horaFimProgramada) : ''}` : '';
    const pr = norm(item.prioridade).toUpperCase().replace(/\s+/g, '');
    $('#activityChips').innerHTML = [
      `<span class="atv-chip tipo" style="--c:${esc(cor)}">${ms(text(item.icone) || ICONES[text(item.tipoAtividadeId)] || 'event')}${esc(item.tipoAtividadeNome || item.tipoAtividadeId)}</span>`,
      `<span class="atv-chip">${ms('calendar_today')}${esc(quando)}${hora ? ' · ' + esc(hora) : ''}</span>`,
      `<span class="atv-chip ${stCls}">${ms(stIc)}${stTxt}</span>`,
      PRIO[pr] ? `<span class="atv-chip pr-${pr}">${ms('flag')}Prioridade ${PRIO[pr]}</span>` : '',
      text(item.responsavelNome) ? `<span class="atv-chip">${ms('person')}${esc(item.responsavelNome)}</span>` : '',
    ].join('');
    // contato rápido
    const wa = text(ent.whatsapp) || text(item.whatsapp), tel = text(ent.telefone) || wa;
    const acts = [];
    if (!item.avulsa) {
      const u = waUrl(wa);
      acts.push(u ? `<a class="atv-btn wa" href="${esc(u)}" target="_blank" rel="noopener" title="Abrir conversa: ${esc(fone(wa))}">${ms('chat')}<span class="lbl">WhatsApp</span></a>`
        : `<span class="atv-btn off" title="Sem WhatsApp no cadastro">${ms('chat')}<span class="lbl">Sem WhatsApp</span></span>`);
      if (tel) acts.push(`<a class="atv-btn" href="tel:+${esc(digitos(tel))}" title="Ligar">${ms('call')}<span class="lbl">${esc(fone(tel))}</span></a>`);
      if (atual.opts.abrirFicha && text(item.entidadeId)) acts.push(`<button type="button" class="atv-btn" data-atv-ficha>${ms('id_card')}<span class="lbl">Ficha</span></button>`);
    }
    $('#activityQuick').innerHTML = acts.join('');
  }

  /* ---------------- roteiro e texto sugerido ---------------- */
  function roteiro(item, ent) {
    const card = $('#activityScriptCard'), box = $('#activityScript'), r = roteiroDe(item);
    const exec = text(item.obsExecucao) || (statusDe(item) === 'done' ? text(item.observacao) : '');
    if (!r && !exec) {
      card.classList.toggle('hidden', !!item.avulsa);
      $('#activityScriptTag').textContent = '';
      box.innerHTML = '<p class="atv-empty">Nenhum roteiro planejado para esta atividade. Use as anotações para registrar o combinado.</p>';
      return;
    }
    card.classList.remove('hidden');
    $('#activityScriptTag').textContent = r && r.plano ? r.plano : '';
    const partes = [];
    if (r && r.canal) partes.push(`<div class="atv-meta">${ms('alt_route')}<span>Canal: <b>${esc(r.canal)}</b></span></div>`);
    if (r && r.livre) partes.push(`<p class="atv-pre">${esc(r.livre)}</p>`);
    if (r && r.texto) {
      const t = preencher(r.texto, item, ent);
      const wa = text(ent.whatsapp) || text(item.whatsapp);
      partes.push(`<label class="atv-lbl" for="activityScriptText">Texto sugerido <small>pode ajustar antes de enviar</small></label>
        <textarea id="activityScriptText" class="atv-text" spellcheck="true">${esc(t)}</textarea>
        <div id="activityScriptWarn" class="atv-warn hidden" role="status"></div>
        <div class="atv-row">
          <button type="button" class="atv-btn pri" data-atv-copiar>${ms('content_copy')}Copiar texto</button>
          ${wa ? `<button type="button" class="atv-btn wa" data-atv-enviar>${ms('send')}Enviar no WhatsApp</button>` : `<span class="atv-btn off" title="Cadastre o WhatsApp do cliente para enviar daqui">${ms('send')}Sem WhatsApp</span>`}
          <button type="button" class="atv-btn ghost" data-atv-restaurar title="Voltar ao texto original do plano">${ms('restart_alt')}Restaurar</button>
        </div>`);
    }
    if (exec) partes.push(`<div class="atv-exec"><small>Registro da execução</small><p class="atv-pre">${esc(exec)}</p></div>`);
    box.innerHTML = partes.join('');
    avisoPendencias();
  }
  function avisoPendencias() {
    const ta = $('#activityScriptText'), w = $('#activityScriptWarn');
    if (!ta || !w) return;
    const p = pendencias(ta.value);
    w.classList.toggle('hidden', !p.length);
    w.innerHTML = p.length ? `${ms('edit_note')}<span>Complete antes de enviar: <b>${p.map(esc).join(', ')}</b></span>` : '';
  }
  async function copiar(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } ta.remove(); return ok;
    }
  }

  /* ---------------- cliente (Visão 360) ---------------- */
  function barras(meses, baseIni, mesParcial, v) {
    const max = Math.max(1, ...v.map(num));
    return `<div class="atv-bars" style="grid-template-columns:repeat(${meses.length || 12},minmax(0,1fr))" role="img" aria-label="Faturamento por mês">${meses.map((m, i) => {
      const semBase = baseIni && m < baseIni, val = num(v[i]);
      const [, mm] = String(m).split('-'), lbl = MESES[Number(mm) - 1] || '';
      const cls = semBase ? 'sb' : !val ? 'zero' : m === mesParcial ? 'parc' : 'ok';
      const alt = cls === 'ok' || cls === 'parc' ? Math.max(4, Math.round((val / max) * 100)) : 0;
      const dica = semBase ? 'sem base' : val ? brl(val) + (m === mesParcial ? ' (parcial)' : '') : 'sem postagem';
      return `<div class="b ${cls}" title="${lbl}/${String(m).slice(2, 4)}: ${dica}"><span class="c"><i style="height:${alt}%"></i></span><small>${lbl.charAt(0).toUpperCase() + lbl.slice(1, 3)}</small></div>`;
    }).join('')}</div>`;
  }
  function cliente(item, ent) {
    const card = $('#activityContextCard'), box = $('#activityContext');
    if (item.avulsa || !text(item.entidadeId)) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    const cix = atual.opts.resumoCliente ? atual.opts.resumoCliente(item.entidadeId) : null;
    const r = cix && cix.r;
    const tags = [];
    const abc = r && r.abc; if (abc) tags.push(`<span class="atv-tag abc-${esc(abc)}">Curva ${esc(abc)}</span>`);
    const acao = text(ent.acaoEngine || ent.acao || (r && r.acao)); if (acao) tags.push(`<span class="atv-tag">${esc(acao.charAt(0) + acao.slice(1).toLowerCase())}</span>`);
    const ctr = r ? r.contrato : norm(ent.temContrato) === 'sim';
    tags.push(`<span class="atv-tag ${ctr ? 'ok' : 'warn'}">${ctr ? 'Com contrato' : 'Sem contrato'}</span>`);
    const inter = text((r && r.intermediador) || ent.intermediador); if (inter && norm(inter) !== 'sem contrato') tags.push(`<span class="atv-tag">${esc(inter)}</span>`);
    if (r && r.grupoN > 1) tags.push(`<span class="atv-tag">Grupo · ${r.grupoN} cadastros</span>`);
    if (r && r.novo) tags.push('<span class="atv-tag novo">Novo</span>');
    const tagsHtml = `<div class="atv-tags">${tags.join('')}</div>`;
    if (!r) {
      if (cix && !cix.pronto && atual.opts.aguardarCurva) {
        box.innerHTML = tagsHtml + '<p class="atv-empty">Carregando postagens do Visão 360…</p>';
        const id = item.agendaId;
        atual.opts.aguardarCurva().then(() => { if (atual && atual.item.agendaId === id && aberto()) cliente(atual.item, atual.ent); }).catch(() => {});
        return;
      }
      box.innerHTML = tagsHtml + (atual.opts.resumoCliente ? '<p class="atv-empty">Sem postagens nos últimos 12 meses neste LOCAL.</p>' : '<p class="atv-empty">Gráfico de postagens disponível no CRM integrado.</p>');
      return;
    }
    const meses = cix.meses || [], v = r.v || [], parc = cix.mesParcial;
    // último mês fechado e média dos meses anteriores com postagem (desde a base)
    let iF = meses.length - 1; if (meses[iF] === parc) iF--;
    const ini = meses.findIndex((m, i) => (!cix.baseIni || m >= cix.baseIni) && num(v[i]) > 0);
    const ant = ini >= 0 && iF > ini ? v.slice(ini, iF).map(num) : [];
    const med = ant.length ? ant.reduce((a, b) => a + b, 0) / ant.length : 0;
    const fech = iF >= 0 ? num(v[iF]) : 0;
    const varPct = med ? (fech - med) / med : null;
    const [, mF] = String(meses[iF] || '').split('-');
    const dias = r.ultima ? diasEntre(r.ultima, hoje()) : null;
    box.innerHTML = `${tagsHtml}
      <div class="atv-kpis">
        <div class="atv-kpi"><small>Faturamento 12M</small><b>${brlK(r.tV)}</b></div>
        <div class="atv-kpi"><small>${MESES[Number(mF) - 1] ? MESES[Number(mF) - 1].charAt(0).toUpperCase() + MESES[Number(mF) - 1].slice(1) + ' (fechado)' : 'Último mês'}</small><b>${brlK(fech)}</b></div>
        <div class="atv-kpi"><small>vs. média anterior</small><b class="${varPct == null ? '' : varPct >= 0.05 ? 'up' : varPct <= -0.05 ? 'down' : ''}">${varPct == null ? '-' : (varPct > 0 ? '+' : '') + Math.round(varPct * 100) + '%'}</b></div>
        <div class="atv-kpi"><small>Última postagem</small><b>${r.ultima ? ddmm(r.ultima) : '-'}</b>${dias != null ? `<em class="${dias >= 30 ? 'down' : ''}">há ${dias} dia${dias === 1 ? '' : 's'}</em>` : ''}</div>
      </div>
      ${barras(meses, cix.baseIni, parc, v)}
      <p class="atv-foot-note">Média anterior: ${brl(med)}/mês. Mês ${parc ? 'atual parcial em tom claro' : 'atual fechado'}. Barra vermelha: mês sem postagem.</p>`;
  }

  /* ---------------- abas ---------------- */
  function aba(nome) {
    $$('#activityModal [data-atv-tab]').forEach((b) => { const on = b.dataset.atvTab === nome; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $$('#activityModal [data-atv-pane]').forEach((p) => p.classList.toggle('active', p.dataset.atvPane === nome));
  }
  const aberto = () => { const m = $('#activityModal'); return m && !m.classList.contains('hidden'); };

  /* ---------------- eventos (uma vez) ---------------- */
  function ligar() {
    const m = $('#activityModal');
    if (!m || m._atvLigado) return;
    m._atvLigado = true;
    m.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-atv-tab],[data-atv-copiar],[data-atv-enviar],[data-atv-restaurar],[data-atv-ficha]');
      if (!b || !atual) return;
      if (b.dataset.atvTab) { aba(b.dataset.atvTab); return; }
      const ta = $('#activityScriptText');
      if (b.hasAttribute('data-atv-copiar')) {
        const ok = ta && await copiar(ta.value);
        avisar(ok ? (pendencias(ta.value).length ? 'Texto copiado. Lembre de completar os campos entre colchetes.' : 'Texto copiado.') : 'Não foi possível copiar. Selecione o texto e copie manualmente.', !ok);
        return;
      }
      if (b.hasAttribute('data-atv-enviar')) {
        if (!ta) return;
        const p = pendencias(ta.value);
        if (p.length && !confirm(`O texto ainda tem campos para completar: ${p.join(', ')}.\n\nEnviar assim mesmo?`)) { ta.focus(); return; }
        const u = waUrl(text(atual.ent.whatsapp) || text(atual.item.whatsapp), ta.value);
        if (u) window.open(u, '_blank', 'noopener');
        return;
      }
      if (b.hasAttribute('data-atv-restaurar')) { const r = roteiroDe(atual.item); if (ta && r) { ta.value = preencher(r.texto, atual.item, atual.ent); avisoPendencias(); } return; }
      if (b.hasAttribute('data-atv-ficha') && atual.opts.abrirFicha) { atual.opts.abrirFicha(atual.item.entidadeId); }
    });
    m.addEventListener('input', (e) => { if (e.target && e.target.id === 'activityScriptText') avisoPendencias(); });
    // Concluir fica no rodapé: leva para a aba Concluir antes da validação do formulário
    const btn = $('#completeActivityBtn');
    if (btn) btn.addEventListener('click', () => aba('concluir'));
  }

  /* ---------------- API ---------------- */
  window.CRM_ATV = {
    /**
     * Desenha a atividade. opts: { eu, toast(msg, erro), resumoCliente(id), aguardarCurva(), abrirFicha(id) }.
     * Pode ser chamada de novo (ex.: quando o cadastro do cliente termina de carregar) sem perder a aba aberta.
     */
    render(item, ent, opts = {}, manterAba = false) {
      if (!item) return;
      ligar();
      if (typeof opts.toast === 'function') avisar = opts.toast;
      const mesmo = atual && atual.item.agendaId === item.agendaId;
      atual = { item, ent: ent || {}, opts };
      cabecalho(item, atual.ent);
      const ta = $('#activityScriptText'), editado = mesmo && manterAba && ta ? ta.value : null;
      roteiro(item, atual.ent);
      if (editado != null && $('#activityScriptText')) { $('#activityScriptText').value = editado; avisoPendencias(); }
      cliente(item, atual.ent);
      const st = statusDe(item);
      const done = st === 'done' || st === 'cancel';
      $('#completeForm').classList.toggle('hidden', done);
      const info = $('#activityDoneInfo');
      if (info) {
        info.classList.toggle('hidden', !done);
        info.innerHTML = done ? `${ms(st === 'done' ? 'task_alt' : 'block')}<div><b>${st === 'done' ? 'Atividade concluída' : 'Atividade cancelada'}</b><small>${esc(text(item.resultadoNome) || '')}${text(item.obsExecucao || (st === 'done' ? item.observacao : '')) ? ' · ' + esc(text(item.obsExecucao || item.observacao)) : ''}</small></div>` : '';
      }
      if (!(mesmo && manterAba)) aba(done ? 'notas' : text(item.tipoAtividadeId) === 'ATV_VISITA' ? 'checklist' : 'concluir');
    },
    statusDe, roteiroDe, pendencias,
  };
})();
