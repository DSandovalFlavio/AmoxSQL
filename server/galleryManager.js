/**
 * Gallery Manager — Seeds and serves chart gallery files from ~/.amoxsql/gallery/
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const GALLERY_DIR = path.join(os.homedir(), '.amoxsql', 'gallery');
const THUMBS_DIR = path.join(GALLERY_DIR, 'thumbnails');

// ─── Gallery Chart Definitions (CommonJS version) ────────────────────────────
// These are the 15 chart configs that get seeded as .amoxvis files

const DEFAULT_CONFIG = {
    chartType: 'bar', xAxisKey: '', yAxisKeys: [], rightYAxisKey: '', splitByKey: '', bubbleSizeKey: '',
    dateAggregation: 'none', sortMode: 'x-asc', limit: 50,
    showLabels: false, dataLabelPosition: 'top', dataLabelSize: 11, dataLabelMinSpace: 30,
    tooltipShowPercent: false, showPercentages: false,
    colorTheme: 'default', backgroundTone: 'default', customBgColor: '', borderStyle: 'none', borderColor: '',
    fontFamily: 'system', textScale: 1, numberFormat: 'compact', decimalPlaces: -1,
    gridMode: 'horizontal', showAxisLines: true, yLogScale: false, yAxisDomain: ['auto', 'auto'],
    yAxisPosition: 'left', showXAxisTitle: true, showYAxisTitle: true, customAxisTitles: { x: '', y: '' },
    xAxisLabelAngle: 0, lineType: 'monotone', lineAreaFill: false, showDots: true, isCumulative: false,
    barStackMode: 'none', barRadius: 4, barColorMode: 'series',
    donutThickness: 60, donutLabelContent: 'name_percent', donutLabelPosition: 'outside',
    donutGroupingThreshold: 0, donutCenterKpi: 'none', scatterQuadrants: false, comboLineKeys: [],
    highlightConfig: { type: 'none', value: '', color: '#ff0000' }, seriesConfig: {},
    legendPosition: 'bottom', chartTitle: '', chartSubtitle: '', chartFootnote: '', textAlign: 'left',
    refLine: { value: '', label: '', color: '#ff4444', style: 'dashed' },
    refArea: { x1: '', x2: '', y1: '', y2: '', color: '#ffffff', opacity: 0.1 },
    goalLine: { enabled: false, value: '', label: 'Goal', color: '#22c55e', style: 'dashed' },
    trendLine: { type: 'none', color: '#fbbf24', windowSize: 3 },
    headline: { visible: false, metric: 'total', compareWith: 'none', size: 'auto', customSize: 28 },
    marginTop: 20, marginBottom: 10, marginLeft: 20, marginRight: 30, titleSpacing: 10,
};

const base = (overrides) => ({ ...DEFAULT_CONFIG, ...overrides });

const GALLERY_DEFINITIONS = [
    { id: '01_ventas_mensuales', config: base({ chartType:'bar',xAxisKey:'mes',yAxisKeys:['ventas'],chartTitle:'Ventas Mensuales 2024',chartSubtitle:'Crecimiento sostenido del Q3',chartFootnote:'Fuente: Sistema de ventas · Datos en USD',colorTheme:'ocean',fontFamily:'inter',showLabels:true,dataLabelPosition:'top',backgroundTone:'darker',borderStyle:'subtle',highlightConfig:{type:'max',value:'',color:'#22c55e'},goalLine:{enabled:true,value:28000,label:'Meta',color:'#22c55e',style:'dashed'},trendLine:{type:'linear',color:'#fbbf24',windowSize:3},textAlign:'left',barRadius:6,numberFormat:'compact',sortMode:'none',limit:0 }), query: "-- Ventas Mensuales 2024\nSELECT * FROM (VALUES ('Ene',12400),('Feb',15800),('Mar',18200),('Abr',16900),('May',21300),('Jun',19700),('Jul',24500),('Ago',27800),('Sep',31200),('Oct',28400),('Nov',25600),('Dic',33100)) AS t(mes, ventas)" },
    { id: '02_revenue_by_region', config: base({ chartType:'bar',barStackMode:'stack',xAxisKey:'quarter',yAxisKeys:['north','south','west','east'],chartTitle:'Revenue by Region & Product',chartSubtitle:'Fiscal Year 2024',colorTheme:'sunset',fontFamily:'outfit',textAlign:'left',barRadius:4,sortMode:'none',limit:0 }), query: "SELECT * FROM (VALUES ('Q1',45000,32000,28000,19000),('Q2',52000,38000,31000,22000),('Q3',61000,42000,35000,27000),('Q4',58000,48000,39000,31000)) AS t(quarter,north,south,west,east)" },
    { id: '03_market_share', config: base({ chartType:'bar',barStackMode:'expand',xAxisKey:'quarter',yAxisKeys:['alpha','beta','gamma','other'],chartTitle:'Market Share by Quarter',chartSubtitle:'Beta surpasses Alpha in Q1-24',colorTheme:'spectral',fontFamily:'roboto',legendPosition:'top',textAlign:'center',numberFormat:'percent',sortMode:'none',limit:0 }), query: "SELECT * FROM (VALUES ('Q1-23',42,28,18,12),('Q2-23',39,30,19,12),('Q3-23',36,31,21,12),('Q4-23',34,33,22,11),('Q1-24',31,34,24,11),('Q2-24',29,35,25,11)) AS t(quarter,alpha,beta,gamma,other)" },
    { id: '04_top_peliculas', config: base({ chartType:'bar-horizontal',xAxisKey:'pelicula',yAxisKeys:['rating'],chartTitle:'Top 10 Películas por Rating',chartSubtitle:'Calificación promedio',colorTheme:'default',fontFamily:'poppins',barColorMode:'dimension',barRadius:8,showLabels:true,dataLabelPosition:'outside',sortMode:'y-desc',textAlign:'left',numberFormat:'standard',decimalPlaces:1,limit:10 }), query: "SELECT * FROM (VALUES ('El Padrino',9.2),('Pulp Fiction',8.9),('Interstellar',8.7),('Parasite',8.5),('Inception',8.4),('The Matrix',8.3),('Coco',8.2),('Spirited Away',8.1),('Amélie',8.0),('Whiplash',7.9)) AS t(pelicula,rating)" },
    { id: '05_hours_by_team', config: base({ chartType:'bar-horizontal',barStackMode:'stack',xAxisKey:'project',yAxisKeys:['engineering','design','qa'],chartTitle:'Hours per Project by Team',chartSubtitle:'Sprint 14',colorTheme:'set2',fontFamily:'source-sans',customAxisTitles:{x:'Total Hours',y:'Project'},sortMode:'y-desc',textAlign:'left',limit:0 }), query: "SELECT * FROM (VALUES ('Platform',320,80,120),('Mobile App',280,140,90),('Analytics',200,40,60),('DevOps',180,20,100),('Research',150,60,30)) AS t(project,engineering,design,qa)" },
    { id: '06_temperatura_anual', config: base({ chartType:'line',xAxisKey:'mes',yAxisKeys:['temp'],chartTitle:'Temperatura Promedio Anual',chartSubtitle:'Ciudad de México',chartFootnote:'Datos: CONAGUA · °C',colorTheme:'rdylbu',fontFamily:'inter',lineType:'monotone',lineAreaFill:true,showDots:true,refLine:{value:20,label:'Confort térmico',color:'#22c55e',style:'dashed'},textAlign:'left',numberFormat:'standard',decimalPlaces:1,sortMode:'none',limit:0 }), query: "SELECT * FROM (VALUES ('Ene',5.2),('Feb',7.1),('Mar',11.4),('Abr',15.8),('May',20.3),('Jun',25.1),('Jul',28.7),('Ago',27.9),('Sep',22.4),('Oct',16.2),('Nov',10.1),('Dic',6.3)) AS t(mes,temp)" },
    { id: '07_web_traffic', config: base({ chartType:'area',xAxisKey:'month',yAxisKeys:['organic','paid','social','referral'],chartTitle:'Website Traffic by Channel',chartSubtitle:'Organic growth outpaces paid',colorTheme:'vivid',fontFamily:'roboto',textAlign:'left',numberFormat:'compact',sortMode:'none',limit:0 }), query: "SELECT * FROM (VALUES ('Jan',12000,8000,5000,3000),('Feb',14000,9500,6200,3400),('Mar',16500,11000,7800,4100),('Apr',18200,10200,9100,4500),('May',21000,12500,10500,5200),('Jun',24500,13800,12000,5800),('Jul',27000,14200,13500,6100),('Aug',25800,15000,14200,6500)) AS t(month,organic,paid,social,referral)" },
    { id: '08_presupuesto', config: base({ chartType:'donut',xAxisKey:'categoria',yAxisKeys:['monto'],chartTitle:'Distribución Presupuestaria',chartSubtitle:'Año fiscal 2024 — Total: $880K',colorTheme:'default',fontFamily:'outfit',donutThickness:60,donutCenterKpi:'total',donutLabelContent:'name_percent',donutLabelPosition:'outside',donutGroupingThreshold:3,showLabels:true,textAlign:'center',numberFormat:'currency',sortMode:'none',limit:0 }), query: "SELECT * FROM (VALUES ('Nómina',450000),('Marketing',120000),('Infraestructura',95000),('I+D',85000),('Operaciones',72000),('Legal',28000),('Capacitación',18000),('Otros',12000)) AS t(categoria,monto)" },
    { id: '09_price_vs_quality', config: base({ chartType:'scatter',xAxisKey:'price',yAxisKeys:['quality'],chartTitle:'Price vs Quality Correlation',chartSubtitle:'Product portfolio analysis',colorTheme:'neon',fontFamily:'poppins',scatterQuadrants:true,customAxisTitles:{x:'Price ($)',y:'Quality Score'},backgroundTone:'darker',textAlign:'left',sortMode:'none',limit:0 }), query: "SELECT * FROM (VALUES ('A',25,72),('B',45,85),('C',15,45),('D',60,91),('E',35,68),('F',80,95),('G',20,55),('H',50,78),('I',70,88),('J',40,62),('K',55,82),('L',30,59)) AS t(product,price,quality)" },
    { id: '10_ciudades_pib', config: base({ chartType:'scatter',xAxisKey:'poblacion',yAxisKeys:['pib'],bubbleSizeKey:'area',chartTitle:'Ciudades: Población vs PIB',chartSubtitle:'Tamaño = área metropolitana',colorTheme:'ocean',fontFamily:'inter',customAxisTitles:{x:'Población (M)',y:'PIB (B USD)'},textAlign:'left',numberFormat:'standard',sortMode:'none',limit:0 }), query: "SELECT * FROM (VALUES ('CDMX',21.8,187,1485),('Guadalajara',5.2,52,187),('Monterrey',4.9,78,324),('Puebla',3.2,28,534),('Tijuana',2.0,35,637),('León',1.7,22,1219),('Querétaro',1.3,31,759),('Mérida',1.1,18,858)) AS t(ciudad,poblacion,pib,area)" },
    { id: '11_sales_satisfaction', config: base({ chartType:'combo',xAxisKey:'month',yAxisKeys:['sales','satisfaction'],comboLineKeys:['satisfaction'],rightYAxisKey:'satisfaction',chartTitle:'Sales vs Customer Satisfaction',chartSubtitle:'Dual axis: bars = revenue, line = NPS',colorTheme:'corporate',fontFamily:'source-sans',customAxisTitles:{x:'Month',y:'Revenue ($)'},textAlign:'left',sortMode:'none',limit:0 }), query: "SELECT * FROM (VALUES ('Jan',42000,78),('Feb',48000,82),('Mar',51000,79),('Apr',55000,85),('May',62000,88),('Jun',58000,91)) AS t(month,sales,satisfaction)" },
    { id: '12_embudo_conversion', config: base({ chartType:'funnel',xAxisKey:'etapa',yAxisKeys:['cantidad'],chartTitle:'Embudo de Conversión Digital',chartSubtitle:'Tasa de conversión: 4.2%',chartFootnote:'Período: Marzo 2024',colorTheme:'dark2',fontFamily:'inter',showLabels:true,textAlign:'center',sortMode:'none',limit:0 }), query: "SELECT * FROM (VALUES ('Visitantes',10000),('Registros',4200),('Activación',2800),('Compra',1100),('Recompra',420)) AS t(etapa,cantidad)" },
    { id: '13_activity_heatmap', config: base({ chartType:'heatmap',xAxisKey:'day',yAxisKeys:['h6','h9','h12','h15','h18','h21'],chartTitle:'Weekly Activity Heatmap',chartSubtitle:'User sessions by day & time',colorTheme:'blues',fontFamily:'jetbrains',textAlign:'center',sortMode:'none',limit:0 }), query: "SELECT * FROM (VALUES ('Mon',2,45,38,52,30,8),('Tue',5,62,41,58,35,12),('Wed',3,55,48,61,42,15),('Thu',4,58,44,55,38,10),('Fri',1,48,50,42,25,20),('Sat',0,12,28,22,35,42),('Sun',0,8,15,18,28,38)) AS t(day,h6,h9,h12,h15,h18,h21)" },
    { id: '14_gastos_depto', config: base({ chartType:'treemap',xAxisKey:'departamento',yAxisKeys:['gasto'],chartTitle:'Gastos por Departamento',chartSubtitle:'Presupuesto operativo anual',colorTheme:'set2',fontFamily:'outfit',textAlign:'left',numberFormat:'currency',sortMode:'none',limit:0 }), query: "SELECT * FROM (VALUES ('Ingeniería',380000),('Marketing',220000),('Ventas',195000),('Operaciones',165000),('RRHH',120000),('Finanzas',95000),('Legal',72000),('Soporte',58000)) AS t(departamento,gasto)" },
    { id: '15_satisfaction_survey', config: base({ chartType:'bar-horizontal',barStackMode:'expand',xAxisKey:'area',yAxisKeys:['very_satisfied','satisfied','neutral','dissatisfied'],chartTitle:'Employee Satisfaction Survey',chartSubtitle:'Q4 2024',colorTheme:'pastel',fontFamily:'roboto',textAlign:'left',numberFormat:'percent',sortMode:'none',limit:0 }), query: "SELECT * FROM (VALUES ('Product',42,31,15,12),('Support',35,28,20,17),('Pricing',22,33,25,20),('UX/Design',48,30,14,8),('Docs',18,35,30,17)) AS t(area,very_satisfied,satisfied,neutral,dissatisfied)" },
];

// ─── Seed Gallery ────────────────────────────────────────────────────────────

function seedGallery() {
    try {
        if (!fs.existsSync(GALLERY_DIR)) {
            fs.mkdirSync(GALLERY_DIR, { recursive: true });
        }
        if (!fs.existsSync(THUMBS_DIR)) {
            fs.mkdirSync(THUMBS_DIR, { recursive: true });
        }

        let seeded = 0;
        for (const def of GALLERY_DEFINITIONS) {
            const filePath = path.join(GALLERY_DIR, `${def.id}.amoxvis`);
            const payload = { ...def.config, query: def.query };
            fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
            seeded++;
        }
        if (seeded > 0) {
            console.log(`[Gallery] Seeded ${seeded} chart examples in ${GALLERY_DIR}`);
        }
    } catch (err) {
        console.warn('[Gallery] Seed warning:', err.message);
    }
}

// ─── Register Routes ─────────────────────────────────────────────────────────

function registerGalleryRoutes(app) {
    // List gallery charts
    app.get('/api/gallery/list', (req, res) => {
        try {
            seedGallery(); // Ensure gallery exists

            const charts = GALLERY_DEFINITIONS.map(def => {
                const thumbPath = path.join(THUMBS_DIR, `${def.id}.png`);
                return {
                    id: def.id,
                    title: def.config.chartTitle || def.id,
                    subtitle: def.config.chartSubtitle || '',
                    chartType: def.config.chartType,
                    hasThumbnail: fs.existsSync(thumbPath),
                    amoxvisPath: path.join(GALLERY_DIR, `${def.id}.amoxvis`),
                };
            });
            res.json({ charts, galleryDir: GALLERY_DIR });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Save thumbnail
    app.post('/api/gallery/thumbnail', (req, res) => {
        const { id, imageData } = req.body;
        if (!id || !imageData) return res.status(400).json({ error: 'id and imageData required' });

        try {
            if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });
            const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
            fs.writeFileSync(path.join(THUMBS_DIR, `${id}.png`), base64Data, 'base64');
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Serve thumbnail
    app.get('/api/gallery/thumbnail/:id', (req, res) => {
        const thumbPath = path.join(THUMBS_DIR, `${req.params.id}.png`);
        if (!fs.existsSync(thumbPath)) return res.status(404).json({ error: 'Thumbnail not found' });
        res.sendFile(thumbPath, { dotfiles: 'allow' });
    });

    // Copy to workspace
    app.post('/api/gallery/copy-to-workspace', (req, res) => {
        const { chartId, targetDir } = req.body;
        if (!chartId) return res.status(400).json({ error: 'chartId required' });

        const srcPath = path.join(GALLERY_DIR, `${chartId}.amoxvis`);
        if (!fs.existsSync(srcPath)) return res.status(404).json({ error: 'Gallery chart not found' });

        try {
            const destDir = targetDir || process.cwd();
            const destPath = path.join(destDir, `${chartId}.amoxvis`);
            fs.copyFileSync(srcPath, destPath);
            res.json({ success: true, path: destPath });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Read a gallery .amoxvis file
    app.get('/api/gallery/chart/:id', (req, res) => {
        const filePath = path.join(GALLERY_DIR, `${req.params.id}.amoxvis`);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Chart not found' });
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            res.json({ content: JSON.parse(content), path: filePath });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}

module.exports = { seedGallery, registerGalleryRoutes, GALLERY_DEFINITIONS };
