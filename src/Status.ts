import { Source } from './sources';

export default interface Status {
    [key: string]: {
    	source: Source,
        starttime: number,
        updatetime: number,
        progress?: number,
        target?: number,
        status?: string,
    },
}