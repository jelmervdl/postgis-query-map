import Pool from '../lib/pool.js';
const {app, BrowserWindow, ipcMain} = require('electron');
const pg = require('pg');
const tunnel = require('tunnel-ssh');

let win = null;

function createWindow() {
	win = new BrowserWindow();
	win.loadFile('client.html');
	win.webContents.openDevTools();
	win.on('closed', () => {
		win = null;
	});
}

function pgConnect(config) {
	return new Promise((accept, reject) => {
		const client = new pg.Client(config);
		client.connect(err => {
			if (err)
				reject(err);
			else
				accept(client);
		});
	});
}

function pgConnectOverSSH(config) {
	const sshConfig = {
		host: config.ssh.host,
		port: config.ssh.port || 22,
		username: config.ssh.user,
		password: config.ssh.password,
		dstHost: config.host,
		dstPort: config.port,
		localHost: 'localhost',
		localPort: 0
	};

	return new Promise((accept, reject) => {
		tunnel(sshConfig, (err, tnl) => {
			if (err)
				return reject(err.message);

			const pgConfig = Object.assign({}, config, {
				host: 'localhost',
				port: tnl.address().port
			});

			const pgClient = new pg.Client(pgConfig);
			pgClient.connect(err => {
				if (err) {
					tnl.close();
					reject(err.message);
				} else {
					pgClient.on('end', () => tnl.close());
					accept(pgClient);
				}
			});
		});
	});
}

const connections = new Pool();

function connect(config) {
	if ('ssh' in config)
		return pgConnectOverSSH(config);
	else
		return pgConnect(config);
}

ipcMain.on('db-connect', (event, serial, config) => {
	connect(config).then(
		(client) => {
			const connectionId = connections.add(client);
			event.sender.send('db-connected', serial, connectionId);
		},
		(err) => {
			event.sender.send('db-error', serial, err);
		});
});

ipcMain.on('db-disconnect', (event, connectionId) => {
	connections.take(connectionId).end();
})

ipcMain.on('db-query', (event, serial, connectionId, query) => {
	try {
		connections.access(connectionId).query(query, [], (err, result) => {
			if (err) {
				event.sender.send('db-error', serial, err);
			} else {
				event.sender.send('db-result', serial, result);
			}
		});
	} catch (err) {
		event.sender.send('db-error', serial, err.message);
	}
});

app.on('ready', createWindow);

app.on('window-all-closed', () => {
	if (process.platform != 'darwin')
		app.quit();
});

app.on('activate', () => {
	if (win === null)
		createWindow();
});