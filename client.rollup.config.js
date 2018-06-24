import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import css from 'rollup-plugin-css-porter';

module.exports = {
	entry: 'client/main.js',
	targets: [
		{
			dest: 'build/client.js',
			format: 'iife',
			sourcemap: true
		}
	],
	plugins: [
		resolve(),
		commonjs(),
		css({
			dest: 'build/client.css',
			minified: false
		})
	]
};