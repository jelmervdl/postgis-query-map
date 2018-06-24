import Map from 'ol/map';
import View from 'ol/view';
import TileLayer from 'ol/layer/tile';
import XYZ from 'ol/source/xyz';
import VectorSource from 'ol/source/vector';
import VectorLayer from 'ol/layer/vector';
import GeoJSON from 'ol/format/geojson';
import Projection from 'ol/proj/projection';
import proj from 'ol/proj';
import CodeMirror from 'codemirror';
import 'codemirror/mode/sql/sql.js';
import 'ol/ol.css';
import 'codemirror/lib/codemirror.css';
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

class Client {
	constructor(connection) {
		this.connection = connection;

		this.result = new VectorSource();

		this.map = new Map({
			target: 'map',
			layers: [
				new TileLayer({
					source: new XYZ({
						url: 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png'
					})
				}),
				new VectorLayer({
					source: this.result
				})
			],
			view: new View({
				center: [0, 0],
				zoom: 2
			})
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
	}

	submitQuery() {
		const query = this.editor.getDoc().getValue();
		this.connection.query(query).then(this.showResult.bind(this));
	}

	showResult(result) {
		const format = new GeoJSON();
		const features = result.rows.map(row => {
			const geojson = Object.values(row).find(value => value instanceof Object);
			const feature = format.readFeature(geojson, {
				featureProjection: this.map.getView().getProjection(),
				dataProjection: format.readProjection(geojson)
			});
			console.log(feature.getGeometry());
			feature.set('row', Object.entries(row).reduce((obj, entry) => {
				if (entry[1] instanceof Object)
					return obj;

				obj[entry[0]] = entry[1];
				return obj;
			}, {}));
			return feature;
		});
		
		this.result.clear();
		this.result.addFeatures(features);
		this.map.getView().fit(this.result.getExtent());
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