import Map from 'ol/map.js';
import View from 'ol/view.js';
import Overlay from 'ol/overlay.js';
import TileLayer from 'ol/layer/tile.js';
import XYZ from 'ol/source/xyz.js';
import VectorSource from 'ol/source/vector.js';
import VectorLayer from 'ol/layer/vector.js';
import GeoJSON from 'ol/format/geojson.js';
import Projection from 'ol/proj/projection.js';
import proj from 'ol/proj.js';
import Draw from 'ol/interaction/draw.js';
import Control from 'ol/control/control.js';
import controlDefaults from 'ol/control.js';
import CodeMirror from 'codemirror';
import DataTable from 'frappe-datatable';
import 'codemirror/mode/sql/sql.js';
import 'ol/ol.css';
import 'codemirror/lib/codemirror.css';
import 'frappe-datatable/dist/frappe-datatable.css';
import './popup.css';
import './main.css';
import * as db from '../lib/db.js';

const {ipcRenderer} = require('electron');
const proj4 = require('proj4');

window.proj4 = proj4;

proj4.defs("EPSG:28992","+proj=sterea\
	+lat_0=52.15616055555555 +lon_0=5.38763888888889 \
	+k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel \
	+towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 \
	+units=m +no_defs");

// proj.addProjection(new Projection({
// 	code: 'EPSG:28992',
// 	units: 'm',
// 	extent: [-285401.92, 22598.08, 595401.9199999999, 903401.9199999999]
// }));

function isObject(item) {
	return (item && typeof item === 'object' && !Array.isArray(item));
}

function assignDeep(target, ...sources) {
	sources.forEach(source => {
		for (const key in source) {
			if (isObject(source[key]) && (key in target)) {
				assignDeep(target[key], source[key]);
			} else {
				if (target instanceof window.Element && !(key in target))
					target.setAttribute(key, source[key]);
				else
					Object.assign(target, {[key]: source[key]});
			}
		}
	});

	return target;
};

function createElement(tagName, properties = {}, content = []) {
	var el = document.createElement(tagName);

	assignDeep(el, properties);

	if (!Array.isArray(content))
		content = [content];

	content.forEach(function(child) {
		if (child === null || child === undefined)
			return;
		
		if (child instanceof window.Element || child instanceof window.DocumentFragment)
			el.appendChild(child);
		else
			el.appendChild(document.createTextNode(child));
	});

	return el;
}

class InteractionControl extends Control {
	constructor(interaction, opt_options) {
		const options = opt_options || {};

		const button = createElement('button', {}, [options.label]);
		button.addEventListener('click', e => {
			if (this.isActive())
				this.getMap().removeInteraction(this.interaction);
			else
				this.getMap().addInteraction(this.interaction);
		});

		const element = createElement('div', {className: 'toggle-drawing ol-unselectable ol-control'}, [button]);

		super({
			element: element,
			target: options.target
		});

		this.interaction = interaction;
	}

	isActive() {
		return this.getMap().getInteractions().getArray().includes(this.interaction);
	}
}

