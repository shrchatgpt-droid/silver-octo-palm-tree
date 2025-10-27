// Dashboard: three simultaneous pies (Investment, Private, Public)
// - global filters (search + toggle) control which sectors are visible per dataset
// - each panel shows the breakdown; when filters remove sectors, a Top vs Rest small pie appears per panel
// - keyboard accessibility for swatches/legend, center-aligned pies, improved color palette
(function () {
  // Helpers
  function formatCurrencyMillions(n) {
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + ' bn';
    return '$' + n.toLocaleString() + ' m';
  }
  function pxToPt(val) { return val * 72 / 96; }

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

  // Improved color palette (distinct and accessible)
  const COLORS = [
    '#2563eb', // blue
    '#0ea5a4', // teal
    '#7c3aed', // purple
    '#f97316', // orange
    '#ef4444', // red
    '#f59e0b', // amber
    '#0891b2', // cyan
    '#60a5fa', // light blue
    '#64748b'  // slate
  ];

  // Compute union of all labels for the global filter controls, preserve deterministic order
  const unionLabels = (() => {
    const seen = new Set();
    const res = [];
    Object.values(datasets).forEach(ds => {
      ds.labels.forEach(l => {
        if (!seen.has(l)) { seen.add(l); res.push(l); }
      });
    });
    return res;
  })();

  // DOM refs
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  const filterListDiv = document.getElementById('filterList');
  const filterSearch = document.getElementById('filterSearch');
  const toggleAllBtn = document.getElementById('toggleAllBtn');
  const showAllBtn = document.getElementById('showAllBtn');
  const hideAllBtn = document.getElementById('hideAllBtn');
  const legendDiv = document.getElementById('legend');

  // Panel element ids mapping
  const panels = {
    investment: {
      mainCanvasId: 'chart-investment-main',
      topCanvasId: 'chart-investment-top',
      topWrapperId: 'investment-top-wrapper',
      infoId: 'investment-info'
    },
    private: {
      mainCanvasId: 'chart-private-main',
      topCanvasId: 'chart-private-top',
      topWrapperId: 'private-top-wrapper',
      infoId: 'private-info'
    },
    public: {
      mainCanvasId: 'chart-public-main',
      topCanvasId: 'chart-public-top',
      topWrapperId: 'public-top-wrapper',
      infoId: 'public-info'
    }
  };

  // Chart instances map
  const chartMainMap = {};
  const chartTopMap = {};

  // Active sectors: Set of labels currently toggled on. Empty set means show all.
  let activeSectors = new Set();

  // persistence key
  const PERSIST_KEY = 'finance_reporting_filters_v1';

  // Chart.js center circle plugin: draws a filled circle + amount text + optional subtext
  const centerCirclePlugin = {
    id: 'centerCirclePlugin',
    afterDraw(chart) {
      const cfg = chart.config.options && chart.config.options.plugins && chart.config.options.plugins.centerText;
      if (!cfg || !cfg.text) return;
      const ctx = chart.ctx;
      const centerX = chart.width / 2;
      const centerY = chart.height / 2;

      // plugin options (defaults)
      const bgColor = cfg.bgColor || '#ffffff';
      const borderColor = cfg.borderColor || 'rgba(16,40,67,0.06)';
      const borderWidth = typeof cfg.borderWidth === 'number' ? cfg.borderWidth : 2;
      const textColor = cfg.color || '#04304a';
      const subtext = cfg.subtext || '';

      // Calculate radius relative to chart size
      const radius = Math.min(chart.width, chart.height) * 0.145;

      ctx.save();

      // Circle with subtle shadow (using stroke)
      ctx.beginPath();
      ctx.fillStyle = bgColor;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = borderWidth;
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Amount text (bigger)
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // adjust font sizes according to radius for responsiveness
      const mainFontSize = Math.max(14, Math.floor(radius * 0.4)); // e.g., radius 50 => font 20
      ctx.font = `bold ${mainFontSize}px Inter, Arial, sans-serif`;
      // If there's a subtext, move main text up a little
      const yOffset = subtext ? - (mainFontSize * 0.25) : 0;
      ctx.fillText(cfg.text, centerX, centerY + yOffset);

      // Subtext (e.g., 'Total')
      if (subtext) {
        ctx.font = `${Math.max(10, Math.floor(radius * 0.18))}px Inter, Arial, sans-serif`;
        ctx.fillStyle = cfg.subColor || '#475569';
        ctx.fillText(subtext, centerX, centerY + mainFontSize * 0.55);
      }

      ctx.restore();
    }
  };

  // Slice explode plugin (identical behavior used previously)
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

  // Persistence helpers
  function saveFilters() {
    try {
      const obj = { active: Array.from(activeSectors) };
      localStorage.setItem(PERSIST_KEY, JSON.stringify(obj));
    } catch (e) { /* ignore */ }
  }
  function loadFilters() {
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  // Accessibility helpers
  function setSwatchA11yAttrs(el, label, isPressed) {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-pressed', isPressed ? 'true' : 'false');
    el.setAttribute('aria-label', `${label} filter ${isPressed ? 'on' : 'off'}`);
  }

  // Build the global filter controls (unionLabels)
  function buildFilterControls() {
    filterListDiv.innerHTML = '';
    unionLabels.forEach((label, i) => {
      const sw = document.createElement('div');
      sw.className = 'swatch';
      sw.dataset.label = label;
      sw.innerHTML = `<div class="color" style="background:${COLORS[i % COLORS.length]}"></div><div style="font-size:13px">${label}</div>`;
      sw.addEventListener('click', () => {
        const newVal = !(activeSectors.has(label));
        toggleSector(label, newVal);
        saveFilters();
      });
      sw.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          const newVal = !(activeSectors.has(label));
          toggleSector(label, newVal);
          saveFilters();
        }
      });
      setSwatchA11yAttrs(sw, label, true);
      filterListDiv.appendChild(sw);
    });
  }

  // Build global legend (same union labels)
  function buildLegend() {
    legendDiv.innerHTML = '';
    unionLabels.forEach((label, i) => {
      const sw = document.createElement('div');
      sw.className = 'swatch';
      sw.dataset.label = label;
      sw.innerHTML = `<div class="color" style="background:${COLORS[i % COLORS.length]}"></div><div style="font-size:13px">${label}</div>`;
      sw.addEventListener('click', () => {
        const newVal = !(activeSectors.has(label));
        toggleSector(label, newVal);
        saveFilters();
      });
      sw.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          const newVal = !(activeSectors.has(label));
          toggleSector(label, newVal);
          saveFilters();
        }
      });
      setSwatchA11yAttrs(sw, label, true);
      legendDiv.appendChild(sw);
    });
  }

  function toggleSector(label, show) {
    if (show) activeSectors.add(label);
    else activeSectors.delete(label);
    renderAll();
    updateFilterUI();
    saveFilters();
  }

  function updateFilterUI() {
    // keep swatches in sync for both filter list and legend
    document.querySelectorAll('#filterList .swatch').forEach(el => {
      const lbl = el.dataset.label;
      const shown = activeSectors.size === 0 || activeSectors.has(lbl);
      el.style.opacity = shown ? '1' : '0.45';
      setSwatchA11yAttrs(el, lbl, shown);
    });
    document.querySelectorAll('#legend .swatch').forEach(el => {
      const lbl = el.dataset.label;
      const shown = activeSectors.size === 0 || activeSectors.has(lbl);
      el.style.opacity = shown ? '1' : '0.45';
      setSwatchA11yAttrs(el, lbl, shown);
    });
  }

  // Filtering helper for a given dataset: returns labels/values that remain after global activeSectors applied
  function filterDatasetLabelsValues(fullLabels, fullValues) {
    // If hide-all sentinel is present, return empty arrays
    if (activeSectors && activeSectors.has('__HIDE_ALL__')) {
      return { labels: [], values: [] };
    }
    if (!activeSectors || activeSectors.size === 0) {
      return { labels: fullLabels.slice(), values: fullValues.slice() };
    }
    const filteredLabels = [];
    const filteredValues = [];
    fullLabels.forEach((lbl, i) => {
      if (activeSectors.has(lbl)) {
        filteredLabels.push(lbl);
        filteredValues.push(fullValues[i]);
      }
    });
    return { labels: filteredLabels, values: filteredValues };
  }

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
          // Pass an object for centerText so the centerCirclePlugin can draw amount + subtext
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

  // Render a single panel (main pie + top-vs-rest if filtering applied)
  function renderPanel(key, cfg) {
    const meta = datasets[key];
    const fullLabels = meta.labels;
    const fullValues = meta.values;

    const filtered = filterDatasetLabelsValues(fullLabels, fullValues);
    const labels = filtered.labels;
    const values = filtered.values;

    // colors: map label -> color by looking up index in unionLabels so same label has same color everywhere
    const colors = labels.map(l => {
      const idx = unionLabels.indexOf(l);
      return COLORS[idx % COLORS.length];
    });

    // total and formatted center text
    const total = values.reduce((a,b)=>a+b,0);
    const totalLabel = formatCurrencyMillions(total);

    // update info text
    const infoEl = document.getElementById(cfg.infoId);
    if (infoEl) infoEl.textContent = `Total: ${totalLabel}`;

    // destroy main chart if exists
    if (chartMainMap[key]) { chartMainMap[key].destroy(); chartMainMap[key] = null; }

    // create main chart (breakdown)
    const ctxMain = document.getElementById(cfg.mainCanvasId).getContext('2d');
    chartMainMap[key] = new Chart(ctxMain, makeChartConfig(labels, values, colors, totalLabel));

    // Determine whether to show Top vs Rest: show when filtered set is not equal to full set
    const showTop = labels.length > 0 && labels.length !== fullLabels.length;
    const topWrapper = document.getElementById(cfg.topWrapperId);
    if (!showTop) {
      // hide top wrapper and destroy chart if present
      if (topWrapper) topWrapper.style.display = 'none';
      if (chartTopMap[key]) { chartTopMap[key].destroy(); chartTopMap[key] = null; }
      return;
    }

    // compute top vs rest based on filtered labels/values
    const sorted = labels.map((l,i)=>({l,v:values[i]})).sort((a,b)=>b.v-a.v);
    const top = sorted.slice(0,3);
    const restTotal = sorted.slice(3).reduce((s,it)=>s+it.v,0);
    const labelsB = top.length ? [...top.map(t=>t.l), 'Other'] : [];
    const valuesB = top.length ? [...top.map(t=>t.v), restTotal] : [];
    // colors for top chart: keep color mapping for items, and 'Other' gets a neutral color
    const colorsB = labelsB.map((lbl,i) => {
      if (lbl === 'Other') return '#94a3b8'; // neutral slate
      const idx = unionLabels.indexOf(lbl);
      return COLORS[idx % COLORS.length];
    });
    const totalLabelB = formatCurrencyMillions(valuesB.reduce((a,b)=>a+b,0));

    // show wrapper
    if (topWrapper) topWrapper.style.display = 'block';

    // destroy old top chart
    if (chartTopMap[key]) { chartTopMap[key].destroy(); chartTopMap[key] = null; }

    // create top chart
    const ctxTop = document.getElementById(cfg.topCanvasId).getContext('2d');
    chartTopMap[key] = new Chart(ctxTop, makeChartConfig(labelsB, valuesB, colorsB, totalLabelB));
  }

  // render all panels
  function renderAll() {
    Object.keys(panels).forEach(key => renderPanel(key, panels[key]));
    updateFilterUI();
  }

  // Build global controls and wire events
  function initControls() {
    buildFilterControls();
    buildLegend();

    // load persisted filters
    const persisted = loadFilters();
    if (persisted && Array.isArray(persisted.active) && persisted.active.length) {
      activeSectors = new Set(persisted.active.filter(a => unionLabels.includes(a)));
    } else {
      activeSectors = new Set(); // empty set == show all
    }

    // search
    filterSearch.addEventListener('input', () => {
      const searchTerm = filterSearch.value.trim().toLowerCase();
      document.querySelectorAll('#filterList .swatch').forEach(el => {
        const lbl = el.dataset.label.toLowerCase();
        el.style.display = lbl.includes(searchTerm) ? 'flex' : 'none';
      });
    });

    resetFiltersBtn.addEventListener('click', () => {
      activeSectors = new Set();
      saveFilters();
      renderAll();
    });

    toggleAllBtn.addEventListener('click', () => {
      // simple implementation: toggle between show-all and hide-all
      if (!activeSectors || activeSectors.size === 0) {
        // hide all (use sentinel)
        activeSectors = new Set(['__HIDE_ALL__']);
      } else {
        // show all
        activeSectors = new Set();
      }
      saveFilters();
      renderAll();
    });

    showAllBtn.addEventListener('click', () => {
      activeSectors = new Set();
      saveFilters();
      renderAll();
    });

    hideAllBtn.addEventListener('click', () => {
      activeSectors = new Set(['__HIDE_ALL__']);
      saveFilters();
      renderAll();
    });

    // Export to PDF (keeps previous high-quality approach)
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
        const imgWidthPt = pxToPt(imgWidth);
        const imgHeightPt = pxToPt(imgHeight);
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
        exportPdfBtn.textContent = 'Export to PDF (High Quality)';
      }
    });
  }

  // Init
  initControls();
  renderAll();
})();