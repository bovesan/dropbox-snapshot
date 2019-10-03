import fs from 'fs';

export function readArray(path: string, array: any[], onChunk: (bytesRead: number, entriesRead: number) => void) {
	return new Promise((resolve, reject) => {
		array.length = 0;
		let count = 0;
		let leftover = '';
		const readStream = fs.createReadStream(path, {
			encoding: 'utf8',
			highWaterMark: 10 * 1024 * 1024,
		});
		readStream.on('data', function(chunk: string) {
			chunk = leftover + chunk;
			let instring = false;
			let level = 0;
			let firstStart: number | undefined;
			let lastEnd;
			for (var i = 0; i < chunk.length; ++i) {
				if (chunk[i] === '"' && chunk[i-1] !== '\\'){
					instring = !instring;
				} else if (!instring) {
					if (chunk[i] === '{') {
						level++;
						if (firstStart === undefined){
							firstStart = i;
						}
					} else if (chunk[i] === '}') {
						level--;
						lastEnd = i+1;
						count++;
					}
				}
			}
			array.push(...JSON.parse('[' + chunk.slice(firstStart, lastEnd) + ']'));
			leftover = chunk.slice(lastEnd);
			onChunk(readStream.bytesRead, array.length);
		});

		readStream.on('end', function() {
			resolve();
		});
});
}