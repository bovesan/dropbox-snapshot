import Debug from 'debug';

export const namespaces = {
	info:    'dsnapshot:info',
	verbose: 'dsnapshot:verbose',
    debug:   'dsnapshot:debug',
}

console.log(process.env.DEBUG);
Debug.enable(namespaces.info);
console.log(process.env.DEBUG);

Debug.log = (...args: any[]) => {
	process.stderr.write("\033[2K" + args.join(' ')+'\n');
	if (process.env.linebuffer){
		process.stderr.write(process.env.linebuffer);
	}
}

export default {
	info: Debug(namespaces.info),
	verbose: Debug(namespaces.verbose),
	debug: Debug(namespaces.debug),
	enable(namespace: 'info' | 'verbose' | 'debug'){
		Debug.enable(process.env.DEBUG + ',' + namespaces[namespace]);
		return this;
	}
}