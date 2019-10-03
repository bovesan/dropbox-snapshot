import EventEmitter from 'events';
import fs from 'fs';

declare namespace bfj {
	interface ParsingOptions {
		/**
		Transformation function, invoked depth-first against the parsed data structure.
		This option is analagous to the reviver parameter for JSON.parse.
		*/
		reviver?: (key, value) => any,
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
		/**
		If set to true, newline characters at the root level will be treated
		as delimiters between discrete chunks of JSON.
		See NDJSON for more information.
		*/
		ndjson?: boolean,
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
	}
	interface MatchOptions extends ParsingOptions {
		/**
		Set this to true if you wish to match against numbers
		with a string or regular expression selector argument.
		*/
		numbers?: boolean,
		/**
		Only apply the selector to certain depths.
		This can improve performance and memory usage, if you know that you're not interested in parsing top-level items.
		*/
		minDepth?: number,
	}
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
	interface PredicateFunction {
		(key: string, value: any, depth: number): boolean,
	}
	function read(path: string, options?: SerialisationOptions): Promise<any>;
	function match(stream: fs.ReadStream, selector?: string | RegExp | PredicateFunction, options?: MatchOptions): EventEmitter;
	function walk(stream: fs.ReadStream, options?: SerialisationOptions): EventEmitter;
	function write(path: string, object: any, options?: SerialisationOptions): Promise<void>;
	function eventify(data: object, options?: SerialisationOptions): EventEmitter;
	interface Events {
		array: string,
		object: string,
		property: string,
		string: string,
		number: string,
		literal: string,
		endArray: string,
		endObject: string,
		error: string,
		dataError: string,
		end: string,
	}
	const events: Events;
}
export = bfj;
