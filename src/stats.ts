export function humanDuration(milliseconds: number){
	const units = [
		{
			singular: 'day',
			plural: 'days',
			milliseconds: 24 * 60 * 60 * 1000,
		},
		{
			singular: 'hour',
			plural: 'hours',
			milliseconds: 60 * 60 * 1000,
		},
		{
			singular: 'min',
			plural: 'min',
			milliseconds: 60 * 1000,
		},
		{
			singular: 'sec',
			plural: 'sec',
			milliseconds: 1000,
		},
		{
			singular: 'ms',
			plural: 'ms',
			milliseconds: 1,
		},
	];
	const strings: string[] = [];
	let left = milliseconds;
	units.forEach(unit => {
		if (left > unit.milliseconds) {
			const whole = Math.floor(left / unit.milliseconds);
			left -= whole * unit.milliseconds;
			if (whole === 1) {
				strings.push(whole + unit.singular);
			} else {
				strings.push(whole + unit.plural);
			}
		}
	});
	strings.length = Math.min(strings.length, 2);
	return strings.join(' ');
}

export function etl(starttime: number, lasttime: number, progress: number){
	const elapsed = lasttime - starttime;
	return humanDuration((elapsed / progress) - elapsed);
}

interface DataPoint {
	time: number,
	value: number,
}
export default class Stats {
	minutes: DataPoint[] = [];
	seconds: DataPoint[] = [];
	starttime: number;
	onUpdate?: (value: number) => void;
	constructor(){
		const now: DataPoint = {
			time: Date.now(),
			value: 0,
		}
		this.starttime = now.time;
		this.minutes.push(now);
		this.seconds.push(now);
	}
	log(value: number) {
		const now: DataPoint = {
			time: Date.now(),
			value,
		}
		if (this.seconds.length < 61 || now.time > this.seconds[0].time + 1000) {
			if (this.onUpdate) {
				this.onUpdate(value);
			}
			this.seconds.unshift(now);
			if (this.seconds.length > 61){
				this.seconds.length = 61;
			}
		}
		if (now.time > this.minutes[0].time + 1000) {
			this.minutes.unshift(now);
			if (this.minutes.length > 61) {
				this.minutes.length = 61;
			}
		}
	}
	get lastMinute(){
		const value = this.seconds[0].value - this.seconds[this.seconds.length - 1].value;
		const timespan = this.seconds[0].time - this.seconds[this.seconds.length - 1].time;
		return value * (60000.0 / timespan) | 0;
	}
	etl(progress: number) {
		return etl(this.starttime, this.seconds[0].time, progress);
	}
	get elapsed() {
		return humanDuration(this.seconds[0].time - this.starttime);
	}

}