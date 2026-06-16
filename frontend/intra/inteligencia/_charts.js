function intelEnsureChartJs() {
  return new Promise((resolve, reject) => {
    if (window.Chart) return resolve(window.Chart);
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
    script.onload = () => resolve(window.Chart);
    script.onerror = () => reject(new Error('Não foi possível carregar Chart.js.'));
    document.head.appendChild(script);
  });
}
async function intelRenderChart(canvas, chartSpec) {
  if (!canvas || !chartSpec) return;
  const type = chartSpec.type || 'bar';
  if (type === 'funnelish') { renderFunnelish(canvas.parentElement, chartSpec.series || []); return; }
  await intelEnsureChartJs();
  const labels = (chartSpec.series || []).map(x => x.label);
  const values = (chartSpec.series || []).map(x => Number(x.value || 0));
  if (canvas._chartInstance) canvas._chartInstance.destroy();
  canvas._chartInstance = new Chart(canvas, { type: type === 'line' ? 'line' : 'bar', data: { labels, datasets: [{ label: chartSpec.title || '', data: values, borderWidth: 2, borderRadius: 8, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } } });
}
function renderFunnelish(container, series) {
  const max = Math.max(...series.map(x => Number(x.value || 0)), 1);
  container.innerHTML = '<div class="intel-funnel">' + series.map(item => `<div class="intel-funnel__row"><div class="intel-funnel__label">${escapeHtml(item.label)}</div><div class="intel-funnel__bar"><div class="intel-funnel__fill" style="width:${Math.max(4, Math.round((Number(item.value || 0) / max) * 100))}%"></div></div><div class="intel-funnel__value">${formatShortNumber(item.value)}</div></div>`).join('') + '</div>';
}
