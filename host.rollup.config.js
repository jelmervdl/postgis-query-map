import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';

module.exports = {
	entry: 'host/main.js',
	targets: [
		{
			dest: 'build/host.js',
			format: 'iife'
		}
	],
	plugins: [
		resolve(),
		commonjs()
	]
};