class Client {
	constructor(connection) {
		this.connection = connection;

		this.layer = new VectorSource();

		this.drawing = new VectorSource({wrapX: false});

		this.drawingControl = new InteractionControl(
			new Draw({
				source: this.drawing,
				type: 'Polygon'
			}),
			{label: 'D'}
		);

		this.popup = new Overlay({
			element: document.querySelector('#popup'),
			autoPan: true,
			autoPanAnimation: {
				duration: 250
			}
		});

		this.popup.getElement().querySelector('.ol-popup-closer').addEventListener('click', e => {
			this.popup.setPosition(undefined);
			e.target.blur();
			e.preventDefault();
		});

		this.map = new Map({
			target: 'map',
			controls: controlDefaults.defaults().extend([this.drawingControl]),
			layers: [
				new TileLayer({
					source: new XYZ({
						url: 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png'
					})
				}),
				new VectorLayer({
					source: this.layer
				}),
				new VectorLayer({
					source: this.drawing
				})
			],
			overlays: [
				this.popup
			],
			view: new View({
				center: [0, 0],
				zoom: 2
			})
		});

		this.map.on('pointermove', e => {
			const hit = this.map.hasFeatureAtPixel(e.pixel);
			this.map.getTargetElement().style.cursor = hit ? 'pointer' : '';
		});

		this.map.on('singleclick', e => {
			if (this.drawingControl.isActive())
				return;

			const features = [];

			this.map.forEachFeatureAtPixel(e.pixel, function(feature) {
				if (!feature.get('row'))
					return;

	        	features.push(createElement('table', {className: 'feature-table'}, Object.entries(feature.get('row')).map(entry => {
	        		return createElement('tr', {}, [
	        			createElement('th', {}, [entry[0]]),
	        			createElement('td', {}, [entry[1]])
	        		]);
	        	})));
			});

			const contentEl = this.popup.getElement().querySelector('.ol-popup-content');
			contentEl.innerHTML = '';

			features.forEach(table => contentEl.appendChild(table));

			this.popup.setPosition(features.length ? e.coordinate : undefined);
		});

		this.editor = CodeMirror(document.querySelector('#editor'), {
			value: 'SELECT * FROM buildings',
			mode: 'text/x-pgsql',
			indentWithTabs: true,
			smartIndent: true,
			lineNumbers: false,
			matchBrackets : true,
			autofocus: true,
			lineWrapping: true,
			extraKeys:{
				'F5': this.submitQuery.bind(this),
				'Cmd-Enter': this.submitQuery.bind(this),
				'Alt-Up': null,
				'Alt-Down': null,
				'Ctrl-Space': 'autocomplete'
			}
		});

		this.table = new DataTable(document.querySelector('#data-table'), {
			columns: [],
			data: [],
			layout: 'fluid',
			clusterize: true
		});

		this.result = null;

		document.querySelector('#view-switch').addEventListener('click', e => {
			if (e.target.matches('button[data-view]'))
				this.setActiveView(e.target.dataset.view);
		});

		this.setActiveView('map');
	}

	setActiveView(view) {
		this.activeView = view;

		document.querySelectorAll('#view-switch button').forEach(button => {
			button.classList.toggle('active', button.dataset.view == view);
		});

		document.querySelectorAll('#visualisation > [data-view]').forEach(visualisation => {
			visualisation.classList.toggle('active', visualisation.dataset.view == view);
		});

		this.updateView();
	}

	submitQuery() {
		const geojson = new GeoJSON();
		const query = "WITH\n"
			+ `_shapes_data AS (SELECT '${geojson.writeFeatures(this.drawing.getFeatures())}'::json as fc),\n`
			+ "_shapes_features AS (SELECT json_array_elements(fc->'features') as feature FROM _shapes_data),\n"
			+ "_shapes AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(feature->>'geometry'), 4326) as geom FROM _shapes_features)\n"
			+ this.editor.getDoc().getValue().replace(/^\s*WITH\s+/, ",\n");

		console.log(query);

		this.connection.query(query).then(this.showResult.bind(this));
	}

	showResult(result) {
		this.result = result;
		this.clearMap();
		this.clearTable();
		this.updateView();
	}

	updateView() {
		if (!this.result)
			return;
		
		switch (this.activeView) {
			case 'map':
				return this.updateMap();

			case 'table':
				return this.updateTable();
		}
	}

	updateMap() {
		const format = new GeoJSON();

		const features = this.result.rows.map(row => {
			const geojson = Object.values(row).find(value => value instanceof Object);

			const feature = format.readFeature(geojson, {
				featureProjection: this.map.getView().getProjection(),
				dataProjection: format.readProjection(geojson)
			});

			feature.set('row', Object.entries(row).reduce((obj, entry) => {
				if (entry[1] instanceof Object)
					return obj;

				obj[entry[0]] = entry[1];
				return obj;
			}, {}));

			return feature;
		});

		this.layer.addFeatures(features);
		this.map.updateSize();
		this.map.getView().fit(this.layer.getExtent());
	}

	clearMap() {
		this.layer.clear();
	}

	updateTable() {
		const columns = this.result.fields.map(field => field.name);

		const rows = this.result.rows.map(row => columns.map(name => {
			return row[name];
		}));

		this.table.refresh(rows, columns);
	}

	clearTable() {
		// this.table.destroy();
	}
}

window.pg = new db.Client();

const conn = window.pg.connect({
	host: 'localhost',
	port: 5432,
	user: '',
	password: '',
	database: '',
	ssh: {
		host: '',
		port: 22,
		user: '',
		password: ''
	}
});

conn.then(
	conn => {
		window.client = new Client(conn);

		window.query = function(query) {
			conn.query(query).then(result => console.log(result), err => console.error('Query error', err));
		};
	},
	err => {
		console.log('Connection error:' + err);
	});