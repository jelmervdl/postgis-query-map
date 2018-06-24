import Pool from '../lib/pool.js';
const {app, BrowserWindow, ipcMain} = require('electron');
const tunnel = require('tunnel-ssh');
const pg = require('pg');
const postgis = require('pg-postgis-types').default;
const wkx = require('wkx');

// Set identify function, we do the parsing in the client.
postgis.setGeometryParser((value) => {
	return wkx.Geometry.parse(new Buffer(value, 'hex')).toGeoJSON({shortCrs: true});
});

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

function connect(config) {
	if ('ssh' in config)
		return pgConnectOverSSH(config);
	else
		return pgConnect(config);
}

const connections = new Pool();

ipcMain.on('db-connect', (event, serial, config) => {
	connect(config).then(
		(client) => {
			const connectionId = connections.add(client);

			const fetcher = (sql, cb) => {
				client.query(sql).then(res => cb(null, res.rows), err => cb(err));
			};

			postgis(fetcher, connectionId.toString(), (err, oids) => {
				if (err)
					event.sender.send('db-error', serial, err);
				else
					event.sender.send('db-connected', serial, connectionId);
			});
		},
		(err) => {
			event.sender.send('db-error', serial, err.message);
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