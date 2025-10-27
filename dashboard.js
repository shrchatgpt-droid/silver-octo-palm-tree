// Dashboard layout: Investment top, Public + Private below.
// Dataset selector at top: All | Investment | Private | Public
(function () {
  // Helpers
  function formatCurrencyMillions(n) {
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + ' bn';
    return '$' + n.toLocaleString() + ' m';
  }

  // Datasets (values in $ millions)
  const datasets = {
    investment: {
      title: 'Investment Platform',
      labels: ['Technology','Fixed Income','Indirect','Industrials','Health Care','Con. Discr.','Real Estate','Other','Financials'],
      values: [791, 617, 472, 445, 394, 344, 322, 318, 297] // sums to 4000
    },
    private: {
      title: 'Private',
      labels: ['Technology','Industrials','Health Care','Real Estate','Con. Discr.','Financials','Other'],
      values: [784, 479, 409, 357, 346, 309, 316] // sums to 3000
    },
    public: {
      title: 'Public',
      labels: ['Fixed Income','Indirect','Technology','Other','Con. Discr.','Health Care'],
      values: [474, 363, 66, 52, 25, 20] // sums to 1000
    }
  };

  const COLORS = [
    '#2563eb', '#0ea5a4', '#7c3aed', '#f97316', '#ef4444',
    '#f59e0b', '#0891b2', '#60a5fa', '#64748b'
  ];

  // DOM refs
  const datasetSelect = document.getElementById('datasetSelect');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');

  const panels = {
    investment: {
      mainCanvasId: 'chart-investment-main',
      topCanvasId: 'chart-investment-top',
      topWrapperId: 'investment-top-wrapper',
      infoId: 'investment-info',
      legendId: 'legend-investment'
    },
    private: {
      mainCanvasId: 'chart-private-main',
      topCanvasId: 'chart-private-top',
      topWrapperId: 'private-top-wrapper',
      infoId: 'private-info',
      legendId: 'legend-private'
    },
    public: {
      mainCanvasId: 'chart-public-main',
      topCanvasId: 'chart-public-top',
      topWrapperId: 'public-top-wrapper',
      infoId: 'public-info',
      legendId: 'legend-public'
    }
  };

  // chart instances
  const chartMainMap = {};
  const chartTopMap = {};

  // Active sector filters: set of visible labels; empty Set means show all.
  let activeSectors = new Set();

  // Plugins: center circle + slice offset (reuse concept)
  const centerCirclePlugin = {
    id: 'centerCirclePlugin',
    afterDraw(chart) {
      const cfg = chart.config.options && chart.config.options.plugins && chart.config.options.plugins.centerText;
      if (!cfg || !cfg.text) return;
      const ctx = chart.ctx;
      const centerX = chart.width / 2;
      const centerY = chart.height / 2;
      const bgColor = cfg.bgColor || '#ffffff';
      const borderColor = cfg.borderColor || 'rgba(16,40,67,0.06)';
      const borderWidth = typeof cfg.borderWidth === 'number' ? cfg.borderWidth : 2;
      const textColor = cfg.color || '#04304a';
      const subtext = cfg.subtext || '';
      const radius = Math.min(chart.width, chart.height) * 0.145;
      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = bgColor;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = borderWidth;
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const mainFontSize = Math.max(14, Math.floor(radius * 0.4));
      ctx.font = `bold ${mainFontSize}px Inter, Arial, sans-serif`;
      const yOffset = subtext ? -(mainFontSize * 0.25) : 0;
      ctx.fillText(cfg.text, centerX, centerY + yOffset);
      if (subtext) {
        ctx.font = `${Math.max(10, Math.floor(radius * 0.18))}px Inter, Arial, sans-serif`;
        ctx.fillStyle = cfg.subColor || '#475569';
        ctx.fillText(subtext, centerX, centerY + mainFontSize * 0.55);
      }
      ctx.restore();
    }
  };

  const sliceOffsetPlugin = {
    id: 'sliceOffsetPlugin',
    afterDatasetDraw(chart) {
      const ds = chart.data.datasets[0];
      if (!ds._offsets) return;
      const meta = chart.getDatasetMeta(0);
      const ctx = chart.ctx;
      meta.data.forEach((arc, i) => {
        const offset = ds._offsets[i] || 0;
        if (!offset) return;
        ctx.save();
        const angle = (arc.startAngle + arc.endAngle) / 2;
        const tx = Math.cos(angle) * offset;
        const ty = Math.sin(angle) * offset;
        ctx.translate(tx, ty);
        arc.draw(ctx);
        ctx.restore();
      });
    }
  };

  Chart.register(centerCirclePlugin, sliceOffsetPlugin);

  // Utility: get filtered labels/values for a dataset (respects activeSectors sentinel)
  function filterDataset(fullLabels, fullValues) {
    // hide-all sentinel
    if (activeSectors && activeSectors.has('__HIDE_ALL__')) {
      return { labels: [], values: [] };
    }
    if (!activeSectors || activeSectors.size === 0) {
      return { labels: fullLabels.slice(), values: fullValues.slice() };
    }
    const labels = [];
    const values = [];
    fullLabels.forEach((l, i) => {
      if (activeSectors.has(l)) {
        labels.push(l);
        values.push(fullValues[i]);
      }
    });
    return { labels, values };
  }

  // Build a panel legend (under each pie). Interactive: toggles activeSectors visibility.
  function buildPanelLegend(key) {
    const panel = panels[key];
    const el = document.getElementById(panel.legendId);
    if (!el) return;
    el.innerHTML = '';
    const meta = datasets[key];
    meta.labels.forEach((label, i) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const color = COLORS[i % COLORS.length];
      item.innerHTML = `<div class="legend-color" style="background:${color}"></div><div class="legend-label">${label}</div>`;
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `Toggle ${label}`);
      // click toggles: if activeSectors empty => currently all visible -> populate activeSectors with all labels then remove the one clicked
      item.addEventListener('click', () => {
        // If currently show-all (empty set) treat click as "hide this one"
        if (activeSectors.size === 0) {
          // initialize activeSectors to all labels first (so toggling is consistent)
          const union = new Set();
          Object.values(datasets).forEach(ds => ds.labels.forEach(l => union.add(l)));
          activeSectors = union;
        }
        if (activeSectors.has(label)) activeSectors.delete(label);
        else activeSectors.add(label);
        renderAll();
      });
      item.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          item.click();
        }
      });
      el.appendChild(item);
    });
  }

  // Chart factory
  function makeChartConfig(labels, values, colors, totalLabel) {
    return {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: '#fff',
          borderWidth: 2,
          hoverOffset: 12
        }]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          centerText: { text: totalLabel, subtext: 'Total' },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const v = ctx.raw;
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0) || 0;
                const pct = total ? ((v / total) * 100).toFixed(1) + '%' : '0.0%';
                const display = v >= 1000 ? '$' + (v/1000).toFixed(1) + ' bn' : '$' + v.toLocaleString() + ' m';
                return ctx.label + ': ' + display + ' (' + pct + ')';
              }
            }
          }
        },
        onClick(evt, elements) {
          if (!elements.length) return;
          const el = elements[0];
          const index = el.index;
          const ds = this.data.datasets[0];
          ds._offsets = ds._offsets || new Array(ds.data.length).fill(0);
          ds._offsets[index] = ds._offsets[index] ? 0 : 20;
          this.draw();
        }
      }
    };
  }

  // Render a single panel
  function renderPanel(key, forceShowTop = false) {
    const meta = datasets[key];
    const cfg = panels[key];
    const fullLabels = meta.labels;
    const fullValues = meta.values;

    // If we are in single selection mode (datasetSelect != 'all') and forceShowTop true,
    // Top vs Rest will be shown based on the full dataset (not filtered).
    const filtered = filterDataset(fullLabels, fullValues);
    const labels = filtered.labels;
    const values = filtered.values;

    // colors map by label index in dataset
    const colors = labels.map(l => {
      const idx = fullLabels.indexOf(l);
      return COLORS[idx % COLORS.length];
    });

    const total = values.reduce((a, b) => a + b, 0);
    const totalLabel = formatCurrencyMillions(total);
    const infoEl = document.getElementById(cfg.infoId);
    if (infoEl) infoEl.textContent = `Total: ${totalLabel}`;

    // destroy existing main chart
    if (chartMainMap[key]) { chartMainMap[key].destroy(); chartMainMap[key] = null; }
    const ctx = document.getElementById(cfg.mainCanvasId).getContext('2d');
    chartMainMap[key] = new Chart(ctx, makeChartConfig(labels, values, colors, totalLabel));

    // Top vs Rest visibility logic:
    // - if forceShowTop === true -> show Top vs Rest based on full dataset
    // - else showTop when filtered set differs from full set AND there is at least one label
    let showTop = false;
    if (forceShowTop) showTop = fullLabels.length > 0;
    else showTop = labels.length > 0 && labels.length !== fullLabels.length;

    const topWrapper = document.getElementById(cfg.topWrapperId);
    if (!showTop) {
      if (topWrapper) topWrapper.style.display = 'none';
      if (chartTopMap[key]) { chartTopMap[key].destroy(); chartTopMap[key] = null; }
    } else {
      // compute top vs rest; if forceShowTop use full arrays, else use filtered arrays
      const sourceLabels = forceShowTop ? fullLabels : labels;
      const sourceValues = forceShowTop ? fullValues : values;
      const sorted = sourceLabels.map((l, i) => ({ l, v: sourceValues[i] })).sort((a, b) => b.v - a.v);
      const top = sorted.slice(0, 3);
      const rest = sorted.slice(3);
      const restTotal = rest.reduce((s, it) => s + it.v, 0);
      const labelsB = top.length ? [...top.map(t => t.l), 'Other'] : [];
      const valuesB = top.length ? [...top.map(t => t.v), restTotal] : [];
      const colorsB = labelsB.map(lbl => lbl === 'Other' ? '#94a3b8' : COLORS[fullLabels.indexOf(lbl) % COLORS.length]);
      const totalLabelB = formatCurrencyMillions(valuesB.reduce((a, b) => a + b, 0));
      if (topWrapper) topWrapper.style.display = 'block';
      if (chartTopMap[key]) { chartTopMap[key].destroy(); chartTopMap[key] = null; }
      const ctxTop = document.getElementById(cfg.topCanvasId).getContext('2d');
      chartTopMap[key] = new Chart(ctxTop, makeChartConfig(labelsB, valuesB, colorsB, totalLabelB));
    }

    // Build per-panel legend
    buildPanelLegend(key);
  }

  // Render view according to datasetSelect value
  function renderAll() {
    const sel = datasetSelect.value;
    if (sel === 'all') {
      // Show all panels in their positions
      document.getElementById('investment-panel').style.display = '';
      document.getElementById('public-panel').style.display = '';
      document.getElementById('private-panel').style.display = '';
      // render normally (Top vs Rest only when filters affect a dataset)
      Object.keys(panels).forEach(k => renderPanel(k, false));
    } else {
      // hide other panels, show only selected
      Object.keys(panels).forEach(k => {
        const el = document.getElementById(panels[k].mainCanvasId).closest('.panel') || document.getElementById(Object.keys(panels[k])[0]);
        // simpler: show/hide top-level section elements
        const section = document.getElementById(`${k}-panel`);
        if (section) section.style.display = (k === sel) ? '' : 'none';
      });
      // in single selection mode, show Top vs Rest for the selected dataset always (force)
      renderPanel(sel, true);
    }
  }

  // Controls wiring
  datasetSelect.addEventListener('change', () => {
    // Reset any "hide-all" sentinel if present when switching views
    if (activeSectors && activeSectors.has('__HIDE_ALL__')) activeSectors = new Set();
    renderAll();
  });

  resetFiltersBtn.addEventListener('click', () => {
    activeSectors = new Set();
    renderAll();
  });

  // Export to PDF (same approach as before)
  exportPdfBtn.addEventListener('click', async () => {
    try {
      exportPdfBtn.disabled = true;
      exportPdfBtn.textContent = 'Preparing...';
      const dashboardEl = document.querySelector('main');
      const scale = Math.max(2, Math.floor(window.devicePixelRatio || 1) * 2);
      const canvas = await html2canvas(dashboardEl, {
        backgroundColor: '#ffffff',
        scale: scale,
        useCORS: true,
        allowTaint: true,
        logging: false
      });
      const imgData = canvas.toDataURL('image/png', 1.0);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const imgWidthPt = imgWidth * 72 / 96;
      const imgHeightPt = imgHeight * 72 / 96;
      const padding = 20;
      let renderWidth = pageWidth - padding * 2;
      let renderHeight = (imgHeightPt * renderWidth) / imgWidthPt;
      if (renderHeight > pageHeight - padding * 2) {
        renderHeight = pageHeight - padding * 2;
        renderWidth = (imgWidthPt * renderHeight) / imgHeightPt;
      }
      const x = (pageWidth - renderWidth) / 2;
      const y = (pageHeight - renderHeight) / 2;
      pdf.addImage(imgData, 'PNG', x, y, renderWidth, renderHeight, undefined, 'FAST');
      const filename = `dashboard-export-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error('Export failed', err);
      alert('PDF export failed — see console for details.');
    } finally {
      exportPdfBtn.disabled = false;
      exportPdfBtn.textContent = 'Export to PDF';
    }
  });

  // Init: render default and legends
  renderAll();
})();