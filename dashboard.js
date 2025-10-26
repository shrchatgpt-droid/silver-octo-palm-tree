// Demo dashboard logic: Chart.js pie charts (fixed scaled datasets) + interactivity (filters, legend toggles) + export to PDF
(function () {
  // Helpers
  function formatCurrencyMillions(n) {
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + ' bn';
    return '$' + n.toLocaleString() + ' m';
  }
  function pxToPt(val) { return val * 72 / 96; }

  // Fixed scaled datasets (values in $ millions)
  const datasets = {
    investment: {
      titleA: 'Investment Platform',
      titleB: 'Investment Platform — Top vs Rest',
      labels: ['Technology','Fixed Income','Indirect','Industrials','Health Care','Con. Discr.','Real Estate','Other','Financials'],
      values: [791, 617, 472, 445, 394, 344, 322, 318, 297] // sums to 4000
    },
    private: {
      titleA: 'Private',
      titleB: 'Private — Top vs Rest',
      labels: ['Technology','Industrials','Health Care','Real Estate','Con. Discr.','Financials','Other'],
      values: [784, 479, 409, 357, 346, 309, 316] // sums to 3000
    },
    public: {
      titleA: 'Public',
      titleB: 'Public — Top vs Rest',
      labels: ['Fixed Income','Indirect','Technology','Other','Con. Discr.','Health Care'],
      values: [474, 363, 66, 52, 25, 20] // sums to 1000
    }
  };

  // Colors
  const COLORS = ['#2c7be5','#1f5d7a','#6f42c1','#16a085','#ff6b6b','#f59e0b','#345e77','#a3c4d9','#98a6b3'];

  // DOM refs
  const datasetSelect = document.getElementById('datasetSelect');
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  const filterListDiv = document.getElementById('filterList');
  const filterSearch = document.getElementById('filterSearch');
  const toggleAllBtn = document.getElementById('toggleAllBtn');
  const showAllBtn = document.getElementById('showAllBtn');
  const hideAllBtn = document.getElementById('hideAllBtn');

  const legendDiv = document.getElementById('legend');
  const chartATitle = document.getElementById('chartA-title');
  const chartBTitle = document.getElementById('chartB-title');
  const chartAInfo = document.getElementById('chartA-info');
  const chartBInfo = document.getElementById('chartB-info');

  const ctxA = document.getElementById('chartA').getContext('2d');
  const ctxB = document.getElementById('chartB').getContext('2d');

  // Chart instances
  let chartA = null, chartB = null;

  // Active sectors set (labels to show). Managed per dataset.
  let activeSectors = new Set();

  // persist key for localStorage
  const PERSIST_KEY = 'finance_reporting_filters_v1';

  // Chart.js center text plugin
  const centerTextPlugin = {
    id: 'centerTextPlugin',
    afterDraw(chart) {
      const centerText = chart.config.options.plugins.centerText && chart.config.options.plugins.centerText.text;
      if (!centerText) return;
      const ctx = chart.ctx;
      const width = chart.width;
      const height = chart.height;
      ctx.save();
      ctx.fillStyle = '#04304a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 18px Inter, Arial, sans-serif';
      ctx.fillText(centerText, width / 2, height / 2);
      ctx.restore();
    }
  };

  // Slice explode plugin (keeps previous behavior)
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

  Chart.register(centerTextPlugin, sliceOffsetPlugin);

  // persistence helpers
  function saveFilters() {
    try {
      const obj = { active: Array.from(activeSectors), view: datasetSelect.value };
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

  function buildFilterControls(labels) {
    filterListDiv.innerHTML = '';
    labels.forEach((label, i) => {
      const sw = document.createElement('label');
      sw.className = 'swatch';
      sw.dataset.label = label;
      sw.innerHTML = `<input type="checkbox" class="filter-checkbox" data-label="${label}" checked style="display:none" />
                      <div class="color" style="background:${COLORS[i % COLORS.length]}"></div>
                      <div style="font-size:13px">${label}</div>`;
      // clicking the swatch toggles the checkbox and filter
      sw.addEventListener('click', () => {
        const cb = sw.querySelector('.filter-checkbox');
        cb.checked = !cb.checked;
        toggleSector(label, cb.checked);
        saveFilters();
      });
      filterListDiv.appendChild(sw);
    });
  }

  function buildLegend(labels) {
    legendDiv.innerHTML = '';
    labels.forEach((lbl, i) => {
      const sw = document.createElement('div');
      sw.className = 'swatch';
      sw.style.cursor = 'pointer';
      sw.dataset.label = lbl;
      sw.innerHTML = `<div class="color" style="background:${COLORS[i % COLORS.length]}"></div><div style="font-size:13px">${lbl}</div>`;
      sw.addEventListener('click', () => {
        const checkbox = document.querySelector(`.filter-checkbox[data-label="${lbl}"]`);
        const newval = !(checkbox && checkbox.checked);
        if (checkbox) checkbox.checked = newval;
        toggleSector(lbl, newval);
        saveFilters();
      });
      legendDiv.appendChild(sw);
    });
  }

  function toggleSector(label, show) {
    if (show) activeSectors.add(label);
    else activeSectors.delete(label);
    render(currentKey); // re-render charts with updated filters
    updateFilterUI();
    saveFilters();
  }

  function updateFilterUI() {
    // keep checkboxes in sync with activeSectors
    document.querySelectorAll('.filter-checkbox').forEach(cb => {
      const lbl = cb.dataset.label;
      cb.checked = activeSectors.has(lbl);
    });
    // highlight swatches for visible ones
    document.querySelectorAll('#filterList .swatch').forEach(el => {
      const lbl = el.dataset.label;
      el.style.opacity = activeSectors.has(lbl) ? '1' : '0.45';
    });
    document.querySelectorAll('#legend .swatch').forEach(el => {
      const lbl = el.dataset.label;
      el.style.opacity = activeSectors.has(lbl) ? '1' : '0.45';
    });
  }

  function makeChartConfig(labels, values, colors, title, totalLabel) {
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
          centerText: {
            text: totalLabel
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const v = ctx.raw; // in millions
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((v / total) * 100).toFixed(1) + '%';
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

  // filtering helper: return labels+values filtered by activeSectors; if none active, show all
  function filterLabelsValues(fullLabels, fullValues) {
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

  // UI helper to compute totals and update info boxes
  function updateInfoBoxes(labels, values) {
    const total = values.reduce((a, b) => a + b, 0);
    chartAInfo.textContent = `Total: ${formatCurrencyMillions(total)}`;
    if (values.length) {
      const maxIdx = values.indexOf(Math.max(...values));
      chartBInfo.textContent = `Top: ${labels[maxIdx]} (${formatCurrencyMillions(values[maxIdx])})`;
    } else {
      chartBInfo.textContent = `Top: —`;
    }
  }

  // global currentKey mapping
  let currentKey = datasetSelect.value || 'investment';

  function render(key) {
    currentKey = key;
    const meta = datasets[key];
    const fullLabels = meta.labels;
    const fullValues = meta.values;
    // Build filter controls on first load of this dataset
    buildFilterControls(fullLabels);
    buildLegend(fullLabels);

    // load persisted settings if present
    const persisted = loadFilters();
    if (persisted && persisted.view === key && (!activeSectors || activeSectors.size === 0)) {
      activeSectors = new Set(persisted.active.filter(a => fullLabels.includes(a)));
      if (activeSectors.size === 0) activeSectors = new Set(fullLabels.slice());
    }

    // if activeSectors is empty (first load or user clicked showAll), initialize to all labels
    if (!activeSectors || activeSectors.size === 0) {
      activeSectors = new Set(fullLabels.slice());
    } else {
      // ensure activeSectors contains only labels from the current dataset (remove others)
      activeSectors.forEach(lbl => {
        if (!fullLabels.includes(lbl)) activeSectors.delete(lbl);
      });
      if (activeSectors.size === 0) activeSectors = new Set(fullLabels.slice());
    }

    // Apply search filter to filterList display (client-side only)
    const searchTerm = filterSearch.value.trim().toLowerCase();
    document.querySelectorAll('#filterList .swatch').forEach(el => {
      const lbl = el.dataset.label.toLowerCase();
      el.style.display = lbl.includes(searchTerm) ? 'flex' : 'none';
    });

    // get filtered labels & values for chart (only those active)
    const { labels, values } = filterLabelsValues(fullLabels, fullValues);

    // prepare colors for visible labels
    const colors = labels.map((_, i) => COLORS[fullLabels.indexOf(labels[i]) % COLORS.length]);

    // formatted total label for center
    const total = values.reduce((a,b)=>a+b,0);
    const totalLabel = formatCurrencyMillions(total);

    chartATitle.textContent = meta.titleA;
    chartBTitle.textContent = meta.titleB;
    updateInfoBoxes(labels, values);

    // destroy previous charts
    if (chartA) { chartA.destroy(); chartA = null; }
    if (chartB) { chartB.destroy(); chartB = null; }

    // Chart A: direct breakdown
    chartA = new Chart(ctxA, makeChartConfig(labels, values, colors, meta.titleA, totalLabel));
    // Chart B: show top 3 vs rest for the filtered set
    const sorted = labels.map((l,i)=>({l,v:values[i]})).sort((a,b)=>b.v-a.v);
    const top = sorted.slice(0,3);
    const restTotal = sorted.slice(3).reduce((s,it)=>s+it.v,0);
    const labelsB = top.length ? [...top.map(t=>t.l), 'Other'] : [];
    const valuesB = top.length ? [...top.map(t=>t.v), restTotal] : [];
    const colorsB = labelsB.map((_,i)=>COLORS[(fullLabels.indexOf(labelsB[i])>=0?fullLabels.indexOf(labelsB[i]):i)%COLORS.length]);
    const totalLabelB = formatCurrencyMillions(valuesB.reduce((a,b)=>a+b,0));
    chartB = new Chart(ctxB, makeChartConfig(labelsB, valuesB, colorsB, meta.titleB, totalLabelB));

    updateFilterUI();
  }

  // events
  datasetSelect.addEventListener('change', (e) => {
    render(e.target.value);
    saveFilters();
  });

  filterSearch.addEventListener('input', () => {
    const searchTerm = filterSearch.value.trim().toLowerCase();
    document.querySelectorAll('#filterList .swatch').forEach(el => {
      const lbl = el.dataset.label.toLowerCase();
      el.style.display = lbl.includes(searchTerm) ? 'flex' : 'none';
    });
  });

  resetFiltersBtn.addEventListener('click', () => {
    const meta = datasets[currentKey];
    activeSectors = new Set(meta.labels.slice());
    saveFilters();
    render(currentKey);
  });

  toggleAllBtn.addEventListener('click', () => {
    const meta = datasets[currentKey];
    const all = meta.labels;
    const anyShown = Array.from(all).some(lbl => activeSectors.has(lbl));
    if (anyShown) {
      activeSectors = new Set(); // hide all
    } else {
      activeSectors = new Set(all.slice()); // show all
    }
    saveFilters();
    render(currentKey);
  });

  showAllBtn.addEventListener('click', () => {
    const meta = datasets[currentKey];
    activeSectors = new Set(meta.labels.slice());
    saveFilters();
    render(currentKey);
  });

  hideAllBtn.addEventListener('click', () => {
    activeSectors = new Set();
    saveFilters();
    render(currentKey);
  });

  // export to PDF (keeps high-quality scaling)
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

  // initial render
  render(currentKey);
})();