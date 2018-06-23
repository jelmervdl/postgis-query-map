import Pool from '../lib/pool.js';

const {app, BrowserWindow, ipcMain} = require('electron');
const pg = require('pg');

let win = null;

function createWindow() {
	win = new BrowserWindow();
	win.loadFile('client.html');
	win.webContents.openDevTools();
	win.on('closed', () => {
		win = null;
	});
}

const connections = new Pool();

ipcMain.on('db-connect', (event, serial, config) => {
	const client = new pg.Client(config);
	client.connect(err => {
		if (err) {
			event.sender.send('db-error', serial, err);
		} else {
			const connectionId = connections.add(client);
			event.sender.send('db-connected', serial, connectionId);
		}
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