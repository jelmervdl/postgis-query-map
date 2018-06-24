import Pool from './pool.js';
const {ipcRenderer} = require('electron');

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

export class Client {
	constructor() {
		this.pool = new Pool();

		ipcRenderer.on('db-error', (event, messageId, error) => {
			this.pool.take(messageId).reject(error);
			delete this.pool[messageId];
		});

		ipcRenderer.on('db-connected', (event, messageId, connectionId) => {
			this.pool.take(messageId).accept(new Connection(this, connectionId));
		});

		ipcRenderer.on('db-result', (event, messageId, result) => {
			this.pool.take(messageId).accept(result);
		});
	}

	unmarshalRow(row) {
		return 
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

