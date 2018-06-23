export default class Pool {
	constructor() {
		this.sequence = 0;
		this.elements = {};
	}

	add(element) {
		const id = ++this.sequence;
		this.elements[id] = element;
		return id;
	}

	access(id) {
		if (!(id in this.elements))
			throw new Error('Unknown id');

		return this.elements[id];	
	}

	take(id) {
		const element = this.access(id);
		delete this.elements[id];
		return element;
	}
}