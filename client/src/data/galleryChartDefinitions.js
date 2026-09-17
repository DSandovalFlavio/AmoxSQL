/**
 * Gallery Chart Definitions
 * 15 professionally designed charts showcasing all AmoxVis features.
 * Each definition contains: synthetic data, full chart config, and gallery metadata.
 */
import { DEFAULT_CONFIG } from '../components/DataVisualizer/constants';

const base = (overrides) => ({ ...DEFAULT_CONFIG, ...overrides });

export const GALLERY_CHARTS = [
  // ─── 1. Column — Monthly Sales ───
  {
    id: '01_ventas_mensuales',
    data: [
      { month: 'Jan', sales: 12400 }, { month: 'Feb', sales: 15800 },
      { month: 'Mar', sales: 18200 }, { month: 'Apr', sales: 16900 },
      { month: 'May', sales: 21300 }, { month: 'Jun', sales: 19700 },
      { month: 'Jul', sales: 24500 }, { month: 'Aug', sales: 27800 },
      { month: 'Sep', sales: 31200 }, { month: 'Oct', sales: 28400 },
      { month: 'Nov', sales: 25600 }, { month: 'Dec', sales: 33100 },
    ],
    amoxvis: base({
      chartType: 'bar', xAxisKey: 'month', yAxisKeys: ['sales'],
      chartTitle: 'Monthly Sales 2024', chartSubtitle: 'Sustained growth through Q3',
      chartFootnote: 'Source: sales system · Figures in USD',
      colorTheme: 'ocean', fontFamily: 'inter', showLabels: true,
      dataLabelPosition: 'top', backgroundTone: 'darker', borderStyle: 'subtle',
      highlightConfig: { type: 'max', value: '', color: '#22c55e' },
      goalLine: { enabled: true, value: 28000, label: 'Target', color: '#22c55e', style: 'dashed' },
      trendLine: { type: 'linear', color: '#fbbf24', windowSize: 3 },
      textAlign: 'left', barRadius: 6, numberFormat: 'compact',
      sortMode: 'none', limit: 0,
    }),
    meta: {
      title: 'Monthly Sales 2024', category: 'column', lang: 'en',
      description: 'Columns highlighting the maximum, with a trend line and a target line',
      showcasedFeatures: ['Highlight Max', 'Goal Line', 'Trend Line', 'Data Labels', 'Inter Font'],
    },
  },

  // ─── 2. Stacked Column — Revenue by Region ───
  {
    id: '02_revenue_by_region',
    data: [
      { quarter: 'Q1', north: 45000, south: 32000, west: 28000, east: 19000 },
      { quarter: 'Q2', north: 52000, south: 38000, west: 31000, east: 22000 },
      { quarter: 'Q3', north: 61000, south: 42000, west: 35000, east: 27000 },
      { quarter: 'Q4', north: 58000, south: 48000, west: 39000, east: 31000 },
    ],
    amoxvis: base({
      chartType: 'bar', barStackMode: 'stack',
      xAxisKey: 'quarter', yAxisKeys: ['north', 'south', 'west', 'east'],
      chartTitle: 'Revenue by Region & Product', chartSubtitle: 'Fiscal Year 2024 — All divisions',
      chartFootnote: 'Source: Finance Dept · Values in USD',
      colorTheme: 'sunset', fontFamily: 'manrope', showLabels: false,
      textAlign: 'left', barRadius: 4, legendPosition: 'bottom',
      sortMode: 'none', limit: 0,
    }),
    meta: {
      title: 'Revenue by Region & Product', category: 'column', lang: 'en',
      description: 'Stacked columns with sunset palette and Outfit font',
      showcasedFeatures: ['Stacked Bars', 'Sunset Palette', 'Outfit Font', 'Multi-Series'],
    },
  },

  // ─── 3. 100% Stacked Column — Market Share ───
  {
    id: '03_market_share',
    data: [
      { quarter: 'Q1-23', alpha: 42, beta: 28, gamma: 18, other: 12 },
      { quarter: 'Q2-23', alpha: 39, beta: 30, gamma: 19, other: 12 },
      { quarter: 'Q3-23', alpha: 36, beta: 31, gamma: 21, other: 12 },
      { quarter: 'Q4-23', alpha: 34, beta: 33, gamma: 22, other: 11 },
      { quarter: 'Q1-24', alpha: 31, beta: 34, gamma: 24, other: 11 },
      { quarter: 'Q2-24', alpha: 29, beta: 35, gamma: 25, other: 11 },
    ],
    amoxvis: base({
      chartType: 'bar', barStackMode: 'expand',
      xAxisKey: 'quarter', yAxisKeys: ['alpha', 'beta', 'gamma', 'other'],
      chartTitle: 'Market Share by Quarter', chartSubtitle: 'Beta surpasses Alpha in Q1-24',
      colorTheme: 'spectral', fontFamily: 'inter',
      legendPosition: 'top', textAlign: 'center', numberFormat: 'percent',
      sortMode: 'none', limit: 0,
    }),
    meta: {
      title: 'Market Share by Quarter', category: 'column', lang: 'en',
      description: '100% stacked with spectral palette and percentage format',
      showcasedFeatures: ['100% Stacked', 'Spectral Palette', 'Percent Format', 'Legend Top'],
    },
  },

  // ─── 4. Horizontal Bar — Top Películas ───
  {
    id: '04_top_peliculas',
    data: [
      { film: 'The Godfather', rating: 9.2 }, { film: 'Pulp Fiction', rating: 8.9 },
      { film: 'Interstellar', rating: 8.7 }, { film: 'Parasite', rating: 8.5 },
      { film: 'Inception', rating: 8.4 }, { film: 'The Matrix', rating: 8.3 },
      { film: 'Coco', rating: 8.2 }, { film: 'Spirited Away', rating: 8.1 },
      { film: 'Amélie', rating: 8.0 }, { film: 'Whiplash', rating: 7.9 },
    ],
    amoxvis: base({
      chartType: 'bar-horizontal', xAxisKey: 'film', yAxisKeys: ['rating'],
      chartTitle: 'Top 10 Films by Rating',
      chartSubtitle: 'Average audience score',
      colorTheme: 'default', fontFamily: 'space-grotesk',
      barColorMode: 'dimension', barRadius: 8, showLabels: true,
      dataLabelPosition: 'outside', sortMode: 'y-desc', textAlign: 'left',
      numberFormat: 'standard', decimalPlaces: 1, limit: 10,
    }),
    meta: {
      title: 'Top 10 Films by Rating', category: 'bar', lang: 'en',
      description: 'Horizontal bars coloured by dimension, set in Poppins',
      showcasedFeatures: ['Horizontal Bars', 'Dimension Colors', 'Poppins Font', 'Sort Desc'],
    },
  },

  // ─── 5. Stacked Bar Horizontal — Hours by Team ───
  {
    id: '05_hours_by_team',
    data: [
      { project: 'Platform', engineering: 320, design: 80, qa: 120 },
      { project: 'Mobile App', engineering: 280, design: 140, qa: 90 },
      { project: 'Analytics', engineering: 200, design: 40, qa: 60 },
      { project: 'DevOps', engineering: 180, design: 20, qa: 100 },
      { project: 'Research', engineering: 150, design: 60, qa: 30 },
    ],
    amoxvis: base({
      chartType: 'bar-horizontal', barStackMode: 'stack',
      xAxisKey: 'project', yAxisKeys: ['engineering', 'design', 'qa'],
      chartTitle: 'Hours per Project by Team',
      chartSubtitle: 'Sprint 14 — Engineering leads across all projects',
      colorTheme: 'set2', fontFamily: 'ibm-plex',
      customAxisTitles: { x: 'Total Hours', y: 'Project' },
      legendPosition: 'bottom', textAlign: 'left',
      sortMode: 'y-desc', limit: 0,
    }),
    meta: {
      title: 'Hours per Project by Team', category: 'bar', lang: 'en',
      description: 'Stacked horizontal bars with custom axis titles',
      showcasedFeatures: ['Stacked Horizontal', 'Set2 Palette', 'Custom Axis Titles', 'Source Sans'],
    },
  },

  // ─── 6. Line — Temperatura Anual ───
  {
    id: '06_temperatura_anual',
    data: [
      { month: 'Jan', temp: 5.2 }, { month: 'Feb', temp: 7.1 }, { month: 'Mar', temp: 11.4 },
      { month: 'Apr', temp: 15.8 }, { month: 'May', temp: 20.3 }, { month: 'Jun', temp: 25.1 },
      { month: 'Jul', temp: 28.7 }, { month: 'Aug', temp: 27.9 }, { month: 'Sep', temp: 22.4 },
      { month: 'Oct', temp: 16.2 }, { month: 'Nov', temp: 10.1 }, { month: 'Dec', temp: 6.3 },
    ],
    amoxvis: base({
      chartType: 'line', xAxisKey: 'month', yAxisKeys: ['temp'],
      chartTitle: 'Average Temperature by Month',
      chartSubtitle: 'Mexico City — central weather station',
      chartFootnote: 'Data: national weather service · Values in °C',
      colorTheme: 'rdylbu', fontFamily: 'inter',
      lineType: 'monotone', lineAreaFill: true, showDots: true,
      refLine: { value: 20, label: 'Comfort level', color: '#22c55e', style: 'dashed' },
      textAlign: 'left', numberFormat: 'standard', decimalPlaces: 1,
      sortMode: 'none', limit: 0,
    }),
    meta: {
      title: 'Average Temperature by Month', category: 'line', lang: 'en',
      description: 'A smooth line with area fill, dots and a reference line',
      showcasedFeatures: ['Smooth Curve', 'Area Fill', 'Reference Line', 'Dots', 'RdYlBu Palette'],
    },
  },

  // ─── 7. Stacked Area — Web Traffic ───
  {
    id: '07_web_traffic',
    data: [
      { month: 'Jan', organic: 12000, paid: 8000, social: 5000, referral: 3000 },
      { month: 'Feb', organic: 14000, paid: 9500, social: 6200, referral: 3400 },
      { month: 'Mar', organic: 16500, paid: 11000, social: 7800, referral: 4100 },
      { month: 'Apr', organic: 18200, paid: 10200, social: 9100, referral: 4500 },
      { month: 'May', organic: 21000, paid: 12500, social: 10500, referral: 5200 },
      { month: 'Jun', organic: 24500, paid: 13800, social: 12000, referral: 5800 },
      { month: 'Jul', organic: 27000, paid: 14200, social: 13500, referral: 6100 },
      { month: 'Aug', organic: 25800, paid: 15000, social: 14200, referral: 6500 },
    ],
    amoxvis: base({
      chartType: 'area', xAxisKey: 'month',
      yAxisKeys: ['organic', 'paid', 'social', 'referral'],
      chartTitle: 'Website Traffic by Channel',
      chartSubtitle: 'Organic growth outpaces paid acquisition',
      colorTheme: 'vivid', fontFamily: 'inter',
      legendPosition: 'bottom', textAlign: 'left', numberFormat: 'compact',
      sortMode: 'none', limit: 0,
    }),
    meta: {
      title: 'Website Traffic by Channel', category: 'line', lang: 'en',
      description: 'Stacked area with vivid palette and compact numbers',
      showcasedFeatures: ['Stacked Area', 'Vivid Palette', 'Multi-Series', 'Compact Numbers'],
    },
  },

  // ─── 8. Donut — Presupuesto ───
  {
    id: '08_presupuesto',
    data: [
      { category: 'Payroll', amount: 450000 }, { category: 'Marketing', amount: 120000 },
      { category: 'Infrastructure', amount: 95000 }, { category: 'R&D', amount: 85000 },
      { category: 'Operations', amount: 72000 }, { category: 'Legal', amount: 28000 },
      { category: 'Training', amount: 18000 }, { category: 'Other', amount: 12000 },
    ],
    amoxvis: base({
      chartType: 'donut', xAxisKey: 'category', yAxisKeys: ['amount'],
      chartTitle: 'Budget Breakdown',
      chartSubtitle: 'Fiscal year 2024 — Total: $880,000 USD',
      colorTheme: 'default', fontFamily: 'manrope',
      donutThickness: 60, donutCenterKpi: 'total', donutLabelContent: 'name_percent',
      donutLabelPosition: 'outside', donutGroupingThreshold: 3,
      showLabels: true, textAlign: 'center', numberFormat: 'currency',
      sortMode: 'none', limit: 0,
    }),
    meta: {
      title: 'Budget Breakdown', category: 'circular', lang: 'en',
      description: 'A donut with a centre KPI, outside labels and small slices grouped',
      showcasedFeatures: ['Center KPI', 'Outside Labels', 'Grouping Threshold', 'Currency Format'],
    },
  },

  // ─── 9. Scatter — Price vs Quality ───
  {
    id: '09_price_vs_quality',
    data: [
      { product: 'A', price: 25, quality: 72 }, { product: 'B', price: 45, quality: 85 },
      { product: 'C', price: 15, quality: 45 }, { product: 'D', price: 60, quality: 91 },
      { product: 'E', price: 35, quality: 68 }, { product: 'F', price: 80, quality: 95 },
      { product: 'G', price: 20, quality: 55 }, { product: 'H', price: 50, quality: 78 },
      { product: 'I', price: 70, quality: 88 }, { product: 'J', price: 40, quality: 62 },
      { product: 'K', price: 55, quality: 82 }, { product: 'L', price: 30, quality: 59 },
    ],
    amoxvis: base({
      chartType: 'scatter', xAxisKey: 'price', yAxisKeys: ['quality'],
      chartTitle: 'Price vs Quality Correlation',
      chartSubtitle: 'Product portfolio analysis — higher price ≠ always better quality',
      colorTheme: 'neon', fontFamily: 'space-grotesk',
      scatterQuadrants: true, customAxisTitles: { x: 'Price ($)', y: 'Quality Score' },
      backgroundTone: 'darker', textAlign: 'left',
      sortMode: 'none', limit: 0,
    }),
    meta: {
      title: 'Price vs Quality Correlation', category: 'scatter', lang: 'en',
      description: 'Scatter plot with quadrants, neon palette and custom axis titles',
      showcasedFeatures: ['Quadrants', 'Neon Palette', 'Poppins Font', 'Dark Background'],
    },
  },

  // ─── 10. Bubble — Ciudades PIB ───
  {
    id: '10_ciudades_pib',
    data: [
      { city: 'Mexico City', population: 21.8, gdp: 187, area: 1485 },
      { city: 'Guadalajara', population: 5.2, gdp: 52, area: 187 },
      { city: 'Monterrey', population: 4.9, gdp: 78, area: 324 },
      { city: 'Puebla', population: 3.2, gdp: 28, area: 534 },
      { city: 'Tijuana', population: 2.0, gdp: 35, area: 637 },
      { city: 'Leon', population: 1.7, gdp: 22, area: 1219 },
      { city: 'Queretaro', population: 1.3, gdp: 31, area: 759 },
      { city: 'Merida', population: 1.1, gdp: 18, area: 858 },
    ],
    amoxvis: base({
      chartType: 'scatter', xAxisKey: 'population', yAxisKeys: ['gdp'],
      bubbleSizeKey: 'area',
      chartTitle: 'Cities: Population vs GDP',
      chartSubtitle: 'Bubble size stands for the metropolitan area',
      colorTheme: 'ocean', fontFamily: 'inter',
      customAxisTitles: { x: 'Population (millions)', y: 'GDP (USD billions)' },
      textAlign: 'left', numberFormat: 'standard',
      sortMode: 'none', limit: 0,
    }),
    meta: {
      title: 'Cities: Population vs GDP', category: 'scatter', lang: 'en',
      description: 'A bubble chart sized by area, ocean palette',
      showcasedFeatures: ['Bubble Size', 'Ocean Palette', 'Custom Axis Labels'],
    },
  },

  // ─── 11. Combo — Sales vs Satisfaction ───
  {
    id: '11_sales_satisfaction',
    data: [
      { month: 'Jan', sales: 42000, satisfaction: 78 },
      { month: 'Feb', sales: 48000, satisfaction: 82 },
      { month: 'Mar', sales: 51000, satisfaction: 79 },
      { month: 'Apr', sales: 55000, satisfaction: 85 },
      { month: 'May', sales: 62000, satisfaction: 88 },
      { month: 'Jun', sales: 58000, satisfaction: 91 },
    ],
    amoxvis: base({
      chartType: 'combo', xAxisKey: 'month', yAxisKeys: ['sales', 'satisfaction'],
      comboLineKeys: ['satisfaction'], rightYAxisKey: 'satisfaction',
      chartTitle: 'Sales vs Customer Satisfaction',
      chartSubtitle: 'Dual axis: bars = revenue, line = NPS score',
      colorTheme: 'corporate', fontFamily: 'ibm-plex',
      customAxisTitles: { x: 'Month', y: 'Revenue ($)' },
      textAlign: 'left', legendPosition: 'bottom',
      sortMode: 'none', limit: 0,
    }),
    meta: {
      title: 'Sales vs Customer Satisfaction', category: 'other', lang: 'en',
      description: 'Combo chart with dual Y axis, corporate palette',
      showcasedFeatures: ['Bar + Line', 'Dual Y Axis', 'Corporate Palette', 'Source Sans'],
    },
  },

  // ─── 12. Funnel — Embudo de Conversión ───
  {
    id: '12_embudo_conversion',
    data: [
      { stage: 'Visitors', count: 10000 },
      { stage: 'Sign-ups', count: 4200 },
      { stage: 'Activation', count: 2800 },
      { stage: 'Purchase', count: 1100 },
      { stage: 'Repeat purchase', count: 420 },
    ],
    amoxvis: base({
      chartType: 'funnel', xAxisKey: 'stage', yAxisKeys: ['count'],
      chartTitle: 'Digital Conversion Funnel',
      chartSubtitle: 'Overall conversion rate: 4.2%',
      chartFootnote: 'Period: March 2024 · Source: web analytics',
      colorTheme: 'dark2', fontFamily: 'inter',
      showLabels: true, textAlign: 'center',
      sortMode: 'none', limit: 0,
    }),
    meta: {
      title: 'Digital Conversion Funnel', category: 'other', lang: 'en',
      description: 'A funnel with centre labels and the dark2 palette',
      showcasedFeatures: ['Funnel Sort', 'Center Labels', 'Dark2 Palette'],
    },
  },

  // ─── 13. Heatmap — Weekly Activity ───
  {
    id: '13_activity_heatmap',
    data: [
      { day: 'Mon', h6: 2, h9: 45, h12: 38, h15: 52, h18: 30, h21: 8 },
      { day: 'Tue', h6: 5, h9: 62, h12: 41, h15: 58, h18: 35, h21: 12 },
      { day: 'Wed', h6: 3, h9: 55, h12: 48, h15: 61, h18: 42, h21: 15 },
      { day: 'Thu', h6: 4, h9: 58, h12: 44, h15: 55, h18: 38, h21: 10 },
      { day: 'Fri', h6: 1, h9: 48, h12: 50, h15: 42, h18: 25, h21: 20 },
      { day: 'Sat', h6: 0, h9: 12, h12: 28, h15: 22, h18: 35, h21: 42 },
      { day: 'Sun', h6: 0, h9: 8, h12: 15, h15: 18, h18: 28, h21: 38 },
    ],
    amoxvis: base({
      chartType: 'heatmap', xAxisKey: 'day',
      yAxisKeys: ['h6', 'h9', 'h12', 'h15', 'h18', 'h21'],
      chartTitle: 'Weekly Activity Heatmap',
      chartSubtitle: 'User sessions by day and time block',
      colorTheme: 'blues', fontFamily: 'jetbrains',
      textAlign: 'center',
      sortMode: 'none', limit: 0,
    }),
    meta: {
      title: 'Weekly Activity Heatmap', category: 'other', lang: 'en',
      description: 'Color intensity matrix with blues palette',
      showcasedFeatures: ['Color Intensity', 'Blues Palette', 'JetBrains Font', 'Matrix View'],
    },
  },

  // ─── 14. Treemap — Gastos por Departamento ───
  {
    id: '14_gastos_depto',
    data: [
      { department: 'Engineering', spend: 380000 },
      { department: 'Marketing', spend: 220000 },
      { department: 'Sales', spend: 195000 },
      { department: 'Operations', spend: 165000 },
      { department: 'People', spend: 120000 },
      { department: 'Finance', spend: 95000 },
      { department: 'Legal', spend: 72000 },
      { department: 'Support', spend: 58000 },
    ],
    amoxvis: base({
      chartType: 'treemap', xAxisKey: 'department', yAxisKeys: ['spend'],
      chartTitle: 'Spend by Department',
      chartSubtitle: 'How the annual operating budget is split',
      colorTheme: 'set2', fontFamily: 'manrope',
      textAlign: 'left', numberFormat: 'currency',
      sortMode: 'none', limit: 0,
    }),
    meta: {
      title: 'Spend by Department', category: 'other', lang: 'en',
      description: 'A treemap with the Set2 palette and currency formatting',
      showcasedFeatures: ['Hierarchical Rectangles', 'Set2 Palette', 'Currency Format'],
    },
  },

  // ─── 15. Bar Horizontal 100% — Satisfaction Survey ───
  {
    id: '15_satisfaction_survey',
    data: [
      { area: 'Product', very_satisfied: 42, satisfied: 31, neutral: 15, dissatisfied: 12 },
      { area: 'Support', very_satisfied: 35, satisfied: 28, neutral: 20, dissatisfied: 17 },
      { area: 'Pricing', very_satisfied: 22, satisfied: 33, neutral: 25, dissatisfied: 20 },
      { area: 'UX/Design', very_satisfied: 48, satisfied: 30, neutral: 14, dissatisfied: 8 },
      { area: 'Documentation', very_satisfied: 18, satisfied: 35, neutral: 30, dissatisfied: 17 },
    ],
    amoxvis: base({
      chartType: 'bar-horizontal', barStackMode: 'expand',
      xAxisKey: 'area', yAxisKeys: ['very_satisfied', 'satisfied', 'neutral', 'dissatisfied'],
      chartTitle: 'Employee Satisfaction Survey',
      chartSubtitle: 'Q4 2024 — All departments combined',
      colorTheme: 'pastel', fontFamily: 'inter',
      legendPosition: 'bottom', textAlign: 'left', numberFormat: 'percent',
      sortMode: 'none', limit: 0,
    }),
    meta: {
      title: 'Employee Satisfaction Survey', category: 'bar', lang: 'en',
      description: 'Horizontal 100% stacked with pastel palette',
      showcasedFeatures: ['100% Stacked Horizontal', 'Pastel Palette', 'Percent Format'],
    },
  },
];

/** Export chart definitions as .amoxvis JSON objects (for backend seeding) */
export const getAmoxvisPayloads = () => {
  return GALLERY_CHARTS.map(chart => {
    // Generate inline SQL query from synthetic data
    let dataQuery = '';
    if (chart.data && chart.data.length > 0) {
      const rows = chart.data.map((row, index) => {
        const values = Object.entries(row).map(([key, val]) => {
          const formattedVal = typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : val;
          return index === 0 ? `${formattedVal} AS ${key}` : formattedVal;
        }).join(', ');
        return `SELECT ${values}`;
      });
      dataQuery = rows.join('\nUNION ALL ');
    }

    const query = `-- Gallery Example: ${chart.meta.title}\n-- This query generates inline sample data for the chart\n${dataQuery}`;

    return {
      id: chart.id,
      payload: JSON.stringify({
        ...chart.amoxvis,
        query: query,
      }, null, 2),
    };
  });
};
