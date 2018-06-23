import Map from 'ol/map';
import View from 'ol/view';
import TileLayer from 'ol/layer/tile';
import XYZ from 'ol/source/xyz';
import Pool from '../lib/pool.js';
import 'ol/ol.css';
import './main.css';

const {ipcRenderer} = require('electron');

const map = new Map({
	target: 'map',
	layers: [
		new TileLayer({
			source: new XYZ({
				url: 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png'
			})
		})
	],
	view: new View({
		center: [0, 0],
		zoom: 2
	})
});


class Client {
	constructor() {
		this.pool = new Pool();

		ipcRenderer.on('db-error', (event, messageId, error) => {
			this.pool.take(messageId).reject(error);
			delete this.pool[messageId];
		});

		ipcRenderer.on('db-connected', (event, messageId, connectionId) => {
			this.pool.take(messageId).accept(new Connection(this, connectionId));
		});

		ipcRenderer.on('db-result', (event, messageId, rows) => {
			this.pool.take(messageId).accept(rows);
		});
	}

	connect(config) {
		return new Promise((accept, reject) => {
			const messageId = this.pool.add({accept, reject});
			ipcRenderer.send('db-connect', messageId, config);
		});
	}

	disconnect(connectionId) {
		ipcRenderer.send('db-disconnect', connectionId);
	}

	query(connectionId, query) {
		return new Promise((accept, reject) => {
			const messageId = this.pool.add({accept, reject});
			ipcRenderer.send('db-query', messageId, connectionId, query);
		});
	}
}


class Connection {
	constructor(client, connectionId) {
		this.valid = true;
		this.client = client;
		this.connectionId = connectionId;
	}

	query(query) {
		if (!this.valid)
			throw new Error('This connection has ended');
		return this.client.query(this.connectionId, query);
	}

	end() {
		this.valid = false;
		return this.client.disconnect(this.connectionId);
	}
}

window.pg = new Client();

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
		window.query = function(query) {
			conn.query(query).then(result => console.log(result), err => console.error('Query error', err));
		};
	},
	err => {
		console.error('Connection error', err);
	});