- Adds interactive pie charts for Investment Platform, Private and Public with fixed scaled datasets (4.0bn / 3.0bn / 1.0bn).
- Adds filter UI (search, toggle, show/hide) and legend-based toggles.
- Persists filter selections in localStorage.
- Adds center totals rendered inside each donut and slice 'explode' on click.
- Keeps high-quality PDF export using html2canvas + jsPDF.

Files changed: index.html, dashboard.js, styles.css

Next steps: add keyboard accessibility (ARIA, keyboard toggles), automated tests (Cypress/Playwright), optional vector PDF export.