declare namespace bfj {
	interface SerialisationOptions {
		/**
		Indentation string or the number of spaces to indent each nested level by.
		This option is analagous to the space parameter for JSON.stringify.
		*/
		space?: string | number,
		/**
		By default, promises are coerced to their resolved value.
		Set this property to 'ignore' for improved performance if you don't need to coerce promises.
		*/
		promises?: 'ignore',
		/**
		By default, buffers are coerced using their toString method.
		Set this property to 'ignore' for improved performance if you don't need to coerce buffers.
		*/
		buffers?: 'ignore',
		/**
		By default, maps are coerced to plain objects.
		Set this property to 'ignore' for improved performance if you don't need to coerce maps.
		*/
		maps?: 'ignore',
		/**
		By default, other iterables (i.e. not arrays, strings or maps) are coerced to arrays.
		Set this property to 'ignore' for improved performance if you don't need to coerce iterables.
		*/
		iterables?: 'ignore',
		/**
		By default, circular references will cause the write to fail.
		Set this property to 'ignore' if you'd prefer to silently skip past circular references in the data.
		*/
		circular?: 'ignore',
		/**
		The length of the write buffer.
		Smaller values use less memory but may result in a slower serialisation time.
		The default value is 1024.
		*/
		bufferLength?: number,
		/**
		Set this if you would like to pass a value for the highWaterMark option to the readable stream constructor.
		*/
		highWaterMark?: number,
		/**
		The number of data items to process before yielding to the event loop.
		Smaller values yield to the event loop more frequently,
		meaning less time will be consumed by bfj per tick but the overall serialisation time will be slower.
		Larger values yield to the event loop less often,
		meaning slower tick times but faster overall serialisation time.
		The default value is 16384.
		*/
		yieldRate?: number,
		/**
		Promise constructor that will be used for promises returned by all methods.
		If you set this option, please be aware that some promise implementations
		(including native promises) may cause your process to die with out-of-memory exceptions.
		Defaults to bluebird's implementation, which does not have that problem.
		*/
		Promise?: PromiseConstructor,
	}
	function write(path: string, object: any, options?: SerialisationOptions): Promise<void>;
}
export = bfj;
