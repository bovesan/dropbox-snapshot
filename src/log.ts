import Debug from 'debug';

export const namespaces = {
	error:   'raindance:error',
	info:    'raindance:info',
	verbose: 'raindance:verbose',
    debug:   'raindance:debug',
}

Debug.enable(namespaces.info);

Debug.log = (...args: any[]) => {
	process.stderr.write("\033[2K" + args.join(' ')+'\n');
	if (process.env.linebuffer){
		process.stderr.write(process.env.linebuffer);
	}
}

export default {
	error: Debug(namespaces.info),
	info: Debug(namespaces.info),
	verbose: Debug(namespaces.verbose),
	debug: Debug(namespaces.debug),
	enable(namespace: 'info' | 'verbose' | 'debug'){
		Debug.enable(process.env.DEBUG + ',' + namespaces[namespace]);
		return this;
	}
}